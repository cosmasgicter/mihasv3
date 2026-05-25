# SQL Migration History

All Django models use `managed = False`. Schema changes are applied
via raw SQL scripts. After the 2026-05-22 reconciliation,
`migration_history` on the production Neon database (project
`wild-bar-37055823`) is the **single source of truth** for what is
applied. This file is the human-readable mirror, regenerated from
`SELECT migration_name, applied_at, notes FROM migration_history
ORDER BY applied_at, migration_name` on 2026-05-25.

The drift-guard
(`python3 manage.py check_schema_drift --check-migration-history-coverage`)
detects when this mirror drifts from the truth — the canonical truth
map at `docs/canonical-truth-map.md` records the relationship.

## Production migration_history (40 rows)

| Migration                                              | Applied (UTC)               | Notes                                            |
| ------------------------------------------------------ | --------------------------- | ------------------------------------------------ |
| `001_extensions.sql`                                   | 2026-02-19T07:31:03.111Z    |                                                  |
| `002_core_schema.sql`                                  | 2026-02-19T07:31:57.964Z    |                                                  |
| `003_supporting_tables.sql`                            | 2026-02-19T07:41:03.725Z    |                                                  |
| `004_functions.sql`                                    | 2026-02-19T07:47:22.019Z    |                                                  |
| `005_triggers.sql`                                     | 2026-02-19T07:48:15.976Z    |                                                  |
| `006_data_migration.sql`                               | 2026-02-19T07:48:58.721Z    |                                                  |
| `007_password_reset.sql`                               | 2026-02-19T08:47:54.771Z    |                                                  |
| `008_notification_idempotency.sql`                     | 2026-02-19T10:43:44.370Z    |                                                  |
| `009_document_migration_log.sql`                       | 2026-02-19T14:17:14.266Z    |                                                  |
| `010_user_permission_overrides.sql`                    | 2026-03-07T13:36:34.106Z    |                                                  |
| `011_payment_review_indexes.sql`                       | 2026-03-07T13:36:47.887Z    |                                                  |
| `add_audit_retention_category.sql`                     | 2026-03-07T13:37:02.236Z    |                                                  |
| `add_csrf_tokens_table.sql`                            | 2026-03-07T13:37:02.236Z    |                                                  |
| `add_login_attempts_table.sql`                         | 2026-03-07T13:37:02.236Z    |                                                  |
| `add_password_reset_tokens_table.sql`                  | 2026-03-07T13:37:02.236Z    |                                                  |
| `add_idempotency_and_status_history.sql`               | 2026-03-10T08:14:27.506Z    |                                                  |
| `add_version_and_nationality.sql`                      | 2026-03-10T08:14:27.506Z    |                                                  |
| `fix_forensic_analysis_round2.sql`                     | 2026-03-10T08:14:27.506Z    |                                                  |
| `normalize_data.sql`                                   | 2026-03-10T08:14:27.506Z    |                                                  |
| `normalize_data_corrected.sql`                         | 2026-03-10T08:14:27.506Z    |                                                  |
| `seed_and_normalize_data.sql`                          | 2026-03-10T08:14:27.506Z    |                                                  |
| `seed_program_intakes_and_requirements.sql`            | 2026-03-10T08:14:27.506Z    |                                                  |
| `data_cleanup_round4.sql`                              | 2026-03-10T08:15:30.649Z    |                                                  |
| `V2_013_PROF_COUNTRY`                                  | 2026-03-27T14:39:21.915Z    |                                                  |
| `drop_dead_columns_and_tables.sql`                     | 2026-03-27T14:43:52.921Z    |                                                  |
| `register_ghost_migrations.sql`                        | 2026-03-27T14:43:52.921Z    |                                                  |
| `add_audit_remediation_indexes.sql`                    | 2026-03-28T05:52:02.883Z    |                                                  |
| `drop_redundant_indexes.sql`                           | 2026-03-28T05:52:02.883Z    |                                                  |
| `lenco_payment_integration.sql`                        | 2026-04-07T14:55:04.066Z    |                                                  |
| `2026_05_22_migration_history_extend.sql`              | 2026-05-25T13:45:01.455Z    |                                                  |
| `2026_05_18_expand_application_status_columns.sql`     | 2026-05-25T13:45:18.795Z    |                                                  |
| `2026_05_18_hot_query_indexes.sql`                     | 2026-05-25T13:45:41.125Z    |                                                  |
| `2026_05_19_seed_communication_templates.sql`          | 2026-05-25T13:46:03.627Z    |                                                  |
| `payment_hardening_indexes.sql`                        | 2026-05-25T13:46:22.041Z    | reconciled-on-2026-05-22; original applied_at not recorded |
| `payment_hardening_preflight.sql`                      | 2026-05-25T13:46:22.395Z    | reconciled-on-2026-05-22; original applied_at not recorded |
| `2026_05_22_migration_history_reconcile.sql`           | 2026-05-25T13:46:24.898Z    |                                                  |
| `application_number_sequences.sql`                     | 2026-05-25T13:46:46.032Z    |                                                  |
| `system_actor_seed.sql`                                | 2026-05-25T13:47:06.292Z    |                                                  |
| `2026_05_22_fk_index_backfill.sql`                     | 2026-05-25T13:47:46.060Z    |                                                  |
| `2026_05_22_device_sessions_refresh_jti.sql`           | 2026-05-25T13:47:51.770Z    |                                                  |

Every row above also has a `_rollback.sql` sibling under
`backend/scripts/` (verified by
`backend/tests/property/test_rollback_pairing.py`). Rollback contents
are constrained to the inverse-additive operation set
(`DROP COLUMN`, `DROP INDEX`, `DROP SEQUENCE`, `DROP TABLE`, scoped
`DELETE FROM ... WHERE`, `DELETE FROM migration_history`) by
`backend/tests/property/test_rollback_safe_operations.py`.

## Files in the checkout but never in migration_history

These files exist under `backend/scripts/` but are deliberately
excluded from the apply / coverage sweep:

| Script | Purpose | Why excluded |
|--------|---------|--------------|
| `00_full_schema.sql`                  | Documentation snapshot of the live schema (regenerated via `generate_full_schema.py` from production); never applied as a migration | Excluded from rollback-pairing and coverage checks |
| `legacy_columns_drop_2026_08_15.sql`  | Future, deliberately-deferred non-additive cleanup | Excluded from rollback-pairing and coverage checks |

## Out-of-band scripts in the `applied/` subdirectory

These were physically applied to production before
`migration_history` was the canonical tracker, then retroactively
recorded by `2026_05_22_migration_history_reconcile.sql` (notes:
`reconciled-on-2026-05-22; original applied_at not recorded`):

| Script | Purpose |
|--------|---------|
| `applied/payment_hardening_indexes.sql`    | Payment hardening Phase 1 indexes |
| `applied/payment_hardening_preflight.sql`  | Payment hardening preflight checks |

## Archived

| Script | Purpose |
|--------|---------|
| `archive/add_missing_payment_columns.sql` | Added payment columns to applications |

## Scripts referenced but missing from the checkout

The April 2026 audits and historical file manifests reference these
scripts. They are recorded in `migration_history` (because they were
physically applied to production) but the SQL files are not in the
repository as of 2026-05-22. Recover them from git history or Neon
executed-DDL logs before claiming a complete archive.

| Script | Purpose |
|--------|---------|
| `business_logic_densification.sql`        | Created conditions, templates, calendar, waivers, amendments tables |
| `add_audit_log_encrypted_network_context.sql` | Encrypted network context on audit_logs |
| `drop_program_fee_full_unique.sql`        | Dropped unique constraint on program_fees |
| `add_outbox_events.sql`                   | Created outbox_events table |
| `create_error_logs_table.sql`             | Created error_logs table (now deprecated) |

## Utility scripts (not migrations)

| Script | Purpose |
|--------|---------|
| `api_quality.sh`                            | API quality checks |
| `check_circular_imports.py`                 | Circular import detection |
| `payment_snapshot_backfill.py`              | Backfill payment metadata snapshots |
| `staging_smoke.py`                          | Staging smoke tests |
| `verify_migration.py`                       | Migration verification |
| `verify_schema_static.py`                   | Static schema verification |
| `apply_canonical_truth_migrations.py`       | Canonical truth migration runner |
| `generate_full_schema.py`                   | Regenerate `00_full_schema.sql` from production |

## Regenerating this file

```bash
psql "$PROD_URL" -At -F'|' \
    -c "SELECT migration_name, applied_at, COALESCE(notes,'') FROM migration_history ORDER BY applied_at, migration_name"
# Pipe through awk/jinja to produce the table above. Pin the row count
# to the value returned by SELECT count(*) FROM migration_history.
```
