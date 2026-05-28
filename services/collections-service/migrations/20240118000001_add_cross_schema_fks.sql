-- Cross-schema foreign keys for collections.entries → auth, items, games.
-- CASCADE everywhere — when a user, item, or game is removed the collection
-- entry has no meaning and should disappear with it.
-- Runs after auth, games, and items services finish their migrations.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'collections'
          AND table_name = 'entries'
          AND constraint_name = 'entries_user_id_fkey'
    ) THEN
        ALTER TABLE collections.entries
            ADD CONSTRAINT entries_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'collections'
          AND table_name = 'entries'
          AND constraint_name = 'entries_item_id_fkey'
    ) THEN
        ALTER TABLE collections.entries
            ADD CONSTRAINT entries_item_id_fkey
            FOREIGN KEY (item_id) REFERENCES items.items(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'collections'
          AND table_name = 'entries'
          AND constraint_name = 'entries_game_id_fkey'
    ) THEN
        ALTER TABLE collections.entries
            ADD CONSTRAINT entries_game_id_fkey
            FOREIGN KEY (game_id) REFERENCES games.games(id) ON DELETE CASCADE;
    END IF;
END $$;
