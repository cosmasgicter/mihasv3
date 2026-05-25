-- Reversible inverse of 2026_05_22_fk_index_backfill.sql. Apply only after confirming no application code depends on the structures being dropped.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Component: 5 (FK index backfill)
-- Requirements: 2.5, 9.1, 9.2
--
-- Drops the 15 FK indexes in the reverse of the order they were created
-- by the forward script. Uses DROP INDEX CONCURRENTLY IF EXISTS so the
-- rollback is online (no full-table lock) and idempotent on re-run.
-- Like the forward script, this file cannot run inside a transaction;
-- apply it manually with autocommit, never via apply_sql_migrations
-- (rollback files are excluded from the lexical apply ordering per
-- Requirement 9.5).

DROP INDEX CONCURRENTLY IF EXISTS idx_settings_updated_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_programs_institution_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_payments_verified_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_fee_waivers_approved_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_application_status_history_changed_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_application_interviews_updated_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_application_interviews_created_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_application_drafts_application_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_application_documents_verified_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_application_conditions_verified_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_application_amendments_reviewed_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_applications_reviewed_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_applications_payment_verified_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_applications_assigned_reviewer_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_applications_admin_feedback_by;
