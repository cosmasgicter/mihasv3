-- Reversible inverse of 2026_05_22_migration_history_extend.sql. Apply only after confirming no application code depends on the structures being dropped.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Component: 1 (extended migration_history table)
-- Drops the unique index first, then the notes and checksum columns. Order
-- matters because the unique index references migration_name (preserved) but
-- must be dropped before any subsequent rollback step that touches the table
-- structure to keep DDL locks short.

DROP INDEX IF EXISTS uq_migration_history_migration_name;

ALTER TABLE migration_history
    DROP COLUMN IF EXISTS notes,
    DROP COLUMN IF EXISTS checksum;
