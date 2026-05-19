-- item_skills, item_builds, item_changelog are queried by item_id on every item page load
-- but had no index — each was a full table scan
CREATE INDEX IF NOT EXISTS idx_item_skills_item_id     ON items.item_skills(item_id);
CREATE INDEX IF NOT EXISTS idx_item_builds_item_id     ON items.item_builds(item_id);
CREATE INDEX IF NOT EXISTS idx_item_changelog_item_id  ON items.item_changelog(item_id);

-- Also useful: ordering is always by `order` or `created_at`
CREATE INDEX IF NOT EXISTS idx_item_skills_order        ON items.item_skills(item_id, "order");
CREATE INDEX IF NOT EXISTS idx_item_changelog_date      ON items.item_changelog(item_id, created_at DESC);
