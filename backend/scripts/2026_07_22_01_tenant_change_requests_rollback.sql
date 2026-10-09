-- Rollback for 2026_07_22_01_tenant_change_requests.sql (Admissions V2 task 4.5).
--
-- Operator-only: *_rollback.sql files are excluded from the apply_sql_migrations
-- boot sweep (_iter_migration_files skips the *_rollback.sql suffix), so this is
-- never auto-applied. It drops the durable tenant change-request table and its
-- indexes/constraints. DESTRUCTIVE — it removes change-request workflow state.
-- Only run after confirming no in-flight change requests matter (applied changes
-- are already reflected in the canonical tables — institutions/programs/domains
-- — and their own config audit rows; this only discards the request-tracking
-- rows). Take a backup first.
--
-- Reverses the expand cleanly: dropping the table removes its constraints and
-- indexes with it, so the explicit ALTER/DROP INDEX guards below are belt-and-
-- braces for a partial forward apply.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_change_requests_institution_id_fk') THEN
        ALTER TABLE tenant_change_requests DROP CONSTRAINT tenant_change_requests_institution_id_fk;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_change_requests_requested_by_id_fk') THEN
        ALTER TABLE tenant_change_requests DROP CONSTRAINT tenant_change_requests_requested_by_id_fk;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_change_requests_reviewed_by_id_fk') THEN
        ALTER TABLE tenant_change_requests DROP CONSTRAINT tenant_change_requests_reviewed_by_id_fk;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_change_requests_kind') THEN
        ALTER TABLE tenant_change_requests DROP CONSTRAINT chk_tenant_change_requests_kind;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_change_requests_status') THEN
        ALTER TABLE tenant_change_requests DROP CONSTRAINT chk_tenant_change_requests_status;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_change_requests_version_nonneg') THEN
        ALTER TABLE tenant_change_requests DROP CONSTRAINT chk_tenant_change_requests_version_nonneg;
    END IF;
END$$;
DROP INDEX IF EXISTS uq_tenant_change_requests_idempotency_key;
DROP INDEX IF EXISTS idx_tenant_change_requests_institution_status;
DROP INDEX IF EXISTS idx_tenant_change_requests_status;
DROP INDEX IF EXISTS idx_tenant_change_requests_requested_by;
DROP INDEX IF EXISTS idx_tenant_change_requests_reviewed_by;
DROP TABLE IF EXISTS tenant_change_requests;
