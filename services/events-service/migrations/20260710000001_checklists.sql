-- Reset checklists: per-user recurring task tracking (daily/weekly/monthly/every-
-- N-days quests) that auto-clears on its cadence. See project_reset_checklist.
--
-- Resets are stateless — NO scheduler wipes checkmarks. Each completion row is
-- stamped with the `period_key` it belongs to; a task counts as "done" only when
-- a completion exists for the *current* period. Period rollover (computed in the
-- service from cadence + the server's reset_hour + timezone) simply stops matching
-- the old key. History is preserved for free (future streaks/stats).

-- Daily reset hour (server-local, 0–23) per regional server. Gacha games reset
-- dailies at a fixed local hour (commonly 04:00); the timezone already on
-- game_servers turns that hour into a real UTC instant for each server.
ALTER TABLE events.game_servers
    ADD COLUMN IF NOT EXISTS reset_hour SMALLINT NOT NULL DEFAULT 4;

-- Admin-authored default tasks for a game. `cadence_kind` ∈
-- daily | weekly | monthly | interval. The extra cadence columns are only
-- meaningful for some kinds:
--   weekly   → reset_weekday       (0=Mon … 6=Sun)
--   monthly  → reset_day_of_month  (1–28; capped at 28 so it exists every month)
--   interval → interval_days       (period length in days, from a fixed epoch)
CREATE TABLE IF NOT EXISTS events.checklist_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Cross-schema FK to games.games added conditionally below.
    game_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    cadence_kind VARCHAR(20) NOT NULL DEFAULT 'daily',
    interval_days INTEGER,
    reset_weekday SMALLINT,
    reset_day_of_month SMALLINT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A user's personal custom tasks (same cadence shape as templates).
CREATE TABLE IF NOT EXISTS events.checklist_user_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Cross-schema FKs to auth.users / games.games kept soft (no FK) — matches
    -- how user_game_follows references users; the service scopes every read by
    -- user_id from the JWT.
    user_id UUID NOT NULL,
    game_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    cadence_kind VARCHAR(20) NOT NULL DEFAULT 'daily',
    interval_days INTEGER,
    reset_weekday SMALLINT,
    reset_day_of_month SMALLINT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin templates a user has opted out of (hybrid model: defaults minus hidden,
-- plus the user's own custom tasks).
CREATE TABLE IF NOT EXISTS events.checklist_hidden_templates (
    user_id UUID NOT NULL,
    template_id UUID NOT NULL REFERENCES events.checklist_templates(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, template_id)
);

-- The check state. `task_source` says which table `task_ref` points at
-- ('template' | 'custom') — a polymorphic soft link, so no FK. `period_key` is
-- the stateless reset anchor; exactly one completion per (user, task, period).
CREATE TABLE IF NOT EXISTS events.checklist_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    task_source VARCHAR(10) NOT NULL,
    task_ref UUID NOT NULL,
    period_key VARCHAR(32) NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, task_source, task_ref, period_key)
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_game ON events.checklist_templates(game_id);
CREATE INDEX IF NOT EXISTS idx_checklist_user_tasks_user_game ON events.checklist_user_tasks(user_id, game_id);
CREATE INDEX IF NOT EXISTS idx_checklist_completions_lookup ON events.checklist_completions(user_id, task_source, task_ref);

-- Cross-schema FKs to games.games — conditional, because a fresh per-service test
-- DB (sqlx::testing) applies only this service's migrations and has no games
-- schema. See feedback_cross_schema_fk_tests.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'games' AND table_name = 'games'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = 'events' AND table_name = 'checklist_templates'
              AND constraint_name = 'checklist_templates_game_id_fkey'
        ) THEN
            ALTER TABLE events.checklist_templates
                ADD CONSTRAINT checklist_templates_game_id_fkey
                FOREIGN KEY (game_id) REFERENCES games.games(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = 'events' AND table_name = 'checklist_user_tasks'
              AND constraint_name = 'checklist_user_tasks_game_id_fkey'
        ) THEN
            ALTER TABLE events.checklist_user_tasks
                ADD CONSTRAINT checklist_user_tasks_game_id_fkey
                FOREIGN KEY (game_id) REFERENCES games.games(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;
