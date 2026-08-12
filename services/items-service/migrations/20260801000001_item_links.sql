-- Generic item ↔ item relations.
--
-- Deliberately not banner-specific: `relation` names the edge, so the same
-- table carries a banner's rate-up roster ('rate_up'), a character's signature
-- weapon, "materials used by", faction membership, etc.
--
-- The first consumer is the banner entity: a Banners-schema item links to the
-- collectables it features. Note that a banner's *preset* roster lives here
-- while a specific run's full lineup (including the 4★s that vary per rerun)
-- lives in events.event_items — see 20260801000002_events_banner_item.sql.
--
-- Many-to-many in both directions: one banner features several items (Chronicled
-- Wish, Endfield's Feast of Radiance), and one item is featured by several
-- banners across its reruns.
CREATE TABLE IF NOT EXISTS items.item_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items.items(id) ON DELETE CASCADE,
    linked_item_id UUID NOT NULL REFERENCES items.items(id) ON DELETE CASCADE,
    relation VARCHAR(50) NOT NULL DEFAULT 'rate_up',
    "order" INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(item_id, linked_item_id, relation),
    CONSTRAINT item_links_no_self_link CHECK (item_id <> linked_item_id)
);

-- Links never cross games: a Star Rail banner cannot feature an Endfield unit.
-- This needs a subquery, so it's a trigger rather than a CHECK constraint.
CREATE OR REPLACE FUNCTION items.item_links_same_game() RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT game_id FROM items.items WHERE id = NEW.item_id)
       IS DISTINCT FROM
       (SELECT game_id FROM items.items WHERE id = NEW.linked_item_id) THEN
        RAISE EXCEPTION 'item_links: linked items must belong to the same game'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS item_links_same_game_trg ON items.item_links;
CREATE TRIGGER item_links_same_game_trg
    BEFORE INSERT OR UPDATE ON items.item_links
    FOR EACH ROW EXECUTE FUNCTION items.item_links_same_game();

-- item_id index serves "what does this banner feature"; linked_item_id serves
-- the reverse lookup that drives a character's banner history.
CREATE INDEX IF NOT EXISTS idx_item_links_item ON items.item_links(item_id, relation);
CREATE INDEX IF NOT EXISTS idx_item_links_linked ON items.item_links(linked_item_id, relation);
