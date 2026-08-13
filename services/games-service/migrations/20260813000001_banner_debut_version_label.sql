-- Relabel the banner "version" field from "Game version" to "Debut version".
--
-- A banner is a reusable preset: "Butterfly on Swordtip" ran in 1.0 and again
-- in later versions, and each run carries its own version in the event's data.
-- So a single version number on the preset can only mean the debut, and
-- "Game version" invited the wrong reading when authoring one.
--
-- Only the label changes; the field key and every stored value are untouched.
-- Scoped to rows that still carry the old label so it is safe to re-run and
-- won't stomp a label someone has since customised.
-- COALESCE guards the column: jsonb_agg over an empty array yields NULL, and a
-- NULL fields list would break every form that reads this schema. The WHERE
-- already implies a non-empty array, so this is belt and braces.
UPDATE games.item_type_schemas
   SET fields = COALESCE(
        (
            SELECT jsonb_agg(
                       CASE
                           WHEN f->>'key' = 'version' AND f->>'label' = 'Game version'
                               THEN jsonb_set(f, '{label}', '"Debut version"'::jsonb)
                           ELSE f
                       END
                       ORDER BY ord
                   )
              FROM jsonb_array_elements(fields) WITH ORDINALITY AS t(f, ord)
        ),
        fields
       )
 WHERE name = 'Banner'
   AND fields @> '[{"key": "version", "label": "Game version"}]'::jsonb;
