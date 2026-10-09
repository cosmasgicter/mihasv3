-- Operator-only reverse of 2026_07_17_01_integrity_constraints_expand.sql.
--
-- Excluded from the apply_sql_migrations boot sweep (the runner skips
-- *_rollback.sql). Drops every constraint/index the expand script added, in
-- reverse order. Idempotent (IF EXISTS everywhere). Does NOT restore the legacy
-- global UNIQUE(template_key) — that is script 02's rollback.
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.3.

-- 7. Application waitlist position.
DROP INDEX IF EXISTS uq_applications_waitlist_position;

-- 6. Communication template tenant-scoped uniqueness.
DROP INDEX IF EXISTS uq_comm_templates_one_active;
DROP INDEX IF EXISTS uq_comm_templates_key_inst_version;

-- 5. Document profile version uniqueness.
DROP INDEX IF EXISTS uq_doc_profiles_scope_version;

-- 4. Access grant scope/target + active-duplicate uniqueness.
DROP INDEX IF EXISTS uq_access_grants_active_application;
DROP INDEX IF EXISTS uq_access_grants_active_program;
DROP INDEX IF EXISTS uq_access_grants_active_institution;
ALTER TABLE access_grants DROP CONSTRAINT IF EXISTS chk_access_grants_scope_target;

-- 3. Program fee one-active.
DROP INDEX IF EXISTS uq_program_fees_one_active;

-- 2. Non-negative capacity/enrollment counters.
ALTER TABLE intakes DROP CONSTRAINT IF EXISTS chk_intakes_enrollment_nonneg;
ALTER TABLE intakes DROP CONSTRAINT IF EXISTS chk_intakes_capacity_nonneg;
ALTER TABLE program_intakes DROP CONSTRAINT IF EXISTS chk_program_intakes_enrollment_nonneg;
ALTER TABLE program_intakes DROP CONSTRAINT IF EXISTS chk_program_intakes_capacity_nonneg;

-- 1. ProgramIntake unique (only the index this task created; the pre-existing
--    Django-named `program_intakes_program_id_intake_id_key` is left intact).
DROP INDEX IF EXISTS uq_program_intakes_program_intake;
