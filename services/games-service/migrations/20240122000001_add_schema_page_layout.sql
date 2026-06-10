-- Per-section detail-page template: an ordered list of layout blocks that
-- drive how an item's DETAIL page renders (hero, stats, rich text, item
-- grids, tabs, etc.). NULL = fall back to the hardcoded fixed layout
-- (image sidebar + stats table + description/lore + related). Mirrors the
-- card_layout column, which does the same for the section grid cards.
ALTER TABLE games.item_type_schemas
  ADD COLUMN IF NOT EXISTS page_layout JSONB NULL;
