-- Rollback for 2026_07_23_01_application_assignment_snapshot.sql
--
-- Drops the four additive assignment-snapshot columns. Non-additive
-- (DROP COLUMN) so it is NEVER auto-applied by apply_sql_migrations; it is an
-- operator-run rollback sibling, executed manually with --allow-non-additive
-- awareness during a deliberate revert only. Guarded with IF EXISTS so a
-- partial-apply revert converges.

ALTER TABLE applications DROP COLUMN IF EXISTS assignment_version;
ALTER TABLE applications DROP COLUMN IF EXISTS eligibility_snapshot;
ALTER TABLE applications DROP COLUMN IF EXISTS requirements_snapshot;
ALTER TABLE applications DROP COLUMN IF EXISTS configuration_version;
