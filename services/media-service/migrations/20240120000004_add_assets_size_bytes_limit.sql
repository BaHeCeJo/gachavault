-- media.assets.size_bytes is BIGINT — Postgres would accept anything up
-- to ~9 EB. The upload handler caps at MAX_FILE_SIZE_MB (10-20 MB
-- typical), and nginx caps client_max_body_size at 25M. The DB had no
-- ceiling at all, so a buggy direct SQL insert or a malicious admin
-- could record `999999999999999` (a petabyte file) without complaint.
--
-- 100 MB ceiling here gives generous headroom over the handler's 20 MB
-- limit (lets the cap change in code without another migration) while
-- still rejecting obvious garbage. Lower bound is > 0 since zero-byte
-- assets aren't useful and -1 would silently become positive in some
-- arithmetic contexts.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = 'media'
          AND constraint_name = 'assets_size_bytes_range'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM media.assets WHERE size_bytes <= 0 OR size_bytes > 104857600
        ) THEN
            RAISE EXCEPTION 'Cannot add assets_size_bytes_range: rows exist outside (0, 100MB]. Inspect: SELECT id, filename, size_bytes FROM media.assets WHERE size_bytes <= 0 OR size_bytes > 104857600;';
        END IF;

        ALTER TABLE media.assets
            ADD CONSTRAINT assets_size_bytes_range
            CHECK (size_bytes > 0 AND size_bytes <= 104857600);
    END IF;
END $$;
