-- Backfill: Migrate legacy result_slip_url / extra_kyc_url into application_documents rows.
-- Idempotent: NOT EXISTS guard prevents duplicate inserts on re-run.
-- Sentinel: document_name contains ' [backfill:legacy_url_migration]' suffix for rollback targeting.
-- Date: 2026-05-27

BEGIN;

DO $$
DECLARE
  result_slip_count bigint;
  extra_kyc_count bigint;
BEGIN
  -- Insert result_slip documents
  INSERT INTO application_documents (id, application_id, document_type, document_name, file_url, verification_status, system_generated, uploaded_at, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    a.id,
    'result_slip',
    'Result Slip [backfill:legacy_url_migration]',
    a.result_slip_url,
    'pending',
    false,
    COALESCE(a.updated_at, a.created_at, now()),
    now(),
    now()
  FROM applications a
  WHERE a.result_slip_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM application_documents ad
      WHERE ad.application_id = a.id
        AND ad.file_url = a.result_slip_url
    );

  GET DIAGNOSTICS result_slip_count = ROW_COUNT;
  RAISE NOTICE 'backfill_application_documents: % result_slip rows inserted', result_slip_count;

  -- Insert extra_kyc documents
  INSERT INTO application_documents (id, application_id, document_type, document_name, file_url, verification_status, system_generated, uploaded_at, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    a.id,
    'extra_kyc',
    'Identity Support Document [backfill:legacy_url_migration]',
    a.extra_kyc_url,
    'pending',
    false,
    COALESCE(a.updated_at, a.created_at, now()),
    now(),
    now()
  FROM applications a
  WHERE a.extra_kyc_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM application_documents ad
      WHERE ad.application_id = a.id
        AND ad.file_url = a.extra_kyc_url
    );

  GET DIAGNOSTICS extra_kyc_count = ROW_COUNT;
  RAISE NOTICE 'backfill_application_documents: % extra_kyc rows inserted', extra_kyc_count;
END $$;

COMMIT;

-- Verification:
-- SELECT document_type, count(*) FROM application_documents WHERE document_name LIKE '%[backfill:legacy_url_migration]' GROUP BY document_type;
-- Expected: result_slip and extra_kyc counts matching the RAISE NOTICE output.
--
-- Check no legacy URLs are missing a corresponding document row:
-- SELECT count(*) FROM applications a WHERE a.result_slip_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM application_documents ad WHERE ad.application_id = a.id AND ad.file_url = a.result_slip_url);
-- Expected: 0
-- SELECT count(*) FROM applications a WHERE a.extra_kyc_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM application_documents ad WHERE ad.application_id = a.id AND ad.file_url = a.extra_kyc_url);
-- Expected: 0
