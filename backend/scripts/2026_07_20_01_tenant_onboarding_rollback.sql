-- Rollback for 2026_07_20_01_tenant_onboarding.sql (Admissions V2 task 4.1).
--
-- Operator-only: *_rollback.sql files are excluded from the apply_sql_migrations
-- boot sweep (_iter_migration_files skips the *_rollback.sql suffix), so this is
-- never auto-applied. It drops the durable tenant onboarding aggregate table and
-- its indexes/constraints. DESTRUCTIVE — it removes onboarding workflow state.
-- Only run after confirming no in-flight onboarding rows matter (a launched
-- tenant keeps working: institutions/domains/etc. are separate tables; this only
-- discards the workflow-tracking rows). Take a backup first.
--
-- Reverses the expand cleanly: dropping the table removes its constraints and
-- indexes with it, so the explicit ALTER/DROP INDEX guards below are belt-and-
-- braces for a partial forward apply.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_onboarding_institution_id_fk') THEN
        ALTER TABLE tenant_onboarding DROP CONSTRAINT tenant_onboarding_institution_id_fk;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_onboarding_created_by_id_fk') THEN
        ALTER TABLE tenant_onboarding DROP CONSTRAINT tenant_onboarding_created_by_id_fk;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_onboarding_state') THEN
        ALTER TABLE tenant_onboarding DROP CONSTRAINT chk_tenant_onboarding_state;
    END IF;
END$$;

DROP INDEX IF EXISTS uq_tenant_onboarding_institution;
DROP INDEX IF EXISTS uq_tenant_onboarding_idempotency_key;
DROP INDEX IF EXISTS idx_tenant_onboarding_state;

DROP TABLE IF EXISTS tenant_onboarding;
