-- Cross-schema foreign keys for the events schema → games, items, auth.
-- CASCADE everywhere: an event, featured-item link, or follow has no meaning
-- once its referent game / item / user is gone.
--
-- Each FK is gated by an EXISTS check on the referent table. No-op in tests
-- where only events-service migrations are applied; real deploys apply all
-- migrations against the shared DB (and events-service boots after games-,
-- auth- and items-service per the compose dependency chain) so referents exist.

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'games' AND table_name = 'games'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'events'
          AND table_name = 'events'
          AND constraint_name = 'events_game_id_fkey'
    ) THEN
        ALTER TABLE events.events
            ADD CONSTRAINT events_game_id_fkey
            FOREIGN KEY (game_id) REFERENCES games.games(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'items' AND table_name = 'items'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'events'
          AND table_name = 'event_items'
          AND constraint_name = 'event_items_item_id_fkey'
    ) THEN
        ALTER TABLE events.event_items
            ADD CONSTRAINT event_items_item_id_fkey
            FOREIGN KEY (item_id) REFERENCES items.items(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'users'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'events'
          AND table_name = 'user_game_follows'
          AND constraint_name = 'user_game_follows_user_id_fkey'
    ) THEN
        ALTER TABLE events.user_game_follows
            ADD CONSTRAINT user_game_follows_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'games' AND table_name = 'games'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'events'
          AND table_name = 'user_game_follows'
          AND constraint_name = 'user_game_follows_game_id_fkey'
    ) THEN
        ALTER TABLE events.user_game_follows
            ADD CONSTRAINT user_game_follows_game_id_fkey
            FOREIGN KEY (game_id) REFERENCES games.games(id) ON DELETE CASCADE;
    END IF;
END $$;
