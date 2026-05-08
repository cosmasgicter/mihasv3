-- Payment hardening preflight report.
-- Run before backend/scripts/payment_hardening_indexes.sql.

-- Duplicate non-null payment references must be resolved before adding the
-- unique reference index.
SELECT
  transaction_reference,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(id ORDER BY created_at NULLS LAST) AS payment_ids
FROM payments
WHERE transaction_reference IS NOT NULL AND transaction_reference <> ''
GROUP BY transaction_reference
HAVING COUNT(*) > 1;

-- More than one active payment for an application blocks the partial unique
-- active-payment index.
SELECT
  application_id,
  COUNT(*) AS active_count,
  ARRAY_AGG(id ORDER BY created_at NULLS LAST) AS payment_ids
FROM payments
WHERE application_id IS NOT NULL
  AND status IN ('pending', 'deferred')
GROUP BY application_id
HAVING COUNT(*) > 1;

-- Payment rows pointing at missing applications should be reviewed.
SELECT p.id, p.application_id, p.status, p.transaction_reference
FROM payments p
LEFT JOIN applications a ON a.id = p.application_id
WHERE p.application_id IS NOT NULL
  AND a.id IS NULL;

-- Successful payments whose application summary is not verified need review.
SELECT p.id, p.application_id, p.status, a.payment_status, p.transaction_reference
FROM payments p
JOIN applications a ON a.id = p.application_id
WHERE p.status = 'successful'
  AND COALESCE(a.payment_status, '') NOT IN ('verified', 'paid', 'force_approved');

-- Repeated processed webhook events indicate dedup is currently advisory.
SELECT
  reference,
  event_type,
  COUNT(*) AS processed_count,
  ARRAY_AGG(id ORDER BY created_at NULLS LAST) AS webhook_log_ids
FROM webhook_event_logs
WHERE processed IS TRUE
GROUP BY reference, event_type
HAVING COUNT(*) > 1;
