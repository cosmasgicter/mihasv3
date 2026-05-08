-- Roll back payment hardening indexes.

DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_reference_event_processed;
DROP INDEX CONCURRENTLY IF EXISTS uq_webhook_processed_reference_event;
DROP INDEX CONCURRENTLY IF EXISTS idx_payments_lenco_reference_present;
DROP INDEX CONCURRENTLY IF EXISTS idx_payments_application_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_payments_status_created_at;
DROP INDEX CONCURRENTLY IF EXISTS uq_payments_one_active_per_application;
DROP INDEX CONCURRENTLY IF EXISTS uq_payments_transaction_reference_present;
