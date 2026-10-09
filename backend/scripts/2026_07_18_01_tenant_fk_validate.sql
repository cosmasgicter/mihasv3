-- Admissions V2 - task 3.4: validate every tenant foreign key (VALIDATE phase).
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 3.4
-- Requirements: R15.3-R15.4, R18.7
-- Findings:     DATA-07 (June tenant FKs added NOT VALID; no validation migration)
-- Design:       15.1 (schema verifier: "unvalidated FKs are failures"),
--               15.2 step 6 ("switch + enforce validated constraints online"),
--               19 risk "Constraint creation blocks production" control
--               ("NOT VALID then validate, bounded locks").
--
-- What this does
-- --------------
-- The June 2026 tenant scripts added their foreign keys NOT VALID (enforced for
-- NEW rows, existing rows left unscanned) so they could ship additively online:
--   * 2026_06_08_01_multi_tenant_beanola_admissions.sql  (17 tenant FKs here;
--     the 4 applications canonical FKs are validated by task 3.2's
--     2026_07_16_03_canonical_assignment_validate.sql, NOT this script)
--   * 2026_06_08_03_institution_document_profiles.sql     (4 FKs)
--   * 2026_06_08_04_communication_templates_tenant.sql    (1 FK)
--   * 2026_06_18_01_institution_domain_lifecycle.sql      (2 FKs)
-- This runs ALTER TABLE ... VALIDATE CONSTRAINT for those 24 FKs so the schema
-- verifier (15.1) reports zero invalid tenant constraints -- the R15.4 gate
-- ("a remaining NOT VALID tenant constraint SHALL block V2").
--
-- Orphan preflight (R15.4 "validated after an orphan remediation preflight")
-- --------------------------------------------------------------------------
-- A READ-ONLY preflight (docs/v2-evidence/3.4/inventory.sql) ran on the Neon
-- default branch first: ZERO orphan rows across all 24 FK relationships (most
-- tenant tables are empty; programs.canonical_program_id is entirely NULL;
-- communication_templates.institution_id is NULL on platform rows). No repair
-- or quarantine was required, so VALIDATE applies cleanly. If a future orphan
-- exists, VALIDATE fails closed (the migration aborts + rolls back) rather than
-- marking a broken constraint valid -- exactly R15.3.
--
-- Lock behaviour (19 "bounded locks")
-- -----------------------------------
-- VALIDATE CONSTRAINT takes only a SHARE UPDATE EXCLUSIVE lock on the table: it
-- serialises against schema changes / VACUUM but NOT against concurrent SELECT /
-- INSERT / UPDATE / DELETE. Measured on the Neon rehearsal branch -- see
-- docs/v2-evidence/3.4/stage2-rehearsal.md. Transaction-safe, so it runs in the
-- normal apply_sql_migrations path (no CREATE INDEX CONCURRENTLY).
--
-- Idempotent + environment-safe
-- -----------------------------
-- Each VALIDATE fires only while the named constraint EXISTS and is still
-- convalidated=false, so a re-run is a no-op (a validated FK stays valid) and a
-- Django-built database (Neon default, production restored from Neon, the
-- ephemeral pytest DB) -- where these tables carry Django-named already-valid
-- FKs and the June names are absent -- is a complete no-op. Additive-only-lint
-- clean (no schema/data removal).

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
              -- 2026_06_08_01_multi_tenant_beanola_admissions.sql (17)
              'programs_canonical_program_id_fk',
              'institution_assets_institution_id_fk',
              'institution_assets_created_by_id_fk',
              'institution_templates_institution_id_fk',
              'institution_templates_created_by_id_fk',
              'required_documents_institution_id_fk',
              'required_documents_program_id_fk',
              'required_documents_canonical_program_id_fk',
              'institution_domains_institution_id_fk',
              'memberships_user_id_fk',
              'memberships_institution_id_fk',
              'memberships_created_by_id_fk',
              'access_grants_user_id_fk',
              'access_grants_institution_id_fk',
              'access_grants_program_id_fk',
              'access_grants_application_id_fk',
              'access_grants_created_by_id_fk',
              -- 2026_06_08_03_institution_document_profiles.sql (4)
              'fk_doc_profiles_institution',
              'fk_doc_profiles_program',
              'fk_doc_profiles_canonical_program',
              'fk_doc_profiles_intake',
              -- 2026_06_08_04_communication_templates_tenant.sql (1)
              'fk_comm_templates_institution',
              -- 2026_06_18_01_institution_domain_lifecycle.sql (2)
              'institution_domains_created_by_id_fk',
              'institution_domains_approved_by_id_fk'
          ])
    LOOP
        EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', r.table_name, r.name);
    END LOOP;
END $$;
