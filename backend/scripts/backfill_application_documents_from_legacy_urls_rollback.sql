-- Rollback for backfill_application_documents_from_legacy_urls.sql
-- Deletes ONLY rows inserted by the backfill, identified by the sentinel suffix in document_name.
-- Date: 2026-05-27

BEGIN;

DO $$
DECLARE
  affected bigint;
BEGIN
  DELETE FROM application_documents
  WHERE document_name LIKE '%[backfill:legacy_url_migration]';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE 'rollback backfill_application_documents: % rows deleted', affected;
END $$;

COMMIT;

-- Verification:
-- SELECT count(*) FROM application_documents WHERE document_name LIKE '%[backfill:legacy_url_migration]';
-- Expected: 0
