-- Cross-schema foreign keys for collections.entries → auth, items, games.
-- CASCADE everywhere — when a user, item, or game is removed the collection
-- entry has no meaning and should disappear with it.
--
-- Each FK is gated by an EXISTS check on the referent table. No-op in tests
-- where only collections-service migrations are applied; real deploys apply
-- all migrations against a shared DB so referents always exist.

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'users'
    ) AND NOT EXISTS (
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
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'items' AND table_name = 'items'
    ) AND NOT EXISTS (
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
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'games' AND table_name = 'games'
    ) AND NOT EXISTS (
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
