-- games.item_type_schemas.section_id references games.sections(id) with
-- no ON DELETE clause — Postgres defaults to NO ACTION, which means
-- deleting a section would fail if a schema is bound to it. The intent
-- is clearly CASCADE: if the section goes away, the schema for that
-- section is meaningless on its own. The parent game_id FK already
-- specifies CASCADE; this aligns section_id with the same semantics.

ALTER TABLE games.item_type_schemas
    DROP CONSTRAINT IF EXISTS item_type_schemas_section_id_fkey;

ALTER TABLE games.item_type_schemas
    ADD CONSTRAINT item_type_schemas_section_id_fkey
    FOREIGN KEY (section_id) REFERENCES games.sections(id) ON DELETE CASCADE;
