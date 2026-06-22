"use client";

import { Fragment } from "react";
import type { ItemPageBundle } from "@/lib/seo";
import type { SkillsConfig } from "@/lib/pageLayout";

// A list of skills/abilities read from a field whose value is an array of
// objects ({ type, name, description, icon_url, group } by default; keys are
// configurable). `type` renders as a small category tag and a change in `group`
// starts a labelled subsection (e.g. "Memosprite", "Eidolons") — so one generic
// block covers any game's ability taxonomy without per-game logic.
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
  const typeKey = c.type_key || "type";
  const groupKey = c.group_key || "group";

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  let lastGroup = "";

  return (
    <section className="mb-8">
      {c.title && <h2 className="text-xl font-semibold mb-4">{c.title}</h2>}
      <div className="space-y-3">
        {list.map((s, i) => {
          const name = str(s?.[nameKey]);
          const desc = str(s?.[descKey]);
          const icon = str(s?.[iconKey]);
          const type = str(s?.[typeKey]);
          const group = str(s?.[groupKey]);
          if (!name && !desc && !icon && !type) return null;
          // A new group value introduces a labelled subsection.
          const showHeader = group !== "" && group !== lastGroup;
          lastGroup = group;
          return (
            <Fragment key={i}>
              {showHeader && (
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 pt-2">{group}</h3>
              )}
              <div className="flex gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
                {icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={icon} alt="" className="w-10 h-10 object-contain rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {type && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700/40 text-amber-300 shrink-0">
                        {type}
                      </span>
                    )}
                    {name && <p className="text-sm font-semibold text-gray-200">{name}</p>}
                  </div>
                  {desc && <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line mt-1">{desc}</p>}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
