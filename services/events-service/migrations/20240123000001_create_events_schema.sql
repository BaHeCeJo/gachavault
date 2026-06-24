CREATE SCHEMA IF NOT EXISTS events;

-- A calendar entry for a game: a banner, version update, maintenance window,
-- limited-time event, etc. `event_type` is a free string (defaulting to
-- 'banner') rather than an enum so new categories can be added without a
-- migration. start_at/end_at are canonical UTC instants; `timezone` names the
-- IANA server-reset zone the event is anchored to (e.g. 'Asia/Shanghai') so the
-- frontend can show both the viewer's local time and the server-reset time.
CREATE TABLE IF NOT EXISTS events.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Cross-schema FK to games.games added in a later, conditional migration.
    game_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL DEFAULT 'banner',
    slug VARCHAR(150) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ,
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    data JSONB NOT NULL DEFAULT '{}',
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(game_id, slug)
);

-- Featured items on an event (e.g. the rate-up characters/weapons of a banner).
-- This link table is the hook the future pull/wish-planning feature builds on:
-- a user wish just points at the same item rows surfaced here.
CREATE TABLE IF NOT EXISTS events.event_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
    -- Cross-schema FK to items.items added in a later, conditional migration.
    item_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'featured',
    "order" INTEGER NOT NULL DEFAULT 0,
    UNIQUE(event_id, item_id)
);

-- Per-locale overrides for an event's title/description. Mirrors the
-- games.translations pattern; English lives on the events row itself.
CREATE TABLE IF NOT EXISTS events.event_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
    locale VARCHAR(10) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_id, locale)
);

-- Which games a user tracks for their personalized calendar. `event_types` is
-- NULL to follow every type, or an array to filter the personalized calendar to
-- specific categories (e.g. '{banner}' = banners only, no maintenance).
CREATE TABLE IF NOT EXISTS events.user_game_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Cross-schema FKs to auth.users / games.games added in a later migration.
    user_id UUID NOT NULL,
    game_id UUID NOT NULL,
    event_types TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_events_game_id ON events.events(game_id);
CREATE INDEX IF NOT EXISTS idx_events_start_at ON events.events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_end_at ON events.events(end_at);
CREATE INDEX IF NOT EXISTS idx_event_items_event_id ON events.event_items(event_id);
CREATE INDEX IF NOT EXISTS idx_event_items_item_id ON events.event_items(item_id);
CREATE INDEX IF NOT EXISTS idx_user_game_follows_user ON events.user_game_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_user_game_follows_game ON events.user_game_follows(game_id);
