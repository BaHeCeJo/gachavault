-- Cross-schema foreign keys for tierlists → auth, games, items.
-- Runs after auth, games, and items services finish their migrations.

DO $$ BEGIN
    IF NOT EXISTS (
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
    IF NOT EXISTS (
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
    IF NOT EXISTS (
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
    IF NOT EXISTS (
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
    IF NOT EXISTS (
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
    IF NOT EXISTS (
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
