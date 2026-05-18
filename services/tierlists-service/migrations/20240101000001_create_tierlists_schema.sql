CREATE SCHEMA IF NOT EXISTS tierlists;

CREATE TABLE IF NOT EXISTS tierlists.tier_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    game_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    share_slug VARCHAR(100) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tierlists.tier_list_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_list_id UUID NOT NULL REFERENCES tierlists.tier_lists(id) ON DELETE CASCADE,
    item_id UUID NOT NULL,
    tier VARCHAR(5) NOT NULL CHECK (tier IN ('S', 'A', 'B', 'C', 'D')),
    UNIQUE(tier_list_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_tier_lists_user_id ON tierlists.tier_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_tier_lists_game_id ON tierlists.tier_lists(game_id);
CREATE INDEX IF NOT EXISTS idx_tier_lists_share_slug ON tierlists.tier_lists(share_slug);
