-- Reversible inverse of system_actor_seed.sql. Apply only after confirming no application code depends on the structures being dropped.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Component: 3 (Migration directory layout — every forward script ships with a sibling rollback)
-- Requirements: 9.1, 9.2, 9.3, 9.4
--
-- Forward script effect: inserts a single deterministic row into the
-- profiles table representing the system actor:
--   id    = '00000000-0000-0000-0000-000000000001'
--   email = 'system@mihas.internal'
--   role  = 'super_admin'
--   is_active = false
--
-- Inverse-additive scope (Requirement 9.2):
-- DELETE FROM <table> WHERE <pk> = '<seeded-id>' is the only allowed
-- mutating statement. We scope the DELETE by the deterministic UUID so
-- this rollback cannot accidentally remove any operator-curated profile
-- that happens to share another column value with the seeded row.
--
-- profiles is not a payments / applications table, so the Requirement
-- 9.4 RAISE NOTICE block is not required here. The SYSTEM_ACTOR_ID is
-- referenced by apps.applications.services as the changed_by actor for
-- automated transitions; do not run this rollback while Celery workers
-- (draft expiry, condition expiry, enrollment expiry, waitlist
-- promotion) are active.
--
-- Application notes (Requirement 9.5):
-- Apply manually with autocommit. Never invoke via apply_sql_migrations.
-- Pass --allow-non-additive when running through tooling that lints SQL,
-- because DROP COLUMN / DROP TABLE family operations are flagged as
-- non-additive by the apply_sql_migrations lint even when this file only
-- performs scoped DELETEs.

DELETE FROM profiles WHERE id = '00000000-0000-0000-0000-000000000001';

DELETE FROM migration_history WHERE migration_name = 'system_actor_seed.sql';
