-- Payment hardening indexes.
-- Run only after backend/scripts/payment_hardening_preflight.sql returns no
-- duplicate payment references or duplicate active payments.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_payments_transaction_reference_present
ON payments (transaction_reference)
WHERE transaction_reference IS NOT NULL AND transaction_reference <> '';

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_payments_one_active_per_application
ON payments (application_id)
WHERE application_id IS NOT NULL AND status IN ('pending', 'deferred');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_status_created_at
ON payments (status, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_application_status
ON payments (application_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_lenco_reference_present
ON payments (lenco_reference)
WHERE lenco_reference IS NOT NULL AND lenco_reference <> '';

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_webhook_processed_reference_event
ON webhook_event_logs (reference, event_type)
WHERE processed IS TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_reference_event_processed
ON webhook_event_logs (reference, event_type, processed);
