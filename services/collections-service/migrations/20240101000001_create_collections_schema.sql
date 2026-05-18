CREATE SCHEMA IF NOT EXISTS collections;

CREATE TABLE IF NOT EXISTS collections.entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    item_id UUID NOT NULL,
    game_id UUID NOT NULL,
    owned BOOLEAN NOT NULL DEFAULT FALSE,
    constellation_level INTEGER CHECK (constellation_level >= 0 AND constellation_level <= 6),
    level INTEGER CHECK (level >= 1 AND level <= 90),
    ascension INTEGER CHECK (ascension >= 0 AND ascension <= 6),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_entries_user_id ON collections.entries(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_game_id ON collections.entries(game_id);
CREATE INDEX IF NOT EXISTS idx_entries_item_id ON collections.entries(item_id);
