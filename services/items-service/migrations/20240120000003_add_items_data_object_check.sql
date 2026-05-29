-- items.items.data is a jsonb column that the whole app assumes is a
-- JSON object — every handler reads `data->>'name'`, `data->>'image_url'`,
-- iterates fields against item_type_schemas, etc. Today Postgres would
-- happily accept `data = '[]'` or `data = '"a string"'` or `data = 'null'`
-- and the queries would silently return NULL, breaking rendering without
-- any error in the logs.
--
-- This CHECK pins the contract at the schema layer. Defensive: if any
-- existing row is already non-object the migration aborts with an
-- informative message instead of silently leaving the constraint off.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = 'items'
          AND constraint_name = 'items_data_is_object'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM items.items WHERE jsonb_typeof(data) != 'object'
        ) THEN
            RAISE EXCEPTION 'Cannot add items_data_is_object: some rows have non-object data. Inspect with: SELECT id, slug, jsonb_typeof(data) FROM items.items WHERE jsonb_typeof(data) != ''object'';';
        END IF;

        ALTER TABLE items.items
            ADD CONSTRAINT items_data_is_object
            CHECK (jsonb_typeof(data) = 'object');
    END IF;
END $$;
