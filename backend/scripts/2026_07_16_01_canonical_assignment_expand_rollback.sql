-- Rollback for 2026_07_16_01_canonical_assignment_expand.sql (task 3.2 EXPAND).
--
-- Operator-run only. Rollback scripts are excluded from the apply_sql_migrations
-- sweep (the ``*_rollback.sql`` suffix filter), so the destructive DROPs here are
-- never auto-applied. Reverses ONLY the additive schema objects created by the
-- expand phase; it does not attempt to un-backfill data (that is the 02_ rollback
-- + Neon-branch discard / backup restore, per design.md §15.2 step 8).
--
-- Safe order: drop the CHECK first (so the flag column can be dropped), then the
-- column, then the ledger table.

ALTER TABLE applications DROP CONSTRAINT IF EXISTS chk_applications_canonical_assignment;

ALTER TABLE applications DROP COLUMN IF EXISTS assignment_quarantined;

DROP TABLE IF EXISTS canonical_assignment_exceptions;
