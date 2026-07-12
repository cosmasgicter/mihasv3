-- Reversible inverse of schema_cleanup_drop_stale_columns.sql.
--
-- Spec: full-platform-remediation-2026-07, Phase 5
-- Requirements: 9.1, 9.2
--
-- Inverse-additive operations only (per R9.2): DELETE FROM migration_history.
--
-- NOTE: DROP COLUMN is irreversible with respect to data — the column values
-- are permanently lost once dropped. ADD COLUMN is forbidden in rollback
-- scripts by R9.2. If the columns need to be restored, create a NEW forward
-- migration that adds them (they will be empty/NULL).
--
-- Application notes (Requirement 9.5):
-- Apply manually with autocommit. Never invoke via apply_sql_migrations.

DELETE FROM migration_history WHERE migration_name = 'schema_cleanup_drop_stale_columns.sql';
