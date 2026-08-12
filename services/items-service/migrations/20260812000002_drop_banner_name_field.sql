-- Drop the free-text "Signature Banner" field now that banners are real
-- entities.
--
-- `banner_name` stored a banner's title as text on each collectable. That fact
-- now lives in items.item_links (relation='rate_up'), which additionally
-- carries the dates, the reruns and a link to the banner's own page — and,
-- unlike hand-typed text, can't drift from reality. Keeping both would leave
-- two records of the same relationship, edited in different places, with
-- nothing reconciling them.
--
-- Removes the field from any schema that declares it and strips the key from
-- every item's data. Only Honkai: Star Rail's Character and Light Cones
-- schemas declare it, and only one item (Acheron, "Words of Yore") has a
-- value — already represented by the words-of-yore banner and its 2024 run.
--
-- In items-service because it rewrites items.items; games-service boots first,
-- so games.item_type_schemas is always present here in a real deploy. The
-- guard covers sqlx::testing, which applies only this service's migrations.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'games' AND table_name = 'item_type_schemas'
    ) THEN
        -- Rebuild `fields` without the banner_name entry, preserving order.
        UPDATE games.item_type_schemas s
           SET fields = COALESCE((
                   SELECT jsonb_agg(f ORDER BY ord)
                     FROM jsonb_array_elements(s.fields) WITH ORDINALITY AS t(f, ord)
                    WHERE f->>'key' IS DISTINCT FROM 'banner_name'
               ), '[]'::jsonb),
               updated_at = NOW()
         WHERE s.fields @> '[{"key": "banner_name"}]'::jsonb;
    END IF;
END $$;

-- Strip the orphaned value so it doesn't linger in item data invisibly.
UPDATE items.items
   SET data = data - 'banner_name',
       updated_at = NOW()
 WHERE data ? 'banner_name';
