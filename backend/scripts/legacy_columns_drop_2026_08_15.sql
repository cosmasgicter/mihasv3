-- Legacy column drop migration.
-- Sunset date: 2026-08-15 (90 days from deprecation start 2026-05-17).
-- See: backend/apps/common/legacy_columns.py for the full registry.
-- See: docs/runbooks/legacy-column-deprecation.md for the process.
-- See: AUDIT-REPORT-2026-04-24.md SSP-001/002/003 for findings.

-- Guard: prevent accidental early execution.
DO $$ BEGIN
  IF current_date < '2026-08-15' THEN
    RAISE EXCEPTION 'Sunset date 2026-08-15 not yet reached (current: %)', current_date;
  END IF;
END $$;

BEGIN;

-- ============================================================
-- applications table: legacy payment columns
-- Reason: canonical payment data lives in the payments table.
-- ============================================================

ALTER TABLE applications DROP COLUMN IF EXISTS payment_method;
-- Was: free-text payment method. Now: payments.method

ALTER TABLE applications DROP COLUMN IF EXISTS payer_name;
-- Was: PII payer name. Now: removed (PII policy violation)

ALTER TABLE applications DROP COLUMN IF EXISTS payer_phone;
-- Was: raw phone number. Now: payments.phone_hash / phone_last4

ALTER TABLE applications DROP COLUMN IF EXISTS amount;
-- Was: payment amount. Now: payments.amount

ALTER TABLE applications DROP COLUMN IF EXISTS paid_at;
-- Was: payment timestamp. Now: payments.paid_at

ALTER TABLE applications DROP COLUMN IF EXISTS momo_ref;
-- Was: mobile money reference. Now: payments.transaction_reference

ALTER TABLE applications DROP COLUMN IF EXISTS pop_url;
-- Was: proof-of-payment upload URL. Now: removed (Lenco is source of truth)

ALTER TABLE applications DROP COLUMN IF EXISTS payment_verified_at;
-- Was: verification timestamp. Now: payments.verified_at

ALTER TABLE applications DROP COLUMN IF EXISTS payment_verified_by;
-- Was: verifier user reference. Now: payments.verified_by_id / audit_logs

-- ============================================================
-- profiles table: legacy auth columns
-- Reason: auth rate-limiting uses DRF throttles + Redis JTI.
-- ============================================================

ALTER TABLE profiles DROP COLUMN IF EXISTS refresh_token_hash;
-- Was: stored refresh token hash. Now: Redis JTI blacklisting

ALTER TABLE profiles DROP COLUMN IF EXISTS failed_login_attempts;
-- Was: login attempt counter. Now: DRF throttle classes

ALTER TABLE profiles DROP COLUMN IF EXISTS locked_until;
-- Was: account lock timestamp. Now: DRF throttle classes

-- ============================================================
-- error_logs table: entire table deprecated
-- Reason: replaced by GlitchTip (Sentry-compatible) error monitoring.
-- The table is preserved but no longer written to. Drop after sunset.
-- ============================================================

DROP TABLE IF EXISTS error_logs;

COMMIT;
