# SQL Migration History

> **⚠️ Superseded by generated evidence (Admissions V2 task 3.6 / DATA-09).**
> This hand-maintained mirror **stopped at the 2026-05 scripts ("40 rows",
> regenerated 2026-05-25)** and therefore omits every June-2026+ tenant/canonical
> migration — the exact drift finding **DATA-09** names. Do **not** hand-edit or
> trust the row list below as current.
>
> The **single current evidence link** for migration-history truth is the report
> **generated from a real database** by
> `python manage.py migration_history_report`, with a runnable freshness gate:
>
> - Evidence + reproduction: [`docs/v2-evidence/3.6/README.md`](../../docs/v2-evidence/3.6/README.md)
> - Generated release history (ids, full sha256 checksums, applied_at, schema
>   fingerprint, non-secret `host=… db=…` identity):
>   [`docs/v2-evidence/3.6/migration-history.release.md`](../../docs/v2-evidence/3.6/migration-history.release.md)
> - Freshness test (build-breaking, no skips):
>   `backend/tests/unit/test_migration_history_report_freshness.py`
>
> Regenerate rather than editing by hand:
> `python manage.py migration_history_report --emit <report>.json --label <env> --markdown <report>.md`.
> The table below is retained only as a **historical 2026-05-25 snapshot**.

All Django models use `managed = False`. Schema changes are applied
via raw SQL scripts. After the 2026-05-22 reconciliation,
`migration_history` on each real database is the **source of truth** for what is
applied; the authoritative human-readable record is now **generated** from that
table (see the banner above), not maintained by hand here.

The drift-guard
(`python3 manage.py check_schema_drift --check-migration-history-coverage`)
detects when this mirror drifts from the truth — the canonical truth
map at `docs/canonical-truth-map.md` records the relationship.

## Historical snapshot — production migration_history (40 rows, as of 2026-05-25; superseded)

The list below is the pre-June-2026 hand-captured snapshot. It is kept for
history only. For the current, June-2026+-inclusive record generated from a real
database, use `docs/v2-evidence/3.6/` (see the banner above).

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

## Regenerating (use the generated report, not this snapshot)

Do not hand-regenerate the snapshot above. Emit the current report from a real
database — it includes every June-2026+ migration id, full sha256 checksum,
applied_at, the schema fingerprint, and a non-secret `host=… db=…` identity, and
it is gated by a runnable freshness test:

```bash
cd backend
# From the active Django connection (fresh/migrated local DB):
python manage.py migration_history_report \
    --emit ../docs/v2-evidence/3.6/migration-history.release.json \
    --label release-canonical-committed-path \
    --markdown ../docs/v2-evidence/3.6/migration-history.release.md
# From a read-only DSN (Neon branch / production read-only) — DSN never printed:
NEON_DSN=... python manage.py migration_history_report \
    --emit ../docs/v2-evidence/3.6/migration-history.neon-default.json \
    --label neon-default-branch --dsn-env NEON_DSN
# Gate freshness (pure; breaks the build if a June-2026+ script is unrecorded):
python manage.py migration_history_report \
    --check-freshness ../docs/v2-evidence/3.6/migration-history.release.json
```

See `docs/v2-evidence/3.6/README.md` for the full reproduction and honest notes
(Neon-default is legitimately stale; production capture is operator-gated).
