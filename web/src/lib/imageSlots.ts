// Per-schema image slot configuration.
//
// Different collectable types carry different image roles: a character has an
// icon / portrait / splash / full art, while a lightcone has an icon / full art
// / basic art with no portrait or splash. Rather than hardcode one fixed set of
// image fields (the old `is_collectable` boolean did exactly that), each schema
// declares its own list of slots.
//
// A slot's `key` is a `<base>_url` data key, so the existing `_focus` / `_zoom`
// sibling convention in imageFocus.ts keeps working unchanged.

export type ImageRole = "thumb" | "card" | "hero" | "gallery";

export const IMAGE_ROLES: ImageRole[] = ["thumb", "card", "hero", "gallery"];

export interface ImageSlot {
  // The `<base>_url` data key the uploaded image is stored under.
  key: string;
  // Admin-form label for the upload field.
  label: string;
  // Crop aspect ratio for the "Make …" button, or null for a plain upload with
  // no cropper (e.g. transparent full art you don't want to crop).
  aspect: number | null;
  // Other slot keys to offer as crop sources, in preferred order. The cropper
  // drops the empty ones and lets the admin pick among what's left.
  cropFrom: string[];
  // Which site surfaces render this image. `thumb` = square list thumbnails,
  // `card` = browse cards, `hero` = detail-page hero, `gallery` = detail gallery.
  roles: ImageRole[];
}

// ---------------------------------------------------------------------------
// Presets — the effective slot list when a schema has no explicit image_slots.
// ---------------------------------------------------------------------------

// The classic character layout the `is_collectable` flag used to force. Kept as
// the default (and as a one-click preset in the schema editor) so existing
// collectable schemas render identically without any data migration.
export const COLLECTABLE_PRESET: ImageSlot[] = [
  {
    key: "fullart_url",
    label: "Full art (transparent, no background)",
    aspect: null,
    cropFrom: [],
    roles: ["hero"],
  },
  {
    key: "image_url",
    label: "Splash art (with background)",
    aspect: null,
    cropFrom: [],
    roles: ["gallery"],
  },
  {
    key: "portrait_url",
    label: "Portrait (3:4)",
    aspect: 3 / 4,
    cropFrom: ["fullart_url", "image_url"],
    roles: ["card"],
  },
  {
    key: "icon_url",
    label: "Icon (square)",
    aspect: 1,
    cropFrom: ["portrait_url", "fullart_url", "image_url"],
    roles: ["thumb"],
  },
];

// Non-collectable default: a single image, with an auto-icon cropped from it.
// The item form special-cases this (crop saves into icon_url) to match the old
// behavior, so it carries no explicit icon slot.
export const SINGLE_IMAGE_PRESET: ImageSlot[] = [
  {
    key: "image_url",
    label: "Image",
    aspect: 1,
    cropFrom: ["image_url"],
    roles: ["thumb", "card", "hero"],
  },
];

// A ready-made lightcone / weapon-cone preset (icon / full art / basic art),
// offered as a starting point in the schema editor.
export const LIGHTCONE_PRESET: ImageSlot[] = [
  {
    key: "fullart_url",
    label: "Full art",
    aspect: null,
    cropFrom: [],
    roles: ["hero"],
  },
  {
    key: "basic_url",
    label: "Basic art",
    aspect: null,
    cropFrom: [],
    roles: ["gallery"],
  },
  {
    key: "icon_url",
    label: "Icon (square)",
    aspect: 1,
    cropFrom: ["fullart_url", "basic_url"],
    roles: ["thumb", "card"],
  },
];

// ---------------------------------------------------------------------------
// Parsing / resolution
// ---------------------------------------------------------------------------

function parseSlot(raw: unknown): ImageSlot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.key !== "string" || !o.key.trim()) return null;
  const aspect =
    typeof o.aspect === "number" && Number.isFinite(o.aspect) && o.aspect > 0 ? o.aspect : null;
  const cropFrom = Array.isArray(o.cropFrom)
    ? o.cropFrom.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    : [];
  const roles = Array.isArray(o.roles)
    ? o.roles.filter((r): r is ImageRole => IMAGE_ROLES.includes(r as ImageRole))
    : [];
  return {
    key: o.key,
    label: typeof o.label === "string" && o.label.trim() ? o.label : o.key,
    aspect,
    cropFrom,
    roles,
  };
}

// Runtime trust boundary: turn raw image_slots JSON (from the API or an
// admin-pasted string) into an ImageSlot[], or null when it isn't usable. Null
// is the signal to fall back to a preset.
export function parseImageSlots(raw: unknown): ImageSlot[] | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  const slots = value.map(parseSlot).filter((s): s is ImageSlot => s !== null);
  return slots.length > 0 ? slots : null;
}

export interface SchemaLike {
  is_collectable?: boolean;
  image_slots?: unknown;
}

// The effective slot list for a schema: an explicit image_slots config if
// present and valid, otherwise the preset implied by is_collectable. This is the
// single source of truth the item form and the render side both read.
export function resolveImageSlots(schema: SchemaLike | null | undefined): ImageSlot[] {
  const parsed = parseImageSlots(schema?.image_slots);
  if (parsed) return parsed;
  return schema?.is_collectable ? COLLECTABLE_PRESET : SINGLE_IMAGE_PRESET;
}

// Ordered data keys to try for a given render role: slots that declare the role
// first (in slot order), then every other slot as a generic fallback so a
// surface never comes up empty when the preferred image is missing. For the
// legacy character/single presets this reproduces the old THUMB/PORTRAIT/hero
// fallback behavior for real (fully-or-partially populated) items.
export function slotKeysForRole(slots: ImageSlot[], role: ImageRole): string[] {
  const primary = slots.filter((s) => s.roles.includes(role)).map((s) => s.key);
  const rest = slots.filter((s) => !s.roles.includes(role)).map((s) => s.key);
  return [...primary, ...rest];
}

// Whether browse cards for this schema should render in 3:4 portrait shape (vs a
// square thumbnail). True when the card-role slot is portrait-shaped — e.g. a
// character's 3:4 portrait — false for square-icon types like lightcones. This
// replaces the old `portrait={schema.is_collectable}` decision.
export function cardIsPortrait(schema: SchemaLike | null | undefined): boolean {
  const slots = resolveImageSlots(schema);
  const cardSlot = slots.find((s) => s.roles.includes("card"));
  return cardSlot != null && cardSlot.aspect != null && cardSlot.aspect < 1;
}
