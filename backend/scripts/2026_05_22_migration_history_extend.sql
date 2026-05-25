-- Extend migration_history with checksum and notes columns and a unique index
-- on migration_name so it can serve as the single source of truth for what is
-- applied to production. Both new columns are nullable so the existing 29
-- production rows do not require backfill, satisfying the additive-only
-- contract from Requirement 1.2.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Component: 1 (extended migration_history table)
-- Forward-only; the reversible inverse lives in
-- 2026_05_22_migration_history_extend_rollback.sql.

ALTER TABLE migration_history
    ADD COLUMN IF NOT EXISTS checksum TEXT NULL,
    ADD COLUMN IF NOT EXISTS notes TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_migration_history_migration_name
    ON migration_history (migration_name);
