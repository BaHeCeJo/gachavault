-- Give every game a Banners section + schema, not just the ones that already
-- had banner events.
--
-- 20260801000003 provisioned these only for games with an existing
-- event_type='banner' event (one game), and the admin "+ New banner" button
-- provisions lazily on first use. That left the item editor unable to create a
-- banner for a game that had never had one — the Section dropdown had no
-- Banners option to pick. Provisioning up front removes the chicken-and-egg.
--
-- Lives in games-service because it only touches games.*, and because
-- games-service boots before items-service and events-service, so this is
-- always the newest applied version when it runs (see the shared
-- _sqlx_migrations ordering constraint).
--
-- Field and image-slot defaults are kept identical to the two other places
-- that create this schema: 20260801000003 and createBanner() in the admin
-- event form.
DO $$
DECLARE
    v_game       RECORD;
    v_section_id UUID;
BEGIN
    FOR v_game IN SELECT id FROM games.games LOOP
        SELECT id INTO v_section_id
          FROM games.sections
         WHERE game_id = v_game.id AND slug = 'banners';

        IF v_section_id IS NULL THEN
            INSERT INTO games.sections (game_id, slug, name, "order")
            VALUES (
                v_game.id, 'banners', 'Banners',
                COALESCE((SELECT MAX("order") + 1 FROM games.sections
                           WHERE game_id = v_game.id), 0)
            )
            RETURNING id INTO v_section_id;
        END IF;

        -- One schema per section (20240116000001), so this is unambiguous.
        -- is_collectable = FALSE: you pull *from* a banner, not one. A banner's
        -- kind (character / weapon / chronicled) is derived from the schemas of
        -- the items it links to, so there is no kind field.
        IF NOT EXISTS (
            SELECT 1 FROM games.item_type_schemas
             WHERE game_id = v_game.id AND section_id = v_section_id
        ) THEN
            INSERT INTO games.item_type_schemas
                (game_id, section_id, name, fields, is_collectable, image_slots)
            VALUES (
                v_game.id, v_section_id, 'Banner',
                '[{"key":"description","label":"Description","type":"textarea"},
                  {"key":"version","label":"Game version","type":"text"}]'::jsonb,
                FALSE,
                '[{"key":"art_url","label":"Banner art","aspect":1.7777,
                   "cropFrom":[],"roles":["card","hero"]},
                  {"key":"icon_url","label":"Icon","aspect":1,
                   "cropFrom":["art_url"],"roles":["thumb"]}]'::jsonb
            );
        END IF;
    END LOOP;
END $$;
