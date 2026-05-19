CREATE TABLE IF NOT EXISTS games.attributes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID        NOT NULL REFERENCES games.games(id) ON DELETE CASCADE,
  attr_type  VARCHAR(100) NOT NULL,
  key        VARCHAR(100) NOT NULL,
  name       VARCHAR(200) NOT NULL,
  icon_url   TEXT,
  color      VARCHAR(20),
  extra      JSONB        NOT NULL DEFAULT '{}',
  sort_order INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(game_id, attr_type, key)
);

CREATE INDEX IF NOT EXISTS idx_attributes_game_type
  ON games.attributes(game_id, attr_type);
