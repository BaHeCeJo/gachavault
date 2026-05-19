ALTER TABLE games.sections
  ADD COLUMN IF NOT EXISTS tabs JSONB NOT NULL DEFAULT '["skills","changelog"]';
