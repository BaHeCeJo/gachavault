-- Mark an item type schema as "collectable" (characters, weapons, agents,
-- Nikkes, …) — as opposed to relics/materials. Collectable types get the
-- standard forced image slots (icon / portrait / splashart / full art) in the
-- admin item form and portrait browse cards on the site. Defaults to false so
-- existing schemas are unaffected.
ALTER TABLE games.item_type_schemas
    ADD COLUMN IF NOT EXISTS is_collectable BOOLEAN NOT NULL DEFAULT FALSE;
