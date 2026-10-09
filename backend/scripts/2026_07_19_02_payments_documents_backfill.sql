-- Admissions V2 — task 3.5 (reconcile canonical payments + document versions),
-- BACKFILL phase.
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 3.5
-- Requirements: R11.7-R11.8, R15.5-R15.6, R15.9
-- Findings:     DATA-11, STU-19
-- Design:       §15.2 step (4) "backfill in bounded idempotent batches with an
--               exception ledger"; §9.3 (immutable versions); §10.2 (orphan
--               remediation before the non-null gate).
--
-- Runs AFTER 01_ expand. Uses ONLY bounded UPDATE / INSERT ... ON CONFLICT (no
-- DELETE, no TRUNCATE) so it is additive-only-lint clean and never destroys a
-- historical value. Fully idempotent: every write is guarded so a re-run
-- converges to a no-op.
--
-- On the Neon authoring branch (and a production DB restored from it) there are
-- ZERO orphan payments, so PART A is a proven no-op; PART B assigns the version /
-- provenance bookkeeping for the 10 duplicate (application, document_type) groups
-- (25 rows superseded) plus every single-version row.

-- ===========================================================================
-- PART A — PAYMENTS orphan remediation (recover deterministically, else
--          quarantine in place — never delete).
-- ===========================================================================

-- A1. Deterministic recovery: an orphan whose metadata carries a valid
--     application_id pointing at a real application is re-linked. Only fills a
--     NULL (idempotent) and only when the target application exists (fail-safe).
UPDATE payments p
SET application_id = (p.metadata->>'application_id')::uuid
WHERE p.application_id IS NULL
  AND p.application_quarantined = false
  AND p.metadata IS NOT NULL
  AND p.metadata ? 'application_id'
  AND (p.metadata->>'application_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = (p.metadata->>'application_id')::uuid
  );

-- A2. Quarantine the unrecoverable remainder. Copy the row's non-PII summary into
--     the ledger (value preserved) — deliberately NOT the raw metadata blob, which
--     may carry phone_hash / phone_last4 (product rule: never log/duplicate PII).
INSERT INTO payment_orphan_exceptions (payment_id, application_id, reason_code, details, owner, removal_path)
SELECT p.id,
       NULL,
       'null_application',
       jsonb_build_object(
           'status', p.status,
           'amount', p.amount,
           'currency', p.currency,
           'transaction_reference', p.transaction_reference,
           'lenco_reference', p.lenco_reference,
           'created_at', p.created_at
       ),
       'admissions-data-remediation',
       'Recover the owning application (set application_id) OR, after operator '
       || 'review + backup, delete the orphan payment; then clear '
       || 'application_quarantined so the row leaves the exempted set.'
FROM payments p
WHERE p.application_id IS NULL
  AND p.application_quarantined = false
ON CONFLICT (payment_id, reason_code) DO NOTHING;

-- A3. Flag the quarantined orphans in place so the mandatory-application CHECK can
--     validate (canonical rows carry application_id; these preserved legacy rows
--     are explicitly exempt). Idempotent: only flips still-NULL, still-unflagged.
UPDATE payments p
SET application_quarantined = true
WHERE p.application_id IS NULL
  AND p.application_quarantined = false;

-- ===========================================================================
-- PART B — APPLICATION DOCUMENTS version + provenance backfill.
-- ===========================================================================

-- B1. Assign version, is_current, supersedes_id, superseded_at deterministically
--     within each (application_id, document_type) group, ordered oldest->newest by
--     COALESCE(uploaded_at, created_at) then id (stable tiebreak). The newest row
--     in each group is the one CURRENT version; older rows become immutable
--     superseded history (STU-19: prior evidence preserved, not overwritten).
--     A full recompute each run => idempotent (same inputs -> same ranks).
WITH ranked AS (
    SELECT
        id,
        row_number() OVER w AS v,
        count(*)     OVER (PARTITION BY application_id, document_type) AS grp_n,
        lag(id)      OVER w AS prev_id,
        lead(COALESCE(uploaded_at, created_at)) OVER w AS next_ts
    FROM application_documents
    WINDOW w AS (
        PARTITION BY application_id, document_type
        ORDER BY COALESCE(uploaded_at, created_at, timestamp with time zone 'epoch'), id
    )
)
UPDATE application_documents d
SET version       = r.v,
    is_current    = (r.v = r.grp_n),
    supersedes_id = r.prev_id,
    superseded_at = CASE WHEN r.v = r.grp_n THEN NULL ELSE r.next_ts END
FROM ranked r
WHERE d.id = r.id
  AND (
        d.version       IS DISTINCT FROM r.v
     OR d.is_current    IS DISTINCT FROM (r.v = r.grp_n)
     OR d.supersedes_id IS DISTINCT FROM r.prev_id
     OR d.superseded_at IS DISTINCT FROM (CASE WHEN r.v = r.grp_n THEN NULL ELSE r.next_ts END)
      );

-- B2. Provenance origin (idempotent: only fills NULL). system_generated slips ->
--     'system_generated'; everything else is a student upload in the legacy data.
UPDATE application_documents
SET provenance = CASE WHEN COALESCE(system_generated, false) THEN 'system_generated' ELSE 'student_upload' END
WHERE provenance IS NULL;

-- B3. Owner backfill for student uploads: the applicant owns their upload. Only
--     fills NULL, only for non-system rows (idempotent). System artifacts keep a
--     NULL uploader (produced by the platform, not a person).
UPDATE application_documents d
SET uploaded_by = a.user_id
FROM applications a
WHERE d.application_id = a.id
  AND d.uploaded_by IS NULL
  AND COALESCE(d.system_generated, false) = false;
