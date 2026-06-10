"use client";

import type { ItemPageBundle } from "@/lib/seo";
import type { SkillsConfig } from "@/lib/pageLayout";

// A list of skills/abilities read from a field whose value is an array of
// objects ({ name, description, icon_url } by default; keys are configurable).
export function SkillsBlock({
  config,
  bundle,
}: {
  config?: Record<string, unknown>;
  bundle: ItemPageBundle;
}) {
  const c = (config ?? {}) as SkillsConfig;
  const data = bundle.item.data as Record<string, unknown>;
  const raw = c.list_field ? data[c.list_field] : undefined;
  const list = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  if (list.length === 0) return null;

  const nameKey = c.name_key || "name";
  const descKey = c.desc_key || "description";
  const iconKey = c.icon_key || "icon_url";

  return (
    <section className="mb-8">
      {c.title && <h2 className="text-xl font-semibold mb-4">{c.title}</h2>}
      <div className="space-y-3">
        {list.map((s, i) => {
          const name = typeof s?.[nameKey] === "string" ? (s[nameKey] as string) : "";
          const desc = typeof s?.[descKey] === "string" ? (s[descKey] as string) : "";
          const icon = typeof s?.[iconKey] === "string" ? (s[iconKey] as string) : "";
          if (!name && !desc && !icon) return null;
          return (
            <div key={i} className="flex gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
              {icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" className="w-10 h-10 object-contain rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <div>
                {name && <p className="text-sm font-semibold text-gray-200">{name}</p>}
                {desc && <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">{desc}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
