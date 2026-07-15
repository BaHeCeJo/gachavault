-- Section slugs are URL path segments (/games/{game}/{section}/{item}) and the
-- route matches them case-sensitively, so a capitalized slug yields a URL that
-- resolves in exactly one casing. create_section never normalized its input, so
-- genshin-impact accumulated four: Artifacts, Characters, Materials, Weapons.
--
-- Casing also silently breaks schema field references. `item_section` /
-- `source_section` on a schema field name a section *by slug*, and the frontend
-- resolves them with an exact match:
--
--     sections.find((s) => s.slug === field.item_section)
--
-- Those references were authored lowercase ('materials', 'characters'), so
-- against a 'Materials' slug they find nothing, `refSection` comes back null,
-- and the itemref/itemlist picker silently falls back to every item in the game
-- instead of scoping to the section. Lowercasing the slugs repairs them.
--
-- Skip any row that would collide with an existing lowercase sibling in the
-- same game (UNIQUE(game_id, slug)). No game currently has such a pair, but a
-- collision here would abort the migration, and a failed migration panics the
-- service on boot — leaving one row un-normalized is by far the better outcome.
UPDATE games.sections s
SET slug = lower(s.slug)
WHERE s.slug <> lower(s.slug)
  AND NOT EXISTS (
    SELECT 1
    FROM games.sections other
    WHERE other.game_id = s.game_id
      AND other.slug = lower(s.slug)
      AND other.id <> s.id
  );
