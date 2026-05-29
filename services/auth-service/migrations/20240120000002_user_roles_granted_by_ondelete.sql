-- auth.user_roles.granted_by has REFERENCES auth.users(id) but no
-- explicit ON DELETE clause, which defaults to NO ACTION — i.e. trying
-- to delete an admin who promoted other users would fail and the
-- operator would have to manually NULL the column first.
--
-- We want the opposite: deleting an admin preserves the audit trail of
-- who they promoted (with granted_by set NULL so it shows up as
-- "promoted by a since-deleted account"). SET NULL matches that intent.
--
-- DROP + ADD instead of ALTER because Postgres doesn't have an
-- in-place way to change the ON DELETE behavior of an existing FK.

ALTER TABLE auth.user_roles
    DROP CONSTRAINT IF EXISTS user_roles_granted_by_fkey;

ALTER TABLE auth.user_roles
    ADD CONSTRAINT user_roles_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
