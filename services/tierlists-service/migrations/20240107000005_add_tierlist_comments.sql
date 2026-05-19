CREATE TABLE IF NOT EXISTS tierlists.comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tierlist_id UUID NOT NULL REFERENCES tierlists.tier_lists(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    username    TEXT NOT NULL,
    body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_tierlist ON tierlists.comments(tierlist_id, created_at DESC);
