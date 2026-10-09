-- Legacy-column CONTRACT migration — evidence-guarded.
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 12.3
-- Requirements: R15.6, R15.7, R15.9, R18.7
-- Findings: DATA-01, DATA-10, DATA-11
-- Registry:   backend/apps/common/legacy_columns.py
-- Invariants: docs/v2-evidence/12.3/invariants.sql  (run this first — read-only)
-- Runbook:    docs/runbooks/legacy-column-deprecation.md
-- Evidence:   docs/v2-evidence/12.3/README.md
-- Rollback:   legacy_columns_contract_2026_08_15_rollback.sql (this directory)
--
-- WHY THIS FILE LIVES IN backend/scripts/future/
-- ----------------------------------------------
-- Per that directory's README: authored, reviewed and version-controlled now,
-- but never swept by `apply_sql_migrations` or `check_schema_drift` (neither
-- recurses into subdirectories) and therefore never auto-applied at container
-- startup. It is promoted to the top level only when its trigger condition is
-- met. Two independent reasons it must not sit at the top level today:
--
--   1. It is a contraction. The additive-only lint rejects DROP COLUMN, and a
--      rejected *pending* top-level file raises CommandError — which would fail
--      the whole boot sweep, and with it the `&&`-chained uvicorn start in
--      backend/Dockerfile's CMD. (This is why the 2026-05-17 drop script is
--      named in EXCLUDED_TOP_LEVEL_FILES.)
--   2. Its trigger condition is not met. See PROMOTE WHEN, below.
--
-- PROMOTE WHEN
-- ------------
-- All five gates in docs/v2-evidence/12.3/invariants.sql read zero on the target
-- database. As of 2026-08-11 three did not (evidence README §3):
--   * 18 applications still carry legacy payment values, 17 of them with no
--     canonical payments row and 16 carrying a money fact recorded nowhere else;
--   * 33/33 applications have no canonical institution/program/intake id, so the
--     snapshot-consistency gate has an empty comparison domain;
--   * 1 application's payment_status disagrees with the ledger projection.
-- The unblocking step is the pre-Lenco payment backfill/quarantine named in
-- evidence README §3.2 — not an edit to this file's guards.
--
-- WHY THIS FILE EXISTS ALONGSIDE legacy_columns_drop_2026_08_15.sql
-- -----------------------------------------------------------------
-- The 2026-05-17 drop script guards only the *date*. A date guard answers
-- "is it 2026-08-15 yet"; it does not answer "is it safe yet". R15.6 requires
-- four more gates be zero before a contract migration runs — runtime reference
-- count, legacy-row count, mismatch count, and telemetry — and on 2026-08-11
-- three of them were NOT zero (docs/v2-evidence/12.3/README.md §3). Running the
-- original script on that date would have destroyed the only surviving record of
-- 16 historical payments and broken every Application query in the platform.
--
-- So this script encodes those gates as guards that FAIL CLOSED. It is designed
-- to REFUSE, loudly and with the offending count in the message, until the
-- prerequisites are actually met. An operator can run it on any date without
-- reading the runbook first and the worst outcome is an aborted transaction.
--
-- It replaces legacy_columns_drop_2026_08_15.sql, which must NOT be run.
-- See §7 of the evidence README for that decision.
--
-- SCOPE — 7 columns, not 12
-- -------------------------
-- Contracted here (ORM-unmapped, zero runtime references, absent from every
-- serializer and from the generated OpenAPI contract):
--   applications.payment_method, payer_name, payer_phone, amount, paid_at,
--   applications.momo_ref, pop_url
--
-- Deliberately NOT here, each a registered Legacy_Exception in
-- backend/apps/common/compatibility_register.py:
--   applications.payment_verified_at / payment_verified_by
--       Live Django model fields, live serializer output on two serializers,
--       four published API response fields, three select_related() call sites,
--       present in apps/admissions/src/generated/api.d.ts, and rendered by a
--       production student component. A published surface gets an announced
--       window, not a silent removal (R2.6).
--   profiles.refresh_token_hash / failed_login_attempts / locked_until
--       ALREADY CONTRACTED, July 2026, by
--       backend/scripts/schema_cleanup_drop_stale_columns.sql. Nothing left to do.
--   error_logs (entire table)
--       186 historical rows, and still an EXPECTED_TABLE in
--       backend/scripts/verify_schema_static.py and verify_migration.py, so
--       dropping it fails the release gate (R15.3). A table is also outside this
--       task's bullet, which contracts *columns*.
--
-- APPLICATION
-- -----------
-- Additive-SQL convention (managed = False, see .kiro/steering/tech.md): applied
-- by `python manage.py apply_sql_migrations`. A contraction is the documented
-- exception to "additive", which is why it ships with a rehearsed rollback
-- (legacy_columns_contract_2026_08_15_rollback.sql) and why production is an
-- operator step with a backup taken first.
--
-- PRODUCTION IS NEVER THE FIRST APPLY (R15.7). Prove on Neon, then a human runs
-- it on the self-hosted Postgres per docs/v2-evidence/12.3/raw/production-procedure.md.

BEGIN;

-- ---------------------------------------------------------------------------
-- Guard 1 — the announced sunset date (unchanged from the 2026-05-17 script)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF current_date < DATE '2026-08-15' THEN
        RAISE EXCEPTION
            'GATE 1 (date): announced sunset 2026-08-15 not yet reached (current_date = %). '
            'Nothing was changed.', current_date;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guard 2 — legacy-row count is zero for every column being dropped (R15.6)
-- ---------------------------------------------------------------------------
-- The gate that mattered on 2026-08-11. A non-zero count means the column still
-- holds data; DROP COLUMN destroys it and R9.2 forbids ADD COLUMN in a rollback,
-- so there is no way back.
DO $$
DECLARE
    v_payment_method int;
    v_payer_name     int;
    v_payer_phone    int;
    v_amount         int;
    v_paid_at        int;
    v_momo_ref       int;
    v_pop_url        int;
    v_total          int;
BEGIN
    SELECT count(payment_method), count(payer_name), count(payer_phone),
           count(amount), count(paid_at), count(momo_ref), count(pop_url)
      INTO v_payment_method, v_payer_name, v_payer_phone,
           v_amount, v_paid_at, v_momo_ref, v_pop_url
      FROM applications;

    v_total := v_payment_method + v_payer_name + v_payer_phone
             + v_amount + v_paid_at + v_momo_ref + v_pop_url;

    IF v_total > 0 THEN
        RAISE EXCEPTION
            'GATE 2 (legacy rows): % non-null legacy value(s) remain — '
            'payment_method=%, payer_name=%, payer_phone=%, amount=%, paid_at=%, '
            'momo_ref=%, pop_url=%. Dropping now destroys data with no rollback. '
            'Backfill or quarantine them into the payments ledger first '
            '(see docs/v2-evidence/12.3/README.md section 3.2). Nothing was changed.',
            v_total, v_payment_method, v_payer_name, v_payer_phone,
            v_amount, v_paid_at, v_momo_ref, v_pop_url;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guard 3 — no legacy row is the only record of a payment (R15.9, DATA-11)
-- ---------------------------------------------------------------------------
-- Guard 2 subsumes this arithmetically, but the two say different things and a
-- future edit could relax one without meaning to relax the other. This is the
-- one that names the harm: an applications row carrying a money fact with no
-- canonical payments row behind it.
DO $$
DECLARE
    v_unbacked int;
BEGIN
    SELECT count(*) INTO v_unbacked
      FROM applications a
     WHERE (a.amount IS NOT NULL OR a.paid_at IS NOT NULL OR a.momo_ref IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.application_id = a.id);

    IF v_unbacked > 0 THEN
        RAISE EXCEPTION
            'GATE 3 (unbacked money rows): % application(s) carry a money fact '
            '(amount / paid_at / momo_ref) with NO canonical payments row. Those '
            'columns are the only surviving record of those payments. Nothing was changed.',
            v_unbacked;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guard 4 — canonical / snapshot consistency (R15.3, R15.6)
-- ---------------------------------------------------------------------------
-- Two failures, deliberately distinguished:
--   a mismatch  = a display snapshot disagreeing with its canonical record;
--   an empty domain = rows with no canonical id at all, where a zero mismatch
--                     count is vacuous and the legacy string is still the only
--                     identity record. On 2026-08-11 it was the second.
DO $$
DECLARE
    v_missing_ids int;
    v_mismatch    int;
BEGIN
    SELECT
        count(*) FILTER (WHERE a.institution_id IS NULL
                            OR a.program_id     IS NULL
                            OR a.intake_id      IS NULL),
        count(*) FILTER (WHERE (i.id  IS NOT NULL AND a.institution IS DISTINCT FROM i.name)
                            OR (cp.id IS NOT NULL AND a.program     IS DISTINCT FROM cp.name)
                            OR (ik.id IS NOT NULL AND a.intake      IS DISTINCT FROM ik.name))
      INTO v_missing_ids, v_mismatch
      FROM applications a
      LEFT JOIN institutions       i  ON i.id  = a.institution_id
      LEFT JOIN canonical_programs cp ON cp.id = a.program_id
      LEFT JOIN intakes            ik ON ik.id = a.intake_id;

    IF v_missing_ids > 0 THEN
        RAISE EXCEPTION
            'GATE 4a (empty comparison domain): % application(s) have no canonical '
            'institution/program/intake id, so the snapshot-consistency check cannot '
            'pass — it can only fail to find anything to compare. Run the canonical '
            'assignment backfill (task 3.2) on this database first. Nothing was changed.',
            v_missing_ids;
    END IF;

    IF v_mismatch > 0 THEN
        RAISE EXCEPTION
            'GATE 4b (snapshot mismatch): % application(s) have a display snapshot '
            'that disagrees with its canonical record. Nothing was changed.', v_mismatch;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guard 5 — payment projection agrees with the ledger (ADR-001, R15.9)
-- ---------------------------------------------------------------------------
-- applications.payment_status is not dropped by this script, but R15.9 gates the
-- contraction on it: a derived column that disagrees with the ledger means the
-- projection this contraction relies on is not yet trustworthy.
-- The CASE is APP_PAYMENT_STATUS_PRECEDENCE (payment_constants.py), in order.
DO $$
DECLARE
    v_mismatch int;
BEGIN
    WITH projected AS (
        SELECT
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
        GROUP BY a.id, a.payment_status
    )
    SELECT count(*) INTO v_mismatch
      FROM projected
     WHERE derived IS NOT NULL
       AND coalesce(stored, '<null>') <> derived;

    IF v_mismatch > 0 THEN
        RAISE EXCEPTION
            'GATE 5 (payment projection): % application(s) have a payment_status that '
            'disagrees with the derived ledger projection. Nothing was changed.', v_mismatch;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guard 6 — the two published columns are still mapped, and stay
-- ---------------------------------------------------------------------------
-- Belt and braces against a future edit widening this script's scope. These two
-- columns are a registered Legacy_Exception with an announced end date; they are
-- not this script's business, and if someone adds them here this guard says so.
DO $$
DECLARE
    v_present int;
BEGIN
    SELECT count(*) INTO v_present
      FROM information_schema.columns
     WHERE table_name = 'applications'
       AND column_name IN ('payment_verified_at', 'payment_verified_by');

    IF v_present <> 2 THEN
        RAISE EXCEPTION
            'GATE 6 (registered exception): expected applications.payment_verified_at and '
            'payment_verified_by to both still exist (they are a registered '
            'Legacy_Exception with an announced end date, and Application still declares '
            'them as model fields); found % of 2. Nothing was changed.', v_present;
    END IF;
END $$;

-- ===========================================================================
-- CONTRACT — the 7 pre-Lenco payment columns
--
-- All seven are absent from backend/apps/applications/models.py (see the
-- "Legacy unmapped columns (AUDIT-1.3-003)" docstring), so Django never names
-- them in a SELECT or INSERT and no ORM query changes shape when they go.
-- The identically-named serializer fields (payment_method / paid_at /
-- paid_amount) are SerializerMethodFields sourced from the payments ledger
-- (ApplicationPaymentSummaryMixin), not from these columns — which is why the
-- generated OpenAPI contract does not move.
-- ===========================================================================

ALTER TABLE applications DROP COLUMN IF EXISTS payment_method;
-- was: free-text pre-Lenco method            now: payments.payment_method

ALTER TABLE applications DROP COLUMN IF EXISTS payer_name;
-- was: payer's name (PII on the wrong table) now: payments.metadata (redacted)

ALTER TABLE applications DROP COLUMN IF EXISTS payer_phone;
-- was: raw phone (PII policy violation)      now: payments.phone_hash / phone_last4

ALTER TABLE applications DROP COLUMN IF EXISTS amount;
-- was: paid amount                           now: payments.amount

ALTER TABLE applications DROP COLUMN IF EXISTS paid_at;
-- was: payment timestamp                     now: payments.verified_at

ALTER TABLE applications DROP COLUMN IF EXISTS momo_ref;
-- was: mobile-money reference                now: payments.transaction_reference

ALTER TABLE applications DROP COLUMN IF EXISTS pop_url;
-- was: proof-of-payment upload URL           now: removed (Lenco is the record)

-- ---------------------------------------------------------------------------
-- Post-contract assertion — inside the same transaction, so a partial
-- contraction rolls back rather than being discovered afterwards.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_remaining int;
BEGIN
    SELECT count(*) INTO v_remaining
      FROM information_schema.columns
     WHERE table_name = 'applications'
       AND column_name IN ('payment_method', 'payer_name', 'payer_phone',
                           'amount', 'paid_at', 'momo_ref', 'pop_url');

    IF v_remaining <> 0 THEN
        RAISE EXCEPTION
            'POST-CHECK: % of the 7 contracted columns still present after the '
            'ALTERs. Rolling back.', v_remaining;
    END IF;
END $$;

INSERT INTO migration_history (migration_name, notes)
VALUES (
    'legacy_columns_contract_2026_08_15.sql',
    'admissions-v2 task 12.3 — contracted 7 ORM-unmapped pre-Lenco payment '
    'columns from applications after the R15.6 gates measured zero. '
    'applications.payment_verified_at/payment_verified_by and error_logs are '
    'registered Legacy_Exceptions and were NOT contracted. Rollback: '
    'legacy_columns_contract_2026_08_15_rollback.sql (structural only — column '
    'values are not recoverable).'
)
ON CONFLICT DO NOTHING;

COMMIT;
