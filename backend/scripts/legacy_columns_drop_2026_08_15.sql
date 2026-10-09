-- ===========================================================================
-- SUPERSEDED — DO NOT RUN. This file no longer drops anything.
--
-- Superseded on 2026-08-11 by admissions-v2 task 12.3.
-- Replacement: backend/scripts/future/legacy_columns_contract_2026_08_15.sql
-- Evidence:    docs/v2-evidence/12.3/README.md  (§3 measurements, §7 this decision)
-- Runbook:     docs/runbooks/legacy-column-deprecation.md  (Day 90 section)
-- ===========================================================================
--
-- WHAT THIS FILE USED TO DO, AND WHY IT MUST NOT
-- ----------------------------------------------
-- Authored 2026-05-17 as the Day-90 execution step of the legacy-column
-- deprecation cycle. It dropped 12 things behind a single guard — the calendar:
--
--     IF current_date < '2026-08-15' THEN RAISE EXCEPTION ...
--
-- That guard answers "is it time yet". It does not answer "is it safe yet", and
-- R15.6 requires four more gates be zero before a contract migration runs. On
-- 2026-08-11, four days before the guard would have stopped firing, task 12.3
-- measured them for the first time. Three were not zero:
--
--   * 18 applications still carry legacy payment values (92 non-null values).
--     17 of them have NO row in the canonical `payments` table, and 16 carry a
--     money fact — an amount, a payment date, or a mobile-money reference —
--     that exists nowhere else in the platform. For those rows the column IS
--     the record. `DROP COLUMN` is irreversible with respect to data and R9.2
--     forbids `ADD COLUMN` in a rollback script, so this file would have
--     destroyed the only surviving record of 16 applicants' payments.
--
--   * `Application` still DECLARES `payment_verified_at` and
--     `payment_verified_by` as model fields. Django names every declared field
--     in its default SELECT and INSERT column list, so dropping those two
--     columns while the fields exist raises `column ... does not exist` on
--     every query against `Application` — that is most of the platform, not one
--     endpoint. They are also four fields of the published API response, they
--     are in apps/admissions/src/generated/api.d.ts, and a student-facing
--     component renders one of them.
--
--   * All 33 applications have NULL canonical institution/program/intake ids on
--     the Neon authoring database, so the canonical/snapshot consistency gate
--     has an empty comparison domain rather than a passing one.
--
-- The `profiles` section was already redundant: those three columns were
-- contracted on 2026-07-12 by schema_cleanup_drop_stale_columns.sql.
--
-- The `DROP TABLE error_logs` was never safe either: 186 historical rows with no
-- canonical destination, and `error_logs` is still an EXPECTED_TABLE in both
-- backend/scripts/verify_schema_static.py and backend/scripts/verify_migration.py,
-- so dropping it fails the release gate.
--
-- WHY IT IS NEUTRALISED RATHER THAN LEFT ALONE
-- --------------------------------------------
-- This file is named in `EXCLUDED_TOP_LEVEL_FILES`
-- (apps/common/management/commands/apply_sql_migrations.py), so it was never
-- auto-applied and no boot sweep was ever at risk from it. The exposure was a
-- person: the runbook's Day-90 section instructed an operator to run
-- `psql "$DATABASE_URL" -f backend/scripts/legacy_columns_drop_2026_08_15.sql`,
-- and from 2026-08-15 the date guard would have let that succeed. Leaving a
-- loaded script next to an instruction to fire it is not a documentation problem.
--
-- It is kept as a marker rather than deleted so that the instruction, wherever it
-- has been copied to, lands on this explanation instead of on a missing file.
--
-- WHAT TO RUN INSTEAD
-- -------------------
--   1. docs/v2-evidence/12.3/invariants.sql        (read-only; are the gates zero?)
--   2. When they are, promote and run
--      backend/scripts/future/legacy_columns_contract_2026_08_15.sql, which
--      carries all five gates as fail-closed guards and contracts only the 7
--      columns proven safe.
--
-- Production remains an operator step, backup first:
-- docs/v2-evidence/12.3/raw/production-procedure.md

DO $$
BEGIN
    RAISE EXCEPTION
        'legacy_columns_drop_2026_08_15.sql is SUPERSEDED and drops nothing. '
        'Run docs/v2-evidence/12.3/invariants.sql first, then '
        'backend/scripts/future/legacy_columns_contract_2026_08_15.sql. '
        'See docs/v2-evidence/12.3/README.md section 7.';
END $$;
