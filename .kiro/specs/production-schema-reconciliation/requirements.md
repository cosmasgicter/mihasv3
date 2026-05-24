# Requirements Document

## Introduction

The MIHAS production Neon database (project `wild-bar-37055823`, default branch) has drifted from the schema that the Django code in `backend/` expects, and the most recent production-readiness report contains claims that do not match `information_schema` reality. A live audit of production confirmed:

- `device_sessions.refresh_jti` and its supporting index are missing.
- The readiness report claims 72 tables but production has exactly 35.
- The readiness report claims "all FK columns indexed" but 15 foreign-key columns have no covering btree index.
- `migration_history` is out of sync — `payment_hardening_indexes.sql` and `payment_hardening_preflight.sql` indexes are physically present but not recorded.
- 2 of 15 production payments are missing `metadata.snapshot` from the Phase 1 backfill.
- `payments.receipt_number` uniqueness is enforced via a partial unique index, not a `UNIQUE` table constraint (functionally equivalent for non-null values; documentation needs to match).

This is a live system: 27 real applications, 15 real payments, 35 tables, and active student traffic. The reconciliation must be additive, online, idempotent, branch-tested, fully reversible, and must include a CI drift-guard so the same drift cannot silently re-accumulate. The work targets the backend-only `/api/v1/` Django app on Neon Postgres 17 and ships no schema changes that touch the response envelope, auth model, CSRF model, or observability stack.

The deliverable is: production schema fully matches the code's expectations, `migration_history` becomes the single source of truth for what is on production, every FK column is indexed, every payment carries `metadata.snapshot`, and CI fails on regression of any of those invariants. Documentation is updated to reflect verified `information_schema` reality, not the previous inflated narrative.

## Glossary

- **Production_Database**: The Neon Postgres 17 default branch of project `wild-bar-37055823`, accessed as `apply.mihas.edu.zm`'s backing store. The system this reconciliation targets.
- **Neon_Branch_Fork**: A short-lived Neon branch created from production used to dry-run additive migrations before they touch the default branch. Free, isolated, and discarded after verification.
- **Migration_History**: The `migration_history` table on `Production_Database`, containing one row per applied SQL file. After reconciliation, this table is the single source of truth for "what schema is on production".
- **Migration_Script**: Any file matching `backend/scripts/*.sql`, excluding `backend/scripts/applied/` and `backend/scripts/archive/`. The set of `Migration_Scripts` represents pending or active schema changes that must be applied in lexical order.
- **Applied_Migration**: A `Migration_Script` whose filename has a corresponding row in `Migration_History`.
- **Schema_Reconciliator**: The operator-facing tooling and process that closes the gap between `Production_Database` and the union of (`Migration_Scripts` + Django model declarations).
- **Drift_Guard**: The Django management command at `backend/apps/common/management/commands/check_schema_drift.py` plus the CI workflow `.github/workflows/backend-governance.yml` that runs it.
- **FK_Index_Invariant**: For every row in `information_schema.referential_constraints` on `Production_Database`, the column or column tuple referenced by the FK must be covered by a btree index whose first column matches the FK column.
- **Coverage_Invariant**: For every column declared on every Django model with `Meta.managed = False`, a column with the same name must exist in `information_schema.columns` for that model's `db_table` on `Production_Database`.
- **Snapshot_Invariant**: `count(*) FILTER (WHERE NOT (metadata ? 'snapshot')) = 0` on the `payments` table on `Production_Database`.
- **Receipt_Uniqueness_Invariant**: `payments.receipt_number` is unique for all non-null, non-empty values, enforced by the partial unique index `uq_payments_receipt_number`.
- **Maintenance_Window**: A pre-announced period during which `Schema_Reconciliator` actions may run against `Production_Database`. Typically off-peak; required for changes that, while online, may briefly raise locks or load.
- **Rollback_Plan**: A documented inverse SQL artefact for every applied step (e.g. `DROP COLUMN`, `DROP INDEX`, `DELETE FROM migration_history WHERE migration_name = ...`). Stored alongside the forward script under `backend/scripts/` with a `_rollback.sql` suffix.

## Requirements

### Requirement 1: Apply pending schema migrations to production

**User Story:** As an operator running production migrations, I want every pending Migration_Script for the admissions schema to be applied to Production_Database in lexical order, idempotently, and only after passing on a Neon_Branch_Fork, so that Django's `managed = False` models do not emit "column does not exist" errors against the live database.

#### Acceptance Criteria

1. WHEN the Schema_Reconciliator runs on a Neon_Branch_Fork, THE Schema_Reconciliator SHALL apply `2026_05_18_expand_application_status_columns.sql`, `2026_05_18_hot_query_indexes.sql`, `2026_05_19_seed_communication_templates.sql`, `application_number_sequences.sql`, `system_actor_seed.sql`, and any other Migration_Script not already in Migration_History, in ascending lexical order of filename.
2. WHEN any Migration_Script is applied to Production_Database, THE Migration_Script SHALL use only additive operations selected from `ADD COLUMN ... NULL DEFAULT ...`, `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`, `INSERT ... ON CONFLICT DO UPDATE`, `CREATE OR REPLACE FUNCTION`, `CREATE SEQUENCE IF NOT EXISTS`, and `ALTER TABLE ... ALTER COLUMN ... TYPE` widening conversions.
3. WHEN a `device_sessions.refresh_jti` column is required by code but missing on Production_Database, THE Schema_Reconciliator SHALL add the column as `varchar(255) NULL` and create a non-unique btree index `idx_sessions_refresh_jti` on `device_sessions(refresh_jti)` using `CREATE INDEX CONCURRENTLY IF NOT EXISTS`.
4. WHEN the Schema_Reconciliator applies a Migration_Script, THE Schema_Reconciliator SHALL insert a row into Migration_History recording `migration_name`, `checksum` (SHA-256 of file contents), and `applied_at` (current timestamp from Production_Database) within the same transaction whenever the underlying SQL permits transactional execution.
5. IF a Migration_Script contains `CREATE INDEX CONCURRENTLY`, THEN THE Schema_Reconciliator SHALL run that statement outside the wrapping transaction and SHALL record the Migration_History row in a separate, subsequent transaction once the index reaches state `valid` in `pg_index`.
6. IF a Migration_Script run fails partway through execution on Production_Database, THEN THE Schema_Reconciliator SHALL roll back any partial changes by aborting the wrapping transaction, SHALL leave Migration_History unchanged for that file, AND SHALL exit with a non-zero status code.
7. IF a Migration_Script run fails because the SQL contains `CREATE INDEX CONCURRENTLY` (which cannot run inside a transaction), THEN THE Schema_Reconciliator SHALL drop any partially-built invalid index using `DROP INDEX CONCURRENTLY IF EXISTS` for each index whose `pg_index.indisvalid = false`, SHALL leave Migration_History unchanged for that file, AND SHALL exit with a non-zero status code.
8. WHEN the Schema_Reconciliator is re-run after a successful application of a Migration_Script, THE Schema_Reconciliator SHALL detect the existing Migration_History row by `migration_name` and SHALL NOT re-execute the SQL.
9. WHEN the Schema_Reconciliator is invoked against Production_Database without a recorded Maintenance_Window in `docs/runbooks/schema-reconciliation-runbook.md`, THE Schema_Reconciliator SHALL log a warning of the form `WARNING: no maintenance window recorded for run started at <iso8601>` to standard error AND SHALL proceed with execution.
10. WHEN the operator records a Maintenance_Window in `docs/runbooks/schema-reconciliation-runbook.md`, THE recorded entry SHALL include a start timestamp, an expected duration, and the list of Migration_Scripts being applied.

### Requirement 2: Index every unindexed foreign-key column on production

**User Story:** As an operator responsible for query performance and join correctness, I want every foreign-key column on Production_Database covered by a btree index, so that joins against `applications`, `payments`, `programs`, and the business-logic-densification tables do not perform sequential scans on multi-thousand-row tables and so that future referential-integrity checks remain fast.

#### Acceptance Criteria

1. THE Schema_Reconciliator SHALL produce a Migration_Script named `2026_05_22_fk_index_backfill.sql` that creates a btree index for each of the 15 unindexed foreign-key columns: `applications.admin_feedback_by`, `applications.assigned_reviewer_id`, `applications.payment_verified_by`, `applications.reviewed_by`, `application_amendments.reviewed_by`, `application_conditions.verified_by`, `application_documents.verified_by`, `application_drafts.application_id`, `application_interviews.created_by`, `application_interviews.updated_by`, `application_status_history.changed_by`, `fee_waivers.approved_by`, `payments.verified_by`, `programs.institution_id`, and `settings.updated_by`.
2. WHEN the FK-index Migration_Script creates an index, THE Migration_Script SHALL use `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_<column> ON <table>(<column>)` with the table and column names matching the FK source.
3. WHEN the FK-index Migration_Script is applied to a Neon_Branch_Fork, THE operator SHALL run `EXPLAIN ANALYZE` on a representative join query for at least one index per affected table and SHALL record the resulting query plan in `docs/runbooks/schema-reconciliation-runbook.md`.
4. WHERE a Migration_Script-driven `CREATE INDEX CONCURRENTLY` statement fails because of an invalid index left in `pg_index` (state `indisvalid = false`), THE Schema_Reconciliator SHALL drop the invalid index with `DROP INDEX CONCURRENTLY` and SHALL re-attempt creation once before exiting with a non-zero status.
5. THE Schema_Reconciliator SHALL also produce `2026_05_22_fk_index_backfill_rollback.sql` containing `DROP INDEX CONCURRENTLY IF EXISTS idx_<table>_<column>` for each of the 15 indexes.
6. AFTER the FK-index Migration_Script is applied to Production_Database, THE FK_Index_Invariant SHALL hold for every row in `information_schema.referential_constraints` whose `constraint_schema` equals `current_schema()`.

### Requirement 3: Complete the payment snapshot backfill

**User Story:** As an operator finishing the payment-hardening Phase 1 rollout, I want every row in the `payments` table on Production_Database to carry a `metadata.snapshot` JSON object, so that downstream payment-recovery, force-approval, and audit code can rely on a uniform shape and so that the `payments` ledger remains the canonical source of truth for application fee state.

#### Acceptance Criteria

1. THE Schema_Reconciliator SHALL run `backend/scripts/payment_snapshot_backfill.py` against Production_Database with the existing logic that populates `metadata.snapshot` only on rows where `NOT (metadata ? 'snapshot')`.
2. WHEN the payment-snapshot backfill runs, THE backfill SHALL read each affected row inside a `SELECT ... FOR UPDATE` block and SHALL write the snapshot in the same transaction.
3. AFTER the payment-snapshot backfill completes against Production_Database, THE Snapshot_Invariant SHALL hold.
4. IF a Payment row contains values that the backfill classifies as ambiguous (per the existing script logic), THEN THE backfill SHALL skip the row, log the row's `id` to standard output, and SHALL NOT raise.
5. WHEN the backfill is re-run after a successful pass, THE backfill SHALL exit with status 0 and SHALL report `0 rows updated, 0 rows skipped` because every row already satisfies the Snapshot_Invariant.

### Requirement 4: Reconcile migration_history with the production database

**User Story:** As an operator inheriting an out-of-sync change log, I want Migration_History to record every Migration_Script that has actually been applied to Production_Database — including out-of-band applications such as `payment_hardening_indexes.sql` and `payment_hardening_preflight.sql` — so that Migration_History can serve as the single source of truth for "what schema is on production" and so that future drift-guard checks have a reliable reference.

#### Acceptance Criteria

1. THE Schema_Reconciliator SHALL produce a Migration_Script named `2026_05_22_migration_history_reconcile.sql` that uses `INSERT INTO migration_history (migration_name, checksum, applied_at, notes) VALUES (...) ON CONFLICT (migration_name) DO NOTHING` for every Migration_Script known to be physically applied to Production_Database but absent from Migration_History.
2. WHERE a script's actual application timestamp is unknown, THE reconcile Migration_Script SHALL use `now()` for `applied_at` AND SHALL set `notes` to the literal string `'reconciled-on-2026-05-22; original applied_at not recorded'`.
3. WHERE a script's actual application timestamp is known from prior runbooks or audit logs, THE reconcile Migration_Script SHALL use that timestamp literal for `applied_at` AND SHALL set `notes` to `'reconciled-on-2026-05-22; original applied_at recovered from <source>'`.
4. AFTER the reconcile Migration_Script runs against Production_Database, THE count of distinct rows in Migration_History SHALL equal the count of unique Migration_Script filenames physically applied to Production_Database, including `payment_hardening_indexes.sql`, `payment_hardening_preflight.sql`, and any other discovered out-of-band script.
5. THE reconcile Migration_Script SHALL be paired with `2026_05_22_migration_history_reconcile_rollback.sql` containing one `DELETE FROM migration_history WHERE migration_name = '<filename>' AND notes LIKE 'reconciled-on-2026-05-22%'` per inserted row.
6. WHEN the Schema_Reconciliator subsequently applies a new Migration_Script, THE new Migration_History row SHALL be a strict superset of the previously reconciled set — the reconcile run SHALL NOT block forward progress.

### Requirement 5: CI drift-guard against schema, FK-index, and migration-history regressions

**User Story:** As the CI system enforcing the production schema invariants, I want the `check_schema_drift` Django management command to fail the build whenever Coverage_Invariant, FK_Index_Invariant, or Migration_History coverage regresses, so that no future PR can silently re-introduce the drift this spec is reconciling.

#### Acceptance Criteria

1. THE Drift_Guard SHALL extend `backend/apps/common/management/commands/check_schema_drift.py` to accept a flag `--check-fk-indexes` that, when set, queries `information_schema.referential_constraints` joined to `pg_index` and reports any FK column lacking a btree index whose first attribute matches the FK column.
2. THE Drift_Guard SHALL extend the same command to accept a flag `--check-migration-history-coverage` that compares the set of Migration_Script filenames under `backend/scripts/` (excluding `applied/` and `archive/` subdirectories) against rows in Migration_History on the configured database.
3. WHEN `--check-migration-history-coverage` is set AND a Migration_Script's git commit timestamp is more than 7 days older than the current run timestamp AND the script's filename is absent from Migration_History, THE Drift_Guard SHALL exit with status code 1 and SHALL print one line per stale unrecorded script in the form `STALE_UNRECORDED_MIGRATION: <filename> committed=<iso8601>`.
4. WHEN `--check-fk-indexes` is set AND any FK column on the configured database lacks a covering btree index, THE Drift_Guard SHALL exit with status code 1 and SHALL print one line per gap in the form `MISSING_FK_INDEX: <table>.<column> -> <ref_table>.<ref_column>`.
5. WHEN the existing Coverage_Invariant check detects any column declared on a `managed = False` model that is missing from `information_schema.columns` on the configured database, THE Drift_Guard SHALL exit with status code 1 and SHALL print the existing schema-drift output unchanged, preserving backwards-compatible diagnostics.
6. THE Drift_Guard SHALL print a single success line of the form `OK: schema-drift=<n> fk-indexes=<m> migration-history=<k>` on exit code 0, where `n`, `m`, and `k` are the counts of items checked.
7. THE workflow `.github/workflows/backend-governance.yml` SHALL run `python3 manage.py check_schema_drift --check-fk-indexes --check-migration-history-coverage` on every pull request whose changeset touches `backend/**` or `backend/scripts/**`, with the database connection pointing to a Neon_Branch_Fork of Production_Database created at the start of the workflow.
8. WHEN a pull request does NOT touch any path under `backend/**` or `backend/scripts/**`, THE workflow SHALL skip the drift-guard step and SHALL NOT create a Neon_Branch_Fork.
9. WHEN the `backend-governance.yml` workflow finishes, THE workflow SHALL delete the Neon_Branch_Fork it created.
10. IF the Neon_Branch_Fork creation step fails, THEN THE workflow SHALL exit with status 1 AND SHALL print `NEON_BRANCH_FORK_UNAVAILABLE: <error>` so the CI failure is distinguishable from a real drift finding.

### Requirement 6: Update the production-readiness documentation to match information_schema reality

**User Story:** As a developer reading the production-readiness documentation, I want the readiness report and the migration history document to reflect what Production_Database actually contains — including the verified 35-table count, the partial-unique-index implementation of receipt-number uniqueness, and the FK-index reconciliation outcome — so that future audits start from facts and not from inflated claims.

#### Acceptance Criteria

1. THE Schema_Reconciliator SHALL update `PRODUCTION-READINESS-FIX-REPORT-2026-05-19.md` (or its successor file `PRODUCTION-READINESS-RECONCILIATION-REPORT-2026-05-22.md`) to replace the "72 tables" claim with the verified count of 35 tables.
2. THE updated readiness report SHALL replace the "all FKs indexed" claim with a table listing the 15 FK columns indexed by the reconciliation Migration_Script, the index name, and the date the index was applied.
3. THE updated readiness report SHALL replace any reference to a `production.py` settings module with the actual Django settings module path used in production (`backend/config/settings/production.py` if it exists, or whichever module the production deployment imports).
4. THE updated readiness report SHALL describe `payments.receipt_number` uniqueness as enforced by the partial unique index `uq_payments_receipt_number ... WHERE receipt_number IS NOT NULL AND <> ''` rather than as a `UNIQUE` table constraint, AND SHALL note that the two formulations are functionally equivalent for non-null values.
5. THE Schema_Reconciliator SHALL update `backend/scripts/MIGRATION_HISTORY.md` so that every row in the on-production Migration_History table appears in the markdown table with `Applied = Y` and the corresponding `applied_at` timestamp.
6. THE Schema_Reconciliator SHALL add an entry to `docs/canonical-truth-map.md` for the domain concept "schema migration tracking" naming `migration_history` on Production_Database as the single canonical source AND naming `backend/scripts/MIGRATION_HISTORY.md` as the human-readable mirror.
7. THE Schema_Reconciliator SHALL produce or update `docs/runbooks/schema-reconciliation-runbook.md` containing: the pre-flight check list, the per-step Maintenance_Window expectation, the per-step Rollback_Plan, the verification queries (Coverage_Invariant, FK_Index_Invariant, Snapshot_Invariant, Receipt_Uniqueness_Invariant), and the post-deployment communication template.

### Requirement 7: Branch-fork verification before any production touch

**User Story:** As a developer adding a new schema change going forward, I want every Migration_Script to be applied first to a Neon_Branch_Fork and the property and unit suites to run there before the change reaches Production_Database, so that production never receives a Migration_Script whose effects have not been observed end-to-end on real production data.

#### Acceptance Criteria

1. WHEN a developer prepares a new Migration_Script for Production_Database, THE developer SHALL first create a Neon_Branch_Fork from the default branch using the Neon MCP `create_branch` tool.
2. WHEN the Neon_Branch_Fork is ready, THE developer SHALL apply the Migration_Script to the fork using `apply_sql_migrations` and SHALL run `python3 manage.py check_schema_drift --check-fk-indexes --check-migration-history-coverage` against the fork.
3. WHEN the drift-guard run on the Neon_Branch_Fork passes, THE developer SHALL run `python3 -m pytest backend/tests/property/ backend/tests/unit/test_payment_migration_indexes.py` against the fork's connection string.
4. IF the property suite or the migration-index unit test fails on the Neon_Branch_Fork, THEN THE developer SHALL NOT apply the Migration_Script to Production_Database AND SHALL revise the Migration_Script and re-fork.
5. WHEN the property suite passes on the Neon_Branch_Fork, THE developer MAY apply the Migration_Script to Production_Database during a Maintenance_Window per Requirement 1.
6. AFTER the Migration_Script is applied to Production_Database, THE developer SHALL delete the Neon_Branch_Fork using the Neon MCP `delete_branch` tool.

### Requirement 8: Property-based invariants for schema reconciliation

**User Story:** As a developer maintaining the schema-reconciliation tooling, I want property-based tests in `backend/tests/property/` that exercise the FK_Index_Invariant, Coverage_Invariant, Migration_History coverage, and Snapshot_Invariant against many possible configurations, so that the invariants stay enforced even as the schema and the Migration_Script set evolve.

#### Acceptance Criteria

1. THE Schema_Reconciliator SHALL add `backend/tests/property/test_schema_reconciliation_invariants.py` containing four hypothesis-based property tests, one per invariant.
2. THE FK_Index_Invariant property SHALL generate arbitrary subsets of the production-table list, query `information_schema.referential_constraints` joined with `pg_index` for each subset, AND SHALL assert that EVERY foreign-key column on the configured database is covered by a btree index whose first column matches the FK column, with no exceptions.
3. THE Coverage_Invariant property SHALL enumerate every Django model with `Meta.managed = False`, generate arbitrary subsets of those models, AND SHALL assert that for each generated model, every concrete field's `column` attribute exists in `information_schema.columns` for the model's `db_table`.
4. THE Migration_History coverage property SHALL enumerate every `*.sql` file under `backend/scripts/` (excluding `applied/` and `archive/`), generate arbitrary subsets, AND SHALL assert that for each generated filename whose git commit timestamp is strictly older than 7 days, the filename is present in Migration_History on the configured database; for filenames committed within the last 7 days, including filenames committed exactly 7 days ago, the property SHALL allow the filename to be either present or absent from Migration_History without failing.
5. THE Snapshot_Invariant property SHALL generate up to 100 random Payment rows in a transaction, simulate the backfill against them, AND SHALL assert that after the simulated backfill `count(*) FILTER (WHERE NOT (metadata ? 'snapshot')) = 0` holds for every generated batch, then SHALL roll back the transaction.
6. WHEN any of the four property tests fails on the configured database, THE pytest run SHALL exit with a non-zero status code AND SHALL include the failing example in the standard hypothesis-shrunk output for human review.

### Requirement 9: Rollback safety for every applied step

**User Story:** As an operator who must keep 27 real applications and 15 real payments safe, I want every applied Migration_Script to ship with a documented inverse Rollback_Plan kept under version control, so that an unexpected production issue can be reversed without ad-hoc SQL written under pressure.

#### Acceptance Criteria

1. WHEN the Schema_Reconciliator produces a Migration_Script in `backend/scripts/`, THE Schema_Reconciliator SHALL also produce a sibling file with the suffix `_rollback.sql` in the same directory.
2. THE rollback file SHALL contain only inverse-additive operations selected from `DROP INDEX CONCURRENTLY IF EXISTS`, `DROP COLUMN IF EXISTS`, `DROP TABLE IF EXISTS`, and `DELETE FROM migration_history WHERE migration_name = '<filename>'`.
3. THE rollback file SHALL be marked at the top with the comment `-- Reversible inverse of <forward_filename>. Apply only after confirming no application code depends on the structures being dropped.`.
4. WHERE a rollback would touch the `payments` table, the `applications` table, or any column that may contain student data, THE rollback file SHALL begin with a `DO $$ BEGIN RAISE NOTICE ... END $$;` block printing the row count of the affected table so the operator can sanity-check before continuing.
5. THE Schema_Reconciliator SHALL NOT include rollback files in the lexical ordering used by `apply_sql_migrations`; rollback files SHALL be applied manually by an operator with explicit awareness of their effect.
6. WHEN a rollback file is applied to Production_Database, THE operator SHALL record the rollback in `docs/runbooks/schema-reconciliation-runbook.md` with the timestamp, the reason, and the resulting state of Migration_History.
