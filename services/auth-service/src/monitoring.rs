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
        "{container=~\"gachavault-.*\"}".to_string()
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
    },
    RuleDef {
        id: "nginx-5xx-spike",
        title: "nginx 5xx spike",
        severity: "warning",
        expr: r#"sum(count_over_time({container=~".*nginx.*"} |~ " 5[0-9][0-9] " [5m]))"#,
        threshold: 10.0,
        fire_when_gt: true,
    },
    RuleDef {
        id: "postgres-fatal",
        title: "Postgres FATAL/PANIC",
        severity: "critical",
        expr: r#"sum(count_over_time({service="postgres"} |~ "(?i)\b(fatal|panic)\b" [5m]))"#,
        threshold: 0.0,
        fire_when_gt: true,
    },
    RuleDef {
        id: "certbot-renew-failed",
        title: "certbot renew failed",
        severity: "warning",
        expr: r#"sum(count_over_time({container=~".*certbot.*"} |~ "renew FAILED" [24h]))"#,
        threshold: 0.0,
        fire_when_gt: true,
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
        let value = loki_instant(&client, rule.expr).await.unwrap_or(-1.0);
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
