-- Reversible inverse of application_number_sequences.sql. Apply only after confirming no application code depends on the structures being dropped.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Component: 3 (Migration directory layout — every forward script ships with a sibling rollback)
-- Requirements: 9.1, 9.2, 9.3, 9.4
--
-- Forward script effect:
--   1. CREATE SEQUENCE IF NOT EXISTS for the six pre-created
--      (institution, year) combos: app_num_mihas_{2025,2026,2027} and
--      app_num_katc_{2025,2026,2027}.
--   2. CREATE OR REPLACE FUNCTION next_application_number(p_code, p_year).
--   3. A DO $$ ... END $$ backfill block that may auto-create additional
--      app_num_<code>_<year> sequences for any (institution, year) pair
--      present in applications.application_number, then ALTER SEQUENCE
--      ... RESTART WITH max+1 to align them with existing rows.
--
-- The forward script reads from the applications table (via the DO $$
-- backfill block), so this rollback prepends the row-count NOTICE block
-- mandated by Requirement 9.4 even though the inverse-additive operations
-- below only mutate sequence and migration_history rows. The NOTICE gives
-- the operator a sanity check before dropping sequences that the live
-- application_number generator depends on.
--
-- Inverse-additive scope (Requirement 9.2):
-- The allowed inverse-additive operations are DROP SEQUENCE IF EXISTS and
-- the scoped DELETE FROM migration_history. We drop only the six
-- deterministically pre-created sequences. Any sequence auto-created by
-- the backfill DO $$ block for an unexpected (institution, year) pair is
-- intentionally left in place — dropping a sequence we did not pre-declare
-- could break a live insert path. An operator who needs to remove an
-- auto-created sequence must do so manually after confirming no rows in
-- applications still depend on it.
--
-- The next_application_number function is intentionally not dropped.
-- DROP FUNCTION is not in the allowed inverse-additive operation set
-- (Requirement 9.2), and CREATE OR REPLACE FUNCTION on the forward path
-- is itself idempotent, so leaving the function definition in place keeps
-- the rollback strictly additive-safe.
--
-- Application notes (Requirement 9.5):
-- Apply manually with autocommit. Never invoke via apply_sql_migrations.
-- Pass --allow-non-additive when running through tooling that lints SQL,
-- because DROP COLUMN / DROP TABLE family operations are flagged as
-- non-additive by the apply_sql_migrations lint even when this file
-- only drops sequences and a tracking row.

DO $$ BEGIN RAISE NOTICE 'Affected rows in applications: %', (SELECT count(*) FROM applications); END $$;

DROP SEQUENCE IF EXISTS app_num_katc_2027;
DROP SEQUENCE IF EXISTS app_num_katc_2026;
DROP SEQUENCE IF EXISTS app_num_katc_2025;
DROP SEQUENCE IF EXISTS app_num_mihas_2027;
DROP SEQUENCE IF EXISTS app_num_mihas_2026;
DROP SEQUENCE IF EXISTS app_num_mihas_2025;

DELETE FROM migration_history WHERE migration_name = 'application_number_sequences.sql';
