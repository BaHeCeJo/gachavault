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

export function focusKeyFor(urlKey: string): string {
  return urlKey.endsWith("_url") ? `${urlKey.slice(0, -4)}_focus` : `${urlKey}_focus`;
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
