-- Legacy-column contraction invariants — READ-ONLY.
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 12.3
-- Requirements: R15.6 (contract only after runtime-reference, legacy-row,
--   mismatch and telemetry gates are zero), R15.7 (read-only evidence compares
--   local/test, fresh, Neon branch and production; production is never the
--   first apply), R15.9 (application payment summaries derive from Payment;
--   deprecated application payment columns contract only after mismatch and
--   use telemetry are zero).
-- Findings: DATA-01, DATA-10, DATA-11.
-- Registry: backend/apps/common/legacy_columns.py
-- Runbook:  docs/runbooks/legacy-column-deprecation.md
--
-- WHAT THIS FILE IS
-- -----------------
-- The four database-side gates R15.6 names, as SQL that can be run on any
-- deployment without mutating it. It is the instrument behind task 12.3's
-- evidence and the same instrument an operator runs on production before the
-- contract migration. It SELECTs only: no ALTER, no UPDATE, no DELETE, no DROP.
--
-- It is deliberately separate from the contract migration
-- (legacy_columns_contract_2026_08_15.sql), which embeds the same four gates as
-- fail-closed guards. This file answers "may we contract yet"; that file
-- refuses to run when the answer is no.
--
-- HOW TO RUN
-- ----------
--   Neon (authoring):     psql "$DATABASE_URL" -f backend/scripts/legacy_column_invariants.sql
--   Production (EC2 box): docker compose -f docker-compose.prod.yml exec -T postgres \
--                           bash -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--                           < backend/scripts/legacy_column_invariants.sql
--
-- Safe to run on production at any time — it takes no locks beyond ordinary
-- read snapshots and writes nothing.

\echo '== Gate 0: schema presence (which legacy columns still exist here) =='
SELECT
    'applications' AS table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'applications'
  AND column_name IN (
      'payment_method', 'payer_name', 'payer_phone', 'amount', 'paid_at',
      'momo_ref', 'pop_url', 'payment_verified_at', 'payment_verified_by'
  )
UNION ALL
SELECT
    'profiles' AS table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('refresh_token_hash', 'failed_login_attempts', 'locked_until')
ORDER BY table_name, column_name;

SELECT
    count(*) FILTER (WHERE table_name = 'error_logs') AS error_logs_table_present
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'error_logs';


\echo '== Gate 1: legacy-row count, per column (R15.6 "legacy-row count ... zero") =='
-- A non-zero count means the column still carries data. Dropping it destroys
-- that data: DROP COLUMN is irreversible with respect to values, and this
-- repo's rollback convention (R9.2) forbids ADD COLUMN in a rollback script.
SELECT
    count(*)                                            AS applications_total,
    count(payment_method)                               AS payment_method,
    count(payer_name)                                   AS payer_name,
    count(payer_phone)                                  AS payer_phone,
    count(amount)                                       AS amount,
    count(paid_at)                                      AS paid_at,
    count(momo_ref)                                     AS momo_ref,
    count(pop_url)                                      AS pop_url,
    count(payment_verified_at)                          AS payment_verified_at,
    count(payment_verified_by)                          AS payment_verified_by
FROM applications;


\echo '== Gate 1b: is that legacy data represented in the canonical ledger? =='
-- The count above on its own cannot distinguish "a redundant copy of a payments
-- row" from "the only surviving record of a payment". This does.
--
--   legacy_rows_with_canonical_payment    -> redundant copy; contracting loses nothing
--   legacy_rows_with_no_canonical_payment -> the applications row is the only record
--   unbacked_money_rows                   -> ... and it carries a money fact
--                                            (amount / paid_at / momo_ref)
WITH legacy AS (
    SELECT
        a.id,
        a.amount,
        a.paid_at,
        a.momo_ref,
        (SELECT count(*) FROM payments p WHERE p.application_id = a.id) AS canonical_payment_rows
    FROM applications a
    WHERE a.payment_method      IS NOT NULL
       OR a.payer_name          IS NOT NULL
       OR a.payer_phone         IS NOT NULL
       OR a.amount              IS NOT NULL
       OR a.paid_at             IS NOT NULL
       OR a.momo_ref            IS NOT NULL
       OR a.pop_url             IS NOT NULL
       OR a.payment_verified_at IS NOT NULL
       OR a.payment_verified_by IS NOT NULL
)
SELECT
    count(*)                                                       AS legacy_rows_total,
    count(*) FILTER (WHERE canonical_payment_rows > 0)             AS legacy_rows_with_canonical_payment,
    count(*) FILTER (WHERE canonical_payment_rows = 0)             AS legacy_rows_with_no_canonical_payment,
    count(*) FILTER (
        WHERE canonical_payment_rows = 0
          AND (amount IS NOT NULL OR paid_at IS NOT NULL OR momo_ref IS NOT NULL)
    )                                                              AS unbacked_money_rows
FROM legacy;


\echo '== Gate 2: canonical / snapshot consistency (R15.3, R15.6) =='
-- docs/canonical-truth-map.md: canonical IDs are the sole authority;
-- applications.institution / program / intake are read-only DISPLAY SNAPSHOTS
-- of institutions.name / canonical_programs.name / intakes.name
-- (backend/apps/applications/assignment_resolution.py:resolve_assignment_snapshot).
--
-- Read `missing_canonical_ids` FIRST. A mismatch count of zero over rows that
-- have no canonical id is not a pass — it is an empty comparison domain, and it
-- means the legacy string is currently the only identity record for that row.
SELECT
    count(*)                                                                       AS applications_total,
    count(*) FILTER (
        WHERE a.institution_id IS NULL OR a.program_id IS NULL OR a.intake_id IS NULL
    )                                                                              AS missing_canonical_ids,
    count(*) FILTER (WHERE a.institution_id IS NOT NULL
                       AND a.program_id     IS NOT NULL
                       AND a.intake_id      IS NOT NULL)                           AS comparable_rows,
    count(*) FILTER (WHERE i.id  IS NOT NULL AND a.institution IS DISTINCT FROM i.name)  AS institution_snapshot_mismatch,
    count(*) FILTER (WHERE cp.id IS NOT NULL AND a.program     IS DISTINCT FROM cp.name) AS program_snapshot_mismatch,
    count(*) FILTER (WHERE ik.id IS NOT NULL AND a.intake      IS DISTINCT FROM ik.name) AS intake_snapshot_mismatch,
    count(*) FILTER (WHERE a.institution_id IS NOT NULL AND i.id  IS NULL)          AS dangling_institution_id,
    count(*) FILTER (WHERE a.program_id     IS NOT NULL AND cp.id IS NULL)          AS dangling_program_id,
    count(*) FILTER (WHERE a.intake_id      IS NOT NULL AND ik.id IS NULL)          AS dangling_intake_id
FROM applications a
LEFT JOIN institutions       i  ON i.id  = a.institution_id
LEFT JOIN canonical_programs cp ON cp.id = a.program_id
LEFT JOIN intakes            ik ON ik.id = a.intake_id;


\echo '== Gate 3: payment projection mismatch (ADR-001, R15.9) =='
-- applications.payment_status is a DERIVED summary of the whole payments ledger.
-- The CASE below is APP_PAYMENT_STATUS_PRECEDENCE from
-- backend/apps/documents/payment_constants.py, in its declared order. Keep the
-- two in sync: backend/tests/unit/test_legacy_column_contraction_12_3.py parses
-- this file and fails if they drift.
--
-- A NULL derived value means the application has no ledger row this platform
-- recognises; derive_application_payment_status() returns None there and the
-- caller must leave the stored summary alone, so those rows are counted
-- separately rather than as mismatches.
WITH projected AS (
    SELECT
        a.id,
        a.application_number,
        a.payment_status AS stored,
        CASE
            WHEN bool_or(lower(coalesce(p.status, '')) IN ('successful', 'force_approved', 'verified', 'paid')) THEN 'verified'
            WHEN bool_or(lower(coalesce(p.status, '')) = 'deferred') THEN 'deferred'
            WHEN bool_or(lower(coalesce(p.status, '')) = 'pending')  THEN 'pending_review'
            WHEN bool_or(lower(coalesce(p.status, '')) = 'failed')   THEN 'failed'
            WHEN bool_or(lower(coalesce(p.status, '')) = 'expired')  THEN 'not_paid'
            ELSE NULL
        END AS derived
    FROM applications a
    LEFT JOIN payments p ON p.application_id = a.id
    GROUP BY a.id, a.application_number, a.payment_status
)
SELECT
    count(*)                                              AS applications_total,
    count(*) FILTER (WHERE derived IS NULL)               AS no_ledger_rows_projection_undefined,
    count(*) FILTER (WHERE derived IS NOT NULL)           AS projectable_rows,
    count(*) FILTER (
        WHERE derived IS NOT NULL
          AND coalesce(stored, '<null>') <> derived
    )                                                     AS projection_mismatches
FROM projected;

\echo '-- the mismatching rows themselves (application_number only; no PII) --'
WITH projected AS (
    SELECT
        a.application_number,
        a.payment_status AS stored,
        string_agg(DISTINCT lower(coalesce(p.status, '')), ',' ORDER BY lower(coalesce(p.status, ''))) AS ledger_statuses,
        CASE
            WHEN bool_or(lower(coalesce(p.status, '')) IN ('successful', 'force_approved', 'verified', 'paid')) THEN 'verified'
            WHEN bool_or(lower(coalesce(p.status, '')) = 'deferred') THEN 'deferred'
            WHEN bool_or(lower(coalesce(p.status, '')) = 'pending')  THEN 'pending_review'
            WHEN bool_or(lower(coalesce(p.status, '')) = 'failed')   THEN 'failed'
            WHEN bool_or(lower(coalesce(p.status, '')) = 'expired')  THEN 'not_paid'
            ELSE NULL
        END AS derived
    FROM applications a
    LEFT JOIN payments p ON p.application_id = a.id
    GROUP BY a.application_number, a.payment_status
)
SELECT application_number, stored, derived, ledger_statuses
FROM projected
WHERE derived IS NOT NULL AND coalesce(stored, '<null>') <> derived
ORDER BY application_number;


\echo '== Gate 4: deprecated-table row count (error_logs) =='
-- legacy_columns.py registers error_logs with __entire_table__. It is still an
-- EXPECTED_TABLE in backend/scripts/verify_schema_static.py and
-- backend/scripts/verify_migration.py, so dropping it without updating both
-- verifiers fails the release gate (R15.3).
SELECT count(*) AS error_logs_rows FROM error_logs;


\echo '== Deployment fingerprint (so a result can be attributed to a database) =='
SELECT
    current_database()                                        AS database,
    (SELECT count(*) FROM migration_history)                  AS migrations_applied,
    (SELECT max(applied_at) FROM migration_history)           AS last_migration_at,
    (SELECT count(*) FROM applications)                       AS applications,
    (SELECT count(*) FROM payments)                           AS payments,
    (SELECT count(*) FROM canonical_programs)                 AS canonical_programs,
    now()                                                     AS measured_at;
