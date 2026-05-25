-- Backfill the 15 missing foreign-key column indexes on the production
-- Neon database (project wild-bar-37055823) so every row in
-- information_schema.referential_constraints is covered by a btree index
-- whose first column matches the FK source column. This satisfies the
-- FK_Index_Invariant defined in requirements.md and closes the gap the
-- live audit found against the readiness report's "all FKs indexed"
-- claim.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Component: 5 (FK index backfill)
-- Requirements: 2.1, 2.2, 2.5, 9.1, 9.2
--
-- Index naming convention: idx_<table>_<column>, matching the existing
-- production convention (idx_payments_app, idx_sessions_user, ...).
--
-- All 15 statements use CREATE INDEX CONCURRENTLY IF NOT EXISTS so the
-- script is online (no full-table lock), idempotent on re-run, and
-- strictly additive. Because CONCURRENTLY cannot run inside a
-- transaction, apply_sql_migrations runs this file in autocommit mode
-- per the split-phase handling in Component 2 / Requirement 1.5.
--
-- Forward-only; the reversible inverse lives in
-- 2026_05_22_fk_index_backfill_rollback.sql.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_admin_feedback_by
    ON applications(admin_feedback_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_assigned_reviewer_id
    ON applications(assigned_reviewer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_payment_verified_by
    ON applications(payment_verified_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_reviewed_by
    ON applications(reviewed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_amendments_reviewed_by
    ON application_amendments(reviewed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_conditions_verified_by
    ON application_conditions(verified_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_documents_verified_by
    ON application_documents(verified_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_drafts_application_id
    ON application_drafts(application_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_interviews_created_by
    ON application_interviews(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_interviews_updated_by
    ON application_interviews(updated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_status_history_changed_by
    ON application_status_history(changed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_waivers_approved_by
    ON fee_waivers(approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_verified_by
    ON payments(verified_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_institution_id
    ON programs(institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settings_updated_by
    ON settings(updated_by);
