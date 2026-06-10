"use client";

import type { ItemPageBundle } from "@/lib/seo";
import type { RatingsConfig } from "@/lib/pageLayout";

// Labeled ratings — e.g. tier per game mode. Each entry reads a field; rendered
// either as pill badges or as horizontal bars (for numeric values).
export function RatingsBlock({
  config,
  bundle,
}: {
  config?: Record<string, unknown>;
  bundle: ItemPageBundle;
}) {
  const c = (config ?? {}) as RatingsConfig;
  const data = bundle.item.data as Record<string, unknown>;

  const entries = (c.entries ?? [])
    .filter((e) => e && e.field)
    .map((e) => ({ label: e.label || e.field, value: data[e.field] }))
    .filter((e) => e.value !== undefined && e.value !== null && e.value !== "");
  if (entries.length === 0) return null;

  const style = c.style ?? "badge";
  return (
    <section className="mb-8">
      {c.title && <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">{c.title}</h2>}
      {style === "bar" ? (
        <div className="space-y-2">
          {entries.map((e, i) => {
            const num = typeof e.value === "number" ? e.value : parseFloat(String(e.value));
            const max = !isNaN(num) && num > 10 ? 100 : 10;
            const pct = !isNaN(num) ? Math.max(0, Math.min(100, (num / max) * 100)) : 0;
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-28 shrink-0 truncate">{e.label}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm text-gray-300 w-10 text-right">{String(e.value)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entries.map((e, i) => (
            <span key={i} className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-gray-800 border border-gray-700">
              <span className="text-gray-400">{e.label}</span>
              <span className="text-amber-300 font-semibold">{String(e.value)}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
