-- Cross-schema foreign keys for auth.user_roles → games schema.
--
-- Each FK is gated by an EXISTS check on the referent table. This is a no-op
-- when the referent schema isn't present (e.g. sqlx::testing per-service test
-- DBs that only apply auth-service's own migrations). Real deploys apply all
-- migrations against a shared DB — either via CI's psql global-version-sort
-- step or via runtime sqlx::migrate!() with healthcheck-gated service order
-- (postgres → games → auth → ...) so the referent always exists in prod.

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'games' AND table_name = 'games'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'auth'
          AND table_name = 'user_roles'
          AND constraint_name = 'user_roles_game_id_fkey'
    ) THEN
        ALTER TABLE auth.user_roles
            ADD CONSTRAINT user_roles_game_id_fkey
            FOREIGN KEY (game_id) REFERENCES games.games(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'games' AND table_name = 'sections'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'auth'
          AND table_name = 'user_roles'
          AND constraint_name = 'user_roles_section_id_fkey'
    ) THEN
        ALTER TABLE auth.user_roles
            ADD CONSTRAINT user_roles_section_id_fkey
            FOREIGN KEY (section_id) REFERENCES games.sections(id) ON DELETE CASCADE;
    END IF;
END $$;
