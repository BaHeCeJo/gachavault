-- Opt-in visibility for a user's collection on their public profile.
--
-- The public profile has always had a Collection section, but nothing could
-- fill it: the endpoint behind it requires a logged-in owner or an admin, and
-- the page is rendered server-side with no token. It therefore always showed
-- "No public collection yet", for everyone.
--
-- Fixing that needs a decision the schema never recorded — who is allowed to
-- see it. The site promises collections are private by default and shared only
-- when you choose to, so the answer is a per-user opt-in that defaults to off.
-- A missing row means private, so existing users stay private without a
-- backfill and nothing becomes visible that wasn't before.
--
-- Only aggregate counts are ever exposed publicly, never the entries
-- themselves; see get_public_collection_stats.
CREATE TABLE IF NOT EXISTS collections.visibility (
    user_id UUID PRIMARY KEY,
    collection_public BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
