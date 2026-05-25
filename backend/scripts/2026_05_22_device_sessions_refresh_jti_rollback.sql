-- Reversible inverse of 2026_05_22_device_sessions_refresh_jti.sql. Apply only after confirming no application code depends on the structures being dropped.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Requirements: 1.3, 9.1, 9.2
--
-- Inverse-additive operations only: DROP INDEX IF EXISTS, DROP COLUMN
-- IF EXISTS, scoped DELETE FROM migration_history. No DDL outside that
-- closed set per Requirement 9.2.
--
-- Application notes (Requirement 9.5):
-- Apply manually with autocommit. Never invoke via apply_sql_migrations.
-- Pass --allow-non-additive when running through tooling that lints SQL,
-- because DROP COLUMN is flagged as non-additive by the
-- apply_sql_migrations lint.

DROP INDEX IF EXISTS idx_device_sessions_refresh_jti;

ALTER TABLE device_sessions DROP COLUMN IF EXISTS refresh_jti;

DELETE FROM migration_history WHERE migration_name = '2026_05_22_device_sessions_refresh_jti.sql';
