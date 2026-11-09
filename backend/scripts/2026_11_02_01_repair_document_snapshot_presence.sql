-- Student journey repair - task 3.15 (design R4-d, clause 2.19).
-- Repair application snapshot columns left NULL by defect A-04.
-- DATA ONLY, additive (fills NULLs), idempotent.
--
-- Spec:     .kiro/specs/student-journey-repair/ task 3.15, design R4-d
-- Clauses:  bugfix 2.19 (snapshot set for every committed document),
--           3.16 (additive only; production after backup, task 6.1/6.2)
--
-- Why
-- ---
-- Before task 3.14 the upload view committed the document version first and
-- wrote ``applications.result_slip_url`` / ``extra_kyc_url`` afterwards, in a
-- separate statement. A failure in between (the varchar(500) overflow for a
-- long file name was the common one) left a committed current document with a
-- NULL snapshot. Every frontend reader treats the snapshot as "uploaded", so
-- such a student was told the document was missing.
--
-- What this does
-- --------------
-- Fills each NULL snapshot with the id of that application's newest current,
-- non-deleted document of a covering type (design D-A3: the snapshot is a
-- presence marker holding the current document id). ``DISTINCT ON`` picks
-- exactly one row per application, so the result is deterministic even for
-- legacy rows where several identity types are current.
--
-- What this never does
-- --------------------
-- * It never overwrites a non-NULL snapshot.
-- * It never touches ``updated_at`` (an ``updated_at`` change would retire an
--   issued slip fingerprint, R-11). The task 3.15 proof lists user triggers on
--   ``applications`` first; none may write ``updated_at``.
-- * A second run changes 0 rows.

WITH slip AS (
  SELECT DISTINCT ON (d.application_id) d.application_id, d.id
  FROM application_documents d
  WHERE d.document_type = 'result_slip' AND d.is_current IS TRUE
    AND COALESCE(d.verification_status, '') <> 'deleted'
  ORDER BY d.application_id, d.uploaded_at DESC NULLS LAST, d.id
)
UPDATE applications a SET result_slip_url = slip.id::text
FROM slip WHERE a.id = slip.application_id AND a.result_slip_url IS NULL;

WITH identity_doc AS (
  SELECT DISTINCT ON (d.application_id) d.application_id, d.id
  FROM application_documents d
  WHERE d.document_type IN ('extra_kyc', 'nrc', 'passport') AND d.is_current IS TRUE
    AND COALESCE(d.verification_status, '') <> 'deleted'
  ORDER BY d.application_id, d.uploaded_at DESC NULLS LAST, d.id
)
UPDATE applications a SET extra_kyc_url = identity_doc.id::text
FROM identity_doc WHERE a.id = identity_doc.application_id AND a.extra_kyc_url IS NULL;
