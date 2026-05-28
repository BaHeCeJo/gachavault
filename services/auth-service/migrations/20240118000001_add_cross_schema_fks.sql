-- Cross-schema foreign keys for auth.user_roles → games schema.
-- Idempotent via information_schema lookup. Runs only after games-service has
-- created the games schema (enforced by docker-compose depends_on).

DO $$ BEGIN
    IF NOT EXISTS (
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
    IF NOT EXISTS (
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
