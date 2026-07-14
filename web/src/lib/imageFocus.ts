// Focal-point helpers for cropped images.
//
// Card/thumbnail portraits render with `object-cover`, which crops toward the
// image *center*. When a character sits off-center in the source art, that
// centered crop cuts them badly. To fix it we store a focal point per image —
// a CSS `object-position` string like "50% 30%" — and apply it wherever the
// image is cropped so the crop anchors on the character instead of the middle.
//
// Convention: the focus for an image URL stored under `<base>_url` lives in a
// sibling key `<base>_focus` on the same item data object (e.g. `image_url` ->
// `image_focus`, `icon_url` -> `icon_focus`). Absent focus === undefined ===
// the previous centered behavior, so nothing changes retroactively.

function baseKey(urlKey: string): string {
  return urlKey.endsWith("_url") ? urlKey.slice(0, -4) : urlKey;
}

// Image roles for collectable items (characters, weapons, …):
//   icon_url      square icon (small/square surfaces)
//   portrait_url  3:4 portrait (browse/list cards)
//   image_url     splash art WITH background (backdrop, gallery, banner bg)
//   fullart_url   full art, transparent (detail-page hero)
// Legacy items have only image_url; the fallback chains keep them rendering.

// Small/square surfaces: icon → portrait → splash.
export const THUMB_KEYS = ["icon_url", "portrait_url", "image_url"];
// Browse/list cards (3:4): portrait → icon → splash.
export const PORTRAIT_KEYS = ["portrait_url", "icon_url", "image_url"];

function firstUrl(
  data: Record<string, unknown> | null | undefined,
  keys: string[],
): string | undefined {
  if (!data) return undefined;
  for (const k of keys) {
    const url = data[k];
    if (typeof url === "string" && url.trim()) return url;
  }
  return undefined;
}

// Preferred image for a compact/thumbnail display (icon first).
export function thumbUrl(data: Record<string, unknown> | null | undefined): string | undefined {
  return firstUrl(data, THUMB_KEYS);
}

// Preferred image for a portrait browse card (portrait first).
export function portraitUrl(data: Record<string, unknown> | null | undefined): string | undefined {
  return firstUrl(data, PORTRAIT_KEYS);
}

// The big detail-page hero render: transparent full art, else the splash art.
export function heroArtUrl(data: Record<string, unknown> | null | undefined): string | undefined {
  return firstUrl(data, ["fullart_url", "image_url"]);
}

export function focusKeyFor(urlKey: string): string {
  return `${baseKey(urlKey)}_focus`;
}

// Zoom is a companion to focus: a scale factor (>= 1) applied on top of the
// object-cover crop, anchored on the focal point. 1 (or absent) === no zoom ===
// the previous behavior. Stored under a sibling `<base>_zoom` key.
export function zoomKeyFor(urlKey: string): string {
  return `${baseKey(urlKey)}_zoom`;
}

// Returns the focal point paired with the first present image URL in `urlKeys`
// (defaults to the common image_url -> icon_url fallback order used across the
// card surfaces). Undefined when no focus is set — callers pass it straight to
// SafeImage's `focus` prop, which no-ops on undefined (centered crop).
export function imageFocus(
  data: Record<string, unknown> | null | undefined,
  urlKeys: string[] = ["image_url", "icon_url"],
): string | undefined {
  if (!data) return undefined;
  for (const k of urlKeys) {
    const url = data[k];
    if (typeof url === "string" && url.trim()) {
      const f = data[focusKeyFor(k)];
      return typeof f === "string" && f.trim() ? f : undefined;
    }
  }
  return undefined;
}

// Zoom factor (> 1) paired with the first present image URL, or undefined when
// no meaningful zoom is set. Passed straight to SafeImage's `zoom` prop.
export function imageZoom(
  data: Record<string, unknown> | null | undefined,
  urlKeys: string[] = ["image_url", "icon_url"],
): number | undefined {
  if (!data) return undefined;
  for (const k of urlKeys) {
    const url = data[k];
    if (typeof url === "string" && url.trim()) {
      const z = data[zoomKeyFor(k)];
      return typeof z === "number" && z > 1 ? z : undefined;
    }
  }
  return undefined;
}
