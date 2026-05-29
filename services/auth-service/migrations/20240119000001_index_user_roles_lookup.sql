-- Per-game / per-section permission checks in items-service run
--   SELECT 1 FROM auth.user_roles
--   WHERE user_id = $1 AND game_id = $2
--     AND (section_id IS NULL OR section_id = $3)
--     AND role IN ('game_admin','game_editor', ...)
-- on every authenticated write (create_item, update_item, create_skill,
-- create_build, create_changelog). Before this index, those queries did
-- an index-scan on idx_user_roles_user_id plus an in-memory filter on
-- (game_id, section_id, role). With a composite, the planner can satisfy
-- the predicate from the index alone.
CREATE INDEX IF NOT EXISTS idx_user_roles_user_game_section_role
    ON auth.user_roles (user_id, game_id, section_id, role);
