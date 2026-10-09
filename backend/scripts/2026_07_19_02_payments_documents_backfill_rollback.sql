-- Operator-only reverse of 2026_07_19_02_payments_documents_backfill.sql (task 3.5).
--
-- Excluded from the apply_sql_migrations boot sweep (runner skips *_rollback.sql).
-- Inverse-additive-only per production-schema-reconciliation Requirement 9.2
-- (test_rollback_safe_operations.py): the ONLY row-level change the backfill makes
-- that is not undone by dropping an additive column is the exception-ledger INSERT,
-- so the sole reverse operation is a scoped DELETE of exactly those rows.
--
-- Why nothing else is here:
--   * The document version/provenance bookkeeping (version, is_current,
--     supersedes_id, superseded_at, provenance, uploaded_by) and the payments
--     application_quarantined flag live in ADDITIVE columns that the 01_ expand
--     rollback DROPs wholesale — so their values need no separate reset (dropping
--     the column reverts the data). Run order is 03_ -> 02_ -> 01_, and the 03_
--     rollback drops the one-current index first, so leaving is_current populated
--     between 02_ and 01_ cannot violate any constraint.
--   * The A1 orphan-recovery UPDATE (payments.application_id filled from metadata)
--     is FORWARD-ONLY by design (design §15.2): we cannot distinguish an id we
--     recovered from one that pre-existed. To fully revert recovered links, discard
--     the Neon rehearsal branch or restore from the pre-change backup
--     (deploy/backup-db.sh).
--
-- Run this BEFORE the 01_ expand rollback (the ledger table must still exist) and
-- AFTER the 03_ validate rollback.
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.5.

-- Remove exactly the orphan-quarantine ledger rows this migration inserted
-- (scoped DELETE ... WHERE — inverse-additive-safe).
DELETE FROM payment_orphan_exceptions
WHERE owner = 'admissions-data-remediation'
  AND reason_code = 'null_application';
