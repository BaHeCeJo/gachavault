CREATE TABLE IF NOT EXISTS tierlists.upvotes (
    tierlist_id UUID NOT NULL REFERENCES tierlists.tier_lists(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tierlist_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_upvotes_tierlist ON tierlists.upvotes(tierlist_id);

ALTER TABLE tierlists.tier_lists
    ADD COLUMN IF NOT EXISTS upvote_count INT NOT NULL DEFAULT 0;
