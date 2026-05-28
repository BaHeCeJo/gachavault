ALTER TABLE games.item_type_schemas
  ADD COLUMN IF NOT EXISTS filter_attrs JSONB NULL;
