-- media.assets.uploaded_by referenced auth.users(id) only as a bare UUID
-- column with an index but no foreign key. Two consequences:
--   1. Garbage IDs could be inserted (no referential check).
--   2. When a user is deleted, their media rows stay around with a UUID
--      that no longer resolves to anything — orphans, gradual cleanup
--      headache.
--
-- This migration adds the missing FK with ON DELETE SET NULL so the file
-- itself + its metadata survive a user delete (matches the spec for an
-- anonymous-keep policy) while the dangling owner reference disappears.
--
-- Gated on the cross-schema-FK pattern the project uses (per memory:
-- cross-schema FK migrations must check the referent table exists first
-- so a fresh DB doesn't crash if auth-service hasn't migrated yet) and
-- idempotent so re-runs after a partial deploy are safe.

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'users'
    ) THEN
        -- Clean up any orphaned uploaded_by values left over from before
        -- the FK was enforced. ON DELETE SET NULL only handles future
        -- deletes; existing dangling UUIDs would block the ALTER TABLE.
        UPDATE media.assets
        SET uploaded_by = NULL
        WHERE uploaded_by IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM auth.users WHERE id = media.assets.uploaded_by
          );

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = 'media'
              AND table_name = 'assets'
              AND constraint_name = 'assets_uploaded_by_fkey'
        ) THEN
            ALTER TABLE media.assets
                ADD CONSTRAINT assets_uploaded_by_fkey
                FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;
