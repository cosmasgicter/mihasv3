-- Rollback for 2026_11_02_01_repair_document_snapshot_presence.sql
-- (student journey repair task 3.15, design R4-d).
--
-- Operator-run only: *_rollback.sql files are excluded from the
-- apply_sql_migrations boot sweep by the suffix filter in
-- ``_iter_migration_files``, so this is never auto-applied.
--
-- THIS ROLLBACK IS DELIBERATELY LEDGER-ONLY (design R4-d, "There is no
-- rollback script"). The forward script only filled NULL presence markers with
-- the id of an existing current document, which is the state the upload path
-- produces and the state before defect A-04. Setting them back to NULL would
-- re-create the defect (students told a committed document is missing), and
-- the script cannot tell a value it wrote from one a later upload wrote. If
-- the data must be restored, restore from the backup taken before the deploy
-- (deploy/backup-db.sh, task 6.1).
--
-- Removing the ledger row only lets the runner re-apply the (idempotent)
-- forward script.

DELETE FROM migration_history
WHERE migration_name = '2026_11_02_01_repair_document_snapshot_presence.sql';
