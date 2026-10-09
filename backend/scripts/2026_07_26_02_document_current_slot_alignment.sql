-- Admissions V2 — task 7.3, follow-up: align the one-current slot with deletion.
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 7.3
-- Requirements: R11.8 (the DATABASE enforces one current document version per
--               application and requirement/type; replace/delete preserve prior
--               evidence history), R17.1 (a multi-step command's compensation and
--               invariants are defined rather than incidental).
-- Findings:     STU-19.
-- Design:       §9.3 ("a partial unique index enforces one current document per
--               application and requirement"), §15.2 step (4) (bounded,
--               idempotent backfill).
--
-- Why this exists
-- ---------------
-- Two earlier scripts each did the right thing in isolation and left one
-- combination wrong:
--
--   * task 3.5's `2026_07_19_02_payments_documents_backfill.sql` assigns
--     `is_current` to the newest row per `(application_id, document_type)` by
--     `uploaded_at`, and creates `uq_application_documents_one_current` — a
--     partial unique index whose predicate is `WHERE is_current`.
--   * task 7.3's `2026_07_26_01_document_evidence_lifecycle.sql` derives
--     `lifecycle_state = 'deleted'` for a row soft-deleted through the pre-7.3
--     path (`verification_status = 'deleted'`), and deliberately leaves the
--     legacy column alone.
--
-- Neither consults the other, so a soft-deleted row that happens to be the newest
-- upload for its requirement ends up holding `is_current = true` while every
-- reader — the readiness gates, the required-documents contract, and
-- `document_evidence.lifecycle_of` — correctly treats it as gone. The result is a
-- requirement that can never be satisfied again: the row is invisible in the API
-- yet occupies the enforced slot, so the student's next upload fails on the unique
-- index and no replacement is possible. The runtime command now releases the slot
-- from whatever holds it, which fixes new writes; this script fixes the rows that
-- are already in that state so the invariant is true of the stored data too.
--
-- Shape: two bounded, idempotent UPDATEs. No DDL, no DROP, no TRUNCATE, no
-- unqualified DELETE — additive-only-lint clean, and a re-run touches zero rows.
-- Nothing is deleted and no historical `verification_status`, `version`,
-- `supersedes_id`, or `verification_notes` value is rewritten: the only column
-- this script changes is `is_current` (plus the matching `superseded_at`
-- bookkeeping), and only on rows the platform already considers non-current.

-- ---------------------------------------------------------------------------
-- 1. Release the slot from soft-deleted rows.
--
--    A deleted version is not the application's current evidence by any
--    definition the runtime uses, so it must not hold a slot the database
--    enforces. `superseded_at` is stamped only when it is still NULL, so a row
--    that already recorded when it stopped being current keeps that timestamp.
-- ---------------------------------------------------------------------------
UPDATE application_documents
SET is_current    = false,
    superseded_at = COALESCE(superseded_at, updated_at, uploaded_at, created_at, now()),
    updated_at    = COALESCE(updated_at, now())
WHERE is_current = true
  AND (
        verification_status = 'deleted'
     OR lifecycle_state IN ('deleted', 'superseded')
      );

-- ---------------------------------------------------------------------------
-- 2. Promote the newest surviving version for requirements that step 1 (or a
--    pre-7.3 soft delete) left with no current row at all.
--
--    Without this, releasing the slot would leave the requirement reporting
--    "missing" even though live evidence is on file — the student would be asked
--    to re-upload a document the platform still has. Chooses the newest
--    non-deleted, non-superseded version by (uploaded_at, id), which is the same
--    ordering task 3.5's backfill and the runtime version chain use, so the
--    promoted row is the one every other surface already calls the latest.
--
--    Bounded by `NOT EXISTS (... is_current ...)`: a requirement that already has
--    a current row is not touched, which is what makes the script safe to re-run
--    and unable to create a second current row.
-- ---------------------------------------------------------------------------
WITH promotable AS (
    SELECT DISTINCT ON (d.application_id, d.document_type)
           d.id
    FROM application_documents d
    WHERE d.is_current = false
      AND COALESCE(d.verification_status, '') <> 'deleted'
      AND COALESCE(d.lifecycle_state, '') NOT IN ('deleted', 'superseded')
      AND NOT EXISTS (
            SELECT 1
            FROM application_documents peer
            WHERE peer.application_id = d.application_id
              AND peer.document_type  = d.document_type
              AND peer.is_current     = true
          )
    ORDER BY d.application_id,
             d.document_type,
             COALESCE(d.uploaded_at, d.created_at, timestamp with time zone 'epoch') DESC,
             d.id DESC
)
UPDATE application_documents d
SET is_current    = true,
    superseded_at = NULL,
    updated_at    = COALESCE(d.updated_at, now())
FROM promotable p
WHERE d.id = p.id;
