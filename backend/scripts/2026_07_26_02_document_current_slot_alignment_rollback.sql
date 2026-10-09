-- Operator-only reverse of 2026_07_26_02_document_current_slot_alignment.sql
-- (task 7.3 follow-up).
--
-- Excluded from the apply_sql_migrations boot sweep (the runner skips
-- *_rollback.sql via the _iter_migration_files suffix filter).
--
-- Backup-first on any real database (deploy/backup-db.sh).
--
-- Data-correction rollback policy
-- -------------------------------
-- The forward script adds no schema, so there is no object to drop. It rewrites
-- `is_current` (and the matching `superseded_at`) on rows that were already
-- non-current by every other definition. Those individual prior values are not
-- recoverable statement-by-statement because the script did not journal them.
--
-- Recreating the old rule would deliberately put a soft-deleted upload back into
-- the enforced one-current slot and make replacement fail on the unique index.
-- Corrected document state therefore remains intact. The only inverse-additive
-- operation is removing this script's migration-history marker, which lets the
-- idempotent forward correction be re-applied after an application rollback.
-- Reverting corrected data itself is backup/restore work.
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 7.3.

BEGIN;

DELETE FROM migration_history
WHERE migration_name = '2026_07_26_02_document_current_slot_alignment.sql';

COMMIT;
