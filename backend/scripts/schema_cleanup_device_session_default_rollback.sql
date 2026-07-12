-- Reversible inverse of schema_cleanup_device_session_default.sql.
--
-- Spec: full-platform-remediation-2026-07, Phase 5
-- Requirements: 9.1, 9.2
--
-- Inverse-additive operations only (per R9.2): DELETE FROM migration_history.
--
-- NOTE: ALTER COLUMN ... DROP DEFAULT is not in the R9.2 allowlist. If the
-- default needs to be reverted, create a NEW forward migration that sets the
-- desired value. Removing the migration_history row here allows the forward
-- script to be re-applied with a different default value if needed.
--
-- Application notes (Requirement 9.5):
-- Apply manually with autocommit. Never invoke via apply_sql_migrations.

DELETE FROM migration_history WHERE migration_name = 'schema_cleanup_device_session_default.sql';
