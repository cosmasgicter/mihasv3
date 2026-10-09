-- Admissions V2 - task 13.6 remediation L3: give canonical_programs.id the
-- gen_random_uuid() default the from-empty build already has. EXPAND phase
-- (additive, idempotent, one statement, metadata-only).
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 13.6 §8.1 L3
-- Requirements: R15.3-R15.4 (additive expand, bounded locks), R15.7-R15.8
--               (a restored backup SHALL be able to be brought forward),
--               R18.7 (rehearsed before it reaches production)
-- Findings:     GATE-13.4-02 (a restored production-lineage backup cannot be
--               brought forward: the boot gate refuses and the documented
--               remedy dies), blocking item B6
-- Design:       15.2 (expand/backfill/switch), 19 risk "Restore cannot be
--               brought forward"
-- Evidence:     docs/v2-evidence/13.6/remediation/L2-L3/README.md;
--               root cause sharpened by docs/v2-evidence/13.5/README.md §4.1
--
-- ===========================================================================
-- WHY THIS FILE IS DATED 2026_06_08_00 AND NOT 2026_08_13
-- ===========================================================================
-- It was authored on 2026-08-13 under task 13.6 remediation L3. The date in the
-- filename is an ORDERING DECLARATION, not a claim about when it was written,
-- and the ``00`` slot means precisely "this must run before 2026_06_08_01 on
-- that date".
--
-- ``apply_sql_migrations`` applies pending files in LEXICAL FILENAME ORDER and
-- aborts the whole sweep at the first failure. On the databases this script
-- exists to repair, the very first pending file is
-- ``2026_06_08_01_multi_tenant_beanola_admissions.sql`` and it is the one that
-- fails. Measured on the restored production-lineage snapshot:
--
--     Pending migrations: 23/42
--       applying: 2026_06_08_01_multi_tenant_beanola_admissions.sql ... FAIL
--     CommandError: null value in column "id" of relation "canonical_programs"
--                   violates not-null constraint
--
-- A fix named ``2026_08_13_...`` would sit twenty-first in that queue and would
-- never be reached - it would be correct, applied nowhere, and the deadlock
-- would survive it. The ordering is therefore load-bearing, and hiding it behind
-- a today-shaped filename would have produced a script that passes review and
-- fixes nothing.
--
-- What this does
-- --------------
--     ALTER TABLE canonical_programs ALTER COLUMN id SET DEFAULT gen_random_uuid();
--
-- One statement, guarded. ``gen_random_uuid()`` is a core built-in from PG 13
-- onward (no pgcrypto dependency); production and the Neon rehearsal branch are
-- both PG 17.
--
-- The root cause, in full
-- -----------------------
-- ``2026_06_08_01`` opens with ``CREATE TABLE IF NOT EXISTS canonical_programs
-- (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ...)`` and later does
-- ``INSERT INTO canonical_programs (name, code, ...) SELECT ... FROM programs``
-- - supplying NO id, because on a fresh build the column's default supplies it.
--
-- On the production lineage that table already existed WITHOUT the default, so
-- ``CREATE TABLE IF NOT EXISTS`` was a no-op and the default never landed.
-- 13.5 §4.1 then measured, read-only, what state such a database is actually in:
--
--     canonical_programs.id has a default .................. no
--     canonical_programs rows ............................... 0
--     2026_06_08_01 recorded in migration_history ........... no
--     applications.institution_id / program_id /
--       program_offering_id / intake_id present ............. yes, all four
--
-- Read together those four facts say something specific: the June script's
-- ``ALTER TABLE``s were ALREADY APPLIED (all four canonical columns exist) and
-- only its ledger row was never written. So ``apply_sql_migrations`` re-runs the
-- whole file; every ``ALTER`` is ``IF NOT EXISTS`` and no-ops; and it dies on the
-- one statement that depends on a default that is not there.
--
-- Why the default, and not "make the June INSERT supply ids"
-- ---------------------------------------------------------
-- Both would clear the deadlock. 13.5 preferred this one and named why: it is
-- additive, idempotent, one statement, it converges the snapshot lineage onto
-- the shape the from-empty build already has (verified on v2_fresh_13_4:
-- ``id | gen_random_uuid()``), and it repairs EVERY database of this lineage
-- rather than the one script that happened to trip over it first. Editing the
-- June script instead would also change a file whose checksum is already
-- recorded in the ledger of every database that did apply it cleanly.
--
-- Why it matters beyond tidiness
-- ------------------------------
-- The canary's rollback plan includes "restore from backup". Today restore works,
-- the app will not start (``check_schema_drift`` exits 1 with 5 missing columns),
-- and the documented remedy fails. Until this is fixed the data-level rollback is
-- unproven, which is why 13.5 classified GATE-13.4-02 as BLOCK. 13.5 preflight
-- gate 22 is the one-command test, and it is what this script turns to PASS.
--
-- Online-safety (design 19 "bounded locks")
-- -----------------------------------------
-- ``SET DEFAULT`` is a catalogue write: no table rewrite, no row touched, no
-- index rebuilt, no existing row's id changed. It takes ACCESS EXCLUSIVE on
-- ``canonical_programs`` for the duration of that catalogue update.
-- Transaction-safe, so it runs in the ordinary transactional path.
--
-- Idempotent + environment-safe
-- -----------------------------
-- The statement fires only while the table EXISTS, the column EXISTS, and it has
-- NO default. Therefore:
--   * a re-run is a complete no-op,
--   * a from-empty build - where this file sorts BEFORE the script that creates
--     the table, so the table does not exist yet - is a complete no-op, and
--     ``2026_06_08_01`` then creates the column with the default itself,
--   * a Django-built or already-repaired database is a complete no-op,
--   * a database whose id default is something else deliberately is left alone
--     rather than overwritten.
-- Additive-only-lint clean: no schema or data removal, no narrowing conversion.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'canonical_programs'
          AND column_name = 'id'
          AND column_default IS NULL
    ) THEN
        ALTER TABLE canonical_programs
            ALTER COLUMN id SET DEFAULT gen_random_uuid();
        RAISE NOTICE 'canonical_programs.id now defaults to gen_random_uuid()';
    END IF;
END $$;
