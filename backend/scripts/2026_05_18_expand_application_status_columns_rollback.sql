-- Reversible inverse of 2026_05_18_expand_application_status_columns.sql. Apply only after confirming no application code depends on the structures being dropped.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Component: 3 (Migration directory layout — every forward script ships with a sibling rollback)
-- Requirements: 9.1, 9.2, 9.3, 9.4
--
-- Forward script effect: ALTER TABLE applications ALTER COLUMN status TYPE varchar(32)
--                       and the same on application_status_history.status.
--
-- Inverse-additive note (Requirement 9.2):
-- A varchar widening cannot be undone using only the allowed inverse-additive
-- operations (DROP COLUMN / DROP INDEX / DROP SEQUENCE / scoped DELETE).
-- Narrowing varchar(32) back to a smaller width would require ALTER COLUMN
-- TYPE — explicitly disallowed by Requirement 9.2 because it can truncate
-- data. The widening itself is non-destructive (every value that fit in the
-- prior column still fits in varchar(32)), so leaving the column type as-is
-- is safe.
--
-- This rollback therefore reverses only the bookkeeping side of the change:
-- it removes the migration_history row so the forward script can be
-- re-applied later (and so check_schema_drift --check-migration-history-coverage
-- treats the file as pending again). The widened column type is intentionally
-- left in place.
--
-- Application notes (Requirement 9.5):
-- Apply manually with autocommit. Never invoke via apply_sql_migrations.
-- Pass --allow-non-additive when running through tooling that lints SQL,
-- because DROP COLUMN / DROP TABLE family operations are flagged as
-- non-additive by the apply_sql_migrations lint even when this particular
-- file does not actually drop columns.

DO $$ BEGIN RAISE NOTICE 'Affected rows in applications: %', (SELECT count(*) FROM applications); END $$;

DELETE FROM migration_history WHERE migration_name = '2026_05_18_expand_application_status_columns.sql';
