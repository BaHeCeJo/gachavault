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

export interface PageBlock {
  // Stable across reorder — used as the React key and (later) the drag id.
  id: string;
  // Discriminator the renderer switches on. Stage 1 ships only "legacy".
  type: string;
  // Block-specific settings (field keys, titles, toggles). Shape depends on type.
  config?: Record<string, unknown>;
}

export interface PageLayout {
  version: 1;
  blocks: PageBlock[];
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

// Seed for the admin "start from current layout" action. Stage 1 returns a
// single `legacy` block — the exact equivalent of having no template — which
// later stages will replace with a decomposed (hero/stats/text/grid) default.
export function defaultLayoutFromSchema(_fields?: unknown): PageLayout {
  return { version: 1, blocks: [{ id: "legacy", type: "legacy" }] };
}
