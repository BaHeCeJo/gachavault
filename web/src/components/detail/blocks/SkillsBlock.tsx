"use client";

import { Fragment, useState } from "react";
import type { ItemPageBundle } from "@/lib/seo";
import type { SkillsConfig } from "@/lib/pageLayout";

// A list of skills/abilities read from a field whose value is an array of
// objects ({ type, name, description, icon_url, group, scalings } by default;
// keys are configurable). `type` renders as a small category tag and a change
// in `group` starts a labelled subsection (e.g. "Memosprite", "Eidolons").
// `scalings` is an array of { label, values[] } where values[i] is the value at
// skill level i+1 — rendered Prydwen-style with a shared level slider (and an
// optional full per-level table). One generic block covers any game's kit.
interface Scaling {
  label: string;
  values: string[];
}

function readScalings(s: Record<string, unknown>, key: string): Scaling[] {
  const raw = s?.[key];
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[])
    .map((r) => ({
      label: typeof r?.label === "string" ? r.label : "",
      values: Array.isArray(r?.values) ? (r.values as unknown[]).map((v) => (v == null ? "" : String(v))) : [],
    }))
    .filter((sc) => sc.label || sc.values.length > 0);
}

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
  const rawList = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];

  const nameKey = c.name_key || "name";
  const descKey = c.desc_key || "description";
  const iconKey = c.icon_key || "icon_url";
  const typeKey = c.type_key || "type";
  const groupKey = c.group_key || "group";
  const scalingsKey = c.scalings_key || "scalings";

  const str = (v: unknown) => (typeof v === "string" ? v : "");

  const skills = rawList
    .map((s) => ({
      name: str(s?.[nameKey]),
      desc: str(s?.[descKey]),
      icon: str(s?.[iconKey]),
      type: str(s?.[typeKey]),
      group: str(s?.[groupKey]),
      scalings: readScalings(s, scalingsKey),
    }))
    .filter((sk) => sk.name || sk.desc || sk.icon || sk.type || sk.scalings.length > 0);

  // The level slider spans 1..(longest scaling array across all skills). Skills
  // with fewer levels (e.g. a Basic ATK that maxes earlier) clamp to their own
  // last value, so the slider stays a single shared control.
  const maxLevel = skills.reduce(
    (m, sk) => Math.max(m, ...sk.scalings.map((x) => x.values.length), 0),
    0,
  );

  // null = "follow max" so the slider starts maxed without an effect.
  const [level, setLevel] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const effLevel = level ?? maxLevel;

  if (skills.length === 0) return null;

  let lastGroup = "";

  return (
    <section className="mb-8">
      {c.title && <h2 className="text-xl font-semibold mb-4">{c.title}</h2>}

      {maxLevel > 1 && (
        <div className="flex items-center gap-3 mb-4">
          {!showTable && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs text-gray-500 shrink-0">Lv</span>
              <input
                type="range"
                min={1}
                max={maxLevel}
                value={effLevel}
                onChange={(e) => setLevel(Number(e.target.value))}
                className="flex-1 accent-amber-500"
              />
              <span className="text-xs text-gray-300 w-6 text-right tabular-nums shrink-0">{effLevel}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition shrink-0"
          >
            {showTable ? "Slider" : "All levels"}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {skills.map((sk, i) => {
          const showHeader = sk.group !== "" && sk.group !== lastGroup;
          lastGroup = sk.group;
          const maxLen = sk.scalings.reduce((m, x) => Math.max(m, x.values.length), 0);
          return (
            <Fragment key={i}>
              {showHeader && (
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 pt-2">{sk.group}</h3>
              )}
              <div className="flex gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
                {sk.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sk.icon} alt="" className="w-10 h-10 object-contain rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {sk.type && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700/40 text-amber-300 shrink-0">
                        {sk.type}
                      </span>
                    )}
                    {sk.name && <p className="text-sm font-semibold text-gray-200">{sk.name}</p>}
                  </div>
                  {sk.desc && <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line mt-1">{sk.desc}</p>}

                  {sk.scalings.length > 0 && (
                    showTable && maxLen > 0 ? (
                      <div className="mt-2 overflow-x-auto">
                        <table className="text-xs border-collapse min-w-full">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-left font-medium pr-3 pb-1" />
                              {Array.from({ length: maxLen }, (_, k) => (
                                <th key={k} className="px-2 pb-1 font-medium text-right tabular-nums">{k + 1}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sk.scalings.map((sc, j) => (
                              <tr key={j} className="border-t border-gray-800/60">
                                <td className="text-gray-400 pr-3 py-1 whitespace-nowrap">{sc.label}</td>
                                {Array.from({ length: maxLen }, (_, k) => (
                                  <td key={k} className="px-2 py-1 text-right tabular-nums text-gray-300">
                                    {sc.values[k] ?? ""}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {sk.scalings.map((sc, j) => {
                          const idx = Math.min(effLevel - 1, sc.values.length - 1);
                          const val = sc.values.length > 0 ? (sc.values[idx] ?? sc.values[sc.values.length - 1]) : "";
                          if (!val) return null;
                          return (
                            <div key={j} className="flex items-baseline justify-between gap-3 text-xs">
                              <span className="text-gray-500">{sc.label}</span>
                              <span className="text-gray-300 font-medium tabular-nums text-right">{val}</span>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
