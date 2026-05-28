-- Enforce at most one schema per section. Game-wide schemas (section_id IS
-- NULL) are still allowed and not constrained — a partial index lets NULLs
-- repeat freely. If the prod DB has duplicates this migration will fail
-- loudly; clean them up by hand and rerun.
CREATE UNIQUE INDEX IF NOT EXISTS item_type_schemas_section_unique
  ON games.item_type_schemas (section_id)
  WHERE section_id IS NOT NULL;
