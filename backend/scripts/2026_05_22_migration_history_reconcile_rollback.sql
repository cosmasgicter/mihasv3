-- Reversible inverse of 2026_05_22_migration_history_reconcile.sql. Apply only after confirming no application code depends on the structures being dropped.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Component: 4 (migration_history reconciliation)
-- Requirements: 4.5, 9.1, 9.2
--
-- Targets exactly the rows the forward reconcile script inserted by
-- matching both the migration_name and the literal notes-prefix marker
-- 'reconciled-on-2026-05-22'. This guarantees the rollback cannot delete
-- a forward-applied row that happens to share the same migration_name
-- (e.g. if a future operator legitimately re-applies one of these scripts
-- through apply_sql_migrations and the row is recorded with notes = NULL).

DELETE FROM migration_history
WHERE migration_name IN (
    'payment_hardening_indexes.sql',
    'payment_hardening_preflight.sql'
)
  AND notes LIKE 'reconciled-on-2026-05-22%';
