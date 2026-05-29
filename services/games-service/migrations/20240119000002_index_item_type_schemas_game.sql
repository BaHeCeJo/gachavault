-- The admin UI loads schemas-for-game (GET /games/:slug/schemas) frequently
-- while editing items, and create_item / update_item also walk schemas by
-- game_id to find the matching one for a section. Without this index the
-- planner sequentially scans item_type_schemas to filter by game_id —
-- cheap today, but the table grows with every (game, section) pair across
-- every game on the platform, so it's worth indexing now rather than
-- waiting for it to be slow.
CREATE INDEX IF NOT EXISTS idx_item_type_schemas_game_id
    ON games.item_type_schemas (game_id);
