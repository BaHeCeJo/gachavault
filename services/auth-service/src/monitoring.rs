//! Admin monitoring endpoints. These proxy read-only queries to Loki (the log
//! store on the `internal` compose network) so the admin UI can show live logs,
//! alert state and error rates WITHOUT exposing Grafana/Loki to the internet.
//!
//! Every handler is admin-gated here, and the api-gateway also runs an edge
//! `admin_role_check` on `/api/v1/admin/*` — defense in depth.

use std::collections::HashMap;

use axum::{extract::Query, Json};
use serde::{Deserialize, Serialize};
use shared_auth::AuthUser;
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;

const DEFAULT_LOKI_URL: &str = "http://loki:3100";
const VALID_LEVELS: &[&str] = &["error", "warn", "info", "debug", "trace"];

fn loki_base() -> String {
    std::env::var("LOKI_URL").unwrap_or_else(|_| DEFAULT_LOKI_URL.to_string())
}

fn require_admin(auth: &AuthUser) -> AppResult<()> {
    if !auth.is_admin() {
        return Err(AppError::Forbidden("Admin access required".into()));
    }
    Ok(())
}

fn loki_err(ctx: &str, e: impl std::fmt::Display) -> AppError {
    AppError::Internal(anyhow::anyhow!("loki {ctx}: {e}"))
}

// Nanoseconds since epoch (Loki's timestamp unit). Millisecond precision is
// plenty for these windows and avoids the newer timestamp_nanos_opt API.
fn now_ns() -> i64 {
    chrono::Utc::now().timestamp_millis() * 1_000_000
}

// ── Loki response shapes ────────────────────────────────────────────────────

// /loki/api/v1/query_range with a log selector → resultType "streams".
#[derive(Deserialize)]
struct StreamsResp {
    data: StreamsData,
}
#[derive(Deserialize)]
struct StreamsData {
    #[serde(default)]
    result: Vec<StreamEntry>,
}
#[derive(Deserialize)]
struct StreamEntry {
    #[serde(default)]
    stream: HashMap<String, String>,
    // Each value is [ "<ns>", "<line>" ].
    #[serde(default)]
    values: Vec<Vec<String>>,
}

// /loki/api/v1/query with a metric expr → resultType "vector".
#[derive(Deserialize)]
struct VectorResp {
    data: VectorData,
}
#[derive(Deserialize)]
struct VectorData {
    #[serde(default)]
    result: Vec<VectorSample>,
}
#[derive(Deserialize)]
struct VectorSample {
    #[serde(default)]
    metric: HashMap<String, String>,
    // value is [ <ts:number>, "<value:string>" ].
    #[serde(default)]
    value: Vec<serde_json::Value>,
}
impl VectorSample {
    fn number(&self) -> f64 {
        self.value
            .get(1)
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0)
    }
}

async fn loki_instant(client: &reqwest::Client, expr: &str) -> AppResult<f64> {
    let resp = client
        .get(format!("{}/loki/api/v1/query", loki_base()))
        .query(&[("query", expr)])
        .send()
        .await
        .map_err(|e| loki_err("query", e))?;
    if !resp.status().is_success() {
        let code = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(loki_err("query", format!("HTTP {code}: {body}")));
    }
    let parsed: VectorResp = resp.json().await.map_err(|e| loki_err("decode", e))?;
    Ok(parsed
        .data
        .result
        .first()
        .map(|s| s.number())
        .unwrap_or(0.0))
}

// ── Live log tail ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct LogsQuery {
    pub service: Option<String>,
    pub level: Option<String>,
    pub search: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Serialize)]
struct LogLine {
    // Raw epoch-ns string; the UI formats it (and uses it as a stable key).
    ns: String,
    line: String,
    service: String,
    level: Option<String>,
    container: Option<String>,
}

fn valid_service_name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 40
        && s.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

// Escape a user search string for a LogQL `|= "..."` line filter.
fn escape_logql(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

pub async fn get_admin_logs(
    auth: AuthUser,
    Query(q): Query<LogsQuery>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    require_admin(&auth)?;

    // The filters build a LogQL selector, so validate against injection.
    let mut matchers: Vec<String> = Vec::new();
    if let Some(service) = q.service.as_deref().filter(|s| !s.is_empty()) {
        if !valid_service_name(service) {
            return Err(AppError::BadRequest("invalid service filter".into()));
        }
        matchers.push(format!("service=\"{service}\""));
    }
    if let Some(level) = q.level.as_deref().filter(|s| !s.is_empty()) {
        if !VALID_LEVELS.contains(&level) {
            return Err(AppError::BadRequest("invalid level filter".into()));
        }
        matchers.push(format!("level=\"{level}\""));
    }
    let selector = if matchers.is_empty() {
        // Default "all" view excludes the observability/metrics stack — their
        // own logs (especially Loki echoing every query it runs) are noise
        // here, not application logs. A specific service filter still reaches
        // them via the `service=` label branch below.
        "{container=~\"gachavault-.*\", container!~\"gachavault-(loki|grafana|promtail|prometheus|cadvisor|node-exporter).*\"}".to_string()
    } else {
        format!("{{{}}}", matchers.join(","))
    };
    let mut query = selector;
    if let Some(search) = q.search.as_deref().filter(|s| !s.is_empty()) {
        if search.len() > 200 {
            return Err(AppError::BadRequest("search too long".into()));
        }
        query = format!("{query} |= \"{}\"", escape_logql(search));
    }

    let limit = q.limit.unwrap_or(100).clamp(1, 500);
    let end = now_ns();
    let start = end - 3_600_000_000_000; // last 1h

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/loki/api/v1/query_range", loki_base()))
        .query(&[
            ("query", query.as_str()),
            ("limit", &limit.to_string()),
            ("direction", "backward"),
            ("start", &start.to_string()),
            ("end", &end.to_string()),
        ])
        .send()
        .await
        .map_err(|e| loki_err("query_range", e))?;
    if !resp.status().is_success() {
        let code = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(loki_err("query_range", format!("HTTP {code}: {body}")));
    }
    let parsed: StreamsResp = resp.json().await.map_err(|e| loki_err("decode", e))?;

    let mut lines: Vec<LogLine> = Vec::new();
    for stream in parsed.data.result {
        let service = stream.stream.get("service").cloned().unwrap_or_default();
        let level = stream.stream.get("level").cloned();
        let container = stream.stream.get("container").cloned();
        for v in stream.values {
            lines.push(LogLine {
                ns: v.first().cloned().unwrap_or_default(),
                line: v.get(1).cloned().unwrap_or_default(),
                service: service.clone(),
                level: level.clone(),
                container: container.clone(),
            });
        }
    }
    // Loki returns one block per stream; merge to a single newest-first list.
    // ns strings are fixed-width epoch-ns, so lexical sort == numeric sort.
    lines.sort_by(|a, b| b.ns.cmp(&a.ns));
    lines.truncate(limit as usize);

    Ok(Json(ApiResponse::success(
        serde_json::json!({ "lines": lines }),
    )))
}

// ── Alert status ────────────────────────────────────────────────────────────

struct RuleDef {
    id: &'static str,
    title: &'static str,
    severity: &'static str,
    expr: &'static str,
    threshold: f64,
    // true → fire when value > threshold; false → fire when value < threshold.
    fire_when_gt: bool,
    // true → evaluate `expr` against Prometheus (metrics); false → Loki (logs).
    prometheus: bool,
}

// Mirrors observability/grafana-provisioning/alerting/rules.yml so the admin
// page can show alert state without a Grafana service-account token.
// KEEP IN SYNC with rules.yml.
const RULES: &[RuleDef] = &[
    RuleDef {
        // container!~ excludes the observability stack: Loki logs every query
        // it runs (this one included), and that log line contains the literal
        // "panicked at" from the query text; promtail ships Loki's logs back
        // into Loki, so without the exclusion the rule matches its own query
        // echo and self-fires forever. Real app/infra panics stay in scope.
        id: "service-panic",
        title: "Service panicked",
        severity: "critical",
        expr: r#"sum(count_over_time({container=~"gachavault-.*", container!~"gachavault-(loki|grafana|promtail).*"} |~ "(?i)panicked at" [5m]))"#,
        threshold: 0.0,
        fire_when_gt: true,
        prometheus: false,
    },
    RuleDef {
        id: "nginx-5xx-spike",
        title: "nginx 5xx spike",
        severity: "warning",
        expr: r#"sum(count_over_time({container=~".*nginx.*"} |~ " 5[0-9][0-9] " [5m]))"#,
        threshold: 10.0,
        fire_when_gt: true,
        prometheus: false,
    },
    RuleDef {
        id: "postgres-fatal",
        title: "Postgres FATAL/PANIC",
        severity: "critical",
        expr: r#"sum(count_over_time({service="postgres"} |~ "(?i)\b(fatal|panic)\b" [5m]))"#,
        threshold: 0.0,
        fire_when_gt: true,
        prometheus: false,
    },
    RuleDef {
        id: "certbot-renew-failed",
        title: "certbot renew failed",
        severity: "warning",
        expr: r#"sum(count_over_time({container=~".*certbot.*"} |~ "renew FAILED" [24h]))"#,
        threshold: 0.0,
        fire_when_gt: true,
        prometheus: false,
    },
    RuleDef {
        // |= (literal) not |~: the match contains regex metacharacters ([ ]).
        // Fires when db-backup logged no successful `[backup] Saved` in 48h —
        // i.e. the daily on-VPS pg_dump is broken. We intentionally run local
        // backups only, so this deliberately does not track off-site.
        id: "db-backup-stale",
        title: "Database backup stale (48h)",
        severity: "warning",
        expr: r#"sum(count_over_time({container=~".*db-backup.*"} |= "[backup] Saved" [48h]))"#,
        threshold: 1.0,
        fire_when_gt: false,
        prometheus: false,
    },
    // ── Resource alerts (Prometheus / node-exporter) ────────────────────────
    RuleDef {
        id: "disk-high",
        title: "Disk usage above 85%",
        severity: "warning",
        expr: r#"(1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|ramfs|devtmpfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|ramfs|devtmpfs"})) * 100"#,
        threshold: 85.0,
        fire_when_gt: true,
        prometheus: true,
    },
    RuleDef {
        id: "ram-high",
        title: "Memory usage above 90%",
        severity: "warning",
        expr: r#"(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100"#,
        threshold: 90.0,
        fire_when_gt: true,
        prometheus: true,
    },
    RuleDef {
        // 10m rate window so a brief spike doesn't show as firing (Grafana's
        // copy adds a 10m `for` on top for the actual notification).
        id: "cpu-high",
        title: "CPU usage above 90% (10m)",
        severity: "warning",
        expr: r#"100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[10m])) * 100)"#,
        threshold: 90.0,
        fire_when_gt: true,
        prometheus: true,
    },
];

#[derive(Serialize)]
struct AlertState {
    id: &'static str,
    title: &'static str,
    severity: &'static str,
    // -1 means the query failed (shown as "unknown", never as firing).
    value: f64,
    threshold: f64,
    firing: bool,
}

pub async fn get_admin_alerts(auth: AuthUser) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    require_admin(&auth)?;
    let client = reqwest::Client::new();
    let mut states: Vec<AlertState> = Vec::with_capacity(RULES.len());
    for rule in RULES {
        // One failing query shouldn't blank the whole panel: treat it as
        // value -1 ("unknown", not firing) and keep evaluating the rest.
        // prom_scalar already returns -1.0 on failure; loki_instant needs the
        // unwrap_or to match that convention.
        let value = if rule.prometheus {
            prom_scalar(&client, rule.expr).await
        } else {
            loki_instant(&client, rule.expr).await.unwrap_or(-1.0)
        };
        let firing = value >= 0.0
            && if rule.fire_when_gt {
                value > rule.threshold
            } else {
                value < rule.threshold
            };
        states.push(AlertState {
            id: rule.id,
            title: rule.title,
            severity: rule.severity,
            value,
            threshold: rule.threshold,
            firing,
        });
    }
    Ok(Json(ApiResponse::success(
        serde_json::json!({ "alerts": states }),
    )))
}

// ── Error-rate summary ──────────────────────────────────────────────────────

pub async fn get_admin_log_stats(
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    require_admin(&auth)?;
    let client = reqwest::Client::new();

    // Structured error/warn counts per service over the last hour. Only app
    // services emit a `level` label (Rust tracing JSON); nginx/postgres health
    // surfaces in the alerts panel instead.
    let expr = r#"sum by (service, level) (count_over_time({level=~"error|warn"} [1h]))"#;
    let resp = client
        .get(format!("{}/loki/api/v1/query", loki_base()))
        .query(&[("query", expr)])
        .send()
        .await
        .map_err(|e| loki_err("query", e))?;
    if !resp.status().is_success() {
        let code = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(loki_err("query", format!("HTTP {code}: {body}")));
    }
    let parsed: VectorResp = resp.json().await.map_err(|e| loki_err("decode", e))?;

    let mut by_service: HashMap<String, (u64, u64)> = HashMap::new(); // service -> (errors, warns)
    for s in parsed.data.result {
        let service = s
            .metric
            .get("service")
            .cloned()
            .unwrap_or_else(|| "unknown".into());
        let level = s.metric.get("level").cloned().unwrap_or_default();
        let n = s.number().max(0.0) as u64;
        let entry = by_service.entry(service).or_default();
        if level == "error" {
            entry.0 += n;
        } else if level == "warn" {
            entry.1 += n;
        }
    }
    let mut rows: Vec<serde_json::Value> = by_service
        .into_iter()
        .map(|(service, (errors, warns))| {
            serde_json::json!({ "service": service, "errors": errors, "warns": warns })
        })
        .collect();
    rows.sort_by(|a, b| {
        b["errors"]
            .as_u64()
            .unwrap_or(0)
            .cmp(&a["errors"].as_u64().unwrap_or(0))
    });

    Ok(Json(ApiResponse::success(serde_json::json!({
        "window": "1h",
        "by_service": rows,
    }))))
}

// ── Server resource metrics (Prometheus) ────────────────────────────────────
// Logs come from Loki (above); host/container numbers come from Prometheus
// (node-exporter + cadvisor). Same `internal` network, admin-gated, read-only.

const DEFAULT_PROMETHEUS_URL: &str = "http://prometheus:9090";

fn prom_base() -> String {
    std::env::var("PROMETHEUS_URL").unwrap_or_else(|_| DEFAULT_PROMETHEUS_URL.to_string())
}

fn prom_err(ctx: &str, e: impl std::fmt::Display) -> AppError {
    AppError::Internal(anyhow::anyhow!("prometheus {ctx}: {e}"))
}

// Prometheus instant query → resultType "vector". Same JSON shape as Loki's
// vector response, so VectorResp/VectorSample are reused. Returns every sample
// (host queries have one; per-container queries have one per `name`).
async fn prom_query(client: &reqwest::Client, query: &str) -> AppResult<Vec<VectorSample>> {
    let resp = client
        .get(format!("{}/api/v1/query", prom_base()))
        .query(&[("query", query)])
        .send()
        .await
        .map_err(|e| prom_err("query", e))?;
    if !resp.status().is_success() {
        let code = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(prom_err("query", format!("HTTP {code}: {body}")));
    }
    let parsed: VectorResp = resp.json().await.map_err(|e| prom_err("decode", e))?;
    Ok(parsed.data.result)
}

// First sample's value, or -1.0 when the query failed or returned nothing
// (the UI renders negative as "—"/unknown rather than a real reading).
async fn prom_scalar(client: &reqwest::Client, query: &str) -> f64 {
    prom_query(client, query)
        .await
        .ok()
        .and_then(|v| v.first().map(|s| s.number()))
        .unwrap_or(-1.0)
}

// Prometheus range query → resultType "matrix". Returns the first series'
// points as (unix_seconds, value).
#[derive(Deserialize)]
struct MatrixResp {
    data: MatrixData,
}
#[derive(Deserialize)]
struct MatrixData {
    #[serde(default)]
    result: Vec<MatrixEntry>,
}
#[derive(Deserialize)]
struct MatrixEntry {
    // Each value is [ <ts:number>, "<value:string>" ].
    #[serde(default)]
    values: Vec<Vec<serde_json::Value>>,
}

async fn prom_range(
    client: &reqwest::Client,
    query: &str,
    start: i64,
    end: i64,
    step: i64,
) -> AppResult<Vec<(f64, f64)>> {
    let resp = client
        .get(format!("{}/api/v1/query_range", prom_base()))
        .query(&[
            ("query", query),
            ("start", &start.to_string()),
            ("end", &end.to_string()),
            ("step", &step.to_string()),
        ])
        .send()
        .await
        .map_err(|e| prom_err("query_range", e))?;
    if !resp.status().is_success() {
        let code = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(prom_err("query_range", format!("HTTP {code}: {body}")));
    }
    let parsed: MatrixResp = resp.json().await.map_err(|e| prom_err("decode", e))?;
    let points = parsed
        .data
        .result
        .first()
        .map(|e| {
            e.values
                .iter()
                .filter_map(|p| {
                    let t = p.first().and_then(|v| v.as_f64())?;
                    let v = p
                        .get(1)
                        .and_then(|v| v.as_str())
                        .and_then(|s| s.parse::<f64>().ok())?;
                    Some((t, v))
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(points)
}

// Exclude pseudo-filesystems so the "disk" reading reflects the real root disk.
const ROOT_FS: &str = r#"{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|ramfs|devtmpfs"}"#;

// Current host + per-container snapshot.
pub async fn get_admin_metrics(auth: AuthUser) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    require_admin(&auth)?;
    let client = reqwest::Client::new();

    let cpu_pct = prom_scalar(
        &client,
        r#"100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[2m])) * 100)"#,
    )
    .await;
    let mem_total = prom_scalar(&client, "node_memory_MemTotal_bytes").await;
    let mem_avail = prom_scalar(&client, "node_memory_MemAvailable_bytes").await;
    let disk_total = prom_scalar(&client, &format!("node_filesystem_size_bytes{ROOT_FS}")).await;
    let disk_avail = prom_scalar(&client, &format!("node_filesystem_avail_bytes{ROOT_FS}")).await;
    let load1 = prom_scalar(&client, "node_load1").await;

    let mem_used = if mem_total > 0.0 && mem_avail >= 0.0 {
        mem_total - mem_avail
    } else {
        0.0
    };
    let mem_pct = if mem_total > 0.0 && mem_avail >= 0.0 {
        (1.0 - mem_avail / mem_total) * 100.0
    } else {
        -1.0
    };
    let disk_used = if disk_total > 0.0 && disk_avail >= 0.0 {
        disk_total - disk_avail
    } else {
        0.0
    };
    let disk_pct = if disk_total > 0.0 && disk_avail >= 0.0 {
        (1.0 - disk_avail / disk_total) * 100.0
    } else {
        -1.0
    };

    // Per-container CPU (cores) and working-set memory (bytes), merged by name.
    let cpu_samples = prom_query(
        &client,
        r#"sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[2m]))"#,
    )
    .await
    .unwrap_or_default();
    let mem_samples = prom_query(
        &client,
        r#"sum by (name) (container_memory_working_set_bytes{name!=""})"#,
    )
    .await
    .unwrap_or_default();

    let mut by_name: HashMap<String, (f64, f64)> = HashMap::new(); // name -> (cpu_cores, mem_bytes)
    for s in &cpu_samples {
        if let Some(name) = s.metric.get("name") {
            by_name.entry(name.clone()).or_default().0 = s.number();
        }
    }
    for s in &mem_samples {
        if let Some(name) = s.metric.get("name") {
            by_name.entry(name.clone()).or_default().1 = s.number();
        }
    }
    let mut containers: Vec<serde_json::Value> = by_name
        .into_iter()
        .map(|(name, (cpu, mem))| {
            serde_json::json!({ "name": name, "cpu_cores": cpu, "mem_bytes": mem })
        })
        .collect();
    containers.sort_by(|a, b| {
        b["mem_bytes"]
            .as_f64()
            .unwrap_or(0.0)
            .partial_cmp(&a["mem_bytes"].as_f64().unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    containers.truncate(20);

    Ok(Json(ApiResponse::success(serde_json::json!({
        "host": {
            "cpu_pct": cpu_pct,
            "mem_pct": mem_pct,
            "mem_used_bytes": mem_used,
            "mem_total_bytes": mem_total,
            "disk_pct": disk_pct,
            "disk_used_bytes": disk_used,
            "disk_total_bytes": disk_total,
            "load1": load1,
        },
        "containers": containers,
    }))))
}

// Last-hour time series for the CPU/RAM/disk charts (1-minute step).
pub async fn get_admin_metrics_range(
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    require_admin(&auth)?;
    let client = reqwest::Client::new();
    let end = chrono::Utc::now().timestamp();
    let start = end - 3600;
    let step = 60i64;

    let cpu = prom_range(
        &client,
        r#"100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[2m])) * 100)"#,
        start,
        end,
        step,
    )
    .await
    .unwrap_or_default();
    let mem = prom_range(
        &client,
        r#"(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100"#,
        start,
        end,
        step,
    )
    .await
    .unwrap_or_default();
    let disk = prom_range(
        &client,
        &format!(
            r#"(1 - (node_filesystem_avail_bytes{ROOT_FS} / node_filesystem_size_bytes{ROOT_FS})) * 100"#
        ),
        start,
        end,
        step,
    )
    .await
    .unwrap_or_default();

    let to_points = |pts: Vec<(f64, f64)>| -> Vec<serde_json::Value> {
        pts.into_iter()
            .map(|(t, v)| serde_json::json!({ "t": t, "v": v }))
            .collect()
    };

    Ok(Json(ApiResponse::success(serde_json::json!({
        "step_s": step,
        "series": {
            "cpu_pct": to_points(cpu),
            "mem_pct": to_points(mem),
            "disk_pct": to_points(disk),
        },
    }))))
}
