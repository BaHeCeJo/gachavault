-- Link a calendar event to the reusable banner it is a run of.
--
-- A banner is an item (a "Banners" section/schema per game), so reruns of
-- Acheron's "Words of Yore" are one banner item with several event rows rather
-- than several unrelated events. NULL for non-banner events, and for banner
-- events not yet attached to a preset.
--
-- Division of labour with events.event_items:
--   items.item_links (relation='rate_up') = the preset roster — the signature
--     unit(s) that define the banner, stable across every rerun.
--   events.event_items                    = this run's full lineup, including
--     the 4★s / secondary rate-ups that differ between reruns. Seeded from the
--     preset on creation, then edited per run.
ALTER TABLE events.events
    ADD COLUMN IF NOT EXISTS banner_item_id UUID;

-- ON DELETE SET NULL: deleting a banner item must not erase calendar history.
-- Gated on items.items existing — sqlx::testing applies only this service's
-- migrations, so the referent is absent there.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'items' AND table_name = 'items'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'events'
          AND table_name = 'events'
          AND constraint_name = 'events_banner_item_id_fkey'
    ) THEN
        ALTER TABLE events.events
            ADD CONSTRAINT events_banner_item_id_fkey
            FOREIGN KEY (banner_item_id) REFERENCES items.items(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Drives "every run of this banner", the query behind both the banner page and
-- a character's banner history.
CREATE INDEX IF NOT EXISTS idx_events_banner_item
    ON events.events(banner_item_id) WHERE banner_item_id IS NOT NULL;
