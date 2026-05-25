-- Reconcile migration_history with the production database by recording
-- the two payment-hardening scripts that were physically applied to
-- production out-of-band before migration_history existed as the single
-- source of truth.
--
-- Spec: .kiro/specs/production-schema-reconciliation/
-- Component: 4 (migration_history reconciliation)
-- Requirements: 4.1, 4.2, 4.5, 9.1, 9.2
--
-- Prerequisites: 2026_05_22_migration_history_extend.sql must have been
-- applied first so the migration_history table has the checksum and notes
-- columns plus the unique index on migration_name that this script's
-- ON CONFLICT (migration_name) DO NOTHING clause targets.
--
-- Each row's checksum is the SHA-256 of the corresponding file in
-- backend/scripts/applied/ at the time this reconcile script was authored
-- (2026-05-22). The original applied_at timestamps for these out-of-band
-- runs are not recorded anywhere, so applied_at is set to now() and the
-- notes column carries a literal marker that the reversible-inverse
-- rollback (2026_05_22_migration_history_reconcile_rollback.sql) uses to
-- target only these reconciliation rows.
--
-- Forward-only; the reversible inverse lives in
-- 2026_05_22_migration_history_reconcile_rollback.sql.

INSERT INTO migration_history (migration_name, checksum, applied_at, notes)
VALUES (
    'payment_hardening_indexes.sql',
    '58baf5811de5276f44b4420ab9f43038b13c43a9d308328443d203c7e42dcc30',
    now(),
    'reconciled-on-2026-05-22; original applied_at not recorded'
)
ON CONFLICT (migration_name) DO NOTHING;

INSERT INTO migration_history (migration_name, checksum, applied_at, notes)
VALUES (
    'payment_hardening_preflight.sql',
    '21b331f104216558f371ba962633371f01a0da58a97f7122f48ce158ea6dd067',
    now(),
    'reconciled-on-2026-05-22; original applied_at not recorded'
)
ON CONFLICT (migration_name) DO NOTHING;
