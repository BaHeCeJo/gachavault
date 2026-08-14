-- Normalize the roles written by the banner importers.
--
-- The bulk import and the HSR seed script both wrote the wiki's authoring
-- vocabulary straight through: 'featured_5' for the headline rate-up and
-- 'featured_4' for the extras. Nothing else in the app speaks those words.
-- The lineup on a collectable's banner history splits on role = 'featured',
-- so every imported 5-star headliner rendered as an also-ran while the
-- hand-authored ones rendered correctly — the same run, two different shapes,
-- depending on how it happened to be entered.
--
-- Both producers now write 'featured' / 'rate_up'; this brings the rows that
-- were already imported in line with them. Idempotent, and a no-op on a
-- database that was never seeded from those scripts.
UPDATE events.event_items SET role = 'featured' WHERE role = 'featured_5';
UPDATE events.event_items SET role = 'rate_up' WHERE role = 'featured_4';
