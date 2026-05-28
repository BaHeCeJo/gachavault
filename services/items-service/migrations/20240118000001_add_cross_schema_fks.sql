-- Cross-schema foreign keys for items → games and items → auth.users.
-- Idempotent. Runs after games-service and auth-service migrations finish.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'items'
          AND table_name = 'items'
          AND constraint_name = 'items_game_id_fkey'
    ) THEN
        ALTER TABLE items.items
            ADD CONSTRAINT items_game_id_fkey
            FOREIGN KEY (game_id) REFERENCES games.games(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'items'
          AND table_name = 'items'
          AND constraint_name = 'items_section_id_fkey'
    ) THEN
        ALTER TABLE items.items
            ADD CONSTRAINT items_section_id_fkey
            FOREIGN KEY (section_id) REFERENCES games.sections(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'items'
          AND table_name = 'items'
          AND constraint_name = 'items_type_schema_id_fkey'
    ) THEN
        ALTER TABLE items.items
            ADD CONSTRAINT items_type_schema_id_fkey
            FOREIGN KEY (type_schema_id) REFERENCES games.item_type_schemas(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- created_by: RESTRICT prevents deleting a user who still owns items. Forces
-- an explicit reassignment or content cleanup before account deletion can
-- proceed, which is the correct policy for a wiki where contributions outlive
-- contributors.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'items'
          AND table_name = 'items'
          AND constraint_name = 'items_created_by_fkey'
    ) THEN
        ALTER TABLE items.items
            ADD CONSTRAINT items_created_by_fkey
            FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'items'
          AND table_name = 'item_builds'
          AND constraint_name = 'item_builds_created_by_fkey'
    ) THEN
        ALTER TABLE items.item_builds
            ADD CONSTRAINT item_builds_created_by_fkey
            FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
    END IF;
END $$;
