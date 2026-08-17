"use client";

import { useId } from "react";
import ImageUploadField from "@/components/ImageUploadField";
import { skillPresetFor, trackFor } from "@/lib/skillPresets";
import { extractScalingRuns, slugify, splitValues } from "@/lib/skillScaling";

// One ability row. All keys optional so a half-filled row is still valid JSON;
// the SkillsBlock skips rows with no name/desc/icon/type at render time.
export interface SkillScaling {
  label?: string;
  // values[i] is the multiplier at skill level i+1 (e.g. ["12%","15.7%",…]).
  values?: string[];
}

export interface SkillRow {
  type?: string;
  group?: string;
  name?: string;
  description?: string;
  icon_url?: string;
  scalings?: SkillScaling[];
  // Level track key. Empty = infer from `type` (the usual case) — set it only
  // when the Type tag doesn't imply the right track.
  track?: string;
}

// Form UI for a `skilllist` schema field: a reorderable list of ability rows
// (Type / Group / Name / Description / Icon) that serialises to the same array
// of objects the public SkillsBlock reads — so editing a kit no longer means
// hand-writing raw JSON. The Type/Group inputs are free-text but offer the
// matched game's real ability vocabulary as a datalist.
export function SkillListField({
  label,
  value,
  onChange,
  gameSlug,
  gameName,
}: {
  label: string;
  value: unknown;
  onChange: (next: SkillRow[]) => void;
  gameSlug?: string;
  gameName?: string;
}) {
  const rows: SkillRow[] = Array.isArray(value) ? (value as SkillRow[]) : [];
  const preset = skillPresetFor(gameSlug, gameName);
  const typeListId = useId();
  const groupListId = useId();

  const update = (next: SkillRow[]) => onChange(next);
  const patch = (idx: number, p: Partial<SkillRow>) =>
    update(rows.map((r, i) => (i === idx ? { ...r, ...p } : r)));
  const add = () => update([...rows, { type: preset.types[0] ?? "", name: "", description: "" }]);
  const remove = (idx: number) => update(rows.filter((_, i) => i !== idx));

  // How many levels the ability's track expects, for the value-count hint.
  const trackTicksOf = (idx: number) =>
    trackFor(preset.tracks, rows[idx].track, rows[idx].type)?.ticks.length ?? 0;

  // Per-ability scaling rows. `values` is stored as an array (one entry per
  // level); the input edits it as a comma-separated string so a datamined list
  // pastes straight in.
  const scalingsOf = (idx: number) => rows[idx].scalings ?? [];
  const setScalings = (idx: number, next: SkillScaling[]) => patch(idx, { scalings: next });
  const addScaling = (idx: number) => setScalings(idx, [...scalingsOf(idx), { label: "", values: [] }]);
  const removeScaling = (idx: number, j: number) => setScalings(idx, scalingsOf(idx).filter((_, k) => k !== j));
  const patchScaling = (idx: number, j: number, p: Partial<SkillScaling>) =>
    setScalings(idx, scalingsOf(idx).map((sc, k) => (k === j ? { ...sc, ...p } : sc)));

  // Every wiki writes per-level values the same way: slash-separated, inline in
  // the sentence ("CRIT Rate by 12/14/16/18/20%"). Rather than make the admin
  // split those by hand for each of a few hundred items, lift every run into a
  // scaling and leave a {token} behind — the description keeps reading like the
  // game's own text and the page fills in the value for the selected level.
  const extractFromDescription = (idx: number) => {
    const description = rows[idx].description ?? "";
    const { text, scalings } = extractScalingRuns(description);
    if (scalings.length === 0) return;
    patch(idx, { description: text, scalings: [...scalingsOf(idx), ...scalings] });
  };

  // Put a scaling's token at the end of the description so it can be dragged
  // into place, rather than making the admin remember the slug spelling.
  const insertToken = (idx: number, j: number) => {
    const sc = scalingsOf(idx)[j];
    const token = slugify(sc?.label ?? "") || String(j + 1);
    const description = rows[idx].description ?? "";
    const sep = description.length > 0 && !description.endsWith(" ") ? " " : "";
    patch(idx, { description: `${description}${sep}{${token}}` });
  };
  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= rows.length) return;
    const copy = rows.slice();
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    update(copy);
  };

  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>

      <datalist id={typeListId}>
        {preset.types.map((t) => <option key={t} value={t} />)}
      </datalist>
      <datalist id={groupListId}>
        {preset.groups.map((g) => <option key={g} value={g} />)}
      </datalist>

      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={idx} className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-5 shrink-0">#{idx + 1}</span>
              <input
                type="text"
                value={row.type ?? ""}
                onChange={(e) => patch(idx, { type: e.target.value })}
                list={typeListId}
                placeholder="Type (e.g. Skill, Ultimate)"
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
              <input
                type="text"
                value={row.group ?? ""}
                onChange={(e) => patch(idx, { group: e.target.value })}
                list={groupListId}
                placeholder="Group (optional)"
                className="w-32 shrink-0 px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
              <select
                value={row.track ?? ""}
                onChange={(e) => patch(idx, { track: e.target.value })}
                title="Level track this ability scales along"
                aria-label="Level track"
                className="w-28 shrink-0 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              >
                <option value="">Auto</option>
                {preset.tracks.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} 1–{t.ticks[t.ticks.length - 1]}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                aria-label="Move up"
                className="w-7 h-7 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(idx, 1)} disabled={idx === rows.length - 1}
                aria-label="Move down"
                className="w-7 h-7 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition disabled:opacity-30">↓</button>
              <button type="button" onClick={() => remove(idx)}
                aria-label="Remove ability"
                className="w-7 h-7 rounded border border-gray-700 text-red-400 hover:border-red-900 transition">✕</button>
            </div>

            <input
              type="text"
              value={row.name ?? ""}
              onChange={(e) => patch(idx, { name: e.target.value })}
              placeholder="Ability name"
              className="w-full px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm font-medium focus:outline-none focus:border-white"
            />
            <div>
              <textarea
                value={row.description ?? ""}
                onChange={(e) => patch(idx, { description: e.target.value })}
                rows={2}
                placeholder="Description — paste the wiki text, e.g. …CRIT Rate by 12/14/16/18/20%"
                className="w-full px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white resize-y"
              />
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => extractFromDescription(idx)}
                  title="Turn every 12/14/16-style run in the description into a scaling, leaving a {token} in its place"
                  className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition"
                >
                  Extract values
                </button>
                <span className="text-[11px] text-gray-600">
                  splits 12/14/16 runs into per-level values
                </span>
              </div>
            </div>
            <ImageUploadField
              label="Icon (optional)"
              value={row.icon_url ?? ""}
              onChange={(url) => patch(idx, { icon_url: url })}
              placeholder="https://… or upload →"
              previewHeight="h-10"
            />

            <div className="pt-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-gray-500">Scalings (per level)</span>
                <button
                  type="button"
                  onClick={() => addScaling(idx)}
                  className="text-xs text-gray-400 hover:text-white transition"
                >
                  + value
                </button>
              </div>
              {(row.scalings ?? []).map((sc, j) => (
                <div key={j} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sc.label ?? ""}
                    onChange={(e) => patchScaling(idx, j, { label: e.target.value })}
                    placeholder="Label (e.g. DMG Boost)"
                    className="w-40 shrink-0 px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  />
                  <input
                    type="text"
                    value={(sc.values ?? []).join(", ")}
                    onChange={(e) => patchScaling(idx, j, { values: splitValues(e.target.value) })}
                    placeholder="12%, 15.7%, … or 12/14/16 (one per level)"
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  />
                  {/* Count against the track's expected length, so a run that
                      was pasted short or long is visible before saving. */}
                  <span
                    className={`text-[11px] w-14 text-right shrink-0 tabular-nums ${
                      trackTicksOf(idx) > 0 && (sc.values ?? []).length !== trackTicksOf(idx)
                        ? "text-amber-500"
                        : "text-gray-600"
                    }`}
                    title={`${(sc.values ?? []).length} value(s); this track has ${trackTicksOf(idx)} levels`}
                  >
                    {(sc.values ?? []).length}/{trackTicksOf(idx)}
                  </span>
                  <button
                    type="button"
                    onClick={() => insertToken(idx, j)}
                    title="Append this scaling's token to the description"
                    aria-label="Insert token into description"
                    className="w-7 h-7 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition shrink-0 text-xs"
                  >
                    {"{}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeScaling(idx, j)}
                    aria-label="Remove scaling"
                    className="w-7 h-7 rounded border border-gray-700 text-red-400 hover:border-red-900 transition shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={add}
          className="text-xs text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 w-full transition"
        >
          + Add ability
        </button>
      </div>
    </div>
  );
}
