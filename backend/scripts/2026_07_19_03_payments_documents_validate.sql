-- Admissions V2 — task 3.5 (reconcile canonical payments + document versions),
-- VALIDATE / SWITCH phase.
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 3.5
-- Requirements: R11.7-R11.8, R15.5-R15.6, R15.9
-- Findings:     DATA-11, STU-19
-- Design:       §15.2 step (6) "switch + enforce NOT NULL / validated online";
--               §9.3 (one-current partial unique index); §10.2 (validated non-null
--               FK; ON DELETE reconciliation); §19 "NOT VALID then validate,
--               bounded locks".
--
-- Runs AFTER 01_ expand + 02_ backfill: every orphan payment is now recovered or
-- flagged quarantined, and every (application, document_type) group has exactly one
-- is_current row, so the constraints below validate/build without error.
--
-- VALIDATE CONSTRAINT takes only SHARE UPDATE EXCLUSIVE (reads + writes continue)
-- and is transaction-safe. The one-current index is a plain (non-CONCURRENT) unique
-- index: the tables are small (production application_documents ~ hundreds of rows,
-- restored from the Neon authoring branch), so the brief SHARE lock is immaterial;
-- a future large-table apply would switch to CREATE UNIQUE INDEX CONCURRENTLY. Every
-- block is guarded + idempotent (a validated constraint stays valid; the index uses
-- IF NOT EXISTS; a Django-built DB where the FK is already CASCADE / already
-- validated is a clean no-op). Additive-only-lint clean (DROP CONSTRAINT to swap the
-- FK ON DELETE action is not a DROP COLUMN/TABLE/TRUNCATE, and the constraint is
-- re-created in the same statement pair).

-- ===========================================================================
-- PART A — APPLICATION DOCUMENTS: enforce one current version + validate.
-- ===========================================================================

-- A1. One current document version per (application, document_type) (R11.8,
--     design §9.3). Partial unique on is_current: superseded history rows are
--     unconstrained, exactly one current row is allowed. Built after the backfill
--     guarantees a single is_current per group.
CREATE UNIQUE INDEX IF NOT EXISTS uq_application_documents_one_current
    ON application_documents (application_id, document_type)
    WHERE is_current;

-- A2. Validate the version-positive CHECK (now every row has version >= 1).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_application_documents_version_positive'
          AND convalidated = false
    ) THEN
        ALTER TABLE application_documents VALIDATE CONSTRAINT chk_application_documents_version_positive;
    END IF;
END $$;

-- A3. Validate the provenance FKs if this task added them NOT VALID (raw-SQL /
--     production path). On a Django-built DB the ORM-named FK is already validated
--     and these named constraints are absent, so this is a no-op.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'application_documents'::regclass
          AND contype = 'f'
          AND convalidated = false
          AND conname IN (
              'application_documents_supersedes_id_fk',
              'application_documents_uploaded_by_fk'
          )
    LOOP
        EXECUTE format('ALTER TABLE application_documents VALIDATE CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

-- ===========================================================================
-- PART B — PAYMENTS: reconcile the FK ON DELETE action + validate the
--          mandatory-application invariant (R15.9).
-- ===========================================================================

-- B1. Reconcile payments.application_id FK: ON DELETE SET NULL -> ON DELETE CASCADE.
--     documents/models.py declares on_delete=models.CASCADE and the Django ORM
--     already cascades in Python; the DB SET NULL was the drift AND the raw-SQL
--     orphan-creation vector DATA-11 flags (a parent delete would SET NULL, and
--     under the new mandatory-application invariant that would raise instead of
--     silently orphaning). Guarded: only fires while the FK still declares SET NULL,
--     so a re-run — or a Django-built DB already on CASCADE — is a no-op.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payments_application_id_fkey'
          AND conrelid = 'payments'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%ON DELETE SET NULL%'
    ) THEN
        ALTER TABLE payments DROP CONSTRAINT payments_application_id_fkey;
        ALTER TABLE payments
            ADD CONSTRAINT payments_application_id_fkey
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
    END IF;
END $$;

-- B2. Validate the mandatory-application CHECK. Fails closed (aborts the migration)
--     if any non-quarantined row still has a NULL application_id — exactly the
--     R15.3 gate. After this, canonical Payment rows have a guaranteed application
--     relationship and application.payment_status is a pure read projection of the
--     canonical Payment ledger (ADR-001).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payments_application_id_not_null'
          AND convalidated = false
    ) THEN
        ALTER TABLE payments VALIDATE CONSTRAINT payments_application_id_not_null;
    END IF;
END $$;
