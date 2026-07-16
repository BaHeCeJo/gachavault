"use client";

import {
  COLLECTABLE_PRESET,
  LIGHTCONE_PRESET,
  IMAGE_ROLES,
  resolveImageSlots,
  type ImageRole,
  type ImageSlot,
} from "@/lib/imageSlots";

// Editor for a schema's per-type image slots. `value === null` means "use the
// default layout implied by the Collectable toggle" (a character's four slots,
// or a single image); an array is an explicit, custom slot list. This is what
// lets a lightcone (icon / full art / basic art) differ from a character.

// Aspect presets for the crop button. `null` = free upload with no cropper.
const ASPECT_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Free (no crop)", value: null },
  { label: "Square 1:1", value: 1 },
  { label: "Portrait 3:4", value: 3 / 4 },
  { label: "Landscape 4:3", value: 4 / 3 },
  { label: "Wide 16:9", value: 16 / 9 },
];

const ROLE_HINTS: Record<ImageRole, string> = {
  thumb: "square list thumbnails",
  card: "browse cards",
  hero: "detail-page hero",
  gallery: "detail gallery",
};

function aspectLabel(a: number | null): string {
  const match = ASPECT_OPTIONS.find((o) => o.value === a);
  if (match) return match.label;
  return a == null ? "Free (no crop)" : `${a.toFixed(3)}`;
}

export function ImageSlotsEditor({
  value,
  onChange,
  isCollectable,
}: {
  value: ImageSlot[] | null;
  onChange: (next: ImageSlot[] | null) => void;
  isCollectable: boolean;
}) {
  const slots = value;

  const update = (idx: number, patch: Partial<ImageSlot>) => {
    if (!slots) return;
    onChange(slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const remove = (idx: number) => {
    if (!slots) return;
    onChange(slots.filter((_, i) => i !== idx));
  };
  const move = (idx: number, dir: -1 | 1) => {
    if (!slots) return;
    const next = idx + dir;
    if (next < 0 || next >= slots.length) return;
    const copy = slots.slice();
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  };
  const add = () => {
    const base = slots ?? [];
    onChange([
      ...base,
      { key: "", label: "", aspect: null, cropFrom: [], roles: [] },
    ]);
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-200">Image slots</span>
        {slots === null ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange(resolveImageSlots({ is_collectable: isCollectable }).map((s) => ({ ...s })))}
              className="text-xs px-2 py-1 rounded border border-gray-700 hover:border-white transition"
            >
              Customize
            </button>
            <button
              type="button"
              onClick={() => onChange(COLLECTABLE_PRESET.map((s) => ({ ...s })))}
              className="text-xs px-2 py-1 rounded border border-gray-700 hover:border-white transition"
            >
              Character preset
            </button>
            <button
              type="button"
              onClick={() => onChange(LIGHTCONE_PRESET.map((s) => ({ ...s })))}
              className="text-xs px-2 py-1 rounded border border-gray-700 hover:border-white transition"
            >
              Lightcone preset
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs px-2 py-1 rounded border border-gray-700 hover:border-red-500/60 hover:text-red-300 transition"
          >
            Reset to default
          </button>
        )}
      </div>

      {slots === null ? (
        <p className="text-xs text-gray-500">
          Using the default layout from the Collectable toggle —{" "}
          <span className="text-gray-300">
            {isCollectable ? "icon, portrait, splash art and full art" : "a single image with an auto-icon"}
          </span>
          . Customize to give this type its own set of images (e.g. a lightcone&apos;s icon / full
          art / basic art, with no portrait or splash).
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            Each slot is one uploadable image. <span className="text-gray-300">Key</span> is the
            data field it&apos;s saved under (use a <code>_url</code> suffix).{" "}
            <span className="text-gray-300">Roles</span> decide which site surfaces show it.{" "}
            <span className="text-gray-300">Crop from</span> lets the admin cut this image out of
            another slot&apos;s art.
          </p>

          {slots.length === 0 && (
            <p className="text-xs text-amber-400">No slots — this type will have no images.</p>
          )}

          <div className="space-y-2">
            {slots.map((slot, idx) => {
              const others = slots.filter((_, i) => i !== idx).filter((s) => s.key.trim());
              return (
                <div key={idx} className="rounded-lg border border-gray-800 bg-gray-950/40 p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={slot.key}
                      onChange={(e) => update(idx, { key: e.target.value })}
                      placeholder="key (e.g. icon_url)"
                      className="w-40 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm font-mono focus:outline-none focus:border-white"
                    />
                    <input
                      type="text"
                      value={slot.label}
                      onChange={(e) => update(idx, { label: e.target.value })}
                      placeholder="Label (e.g. Icon)"
                      className="flex-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                    />
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                        className="px-1.5 py-1 text-xs rounded border border-gray-700 hover:border-white disabled:opacity-30 transition" title="Move up">↑</button>
                      <button type="button" onClick={() => move(idx, 1)} disabled={idx === slots.length - 1}
                        className="px-1.5 py-1 text-xs rounded border border-gray-700 hover:border-white disabled:opacity-30 transition" title="Move down">↓</button>
                      <button type="button" onClick={() => remove(idx)}
                        className="px-1.5 py-1 text-xs rounded border border-gray-700 hover:border-red-500/60 hover:text-red-300 transition" title="Remove slot">✕</button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="flex items-center gap-1.5 text-xs text-gray-400">
                      Crop aspect
                      <select
                        value={aspectLabel(slot.aspect)}
                        onChange={(e) => {
                          const opt = ASPECT_OPTIONS.find((o) => o.label === e.target.value);
                          update(idx, { aspect: opt ? opt.value : null });
                        }}
                        className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs focus:outline-none focus:border-white"
                      >
                        {ASPECT_OPTIONS.map((o) => (
                          <option key={o.label} value={o.label}>{o.label}</option>
                        ))}
                      </select>
                    </label>

                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>Roles:</span>
                      {IMAGE_ROLES.map((role) => {
                        const on = slot.roles.includes(role);
                        return (
                          <label key={role} className="flex items-center gap-1" title={ROLE_HINTS[role]}>
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                update(idx, {
                                  roles: on ? slot.roles.filter((r) => r !== role) : [...slot.roles, role],
                                })
                              }
                            />
                            {role}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {others.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                      <span>Crop from:</span>
                      {others.map((o) => {
                        const on = slot.cropFrom.includes(o.key);
                        return (
                          <label key={o.key} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                update(idx, {
                                  cropFrom: on
                                    ? slot.cropFrom.filter((k) => k !== o.key)
                                    : [...slot.cropFrom, o.key],
                                })
                              }
                            />
                            <span className="font-mono">{o.key}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={add}
            className="text-xs px-2.5 py-1.5 rounded border border-gray-700 hover:border-white transition"
          >
            + Add slot
          </button>
        </>
      )}
    </div>
  );
}
