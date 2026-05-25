-- Reversible inverse of 2026_05_18_hot_query_indexes.sql. Apply only after confirming no application code depends on the structures being dropped.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Component: 3 (Migration directory layout — every forward script ships with a sibling rollback)
-- Requirements: 9.1, 9.2, 9.3, 9.4
--
-- Forward script effect: 8 hot-query btree indexes on applications, payments,
-- and audit_logs. All created with CREATE INDEX IF NOT EXISTS. The rollback
-- drops them in the reverse of creation order using DROP INDEX IF EXISTS so
-- the rollback is idempotent on re-run and does not error on a partial state.
--
-- This rollback touches the applications and payments tables (Requirement
-- 9.4), so it begins with row-count NOTICE blocks for both tables to give
-- the operator a sanity check before running. audit_logs is also indirectly
-- affected but is not student-data-bearing; no NOTICE block is needed there.
--
-- Application notes (Requirement 9.5):
-- Apply manually with autocommit. Never invoke via apply_sql_migrations.
-- Pass --allow-non-additive when running through tooling that lints SQL,
-- because DROP COLUMN / DROP TABLE family operations are flagged as
-- non-additive by the apply_sql_migrations lint.

DO $$ BEGIN RAISE NOTICE 'Affected rows in applications: %', (SELECT count(*) FROM applications); END $$;

DO $$ BEGIN RAISE NOTICE 'Affected rows in payments: %', (SELECT count(*) FROM payments); END $$;

DROP INDEX IF EXISTS idx_audit_logs_entity_id;
DROP INDEX IF EXISTS idx_audit_logs_actor_id;
DROP INDEX IF EXISTS idx_payments_status;
DROP INDEX IF EXISTS idx_payments_application_id;
DROP INDEX IF EXISTS idx_payments_user_id;
DROP INDEX IF EXISTS idx_applications_status;
DROP INDEX IF EXISTS idx_applications_intake;
DROP INDEX IF EXISTS idx_applications_user_id;

DELETE FROM migration_history WHERE migration_name = '2026_05_18_hot_query_indexes.sql';
