// Per-section detail-page template model. A `page_layout` is an ordered list
// of blocks that drive how an item's DETAIL page renders. `null` (or anything
// malformed) means "no template" → the renderer falls back to the legacy fixed
// layout, byte-identically to before this feature existed.
//
// Block configs reference schema FIELD KEYS (same pattern as CardLayout slots),
// so a block reads item.data[key] at render time. The storage/parse layer is
// intentionally permissive (only id+type are required) so that a newer block
// type written by a future admin build degrades to "unknown → skipped" on an
// older frontend instead of corrupting the whole layout.

export type BlockType = "legacy" | "hero" | "stats_table" | "rich_text" | "item_grid";

export interface PageBlock {
  // Stable across reorder — used as the React key and the drag id.
  id: string;
  // Discriminator the renderer switches on.
  type: string;
  // Block-specific settings (field keys, titles, toggles). Shape depends on type.
  config?: Record<string, unknown>;
}

export interface PageLayout {
  version: 1;
  blocks: PageBlock[];
}

// ---- Per-block config shapes (the renderer/editor cast block.config to these) ----

export interface HeroConfig {
  image_field?: string; // default "image_url" (falls back to icon_url)
  name_field?: string; // default "name"
  rarity_field?: string; // default "rarity"
  badge_fields?: string[]; // attribute field keys → pills
  show_section_tag?: boolean;
}

export interface StatsTableConfig {
  title?: string;
  // Explicit field keys in order; empty/undefined = auto (all non-hidden fields).
  fields?: string[];
}

export interface RichTextConfig {
  title?: string;
  source_field?: string; // read item.data[source_field]
  static_text?: string; // used when source_field is empty
  style?: "plain" | "quote" | "lore";
}

export interface ItemGridConfig {
  title?: string;
  // "" or "related" = the related-items grid; otherwise a field key
  // (itemref / backref / itemlist) to pull the list from.
  source?: string;
  columns?: number; // 3 | 4 | 6 (default 6)
  limit?: number; // default 12
}

// ---- Editor palette: blocks an admin can add (legacy is the null-equivalent
// fallback and intentionally not offered here). ----

export interface BlockTypeMeta {
  type: BlockType;
  label: string;
  help: string;
  defaultConfig: () => Record<string, unknown>;
}

export const BLOCK_TYPES: BlockTypeMeta[] = [
  { type: "hero", label: "Hero", help: "Art + name + rarity + attribute badges", defaultConfig: () => ({ show_section_tag: true }) },
  { type: "stats_table", label: "Stats table", help: "A table of fields — auto, or pick which ones", defaultConfig: () => ({}) },
  { type: "rich_text", label: "Rich text", help: "Heading + a text field (description, lore) or custom text", defaultConfig: () => ({ style: "plain" }) },
  { type: "item_grid", label: "Item grid", help: "Card grid: related items, or an item-reference field", defaultConfig: () => ({ source: "related", columns: 6, limit: 12 }) },
];

export const BLOCK_LABELS: Record<string, string> = Object.fromEntries(
  BLOCK_TYPES.map((b) => [b.type, b.label]),
);

// Stable-enough id for a freshly added block (client-only use).
export function makeBlockId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `b_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// Runtime trust boundary: turn the raw JSON coming back from the API (or an
// admin-pasted string) into a PageLayout, or null if it isn't usable. Returning
// null is the signal to render the legacy layout.
export function parsePageLayout(raw: unknown): PageLayout | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.blocks)) return null;

  const blocks: PageBlock[] = [];
  for (const b of obj.blocks) {
    if (!b || typeof b !== "object" || Array.isArray(b)) continue;
    const bb = b as Record<string, unknown>;
    if (typeof bb.id !== "string" || typeof bb.type !== "string") continue;
    const block: PageBlock = { id: bb.id, type: bb.type };
    if (bb.config && typeof bb.config === "object" && !Array.isArray(bb.config)) {
      block.config = bb.config as Record<string, unknown>;
    }
    blocks.push(block);
  }
  return { version: 1, blocks };
}

// Seed for the admin "mirror current page" action: decompose the legacy fixed
// page into editable blocks (hero → stats → description → lore → related), so
// an admin gets the familiar layout as a starting point to rearrange.
export function defaultLayoutFromSchema(fields?: { key: string; type?: string }[]): PageLayout {
  const keys = new Set((fields ?? []).map((f) => f.key));
  const hasField = (k: string) => keys.size === 0 || keys.has(k);

  const blocks: PageBlock[] = [
    { id: makeBlockId(), type: "hero", config: { show_section_tag: true } },
    { id: makeBlockId(), type: "stats_table", config: {} },
  ];
  if (hasField("description")) {
    blocks.push({ id: makeBlockId(), type: "rich_text", config: { title: "Description", source_field: "description", style: "quote" } });
  }
  if (hasField("lore")) {
    blocks.push({ id: makeBlockId(), type: "rich_text", config: { title: "Lore", source_field: "lore", style: "lore" } });
  }
  blocks.push({ id: makeBlockId(), type: "item_grid", config: { source: "related", columns: 6, limit: 12 } });
  return { version: 1, blocks };
}
