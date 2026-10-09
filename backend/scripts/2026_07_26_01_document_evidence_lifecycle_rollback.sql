-- Operator-only reverse of 2026_07_26_01_document_evidence_lifecycle.sql (task 7.3).
--
-- Excluded from the apply_sql_migrations boot sweep (the runner skips
-- *_rollback.sql via the _iter_migration_files suffix filter). Drops every object
-- the forward script added, in reverse order. Idempotent (IF EXISTS everywhere).
--
-- Backup-first on any real database (deploy/backup-db.sh).
--
-- Evidence loss warning: dropping ``document_verification_events`` discards the
-- append-only verification history and dropping ``document_upload_stages``
-- discards the staged-write ledger the reconciliation sweeper reads. Export both
-- tables before running this on a database that has served real uploads:
--
--   \copy document_verification_events TO 'dvе.csv' CSV HEADER
--   \copy document_upload_stages       TO 'dus.csv' CSV HEADER
--
-- The forward script's two backfills are NOT reversed by row-level writes: the
-- lifecycle/extraction values live only in the columns dropped below, so removing
-- the columns removes the backfill. No historical ``verification_status`` value
-- was modified by the forward script, so nothing there needs restoring.
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 7.3.
-- PART C — append-only verification history.
DROP INDEX IF EXISTS idx_document_verification_events_application;
DROP INDEX IF EXISTS idx_document_verification_events_document;
ALTER TABLE IF EXISTS document_verification_events
    DROP CONSTRAINT IF EXISTS document_verification_events_application_id_fk;
ALTER TABLE IF EXISTS document_verification_events
    DROP CONSTRAINT IF EXISTS document_verification_events_document_id_fk;
DROP TABLE IF EXISTS document_verification_events;
-- PART B — staged-write ledger.
DROP INDEX IF EXISTS uq_document_upload_stages_idempotency;
DROP INDEX IF EXISTS uq_document_upload_stages_object_key;
DROP INDEX IF EXISTS idx_document_upload_stages_orphaned;
DROP INDEX IF EXISTS idx_document_upload_stages_unresolved;
ALTER TABLE IF EXISTS document_upload_stages
    DROP CONSTRAINT IF EXISTS document_upload_stages_document_id_fk;
ALTER TABLE IF EXISTS document_upload_stages
    DROP CONSTRAINT IF EXISTS document_upload_stages_application_id_fk;
ALTER TABLE IF EXISTS document_upload_stages
    DROP CONSTRAINT IF EXISTS chk_document_upload_stages_attempts;
ALTER TABLE IF EXISTS document_upload_stages
    DROP CONSTRAINT IF EXISTS chk_document_upload_stages_state;
DROP TABLE IF EXISTS document_upload_stages;
-- PART A — application_documents lifecycle columns, CHECKs, and indexes.
DROP INDEX IF EXISTS idx_application_documents_lifecycle_open;
DROP INDEX IF EXISTS idx_application_documents_version_chain;
ALTER TABLE application_documents
    DROP CONSTRAINT IF EXISTS chk_application_documents_extraction_state;
ALTER TABLE application_documents
    DROP CONSTRAINT IF EXISTS chk_application_documents_lifecycle_state;
ALTER TABLE application_documents DROP COLUMN IF EXISTS extraction_state;
ALTER TABLE application_documents DROP COLUMN IF EXISTS storage_key;
ALTER TABLE application_documents DROP COLUMN IF EXISTS lifecycle_state;
