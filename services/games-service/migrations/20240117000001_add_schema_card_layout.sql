-- Per-schema card display config: which attribute drives the border color,
-- which goes top-left/top-right, which renders as a faded watermark behind
-- the portrait, plus the watermark opacity. NULL = fall back to the
-- hardcoded gacha-style defaults (border by rarity, element top-right).
ALTER TABLE games.item_type_schemas
  ADD COLUMN IF NOT EXISTS card_layout JSONB NULL;
