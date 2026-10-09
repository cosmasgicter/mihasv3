-- Admissions V2 — task 3.5 (reconcile canonical payments + document versions),
-- EXPAND phase.
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 3.5
-- Requirements: R11.7-R11.8, R15.5-R15.6, R15.9
-- Findings:     DATA-11 (payment truth split across deprecated application
--               columns + nullable Payment.application, allowing orphans),
--               STU-19 (document storage/DB not compensated; no current/superseded
--               enforcement; "Replace" may only touch local UI state)
-- Design:       §9.3 (immutable document versions + one-current partial unique
--               index), §10.2 (Payment.application validated non-null FK after
--               orphan remediation; application payment fields become a read
--               projection), §15.2 step (2) "add columns/constraints as nullable /
--               NOT VALID where online-safe", §19 "exception ledger" control.
--
-- Sequence (design §15.2): EXPAND is additive + idempotent and performs NO data
-- mutation. The backfill (step 4) and validate/switch (step 6) land in the sibling
-- 02_/03_ scripts. The deprecated application payment columns (payment_method,
-- payer_name, payer_phone, amount, paid_at, momo_ref, pop_url, payment_verified_at,
-- payment_verified_by) are DELIBERATELY LEFT INTACT — they are output-only
-- snapshots preserved through the observation window (R15.6/R15.9). Contraction is
-- owned by task 12.3 only after the payment-projection mismatch + use telemetry are
-- zero. This task NEVER drops or rewrites a historical payment value.
--
-- Online-safety: ADD COLUMN with a constant default is metadata-only on PG 11+;
-- ADD CONSTRAINT ... NOT VALID takes a brief lock and does not scan the table;
-- CREATE TABLE / CREATE INDEX on the empty exception ledger is instant. Every
-- statement is idempotent (IF NOT EXISTS / pg_constraint guards) so a re-run after
-- a tracking-table wipe — or on a Django-built database where the mapped columns
-- already exist — converges to a no-op. Additive-only-lint clean.

-- ===========================================================================
-- PART A — PAYMENTS: make the application relationship mandatory for canonical
--          rows (R15.9), preserving any orphan value via an exception ledger.
-- ===========================================================================

-- A1. Quarantine flag. Mirrors task 3.2's applications.assignment_quarantined:
--     it lets the mandatory-application invariant be a plain CHECK (a subquery is
--     illegal in a CHECK). A canonical Payment must carry application_id UNLESS it
--     is an explicitly quarantined legacy orphan whose value we are preserving.
--     Constant default => metadata-only on PG 11+.
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS application_quarantined boolean NOT NULL DEFAULT false;

-- A2. Orphan-payment exception ledger (Legacy_Exception ledger, design §19). An
--     orphan payment (application_id IS NULL that cannot be deterministically
--     recovered) is copied here — value preserved — and flagged in place rather
--     than deleted (task instruction: "prefer quarantine over deletion";
--     "preserve old evidence and payment values during observation").
CREATE TABLE IF NOT EXISTS payment_orphan_exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL,
    application_id uuid NULL,
    reason_code varchar(64) NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    owner varchar(120) NOT NULL DEFAULT 'admissions-data-remediation',
    removal_path text NOT NULL,
    resolved boolean NOT NULL DEFAULT false,
    resolved_at timestamp with time zone NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- One ledger row per (payment, reason). The backfill upserts via ON CONFLICT
-- DO NOTHING; resolution flips ``resolved`` in place rather than inserting a dup.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_orphan_exception_payment_reason
    ON payment_orphan_exceptions (payment_id, reason_code);
CREATE INDEX IF NOT EXISTS idx_payment_orphan_exception_open
    ON payment_orphan_exceptions (reason_code)
    WHERE resolved = false;

-- FK ledger.payment_id -> payments.id. The table starts empty so a validated FK
-- is instant here (no NOT VALID needed). Guarded so a re-run does not error.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_orphan_exceptions_payment_id_fk'
    ) THEN
        ALTER TABLE payment_orphan_exceptions
            ADD CONSTRAINT payment_orphan_exceptions_payment_id_fk
            FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE;
    END IF;
END $$;

-- A3. Mandatory-application invariant, added NOT VALID (existing rows not scanned
--     now; the 03_ validate script runs VALIDATE CONSTRAINT after the backfill has
--     recovered-or-quarantined every orphan). A NOT VALID CHECK STILL enforces
--     every INSERT/UPDATE immediately, so no new orphan can be created from now on.
--     Canonical rows must have application_id; quarantined legacy orphans are exempt.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_application_id_not_null'
    ) THEN
        ALTER TABLE payments
            ADD CONSTRAINT payments_application_id_not_null
            CHECK (application_id IS NOT NULL OR application_quarantined = true)
            NOT VALID;
    END IF;
END $$;

-- ===========================================================================
-- PART B — APPLICATION DOCUMENTS: immutable version + provenance fields and the
--          one-current partial unique constraint (R11.7-R11.8, design §9.3).
-- ===========================================================================

-- B1. Immutable version + provenance columns. All additive; constant/nullable
--     defaults => metadata-only on PG 11+.
--       version        - monotonically increasing version within (application,
--                        document_type); the backfill assigns it deterministically.
--       is_current     - exactly one TRUE per (application, document_type) after
--                        backfill; the one-current partial unique index enforces it.
--       supersedes_id  - provenance chain: the row this version replaced.
--       superseded_at  - when this (non-current) version was superseded.
--       content_hash   - integrity checksum (R11.7); NULL for legacy rows whose
--                        bytes are not re-hashable here — new uploads populate it.
--       uploaded_by    - owner/provenance (R11.7); the applicant for student
--                        uploads, NULL for system-generated artifacts.
--       provenance     - structured origin: student_upload / system_generated /
--                        admin_upload / ocr_import.
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS supersedes_id uuid NULL;
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS superseded_at timestamp with time zone NULL;
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS content_hash varchar(128) NULL;
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS uploaded_by uuid NULL;
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS provenance varchar(32) NULL;

-- B2. Provenance FKs, added NOT VALID (new columns are all NULL so validation is
--     trivial; the 03_ script validates them online for consistency). Guarded by
--     COLUMN so a Django-built database that already carries an ORM-named FK on the
--     column is a no-op (no duplicate FK), while a raw-SQL / production database
--     where the column is brand-new gets exactly one FK.
DO $$
DECLARE
    supersedes_attnum smallint;
    uploaded_by_attnum smallint;
BEGIN
    SELECT attnum INTO supersedes_attnum FROM pg_attribute
        WHERE attrelid = 'application_documents'::regclass AND attname = 'supersedes_id';
    SELECT attnum INTO uploaded_by_attnum FROM pg_attribute
        WHERE attrelid = 'application_documents'::regclass AND attname = 'uploaded_by';

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'application_documents'::regclass AND contype = 'f'
          AND conkey = ARRAY[supersedes_attnum]::smallint[]
    ) THEN
        ALTER TABLE application_documents
            ADD CONSTRAINT application_documents_supersedes_id_fk
            FOREIGN KEY (supersedes_id) REFERENCES application_documents(id) ON DELETE SET NULL
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'application_documents'::regclass AND contype = 'f'
          AND conkey = ARRAY[uploaded_by_attnum]::smallint[]
    ) THEN
        ALTER TABLE application_documents
            ADD CONSTRAINT application_documents_uploaded_by_fk
            FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL
            NOT VALID;
    END IF;
END $$;

-- B3. Version integrity CHECK (>= 1), added NOT VALID; validated in 03_ after the
--     backfill assigns positive versions. Design §15.5 "document invariants".
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_application_documents_version_positive'
    ) THEN
        ALTER TABLE application_documents
            ADD CONSTRAINT chk_application_documents_version_positive
            CHECK (version >= 1)
            NOT VALID;
    END IF;
END $$;
