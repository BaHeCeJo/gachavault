-- Backfill: turn banner events already in the calendar into banner items.
--
-- For every game that has at least one event_type='banner' event:
--   1. ensure a "Banners" section + its one item type schema,
--   2. create one banner item per existing banner event,
--   3. point the event at it via banner_item_id,
--   4. seed the banner's preset roster from that event's role='featured' items.
--
-- Idempotent throughout: re-running adopts existing rows rather than
-- duplicating, and events already carrying a banner_item_id are skipped.
--
-- Ordering note: events-service boots after items-service (compose
-- depends_on: service_healthy), so items.item_links from 20260801000001 always
-- exists by the time this runs in a real deploy. The guard below covers
-- sqlx::testing, which applies only this service's migrations.
DO $$
DECLARE
    v_game       RECORD;
    v_event      RECORD;
    v_section_id UUID;
    v_schema_id  UUID;
    v_author     UUID;
    v_banner_id  UUID;
    v_slug       TEXT;
    v_suffix     INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'items' AND table_name = 'item_links'
    ) THEN
        RAISE NOTICE 'items.item_links absent — skipping banner backfill';
        RETURN;
    END IF;

    FOR v_game IN
        SELECT DISTINCT game_id FROM events.events WHERE event_type = 'banner'
    LOOP
        -- items.created_by is NOT NULL with an FK to auth.users, so a game with
        -- no usable author can't be backfilled. Prefer whoever authored the
        -- banner events; fall back to the oldest account.
        SELECT COALESCE(
                   (SELECT e.created_by FROM events.events e
                     WHERE e.game_id = v_game.game_id AND e.event_type = 'banner'
                       AND e.created_by IS NOT NULL
                     ORDER BY e.created_at ASC LIMIT 1),
                   (SELECT u.id FROM auth.users u ORDER BY u.created_at ASC LIMIT 1)
               )
          INTO v_author;

        IF v_author IS NULL THEN
            RAISE NOTICE 'No author available for game % — skipping', v_game.game_id;
            CONTINUE;
        END IF;

        -- 1. Section (slug lowercase, per 20260715000001).
        SELECT id INTO v_section_id
          FROM games.sections
         WHERE game_id = v_game.game_id AND slug = 'banners';

        IF v_section_id IS NULL THEN
            INSERT INTO games.sections (game_id, slug, name, "order")
            VALUES (
                v_game.game_id, 'banners', 'Banners',
                COALESCE((SELECT MAX("order") + 1 FROM games.sections
                           WHERE game_id = v_game.game_id), 0)
            )
            RETURNING id INTO v_section_id;
        END IF;

        -- 2. Schema. is_collectable = FALSE: you pull *from* a banner, not one.
        --    The banner's kind (character / weapon / chronicled) is derived from
        --    the schemas of its linked rate-up items, so there's no kind field.
        SELECT id INTO v_schema_id
          FROM games.item_type_schemas
         WHERE game_id = v_game.game_id AND section_id = v_section_id;

        IF v_schema_id IS NULL THEN
            INSERT INTO games.item_type_schemas
                (game_id, section_id, name, fields, is_collectable, image_slots)
            VALUES (
                v_game.game_id, v_section_id, 'Banner',
                '[{"key":"description","label":"Description","type":"textarea"},
                  {"key":"version","label":"Game version","type":"text"}]'::jsonb,
                FALSE,
                '[{"key":"art_url","label":"Banner art","aspect":1.7777,
                   "cropFrom":[],"roles":["card","hero"]},
                  {"key":"icon_url","label":"Icon","aspect":1,
                   "cropFrom":["art_url"],"roles":["thumb"]}]'::jsonb
            )
            RETURNING id INTO v_schema_id;
        END IF;

        -- 3. One banner item per existing banner event.
        FOR v_event IN
            SELECT id, slug, title, description, image_url
              FROM events.events
             WHERE game_id = v_game.game_id
               AND event_type = 'banner'
               AND banner_item_id IS NULL
             ORDER BY start_at ASC
        LOOP
            -- items.slug is unique per game and the event slug may already be
            -- taken by a non-banner item. Walk to a free slug rather than
            -- risking a unique violation: this runs inside the migration's
            -- transaction, so a failed insert would panic the service on boot.
            v_slug := v_event.slug;
            v_suffix := 0;
            WHILE EXISTS (
                SELECT 1 FROM items.items
                 WHERE game_id = v_game.game_id AND slug = v_slug
                   AND section_id <> v_section_id
            ) LOOP
                v_suffix := v_suffix + 1;
                v_slug := v_event.slug || '-banner'
                          || CASE WHEN v_suffix > 1 THEN '-' || v_suffix ELSE '' END;
            END LOOP;

            -- An item with this slug inside the Banners section is this banner
            -- already (a re-run of the migration) — adopt it instead of
            -- inserting a duplicate.
            SELECT id INTO v_banner_id
              FROM items.items
             WHERE game_id = v_game.game_id AND slug = v_slug;

            IF v_banner_id IS NULL THEN
                INSERT INTO items.items
                    (game_id, section_id, type_schema_id, slug, data, created_by)
                VALUES (
                    v_game.game_id, v_section_id, v_schema_id, v_slug,
                    jsonb_strip_nulls(jsonb_build_object(
                        'name',        v_event.title,
                        'description', v_event.description,
                        'art_url',     v_event.image_url
                    )),
                    v_author
                )
                RETURNING id INTO v_banner_id;
            END IF;

            UPDATE events.events
               SET banner_item_id = v_banner_id
             WHERE id = v_event.id;

            -- 4. Preset roster = this run's headline rate-ups. The secondary
            --    rate-ups stay on the event only: they change between reruns,
            --    so they must not define the banner.
            --
            --    The join to items.items is not decoration: item_links has a
            --    same-game trigger, and a stray cross-game featured item would
            --    raise inside this transaction and crash-loop the service on
            --    boot. Filtering here turns that into a silently skipped row.
            INSERT INTO items.item_links (item_id, linked_item_id, relation, "order")
            SELECT v_banner_id, ei.item_id, 'rate_up', ei."order"
              FROM events.event_items ei
              JOIN items.items i ON i.id = ei.item_id
             WHERE ei.event_id = v_event.id
               AND ei.role = 'featured'
               AND ei.item_id <> v_banner_id
               AND i.game_id = v_game.game_id
            ON CONFLICT (item_id, linked_item_id, relation) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;
