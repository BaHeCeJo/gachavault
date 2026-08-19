"use client";

import { Fragment, useState } from "react";
import type { ItemPageBundle } from "@/lib/seo";
import type { SkillsConfig } from "@/lib/pageLayout";
import type { SkillTrack } from "@/lib/skillPresets";
import { hasTokens, renderTemplate, tokenizedScalings } from "@/lib/skillScaling";
import { defaultTickOf, isBoostedTick, resolveTicks, skillPresetFor, trackFor } from "@/lib/skillPresets";

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

// An ability description with its `{token}` placeholders replaced by the values
// for the selected level, each highlighted so the level-dependent numbers stand
// out from the prose. A description with no tokens renders unchanged.
function SkillDescription({
  description,
  scalings,
  levelIndex,
}: {
  description: string;
  scalings: Scaling[];
  levelIndex: number;
}) {
  return (
    <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line mt-1">
      {renderTemplate(description, scalings, levelIndex).map((part, i) =>
        part.kind === "value" ? (
          <span key={i} className="font-semibold text-amber-300 tabular-nums">
            {part.text}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </p>
  );
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

  const trackKey = c.track_key || "track";
  const tracks = c.tracks?.length
    ? c.tracks
    : skillPresetFor(bundle.item.game_slug, bundle.game?.name).tracks;

  const skills = rawList
    .map((s) => {
      const type = str(s?.[typeKey]);
      const scalings = readScalings(s, scalingsKey);
      const track = trackFor(tracks, str(s?.[trackKey]), type);
      return {
        name: str(s?.[nameKey]),
        desc: str(s?.[descKey]),
        icon: str(s?.[iconKey]),
        type,
        group: str(s?.[groupKey]),
        scalings,
        track,
        // Its own ticks, so a Basic ATK that stops at 7 shows 7 stops even
        // though the Skill beside it runs to 10.
        ticks: resolveTicks(track, scalings.reduce((m, x) => Math.max(m, x.values.length), 0)),
      };
    })
    .filter((sk) => sk.name || sk.desc || sk.icon || sk.type || sk.scalings.length > 0);

  // One slider per track that any ability actually scales along — a kit with a
  // memosprite, or a Basic ATK capping earlier than the Skill, gets independent
  // controls instead of one slider silently clamping the shorter ones.
  const sliders: { key: string; label: string; ticks: string[]; track?: SkillTrack }[] = [];
  for (const sk of skills) {
    const track = sk.track;
    if (!track || sk.ticks.length < 2) continue;
    const seen = sliders.find((s) => s.key === track.key);
    // Two abilities can share a track with different value counts (an Ultimate
    // with 10, a Talent with 8) — the slider spans the longer of them.
    if (!seen) sliders.push({ key: track.key, label: track.label, ticks: sk.ticks, track });
    else if (sk.ticks.length > seen.ticks.length) seen.ticks = sk.ticks;
  }

  // A missing entry means "untouched", so each slider opens on its track's own
  // default — max for a character's kit, S1 for a light cone.
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [showTable, setShowTable] = useState(false);

  const levelOf = (track: SkillTrack | undefined, ticks: string[]) => {
    const max = ticks.length;
    const chosen = track !== undefined ? levels[track.key] : undefined;
    return Math.min(chosen ?? defaultTickOf(track, max), max);
  };

  if (skills.length === 0) return null;

  let lastGroup = "";

  return (
    <section className="mb-8">
      {c.title && <h2 className="text-xl font-semibold mb-4">{c.title}</h2>}

      {sliders.length > 0 && (
        <div className="flex items-start gap-3 mb-4">
          {!showTable && (
            <div className="flex-1 min-w-0 space-y-1.5">
              {sliders.map((s) => {
                const level = levelOf(s.track, s.ticks);
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 shrink-0 w-28 truncate" title={s.label}>{s.label}</span>
                    <input
                      type="range"
                      min={1}
                      max={s.ticks.length}
                      value={level}
                      aria-label={s.label}
                      onChange={(e) => setLevels((prev) => ({ ...prev, [s.key]: Number(e.target.value) }))}
                      className="flex-1 accent-amber-500"
                    />
                    {/* A level past the base cap needs eidolons/masteries, so
                        it is marked rather than shown as if everyone has it. */}
                    <span
                      className={`text-xs w-8 text-right tabular-nums shrink-0 ${
                        isBoostedTick(s.track, level) ? "text-amber-400" : "text-gray-300"
                      }`}
                      title={
                        isBoostedTick(s.track, level)
                          ? `Above the base maximum of ${s.track?.baseTicks}`
                          : undefined
                      }
                    >
                      {s.ticks[level - 1]}
                      {isBoostedTick(s.track, level) && <span aria-hidden>*</span>}
                    </span>
                  </div>
                );
              })}
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
          const maxLen = sk.ticks.length;
          // Each ability reads the slider for its own track, so a memosprite
          // skill doesn't move when the main kit's level does.
          const effLevel = levelOf(sk.track, sk.ticks);
          // Scalings spliced into the sentence don't repeat as rows underneath
          // — but the "All levels" table still shows every one of them.
          const inlined = hasTokens(sk.desc) ? tokenizedScalings(sk.desc, sk.scalings) : new Set<number>();
          const listed = sk.scalings.filter((_, j) => !inlined.has(j));
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
                  {sk.desc && (
                    <SkillDescription description={sk.desc} scalings={sk.scalings} levelIndex={effLevel - 1} />
                  )}

                  {sk.scalings.length > 0 && (
                    showTable && maxLen > 0 ? (
                      <div className="mt-2 overflow-x-auto">
                        <table className="text-xs border-collapse min-w-full">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-left font-medium pr-3 pb-1" />
                              {sk.ticks.map((tick, k) => (
                                <th key={k} className="px-2 pb-1 font-medium text-right tabular-nums">{tick}</th>
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
                      <div className={listed.length > 0 ? "mt-2 space-y-1" : ""}>
                        {listed.map((sc, j) => {
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
