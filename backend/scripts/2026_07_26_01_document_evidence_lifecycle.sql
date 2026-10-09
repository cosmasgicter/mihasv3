-- Admissions V2 — task 7.3 (immutable document versions + storage compensation).
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 7.3
-- Requirements: R11.7 (document uploads are immutable evidence versions carrying
--               checksum, owner, type, scan/extraction status, verification actor,
--               and STRUCTURED notes — extracted analysis is not overloaded into
--               human verification notes), R11.8 (the DATABASE enforces one
--               current version per application+requirement; replace/delete
--               update metadata atomically with object-storage compensation and
--               preserve prior evidence history), R17.1 (every multi-step command
--               defines transaction boundaries, idempotency, retry, timeout,
--               compensation, and a stable operator-visible event), R17.4
--               (durable reconciliation for the storage provider).
-- Findings:     STU-19 — "Document storage and database updates are not
--               compensated atomically, current/superseded versions are not
--               enforced, and 'Replace' may clear only local UI state."
-- Design:       §9.3 (lifecycle `uploaded -> scanning -> ready_for_review ->
--               verified`, `-> rejected -> replacement uploaded`,
--               `uploaded/scanning -> processing_failed -> retry`; "a partial
--               unique index enforces one current document per application and
--               requirement"; "object upload and metadata use a staged object key
--               plus committed metadata; on failure, compensation deletes the
--               staged object or a sweeper reconciles it"), §15.2 step (2)/(4)/(6),
--               §17 ("queued means a committed durable record exists"; operational
--               queues expose age and terminal-failure counts for document
--               processing).
--
-- Relationship to task 3.5
-- ------------------------
-- Task 3.5 (`2026_07_19_0{1,2,3}_payments_documents_*.sql`) already adds the
-- version/provenance COLUMNS (version, is_current, supersedes_id, superseded_at,
-- content_hash, uploaded_by, provenance), the version-positive CHECK, and the
-- one-current partial unique index `uq_application_documents_one_current`. This
-- script does NOT re-add any of them and does not depend on them existing: it
-- sorts after 3.5 in `apply_sql_migrations` filename order, and every statement
-- here is independently guarded. 7.3 adds only what the runtime commands need on
-- top of that: the canonical lifecycle column, the durable object key, the
-- extraction state that stops OCR clobbering a human verification decision, the
-- staged-write ledger, and the append-only verification history.
--
-- Online-safety: ADD COLUMN with a constant/NULL default is metadata-only on
-- PG 11+; CREATE TABLE / CREATE INDEX on the two brand-new (empty) tables is
-- instant; the two backfill UPDATEs are bounded by a `WHERE ... IS NULL` guard so
-- a re-run touches zero rows. The lifecycle/extraction CHECKs are added NOT VALID
-- and validated at the end of the same script, after the backfill — a NOT VALID
-- CHECK still enforces every INSERT/UPDATE immediately. Additive-only-lint clean:
-- no DROP COLUMN / DROP TABLE / TRUNCATE / DELETE FROM / narrowing ALTER.
-- ===========================================================================
-- PART A — APPLICATION_DOCUMENTS: canonical lifecycle, durable object key, and
--          extraction state (R11.7, design §9.3).
-- ===========================================================================
-- A1. Canonical lifecycle state. Deliberately SEPARATE from the legacy
--     ``verification_status`` column, which conflates three different questions
--     (has a human verified it? is OCR running? was the row soft-deleted?) and is
--     read by many existing surfaces. ``verification_status`` stays as the legacy
--     projection every current reader keeps using; ``lifecycle_state`` is the
--     canonical design §9.3 state the 7.3 commands transition. Nullable, because a
--     legacy row's true lifecycle is *derived*, not invented — the backfill below
--     projects it deterministically and the runtime derives it for any row a
--     future path leaves NULL.
ALTER TABLE application_documents
    ADD COLUMN IF NOT EXISTS lifecycle_state varchar(32) NULL;
-- A2. Durable object key. ``file_url`` is a rendered URL whose shape has changed
--     over time (full https URL, bucket-prefixed path, or storage-relative key),
--     so compensation and the reconciliation sweeper must not have to re-derive
--     the object identity by string surgery at the moment they need it most.
--     Recorded at commit time from the value the storage backend actually
--     returned.
ALTER TABLE application_documents
    ADD COLUMN IF NOT EXISTS storage_key text NULL;
-- A3. Scan/extraction status (R11.7 "scan/extraction status"). Before 7.3 the OCR
--     task wrote ``ocr_processing`` / ``ocr_failed`` / ``ocr_skipped`` into
--     ``verification_status`` — the same column that records a human reviewer's
--     decision — so a re-extract silently erased a reviewer's ``verified``. The
--     extraction pipeline now owns this column instead.
ALTER TABLE application_documents
    ADD COLUMN IF NOT EXISTS extraction_state varchar(32) NULL;
-- A4. Deterministic lifecycle backfill (design §15.2 step 4). Bounded and
--     idempotent: only rows whose lifecycle_state IS NULL are touched, so a
--     re-run is a no-op and no historical value is rewritten. The projection is
--     lossless in the only direction that matters — a human decision
--     (verified/rejected) and a soft-delete are preserved exactly; every other
--     legacy status means "evidence is on file awaiting review".
UPDATE application_documents
SET lifecycle_state = CASE
        WHEN is_current = false THEN 'superseded'
        WHEN verification_status = 'verified' THEN 'verified'
        WHEN verification_status = 'rejected' THEN 'rejected'
        WHEN verification_status = 'deleted' THEN 'deleted'
        ELSE 'ready_for_review'
    END
WHERE lifecycle_state IS NULL;
-- A5. Extraction-state backfill for the legacy ``ocr_*`` values that are sitting
--     in ``verification_status``. Value-preserving: the ocr_* string is copied to
--     its proper home; the legacy column is deliberately LEFT AS IS so any reader
--     that still derives ``ocr_state`` from it keeps working through the
--     observation window (contraction is a later task, gated on telemetry).
UPDATE application_documents
SET extraction_state = verification_status
WHERE extraction_state IS NULL
  AND verification_status IN (
      'ocr_processing', 'ocr_complete', 'ocr_no_text',
      'ocr_no_grades', 'ocr_failed', 'ocr_skipped'
  );
-- A6. Lifecycle vocabulary CHECK (design §9.3). NOT VALID first so the statement
--     does not scan the table under lock; validated at the end of this script now
--     that A4 has given every row a legal value. A NOT VALID CHECK already
--     enforces every INSERT/UPDATE, so no illegal state can be written from now on.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_application_documents_lifecycle_state'
    ) THEN
        ALTER TABLE application_documents
            ADD CONSTRAINT chk_application_documents_lifecycle_state
            CHECK (lifecycle_state IS NULL OR lifecycle_state IN (
                'uploaded', 'scanning', 'ready_for_review', 'verified',
                'rejected', 'processing_failed', 'superseded', 'deleted'
            ))
            NOT VALID;
    END IF;
END $$;
-- A7. Extraction vocabulary CHECK. Same NOT VALID -> VALIDATE pattern.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_application_documents_extraction_state'
    ) THEN
        ALTER TABLE application_documents
            ADD CONSTRAINT chk_application_documents_extraction_state
            CHECK (extraction_state IS NULL OR extraction_state IN (
                'pending', 'ocr_processing', 'ocr_complete', 'ocr_no_text',
                'ocr_no_grades', 'ocr_failed', 'ocr_skipped'
            ))
            NOT VALID;
    END IF;
END $$;
-- A8. History read path: fetch every version of one requirement for one
--     application, newest first, without scanning the table.
CREATE INDEX IF NOT EXISTS idx_application_documents_version_chain
    ON application_documents (application_id, document_type, version DESC);
-- A9. Operator queue view (design §17 "operational queues expose age"): the
--     documents awaiting a human decision.
CREATE INDEX IF NOT EXISTS idx_application_documents_lifecycle_open
    ON application_documents (lifecycle_state, uploaded_at)
    WHERE lifecycle_state IN ('uploaded', 'scanning', 'ready_for_review', 'processing_failed');
-- ===========================================================================
-- PART B — DOCUMENT_UPLOAD_STAGES: the durable staged-write ledger that makes
--          storage compensation and reconciliation possible (R11.8, R17.1,
--          R17.4; design §9.3 "staged object key plus committed metadata").
-- ===========================================================================
-- A stage row is committed to the database BEFORE a single byte is written to
-- object storage. That ordering is the whole point: if the process dies between
-- the object write and the metadata commit, the object is still discoverable
-- (design §17 — "queued" means a committed durable record exists), so the sweeper
-- can reconcile it instead of leaving an invisible orphan paid for forever.
--
-- state machine:
--   staged               -> committed             (metadata commit succeeded)
--   staged               -> compensated           (metadata failed; object deleted)
--   staged               -> compensation_pending  (metadata failed; delete failed too)
--   staged               -> write_failed          (object write itself failed)
--   compensation_pending -> compensated           (sweeper deleted the object)
--   compensation_pending -> orphaned              (terminal; operator-visible)
-- committed / compensated / write_failed / orphaned are terminal.
CREATE TABLE IF NOT EXISTS document_upload_stages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL,
    document_type varchar(100) NOT NULL,
    -- The object key the bytes are (or were) written to. Recorded before the
    -- write so compensation never has to guess.
    object_key text NOT NULL,
    -- sha256 of the uploaded bytes: the integrity checksum promoted onto the
    -- committed version, and the idempotency identity for a retried upload.
    content_hash varchar(128) NULL,
    file_size integer NULL,
    mime_type varchar(100) NULL,
    state varchar(32) NOT NULL DEFAULT 'staged',
    -- Set when the metadata commit succeeds. NULL on every non-committed row.
    document_id uuid NULL,
    -- Command identity for a client-supplied Idempotency-Key (R17.1).
    idempotency_key text NULL,
    actor_id uuid NULL,
    attempts integer NOT NULL DEFAULT 0,
    -- Bounded operator-facing reason. Never carries document bytes, a signed
    -- URL, or applicant PII (R17.2).
    last_error varchar(500) NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    resolved_at timestamp with time zone NULL
);
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_document_upload_stages_state'
    ) THEN
        ALTER TABLE document_upload_stages
            ADD CONSTRAINT chk_document_upload_stages_state
            CHECK (state IN (
                'staged', 'committed', 'compensated',
                'compensation_pending', 'write_failed', 'orphaned'
            ));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_document_upload_stages_attempts'
    ) THEN
        ALTER TABLE document_upload_stages
            ADD CONSTRAINT chk_document_upload_stages_attempts
            CHECK (attempts >= 0);
    END IF;
END $$;
-- FKs. Both tables start empty so validated FKs are instant here.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'document_upload_stages_application_id_fk'
    ) THEN
        ALTER TABLE document_upload_stages
            ADD CONSTRAINT document_upload_stages_application_id_fk
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'document_upload_stages_document_id_fk'
    ) THEN
        ALTER TABLE document_upload_stages
            ADD CONSTRAINT document_upload_stages_document_id_fk
            FOREIGN KEY (document_id) REFERENCES application_documents(id) ON DELETE SET NULL;
    END IF;
END $$;
-- The sweeper's own query: unresolved stages, oldest first.
CREATE INDEX IF NOT EXISTS idx_document_upload_stages_unresolved
    ON document_upload_stages (created_at)
    WHERE state IN ('staged', 'compensation_pending');
-- Operator queue: terminal failures that need a human (design §17).
CREATE INDEX IF NOT EXISTS idx_document_upload_stages_orphaned
    ON document_upload_stages (updated_at)
    WHERE state = 'orphaned';
-- One object key is staged exactly once (a retried command re-uses its own row
-- rather than staging a second write to the same key).
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_upload_stages_object_key
    ON document_upload_stages (object_key);
-- Replay protection for a client-supplied Idempotency-Key, scoped per
-- application+type so two different requirements can share a key without
-- colliding (R17.1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_upload_stages_idempotency
    ON document_upload_stages (application_id, document_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
-- ===========================================================================
-- PART C — DOCUMENT_VERIFICATION_EVENTS: append-only lifecycle + verification
--          history (R11.7 "verification actor and STRUCTURED notes", R11.8
--          "preserve prior evidence history").
-- ===========================================================================
-- Why a separate table rather than more columns on application_documents:
-- ``verification_notes`` is a single free-text column that the OCR pipeline and
-- human reviewers were both writing to, so the last writer won and the previous
-- decision's reason was gone. History is append-only here — one row per
-- transition, with the actor, the structured reason, and the from/to states — so
-- a superseded version keeps its full verification story (R11.8) and a
-- reviewer's words are never overwritten by a machine's.
CREATE TABLE IF NOT EXISTS document_verification_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL,
    application_id uuid NOT NULL,
    -- Design §9.3 transition being recorded, e.g. uploaded -> ready_for_review.
    from_state varchar(32) NULL,
    to_state varchar(32) NOT NULL,
    -- Stable operator-visible event name (R17.1), e.g. document.version.committed.
    event_type varchar(64) NOT NULL,
    actor_id uuid NULL,
    actor_role varchar(32) NULL,
    -- Structured reason/notes (R11.7). Human review notes live under
    -- ``notes``; machine output lives under its own key. Never the document
    -- body, a signed URL, or unnecessary PII (R17.2).
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    document_version integer NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'document_verification_events_document_id_fk'
    ) THEN
        ALTER TABLE document_verification_events
            ADD CONSTRAINT document_verification_events_document_id_fk
            FOREIGN KEY (document_id) REFERENCES application_documents(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'document_verification_events_application_id_fk'
    ) THEN
        ALTER TABLE document_verification_events
            ADD CONSTRAINT document_verification_events_application_id_fk
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_document_verification_events_document
    ON document_verification_events (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_verification_events_application
    ON document_verification_events (application_id, created_at DESC);
-- ===========================================================================
-- PART D — VALIDATE the two lifecycle CHECKs now that the backfill has run.
-- ===========================================================================
-- VALIDATE CONSTRAINT takes only SHARE UPDATE EXCLUSIVE (reads and writes
-- continue) and is a no-op once validated, so this block is idempotent.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'application_documents'::regclass
          AND contype = 'c'
          AND convalidated = false
          AND conname IN (
              'chk_application_documents_lifecycle_state',
              'chk_application_documents_extraction_state'
          )
    LOOP
        EXECUTE format('ALTER TABLE application_documents VALIDATE CONSTRAINT %I', r.conname);
    END LOOP;
END $$;
