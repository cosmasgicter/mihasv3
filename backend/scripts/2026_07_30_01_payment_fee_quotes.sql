-- Admissions V2 — task 8.1 (expiring server-authored fee quotes).
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 8.1
-- Requirements: R12.1 (BEFORE payment the backend creates an EXPIRING fee quote
--               using canonical offering, intake, residency, fee type, currency,
--               provider fee policy, and configuration version; the frontend
--               performs NO amount arithmetic), R12.2 (no unique active fee ->
--               FEE_NOT_CONFIGURED, never a hardcoded substitute), R12.6 (the UI
--               displays server amounts, quote expiry, provider state, recovery
--               action, and receipt status without hardcoded fees).
-- Findings:     STU-08 — "Payment UI hardcodes a 1 percent transaction fee and an
--               empty-state K150/USD20 fee"; DATA-05 — "Fee lookup uses display
--               names/codes and an invented default."
-- Design:       §10.1 Fee Quote — "``CreateFeeQuote`` accepts the application ID.
--               It loads the immutable assignment, residency, active fee policy,
--               and provider-fee bearer, then stores and returns:
--               ``quote_id, application_id, configuration_version, base_amount,
--               provider_fee, total_amount, currency, residency, expires_at,
--               signature/status``. The frontend displays these values and never
--               computes a percent or fallback."
--
-- Relationship to task 5.4
-- ------------------------
-- 5.4 made the *resolution* canonical (``FeeResolver`` -> one active
-- ``program_fees`` row per offering/fee_type/residency, fail closed with
-- FEE_NOT_CONFIGURED / FEE_AMBIGUOUS). It shipped no schema. 8.1 adds the missing
-- half: a durable, signed, expiring QUOTE record so the amount a student is shown
-- is the same amount the server later accepts, and so a stale or tampered quote
-- cannot fund a payment. It does not fork 5.4 — every quote row is produced by
-- ``FeeResolver.resolve_for_offering`` through ``FeeQuoteService``.
--
-- Online-safety: one brand-new (empty) table plus its constraints/indexes, so
-- every statement is instant and takes no lock on an existing table. Additive-only
-- lint clean: no DROP COLUMN / DROP TABLE / TRUNCATE / DELETE FROM / narrowing
-- ALTER. Fully idempotent (CREATE ... IF NOT EXISTS + pg_constraint guards), so a
-- re-run after a migration_history wipe converges.
-- ===========================================================================
-- PAYMENT_FEE_QUOTES — the server-authored money contract for one payment attempt
-- ===========================================================================
-- Why a table and not a signed cookie/JWT handed to the client: expiry and
-- single-use redemption have to be *observable and enforceable server-side*
-- (R12.1/R12.5). A row lets redemption take a row lock, flip status to
-- ``redeemed``, and bind the funding ``payment_id`` in the same transaction that
-- creates the Payment — which is what makes "an already-redeemed quote cannot
-- fund a second payment" a database fact rather than a hope. The signature is
-- belt-and-braces on top: it detects a tampered/forged row even if something
-- wrote to the table out of band.
CREATE TABLE IF NOT EXISTS payment_fee_quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL,
    -- Canonical offering the fee was resolved from (task 5.2 assignment binding).
    -- NOT the display string — a same-name offering in another tenant can never
    -- satisfy this quote (R7.7).
    program_offering_id uuid NULL,
    -- The exact FeeSchedule row that produced base_amount. Kept so an auditor can
    -- reconstruct the quote, and so redemption can tell "the fee row changed"
    -- apart from "a different fee row now applies".
    fee_schedule_id uuid NULL,
    fee_type varchar(20) NOT NULL DEFAULT 'application',
    -- Server-derived from the application's nationality/country. Never client-sent.
    residency_category varchar(20) NOT NULL,
    -- The application's canonical configuration version (task 5.2). Null on legacy
    -- rows that predate the assignment snapshot.
    configuration_version varchar(64) NULL,
    -- Deterministic fingerprint of every input that decided the money:
    -- offering + fee row + amount + currency + residency + fee type + provider-fee
    -- policy + waiver + application configuration_version. Recomputed at
    -- redemption; a mismatch is QUOTE_CONFIGURATION_CHANGED, so a quote is bound
    -- to the fee configuration it was minted from (R12.1).
    fee_configuration_version varchar(64) NOT NULL,
    -- Money. base_amount is the canonical application fee AFTER any waiver;
    -- provider_fee is the customer-borne provider charge derived from the SERVER's
    -- provider-fee policy (this is the 1% the frontend used to invent — STU-08);
    -- total_amount is what the student is told they will be charged.
    base_amount numeric(10, 2) NOT NULL,
    provider_fee numeric(10, 2) NOT NULL DEFAULT 0,
    total_amount numeric(10, 2) NOT NULL,
    currency varchar(3) NOT NULL,
    -- Who bears the provider fee: 'customer' (added to the charge) or 'merchant'
    -- (absorbed by the institution, so provider_fee is 0 on the customer total).
    bearer varchar(20) NOT NULL DEFAULT 'customer',
    -- Snapshot of the provider-fee policy + fee source that produced the numbers
    -- above (percent/fixed/cap/source). Audit evidence, never an input.
    policy jsonb NOT NULL DEFAULT '{}'::jsonb,
    waiver_applied boolean NOT NULL DEFAULT false,
    -- Lifecycle. active -> redeemed | expired | superseded | cancelled.
    -- ``expired`` is a *materialised* terminal state written by the sweeper /
    -- next quote request; expiry itself is decided by ``expires_at`` so a quote is
    -- never treated as live merely because no sweeper has run yet.
    status varchar(20) NOT NULL DEFAULT 'active',
    expires_at timestamp with time zone NOT NULL,
    -- HMAC-SHA256 (hex) over the canonical quote payload. Verified before
    -- redemption; a mismatch is QUOTE_INVALID and funds nothing.
    signature varchar(128) NOT NULL,
    -- Signing-key generation, so the key can be rotated without invalidating the
    -- audit value of historical rows.
    signature_version integer NOT NULL DEFAULT 1,
    -- Redemption binding: the Payment this quote funded. Exactly one payment per
    -- quote and one quote per payment (partial unique index below).
    payment_id uuid NULL,
    redeemed_at timestamp with time zone NULL,
    issued_to uuid NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_fee_quotes_status'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT chk_payment_fee_quotes_status
            CHECK (status IN ('active', 'redeemed', 'expired', 'superseded', 'cancelled'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_fee_quotes_bearer'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT chk_payment_fee_quotes_bearer
            CHECK (bearer IN ('customer', 'merchant'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_fee_quotes_residency'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT chk_payment_fee_quotes_residency
            CHECK (residency_category IN ('local', 'international'));
    END IF;
    -- Money integrity. Amounts are never negative, and the total is exactly the
    -- base plus the customer-borne provider fee — so no caller (including a
    -- future one) can persist a total that does not add up. This is the DB half
    -- of "the server is the sole amount authority" (R12.1).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_fee_quotes_amounts_nonneg'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT chk_payment_fee_quotes_amounts_nonneg
            CHECK (base_amount >= 0 AND provider_fee >= 0 AND total_amount >= 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_fee_quotes_total_is_sum'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT chk_payment_fee_quotes_total_is_sum
            CHECK (total_amount = base_amount + provider_fee);
    END IF;
    -- A merchant-borne provider fee is never charged to the customer, so it must
    -- not inflate the total.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_fee_quotes_merchant_bearer_zero_fee'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT chk_payment_fee_quotes_merchant_bearer_zero_fee
            CHECK (bearer <> 'merchant' OR provider_fee = 0);
    END IF;
    -- Redemption binding. Only a redeemed quote may name a payment or carry a
    -- redemption timestamp, and a redeemed quote must be timestamped — so
    -- ``redeemed`` can never be a bare label, and an unredeemed quote can never
    -- claim a payment.
    --
    -- Note the asymmetry: a redeemed quote is NOT required to still name a live
    -- payment_id. ``payment_fee_quotes_payment_id_fk`` is ON DELETE SET NULL, so
    -- if the funded Payment row is ever removed the FK nulls this column by
    -- design; requiring payment_id NOT NULL here would contradict that FK and
    -- make deleting any funded Payment impossible. Keeping the quote row (with
    -- its status, amounts, signature, and redeemed_at intact) is the point: it is
    -- the audit evidence of what the student was asked to pay. Single-use is
    -- enforced by ``status``, not by payment_id — FeeQuoteService.redeem() refuses
    -- every non-``active`` status — so a nulled payment_id can never make a spent
    -- quote redeemable again.
    --
    -- Self-healing: if an earlier rehearsal of this script installed the stricter
    -- (self-contradictory) definition, replace it. Constraint-level only; no data
    -- is touched.
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_payment_fee_quotes_redeemed_binding'
          AND pg_get_constraintdef(oid) LIKE '%payment_id IS NOT NULL%'
    ) THEN
        ALTER TABLE payment_fee_quotes
            DROP CONSTRAINT chk_payment_fee_quotes_redeemed_binding;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_fee_quotes_redeemed_binding'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT chk_payment_fee_quotes_redeemed_binding
            CHECK (
                (status = 'redeemed' AND redeemed_at IS NOT NULL)
                OR (status <> 'redeemed' AND payment_id IS NULL AND redeemed_at IS NULL)
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_fee_quotes_signature_present'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT chk_payment_fee_quotes_signature_present
            CHECK (length(signature) >= 32);
    END IF;
END $$;
-- FKs. The table starts empty, so validated FKs are instant here.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_fee_quotes_application_id_fk'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT payment_fee_quotes_application_id_fk
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_fee_quotes_program_offering_id_fk'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT payment_fee_quotes_program_offering_id_fk
            FOREIGN KEY (program_offering_id) REFERENCES programs(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_fee_quotes_fee_schedule_id_fk'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT payment_fee_quotes_fee_schedule_id_fk
            FOREIGN KEY (fee_schedule_id) REFERENCES program_fees(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_fee_quotes_payment_id_fk'
    ) THEN
        ALTER TABLE payment_fee_quotes
            ADD CONSTRAINT payment_fee_quotes_payment_id_fk
            FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;
    END IF;
END $$;
-- At most ONE live quote per (application, fee_type). A new quote request
-- supersedes the previous row in the same transaction, so this index is what
-- stops two contradictory live prices existing for one application.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_fee_quotes_one_active
    ON payment_fee_quotes (application_id, fee_type)
    WHERE status = 'active';
-- One quote funds at most one payment, and one payment is funded by at most one
-- quote — the database half of "an already-redeemed quote cannot fund a payment".
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_fee_quotes_payment
    ON payment_fee_quotes (payment_id)
    WHERE payment_id IS NOT NULL;
-- Student/operator history read: newest quote first for one application.
CREATE INDEX IF NOT EXISTS idx_payment_fee_quotes_application
    ON payment_fee_quotes (application_id, created_at DESC);
-- Expiry sweeper: the live rows whose clock has run out, oldest first.
CREATE INDEX IF NOT EXISTS idx_payment_fee_quotes_expiring
    ON payment_fee_quotes (expires_at)
    WHERE status = 'active';
