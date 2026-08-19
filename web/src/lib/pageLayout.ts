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

import type { SkillTrack } from "./skillPresets";

export type BlockType =
  | "legacy"
  | "hero"
  | "stats_table"
  | "rich_text"
  | "item_grid"
  | "columns"
  | "tabs"
  | "gallery"
  | "ratings"
  | "skills"
  | "banner_history"
  | "divider";

export interface PageBlock {
  // Stable across reorder — used as the React key and the drag id.
  id: string;
  // Discriminator the renderer switches on.
  type: string;
  // Block-specific settings (field keys, titles, toggles, child blocks).
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

export interface DividerConfig {
  label?: string;
}

export interface GalleryConfig {
  title?: string;
  image_fields?: string[]; // schema image/url field keys to show
  columns?: number; // 1 | 2 | 3 | 4 (default 3)
  aspect?: "video" | "square" | "portrait"; // tile shape (default "video")
  fit?: "cover" | "contain"; // crop-to-fill vs. letterbox uncropped (default "cover")
}

export interface RatingsConfig {
  title?: string;
  entries?: { label: string; field: string }[]; // each reads item.data[field]
  style?: "badge" | "bar";
}

export interface SkillsConfig {
  title?: string;
  list_field?: string; // a field whose value is an array of skill objects
  name_key?: string; // default "name"
  desc_key?: string; // default "description"
  icon_key?: string; // default "icon_url"
  type_key?: string; // default "type" — rendered as a category tag (e.g. "Skill", "Ultimate")
  group_key?: string; // default "group" — a value change starts a labelled subsection (e.g. "Memosprite")
  scalings_key?: string; // default "scalings" — array of { label, values[] } per-level multipliers, shown via a level slider
  track_key?: string; // default "track" — names the level track an ability scales along
  // default "tag" — a secondary badge beside the type (how an ability hits:
  // Single Target, Blast, AoE…), which is what tells two same-typed abilities
  // apart when the game shows them under one name.
  tag_key?: string;
  // Level tracks for this schema. Omitted (the norm) = the game's preset
  // tracks, so a light cone slider reads S1-S5 and a ZZZ core passive A-F
  // without any per-schema setup.
  tracks?: SkillTrack[];
}

export interface ColumnsConfig {
  ratio?: "1-1" | "1-2" | "2-1"; // default "1-1"
  columns?: PageBlock[][]; // child blocks per column (2 columns)
}

export interface TabConfig {
  id: string;
  label: string;
  blocks: PageBlock[];
}

export interface TabsConfig {
  tabs?: TabConfig[];
}

// ---- Editor palette: blocks an admin can add (legacy is the null-equivalent
// fallback and intentionally not offered here). `container` blocks hold child
// blocks and are only offered at the top level (nesting cap = 2). ----

export interface BlockTypeMeta {
  type: BlockType;
  label: string;
  help: string;
  container?: boolean;
  defaultConfig: () => Record<string, unknown>;
}

export const BLOCK_TYPES: BlockTypeMeta[] = [
  { type: "hero", label: "Hero", help: "Art + name + rarity + attribute badges", defaultConfig: () => ({ show_section_tag: true }) },
  { type: "stats_table", label: "Stats table", help: "A table of fields — auto, or pick which ones", defaultConfig: () => ({}) },
  { type: "rich_text", label: "Rich text", help: "Heading + a text field (description, lore) or custom text", defaultConfig: () => ({ style: "plain" }) },
  { type: "item_grid", label: "Item grid", help: "Card grid: related items, or an item-reference field", defaultConfig: () => ({ source: "related", columns: 6, limit: 12 }) },
  { type: "ratings", label: "Ratings", help: "Labeled badges or bars from fields", defaultConfig: () => ({ style: "badge", entries: [] }) },
  { type: "skills", label: "Skills", help: "A list of skills/abilities from a list field", defaultConfig: () => ({}) },
  { type: "gallery", label: "Gallery", help: "A grid of images from image fields", defaultConfig: () => ({ columns: 3 }) },
  { type: "banner_history", label: "Banner history", help: "Every banner run this item appeared on — or, on a banner, all its reruns", defaultConfig: () => ({}) },
  { type: "divider", label: "Divider", help: "A separator line with an optional label", defaultConfig: () => ({}) },
  { type: "columns", label: "Columns", help: "Two side-by-side columns of blocks", container: true, defaultConfig: () => ({ ratio: "1-1", columns: [[], []] }) },
  { type: "tabs", label: "Tabs", help: "Tabbed sections (e.g. Kit / Build / Lore)", container: true, defaultConfig: () => ({ tabs: [{ id: makeBlockId(), label: "Tab 1", blocks: [] }] }) },
];

export const BLOCK_LABELS: Record<string, string> = Object.fromEntries(
  BLOCK_TYPES.map((b) => [b.type, b.label]),
);

export const CONTAINER_TYPES = new Set(BLOCK_TYPES.filter((b) => b.container).map((b) => b.type));

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

// Parse one level of a block array. `depth` enforces the nesting cap: container
// children are parsed at depth+1, and at the cap any nested container's
// children are dropped (no container-in-container).
function parseBlocks(arr: unknown, depth: number): PageBlock[] {
  if (!Array.isArray(arr)) return [];
  const out: PageBlock[] = [];
  for (const b of arr) {
    if (!b || typeof b !== "object" || Array.isArray(b)) continue;
    const bb = b as Record<string, unknown>;
    if (typeof bb.id !== "string" || typeof bb.type !== "string") continue;
    const block: PageBlock = { id: bb.id, type: bb.type };
    const rawConfig =
      bb.config && typeof bb.config === "object" && !Array.isArray(bb.config)
        ? { ...(bb.config as Record<string, unknown>) }
        : undefined;
    if (rawConfig) {
      if (depth < 1 && bb.type === "columns" && Array.isArray(rawConfig.columns)) {
        rawConfig.columns = (rawConfig.columns as unknown[]).map((col) => parseBlocks(col, depth + 1));
      } else if (depth < 1 && bb.type === "tabs" && Array.isArray(rawConfig.tabs)) {
        rawConfig.tabs = (rawConfig.tabs as unknown[]).map((t) => {
          const tt = t && typeof t === "object" ? (t as Record<string, unknown>) : {};
          return {
            id: typeof tt.id === "string" ? tt.id : makeBlockId(),
            label: typeof tt.label === "string" ? tt.label : "Tab",
            blocks: parseBlocks(tt.blocks, depth + 1),
          };
        });
      } else if (depth >= 1) {
        // At the nesting cap a container can't hold children — strip them. Only
        // for the actual container types: a `gallery`/`item_grid` block also has
        // a `columns` key, but it's a NUMBER (grid width), not child blocks, and
        // must survive. (Deleting it indiscriminately reset nested galleries to
        // the default 3-wide grid.)
        if (bb.type === "columns") delete rawConfig.columns;
        if (bb.type === "tabs") delete rawConfig.tabs;
      }
      block.config = rawConfig;
    }
    out.push(block);
  }
  return out;
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
  return { version: 1, blocks: parseBlocks(obj.blocks, 0) };
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
