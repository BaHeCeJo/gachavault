-- Per-game servers (regional accounts) and per-server event timing.
-- The same banner starts/ends at different real instants on each server, so a
-- single events.start_at/end_at can't represent it; those columns stay as the
-- canonical/primary time (used for sorting and as a fallback for single-server
-- games or events without per-server rows).

CREATE TABLE IF NOT EXISTS events.game_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Cross-schema FK to games.games added below (conditional).
    game_id UUID NOT NULL,
    key VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(game_id, key)
);

CREATE TABLE IF NOT EXISTS events.event_server_times (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,
    -- References a game_servers.key for the event's game (soft link by string).
    server_key VARCHAR(50) NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ,
    UNIQUE(event_id, server_key)
);

-- A follower's chosen home server for that game; NULL = use the primary time.
ALTER TABLE events.user_game_follows ADD COLUMN IF NOT EXISTS server VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_game_servers_game ON events.game_servers(game_id);
CREATE INDEX IF NOT EXISTS idx_event_server_times_event ON events.event_server_times(event_id);

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'games' AND table_name = 'games'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'events'
          AND table_name = 'game_servers'
          AND constraint_name = 'game_servers_game_id_fkey'
    ) THEN
        ALTER TABLE events.game_servers
            ADD CONSTRAINT game_servers_game_id_fkey
            FOREIGN KEY (game_id) REFERENCES games.games(id) ON DELETE CASCADE;
    END IF;
END $$;
