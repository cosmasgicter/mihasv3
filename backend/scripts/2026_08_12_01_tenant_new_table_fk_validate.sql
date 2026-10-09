-- Admissions V2 - task 13.4: validate the July tenant-table foreign keys
-- (VALIDATE phase for the three expand scripts that shipped without one).
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 13.4
-- Requirements: R15.3-R15.4 ("a remaining NOT VALID tenant constraint SHALL
--               block V2"), R18.7
-- Findings:     GATE-13.1-01 (an expand with no validate), DATA-07 (the same
--               pattern one lane earlier)
-- Design:       15.2 step 6 ("switch + enforce validated constraints online"),
--               19 risk "Constraint creation blocks production" control
--               ("NOT VALID then validate, bounded locks")
-- Precedent:    2026_07_18_01_tenant_fk_validate.sql (task 3.4) - same shape,
--               same guard, same idempotence contract. This script is its
--               missing sibling for the three July tenant tables.
--
-- What this does
-- --------------
-- Three July 2026 tenant scripts added their foreign keys NOT VALID so they
-- could ship additively online, and - unlike five sibling expand scripts - none
-- of them shipped a paired *_validate.sql:
--   * 2026_07_20_01_tenant_onboarding.sql          (2 FKs)
--   * 2026_07_21_01_tenant_staff_invitations.sql   (4 FKs)
--   * 2026_07_22_01_tenant_change_requests.sql     (3 FKs)
-- This runs ALTER TABLE ... VALIDATE CONSTRAINT for those 9 FKs so
-- ``schema_manifest --verify`` can return ok on an environment built from the
-- repo SQL. Before this script, task 13.1 measured 9 permanent
-- ``unvalidated_foreign_key`` failures on the fresh-from-empty manifest, which
-- meant a REAL future NOT VALID constraint was indistinguishable from this
-- permanent one - the verifier could never be trusted to say "clean".
--
-- Why this is cheap and why it was always going to be
-- ---------------------------------------------------
-- All three are NEW tables created by the same script that added the FK, so
-- there are no pre-existing rows to scan and the constraint is already enforced
-- for every row that can exist. This is NOT a data-integrity hole being closed;
-- it is the verifier being made able to tell the truth. VALIDATE on an empty or
-- small table is effectively instant - measured on the Neon rehearsal branch,
-- see docs/v2-evidence/13.4/.
--
-- Orphan preflight (R15.4 "validated after an orphan remediation preflight")
-- --------------------------------------------------------------------------
-- A READ-ONLY preflight ran first on the Neon rehearsal branch and on the
-- fresh-from-empty database (docs/v2-evidence/13.4/invariants.sql, Gate 1):
-- ZERO orphan rows across all 9 FK relationships. If a future orphan does
-- exist, VALIDATE fails closed - the migration aborts and rolls back rather
-- than marking a broken constraint valid, which is exactly R15.3.
--
-- Lock behaviour (design 19 "bounded locks")
-- ------------------------------------------
-- VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE on the table: it serialises
-- against schema changes and VACUUM but NOT against concurrent
-- SELECT / INSERT / UPDATE / DELETE. Measured again for these three tables on
-- the Neon rehearsal branch (docs/v2-evidence/13.4/raw/c4-constraint-validation.txt).
-- Transaction-safe, so it runs in the normal transactional apply_sql_migrations
-- path - no CREATE INDEX CONCURRENTLY, no long ACCESS EXCLUSIVE hold.
--
-- Idempotent + environment-safe
-- -----------------------------
-- Each VALIDATE fires only while the named constraint EXISTS and is still
-- ``convalidated = false``, so a re-run is a no-op (a validated FK stays valid)
-- and a Django-built database - where these tables carry Django-named,
-- already-valid FKs and the July names are absent - is a complete no-op.
-- Additive-only-lint clean: no schema or data removal.

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT con.conname AS name,
               con.conrelid::regclass::text AS table_name
        FROM pg_constraint con
        WHERE con.contype = 'f'
          AND con.convalidated = false
          AND con.conname = ANY (ARRAY[
              -- 2026_07_20_01_tenant_onboarding.sql (2)
              'tenant_onboarding_institution_id_fk',
              'tenant_onboarding_created_by_id_fk',
              -- 2026_07_21_01_tenant_staff_invitations.sql (4)
              'tenant_staff_invitations_institution_id_fk',
              'tenant_staff_invitations_profile_id_fk',
              'tenant_staff_invitations_membership_id_fk',
              'tenant_staff_invitations_invited_by_id_fk',
              -- 2026_07_22_01_tenant_change_requests.sql (3)
              'tenant_change_requests_institution_id_fk',
              'tenant_change_requests_requested_by_id_fk',
              'tenant_change_requests_reviewed_by_id_fk'
          ])
    LOOP
        EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', r.table_name, r.name);
    END LOOP;
END $$;
