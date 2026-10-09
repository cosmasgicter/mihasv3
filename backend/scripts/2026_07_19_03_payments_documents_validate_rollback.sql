-- Operator-only reverse of 2026_07_19_03_payments_documents_validate.sql (task 3.5).
--
-- Excluded from the apply_sql_migrations boot sweep (runner skips *_rollback.sql).
-- Reverses the SWITCH: drops the one-current partial unique index and restores the
-- payments FK ON DELETE action to its prior SET NULL. Idempotent (IF EXISTS /
-- guarded).
--
-- Note: VALIDATE CONSTRAINT is NOT independently reversible — a validated CHECK/FK
-- stays valid (there is no ``INVALIDATE CONSTRAINT``). To return a constraint to
-- NOT VALID you must drop and re-add it, which the 01_ expand rollback does. So
-- this file only reverses the two switch actions that ARE reversible; the
-- constraints themselves are removed by the 01_ rollback. Run this FIRST (before
-- the 02_ and 01_ rollbacks).
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.5.

-- A1. Drop the one-current partial unique index (superseded history rows may again
--     share (application_id, document_type) with a current row).
DROP INDEX IF EXISTS uq_application_documents_one_current;

-- B1. Restore the payments FK ON DELETE action to SET NULL (its pre-3.5 state).
--     Guarded: only fires while the FK currently declares CASCADE, so a re-run or a
--     database that was already SET NULL is a no-op.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payments_application_id_fkey'
          AND conrelid = 'payments'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%ON DELETE CASCADE%'
    ) THEN
        ALTER TABLE payments DROP CONSTRAINT payments_application_id_fkey;
        ALTER TABLE payments
            ADD CONSTRAINT payments_application_id_fkey
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL;
    END IF;
END $$;
