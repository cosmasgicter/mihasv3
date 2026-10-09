-- Admissions V2 — task 3.2 (canonical assignment remediation), VALIDATE phase.
--
-- Spec:        .kiro/specs/admissions-v2-canonical-rebuild/
-- Requirements: R7.1-R7.2, R15.3-R15.4, R15.7
-- Findings:    DATA-07 (unvalidated tenant FKs), DATA-01/02, STU-01
-- Sequence:    design.md §15.2 step (6) "switch + enforce NOT NULL / validated
--              online". Run AFTER 01_ expand and 02_ backfill: every non-draft
--              row is now either fully assigned or explicitly quarantined, so the
--              CHECK and the four canonical FKs can be validated without error.
--
-- VALIDATE CONSTRAINT takes only SHARE UPDATE EXCLUSIVE (reads + writes continue)
-- and is transaction-safe, so this runs inside the apply_sql_migrations
-- transactional path. Both blocks are defensive + idempotent:
--   * FK validation only fires for the four applications canonical FKs that exist
--     AND are still NOT VALID (fresh-from-empty added them NOT VALID; environments
--     built by the Django path already carry validated equivalents under different
--     names, where this is a no-op).
--   * the CHECK is validated only while it is still NOT VALID.

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'applications'::regclass
          AND contype = 'f'
          AND convalidated = false
          AND conname IN (
              'applications_institution_id_fk',
              'applications_program_id_fk',
              'applications_program_offering_id_fk',
              'applications_intake_id_fk'
          )
    LOOP
        EXECUTE format('ALTER TABLE applications VALIDATE CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_applications_canonical_assignment'
          AND convalidated = false
    ) THEN
        ALTER TABLE applications VALIDATE CONSTRAINT chk_applications_canonical_assignment;
    END IF;
END $$;
