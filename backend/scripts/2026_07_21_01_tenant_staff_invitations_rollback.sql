-- Rollback for 2026_07_21_01_tenant_staff_invitations.sql (Admissions V2 task 4.2).
--
-- Operator-only: *_rollback.sql files are excluded from the apply_sql_migrations
-- boot sweep (_iter_migration_files skips the *_rollback.sql suffix), so this is
-- never auto-applied. It drops the tenant staff-invitation table and its
-- indexes/constraints. DESTRUCTIVE — it removes invitation records. Accepted
-- invitations have already handed off to a real membership (a separate table),
-- so a launched/staffed tenant keeps working; this only discards the invitation
-- audit/handoff rows. Take a backup first.
--
-- Reverses the expand cleanly: dropping the table removes its constraints and
-- indexes with it; the explicit guards below are belt-and-braces for a partial
-- forward apply.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_staff_invitations_institution_id_fk') THEN
        ALTER TABLE tenant_staff_invitations DROP CONSTRAINT tenant_staff_invitations_institution_id_fk;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_staff_invitations_profile_id_fk') THEN
        ALTER TABLE tenant_staff_invitations DROP CONSTRAINT tenant_staff_invitations_profile_id_fk;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_staff_invitations_membership_id_fk') THEN
        ALTER TABLE tenant_staff_invitations DROP CONSTRAINT tenant_staff_invitations_membership_id_fk;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_staff_invitations_invited_by_id_fk') THEN
        ALTER TABLE tenant_staff_invitations DROP CONSTRAINT tenant_staff_invitations_invited_by_id_fk;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_staff_invitations_status') THEN
        ALTER TABLE tenant_staff_invitations DROP CONSTRAINT chk_tenant_staff_invitations_status;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_staff_invitations_resend_nonneg') THEN
        ALTER TABLE tenant_staff_invitations DROP CONSTRAINT chk_tenant_staff_invitations_resend_nonneg;
    END IF;
END$$;

DROP INDEX IF EXISTS uq_tenant_staff_invitations_token_hash;
DROP INDEX IF EXISTS uq_tenant_staff_invitations_pending_email;
DROP INDEX IF EXISTS idx_tenant_staff_invitations_institution_status;
DROP INDEX IF EXISTS idx_tenant_staff_invitations_profile;
DROP INDEX IF EXISTS idx_tenant_staff_invitations_membership;

DROP TABLE IF EXISTS tenant_staff_invitations;
