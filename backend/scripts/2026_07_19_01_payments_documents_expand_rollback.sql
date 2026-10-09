-- Operator-only reverse of 2026_07_19_01_payments_documents_expand.sql (task 3.5).
--
-- Excluded from the apply_sql_migrations boot sweep (the runner skips
-- *_rollback.sql via the _iter_migration_files suffix filter). Drops every object
-- the expand script added, in reverse order. Idempotent (IF EXISTS everywhere).
--
-- Run 02_ and 03_ rollbacks FIRST (reverse order) if those phases were applied:
--   03_..._validate_rollback.sql  -> 02_..._backfill_rollback.sql -> this file.
-- Backup-first on any real database (deploy/backup-db.sh). This reverses only the
-- ADDITIVE scaffolding; it never touches the deprecated application payment columns
-- (they were never modified by task 3.5).
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.5.

-- B3. Document version-positive CHECK.
ALTER TABLE application_documents DROP CONSTRAINT IF EXISTS chk_application_documents_version_positive;

-- B2. Document provenance FKs (only the names this task creates; a Django-named
--     FK on the same column, if present, is left intact).
ALTER TABLE application_documents DROP CONSTRAINT IF EXISTS application_documents_uploaded_by_fk;
ALTER TABLE application_documents DROP CONSTRAINT IF EXISTS application_documents_supersedes_id_fk;

-- B1. Document version + provenance columns.
ALTER TABLE application_documents DROP COLUMN IF EXISTS provenance;
ALTER TABLE application_documents DROP COLUMN IF EXISTS uploaded_by;
ALTER TABLE application_documents DROP COLUMN IF EXISTS content_hash;
ALTER TABLE application_documents DROP COLUMN IF EXISTS superseded_at;
ALTER TABLE application_documents DROP COLUMN IF EXISTS supersedes_id;
ALTER TABLE application_documents DROP COLUMN IF EXISTS is_current;
ALTER TABLE application_documents DROP COLUMN IF EXISTS version;

-- A3. Payments mandatory-application CHECK.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_application_id_not_null;

-- A2. Payment orphan exception ledger (FK, indexes, table).
ALTER TABLE payment_orphan_exceptions DROP CONSTRAINT IF EXISTS payment_orphan_exceptions_payment_id_fk;
DROP INDEX IF EXISTS idx_payment_orphan_exception_open;
DROP INDEX IF EXISTS uq_payment_orphan_exception_payment_reason;
DROP TABLE IF EXISTS payment_orphan_exceptions;

-- A1. Payments quarantine flag.
ALTER TABLE payments DROP COLUMN IF EXISTS application_quarantined;
