# SQL Migration History

All Django models use `managed = False`. Schema changes are applied via raw SQL scripts.

## Active Scripts

| Script | Purpose | Applied |
|--------|---------|---------|
| `00_full_schema.sql` | Placeholder guide — regenerate from production via pg_dump | N/A |
| `application_number_sequences.sql` | Application number sequence setup | unknown |
| `system_actor_seed.sql` | System actor seed data | unknown |
| `legacy_columns_drop_2026_08_15.sql` | Drop deprecated payment columns from applications | N (scheduled) |
| `payment_hardening_indexes_rollback.sql` | Rollback for payment hardening indexes | N (rollback only) |
| `2026_05_18_hot_query_indexes.sql` | Hot-query indexes for applications, payments, audit_logs | N |
| `2026_05_18_expand_application_status_columns.sql` | Widen application status columns for canonical lifecycle values | N |
| `2026_05_19_seed_communication_templates.sql` | Seed all 19 communication_templates rows used in production code | N |

## Applied Scripts (in `applied/` subdirectory)

| Script | Purpose | Applied |
|--------|---------|---------|
| `applied/payment_hardening_indexes.sql` | Payment hardening Phase 1 indexes | Y |
| `applied/payment_hardening_preflight.sql` | Payment hardening preflight checks | Y |

## Archived Scripts Present In Checkout

| Script | Purpose | Applied |
|--------|---------|---------|
| `archive/add_missing_payment_columns.sql` | Added payment columns to applications | Y |

## Applied Scripts Referenced Elsewhere But Missing From This Checkout

The April 2026 audits and historical file manifests reference the scripts below,
but the SQL files are not present in the repository on 2026-05-18. Their
application status therefore cannot be re-verified from source control alone;
recover them from git history or Neon executed-DDL logs before claiming a
complete archive.

| Script | Purpose | Repository state |
|--------|---------|------------------|
| `lenco_payment_integration.sql` | Created program_fees, webhook_event_logs tables | missing |
| `business_logic_densification.sql` | Created conditions, templates, calendar, waivers, amendments tables | missing |
| `add_audit_log_encrypted_network_context.sql` | Encrypted network context on audit_logs | missing |
| `drop_program_fee_full_unique.sql` | Dropped unique constraint on program_fees | missing |
| `add_outbox_events.sql` | Created outbox_events table | missing |
| `create_error_logs_table.sql` | Created error_logs table (now deprecated) | missing |

## Utility Scripts (not migrations)

| Script | Purpose |
|--------|---------|
| `api_quality.sh` | API quality checks |
| `check_circular_imports.py` | Circular import detection |
| `payment_snapshot_backfill.py` | Backfill payment metadata snapshots |
| `staging_smoke.py` | Staging smoke tests |
| `verify_migration.py` | Migration verification |
| `verify_schema_static.py` | Static schema verification |
| `apply_canonical_truth_migrations.py` | Canonical truth migration runner |
