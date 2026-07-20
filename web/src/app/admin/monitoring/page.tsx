"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminApi } from "@/lib/api";
import { useAdminGuard } from "@/hooks/useAdminGuard";

// Polls auth-service's admin Loki proxy (see services/auth-service/src/monitoring.rs)
// so admins get live logs + alert state + error rates in-app, without exposing
// Grafana/Loki to the internet.

const REFRESH_MS = 4000;
// Metrics change slowly and query_range is heavier than a log tail, so poll
// the Prometheus-backed Server Resources section less often than the logs.
const METRICS_REFRESH_MS = 15000;

// Compose services Promtail labels logs by, plus infra. Used for the filter
// dropdown. Keep roughly in sync with docker-compose.prod.yml service names.
const SERVICES = [
  "auth-service",
  "api-gateway",
  "games-service",
  "items-service",
  "collections-service",
  "tierlists-service",
  "media-service",
  "search-service",
  "notifications-service",
  "web",
  "nginx",
  "postgres",
];

const LEVELS = ["error", "warn", "info", "debug"];

interface AlertState {
  id: string;
  title: string;
  severity: string;
  value: number;
  threshold: number;
  firing: boolean;
}

interface LogLine {
  ns: string;
  line: string;
  service: string;
  level?: string | null;
  container?: string | null;
}

interface ServiceErrCount {
  service: string;
  errors: number;
  warns: number;
}

interface HostMetrics {
  cpu_pct: number;
  mem_pct: number;
  mem_used_bytes: number;
  mem_total_bytes: number;
  disk_pct: number;
  disk_used_bytes: number;
  disk_total_bytes: number;
  load1: number;
}

interface ContainerMetric {
  name: string;
  cpu_cores: number;
  mem_bytes: number;
}

interface MetricPoint {
  t: number;
  v: number;
}

interface MetricsRange {
  cpu_pct: MetricPoint[];
  mem_pct: MetricPoint[];
  disk_pct: MetricPoint[];
}

function levelClasses(level?: string | null): string {
  switch (level) {
    case "error":
      return "text-red-400";
    case "warn":
      return "text-amber-400";
    case "info":
      return "text-sky-400";
    default:
      return "text-gray-400";
  }
}

function fmtTime(ns: string): string {
  const ms = Number(ns) / 1e6;
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function fmtPct(n: number): string {
  return Number.isFinite(n) && n >= 0 ? `${n.toFixed(0)}%` : "—";
}

// Prometheus timestamps are unix seconds; render as local HH:MM.
function fmtClock(t: number): string {
  return new Date(t * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function MetricChart({
  title,
  data,
  color,
  current,
  sub,
}: {
  title: string;
  data: MetricPoint[];
  color: string;
  current: number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs text-gray-400 uppercase tracking-wider">{title}</h3>
        <span className="text-xl font-semibold" style={{ color }}>
          {fmtPct(current)}
        </span>
      </div>
      <p className="text-xs text-gray-600 mb-2 h-4 truncate">{sub ?? ""}</p>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={fmtClock}
            tick={{ fontSize: 10, fill: "#6b7280" }}
            minTickGap={48}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#6b7280" }}
            width={34}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(t) => fmtClock(Number(t))}
            formatter={(v) => [`${Number(v).toFixed(1)}%`, title]}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AdminMonitoringPage() {
  const { user, isLoading } = useAdminGuard("/admin/monitoring");

  const [alerts, setAlerts] = useState<AlertState[]>([]);
  const [errStats, setErrStats] = useState<ServiceErrCount[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [metrics, setMetrics] = useState<{
    host: HostMetrics;
    containers: ContainerMetric[];
  } | null>(null);
  const [range, setRange] = useState<MetricsRange>({
    cpu_pct: [],
    mem_pct: [],
    disk_pct: [],
  });
  const [service, setService] = useState("");
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Keep the latest filters in a ref so the polling interval always reads
  // current values without being torn down/recreated on every keystroke.
  // The sync has to happen in an effect, not during render (react-hooks/refs).
  // It is declared above the effect that calls refresh() so that on a filter
  // change React runs this one first and the refetch sees the new values.
  const filters = useRef({ service, level, search });
  useEffect(() => {
    filters.current = { service, level, search };
  }, [service, level, search]);

  const refresh = useCallback(async () => {
    try {
      const { service: svc, level: lvl, search: q } = filters.current;
      const [alertsRes, statsRes, logsRes] = await Promise.all([
        adminApi.monitoring.alerts(),
        adminApi.monitoring.logStats(),
        adminApi.monitoring.logs({
          service: svc || undefined,
          level: lvl || undefined,
          search: q || undefined,
          limit: 200,
        }),
      ]);
      setAlerts(alertsRes.data.data?.alerts ?? []);
      setErrStats(statsRes.data.data?.by_service ?? []);
      setLogs(logsRes.data.data?.lines ?? []);
      setLastUpdated(Date.now());
      setError(null);
    } catch {
      setError("Couldn't reach the log backend (Loki). Retrying…");
    } finally {
      setReady(true);
    }
  }, []);

  // Initial load + immediate refetch when filters change.
  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user, refresh, service, level, search]);

  // Auto-refresh poll.
  useEffect(() => {
    if (!user || paused) return;
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [user, paused, refresh]);

  // Metrics (Prometheus) refresh on a slower cadence than logs, and in its own
  // try/catch so a metrics-backend hiccup can't blank the logs/alerts panels.
  const refreshMetrics = useCallback(async () => {
    try {
      const [mRes, rRes] = await Promise.all([
        adminApi.monitoring.metrics(),
        adminApi.monitoring.metricsRange(),
      ]);
      setMetrics(mRes.data.data ?? null);
      const s = rRes.data.data?.series;
      if (s) {
        setRange({
          cpu_pct: s.cpu_pct ?? [],
          mem_pct: s.mem_pct ?? [],
          disk_pct: s.disk_pct ?? [],
        });
      }
    } catch {
      /* keep last-known metrics; the logs panel surfaces backend problems */
    }
  }, []);

  useEffect(() => {
    if (!user || paused) return;
    refreshMetrics();
    const id = setInterval(refreshMetrics, METRICS_REFRESH_MS);
    return () => clearInterval(id);
  }, [user, paused, refreshMetrics]);

  if (isLoading || !user) {
    return (
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="h-8 w-48 rounded bg-gray-800 animate-pulse" />
      </main>
    );
  }

  const firingCount = alerts.filter((a) => a.firing).length;

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-semibold">Monitoring</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 text-gray-400">
            <span
              className={`inline-block w-2 h-2 rounded-full ${paused ? "bg-gray-500" : "bg-emerald-400 animate-pulse"}`}
            />
            {paused ? "Paused" : `Live · ${REFRESH_MS / 1000}s`}
          </span>
          <button
            onClick={() => setPaused((p) => !p)}
            className="px-3 py-1 rounded-lg border border-gray-700 hover:border-gray-500 transition"
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <Link href="/admin" className="text-gray-400 hover:text-white">
            ← Admin
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 text-red-300 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Alerts */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Alerts {firingCount > 0 && <span className="text-red-400">· {firingCount} firing</span>}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {!ready
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-800 animate-pulse" />
              ))
            : alerts.map((a) => {
                const unknown = a.value < 0;
                const dot = a.firing ? "bg-red-500" : unknown ? "bg-gray-600" : "bg-emerald-500";
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      a.firing ? "border-red-800 bg-red-950/30" : "border-gray-800 bg-gray-900"
                    }`}
                  >
                    <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <p className="text-xs text-gray-400">
                        {unknown
                          ? "unknown"
                          : a.firing
                            ? `FIRING · ${a.value} (limit ${a.threshold})`
                            : "OK"}
                        <span className="text-gray-600"> · {a.severity}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
        </div>
      </section>

      {/* Server resources (Prometheus) */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Server resources
        </h2>
        {!metrics ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-44 rounded-xl bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <MetricChart
                title="CPU"
                data={range.cpu_pct}
                color="#38bdf8"
                current={metrics.host.cpu_pct}
                sub={metrics.host.load1 >= 0 ? `load ${metrics.host.load1.toFixed(2)}` : undefined}
              />
              <MetricChart
                title="Memory"
                data={range.mem_pct}
                color="#34d399"
                current={metrics.host.mem_pct}
                sub={`${fmtBytes(metrics.host.mem_used_bytes)} / ${fmtBytes(metrics.host.mem_total_bytes)}`}
              />
              <MetricChart
                title="Disk"
                data={range.disk_pct}
                color="#a78bfa"
                current={metrics.host.disk_pct}
                sub={`${fmtBytes(metrics.host.disk_used_bytes)} / ${fmtBytes(metrics.host.disk_total_bytes)}`}
              />
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-3">
                Per-container · top by memory
              </h3>
              {metrics.containers.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No container metrics yet (cAdvisor may still be warming up).
                </p>
              ) : (
                <div className="space-y-1.5">
                  {(() => {
                    const maxMem = Math.max(...metrics.containers.map((c) => c.mem_bytes), 1);
                    return metrics.containers.map((c) => (
                      <div key={c.name} className="flex items-center gap-3 text-xs">
                        <span className="w-44 truncate text-gray-300" title={c.name}>
                          {c.name}
                        </span>
                        <div className="flex-1 h-2 rounded bg-gray-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500/70"
                            style={{ width: `${(c.mem_bytes / maxMem) * 100}%` }}
                          />
                        </div>
                        <span className="w-20 text-right tabular-nums text-gray-400">
                          {fmtBytes(c.mem_bytes)}
                        </span>
                        <span className="w-24 text-right tabular-nums text-gray-500">
                          {(c.cpu_cores * 100).toFixed(1)}% cpu
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Error-rate summary */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Errors / warnings · last hour
        </h2>
        {ready && errStats.length === 0 ? (
          <p className="text-sm text-gray-500">No errors or warnings logged in the last hour. 🎉</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {errStats.map((s) => (
              <div key={s.service} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p className="text-xs text-gray-400 truncate mb-1">{s.service}</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-semibold text-red-400">{s.errors}</span>
                  <span className="text-xs text-gray-500">err</span>
                  <span className="text-lg font-medium text-amber-400">{s.warns}</span>
                  <span className="text-xs text-gray-500">warn</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Live log tail */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Live logs</h2>
          <div className="flex items-center gap-2 text-sm">
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1"
            >
              <option value="">All services</option>
              {SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1"
            >
              <option value="">All levels</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 w-32"
            />
          </div>
        </div>
        <div className="rounded-xl border border-gray-800 bg-black/40 font-mono text-xs h-[28rem] overflow-auto">
          {!ready ? (
            <div className="p-4 text-gray-500">Loading logs…</div>
          ) : logs.length === 0 ? (
            <div className="p-4 text-gray-500">No log lines match the current filters.</div>
          ) : (
            logs.map((l, i) => (
              <div
                key={`${l.ns}-${i}`}
                className="flex gap-3 px-3 py-1 border-b border-gray-900 hover:bg-gray-900/60"
              >
                <span className="text-gray-600 shrink-0 tabular-nums">{fmtTime(l.ns)}</span>
                <span className="text-violet-300 shrink-0 w-36 truncate" title={l.service}>
                  {l.service || l.container || "—"}
                </span>
                {l.level && (
                  <span className={`shrink-0 w-12 uppercase ${levelClasses(l.level)}`}>{l.level}</span>
                )}
                <span className="text-gray-300 whitespace-pre-wrap break-all">{l.line}</span>
              </div>
            ))
          )}
        </div>
        {lastUpdated && (
          <p className="text-xs text-gray-600 mt-2">
            Updated {new Date(lastUpdated).toLocaleTimeString([], { hour12: false })} · showing{" "}
            {logs.length} lines (last hour)
          </p>
        )}
      </section>
    </main>
  );
}
