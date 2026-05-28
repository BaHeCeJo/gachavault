-- Cross-schema foreign keys for tierlists → auth, games, items.
--
-- Each FK is gated by an EXISTS check on the referent table. No-op in tests
-- where only tierlists-service migrations are applied; real deploys apply
-- all migrations against a shared DB so referents always exist.

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'users'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'tierlists'
          AND table_name = 'tier_lists'
          AND constraint_name = 'tier_lists_user_id_fkey'
    ) THEN
        ALTER TABLE tierlists.tier_lists
            ADD CONSTRAINT tier_lists_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'games' AND table_name = 'games'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'tierlists'
          AND table_name = 'tier_lists'
          AND constraint_name = 'tier_lists_game_id_fkey'
    ) THEN
        ALTER TABLE tierlists.tier_lists
            ADD CONSTRAINT tier_lists_game_id_fkey
            FOREIGN KEY (game_id) REFERENCES games.games(id) ON DELETE CASCADE;
    END IF;
END $$;

-- section_id is nullable (tier lists span a whole game or one section).
-- SET NULL on section delete preserves the list under the parent game.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'games' AND table_name = 'sections'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'tierlists'
          AND table_name = 'tier_lists'
          AND constraint_name = 'tier_lists_section_id_fkey'
    ) THEN
        ALTER TABLE tierlists.tier_lists
            ADD CONSTRAINT tier_lists_section_id_fkey
            FOREIGN KEY (section_id) REFERENCES games.sections(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'items' AND table_name = 'items'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'tierlists'
          AND table_name = 'tier_list_entries'
          AND constraint_name = 'tier_list_entries_item_id_fkey'
    ) THEN
        ALTER TABLE tierlists.tier_list_entries
            ADD CONSTRAINT tier_list_entries_item_id_fkey
            FOREIGN KEY (item_id) REFERENCES items.items(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'users'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'tierlists'
          AND table_name = 'upvotes'
          AND constraint_name = 'upvotes_user_id_fkey'
    ) THEN
        ALTER TABLE tierlists.upvotes
            ADD CONSTRAINT upvotes_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'users'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'tierlists'
          AND table_name = 'comments'
          AND constraint_name = 'comments_user_id_fkey'
    ) THEN
        ALTER TABLE tierlists.comments
            ADD CONSTRAINT comments_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;
