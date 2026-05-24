# Implementation Plan

## Overview

This plan turns the design into a sequence of code-level tasks. Each task is a discrete, reviewable unit. Tasks marked `[ ]*` are property-based tests; everything else is implementation or verification work. Property tests are written and reviewed alongside the production code they exercise.

The execution order respects the data flow in `design.md` (Component 1 → 10): the `migration_history` extension lands before any other migration relies on its `checksum`/`notes` columns, the FK index backfill lands after the migration plumbing supports CONCURRENTLY mode, and the drift-guard CI lands last so it cannot block its own pre-conditions.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Wave 1 — migration_history extension",
      "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"],
      "rationale": "Extending migration_history must land first because every later migration writes to its new checksum/notes columns. The apply_sql_migrations refactor and additive lint also block subsequent waves."
    },
    {
      "name": "Wave 2 — Migration scripts authored and tested",
      "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6"],
      "rationale": "Once Wave 1's tooling exists, author the reconcile script, FK-index backfill, and rollback siblings for the five pre-existing pending scripts. Property tests confirm rollback pairing and additive-only operations."
    },
    {
      "name": "Wave 3 — Snapshot backfill verification",
      "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5"],
      "rationale": "Audit the existing payment_snapshot_backfill.py against the spec contract, add --verify mode, and write property + unit tests. Independent of Wave 2 in terms of code, but ordered after so the operator runs both during the same maintenance window."
    },
    {
      "name": "Wave 4 — Drift-guard CLI extension",
      "tasks": ["4.1", "4.2", "4.3", "4.4"],
      "rationale": "Extend check_schema_drift with --check-fk-indexes and --check-migration-history-coverage. Property tests in 4.4 exercise the FK_Index_Invariant, Coverage_Invariant, and Migration_History coverage rules."
    },
    {
      "name": "Wave 5 — CI workflow",
      "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"],
      "rationale": "Add the drift-guard job to backend-governance.yml. Depends on Wave 4 because the YAML invokes the new CLI flags. Branch-fork failure-mode property test sits alongside the workflow YAML."
    },
    {
      "name": "Wave 6 — Production rollout",
      "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6"],
      "rationale": "Operator-driven steps: pre-flight on a Neon branch fork, record the maintenance window, apply migrations, run the snapshot backfill, verify post-conditions, delete the fork. Sequential and gated on Waves 1-5."
    },
    {
      "name": "Wave 7 — Documentation",
      "tasks": ["7.1", "7.2", "7.3", "7.4"],
      "rationale": "Update the readiness report, regenerate MIGRATION_HISTORY.md from production, add the canonical-truth-map entry, and author the schema-reconciliation runbook. Last because the documentation captures the reality after Wave 6 completes."
    }
  ]
}
```

```
1.1 ─► 1.2 ─► 1.3 ──┐
                    ▼
        1.4* ◄──── 1.5
                    │
                    ▼
2.1 ─► 2.2 ─► 2.3 ─► 2.4* ─► 2.5* ─► 2.6
                    │
                    ▼
3.1 ─► 3.2 ─► 3.3 ─► 3.4* ─► 3.5
                    │
                    ▼
4.1 ─► 4.2 ─► 4.3 ─► 4.4*
                    │
                    ▼
5.1 ─► 5.2 ─► 5.3 ─► 5.4* ─► 5.5* ─► 5.6
                    │
                    ▼
6.1 ─► 6.2 ─► 6.3 ─► 6.4
                    │
                    ▼
7.1 ─► 7.2 ─► 7.3
```

Phase boundaries: Tasks 1.x must complete before 2.x because the `apply_sql_migrations` refactor depends on the extended `migration_history` schema. Tasks 5.x (CI drift-guard) depend on Tasks 2-4 producing their files so the guard has something to assert against. Tasks 6.x (production rollout) and 7.x (documentation + verification) are sequential at the end.

## Tasks

- [ ] 1. Extend the `migration_history` table and tracking-aware tooling

- [ ] 1.1 Author `2026_05_22_migration_history_extend.sql` and its rollback
  - Create `backend/scripts/2026_05_22_migration_history_extend.sql` containing `ALTER TABLE migration_history ADD COLUMN IF NOT EXISTS checksum TEXT NULL; ADD COLUMN IF NOT EXISTS notes TEXT NULL;` and `CREATE UNIQUE INDEX IF NOT EXISTS uq_migration_history_migration_name ON migration_history (migration_name);`
  - Create `backend/scripts/2026_05_22_migration_history_extend_rollback.sql` containing `DROP INDEX IF EXISTS uq_migration_history_migration_name; ALTER TABLE migration_history DROP COLUMN IF EXISTS notes; DROP COLUMN IF EXISTS checksum;`
  - Add the `-- Reversible inverse of 2026_05_22_migration_history_extend.sql. Apply only after confirming no application code depends on the structures being dropped.` header line to the rollback file
  - _Requirements: 1.2, 9.1, 9.2, 9.3_

- [ ] 1.2 Refactor `apply_sql_migrations` to use `migration_history` as its tracking table
  - Update `backend/apps/common/management/commands/apply_sql_migrations.py` so the default `migrations_dir` resolves to `backend/scripts/` (not `backend/scripts/migrations/`)
  - Replace all references to `applied_sql_migrations` with `migration_history`
  - At command startup, query `information_schema.columns` for `migration_history.checksum`; if absent, exit with `MIGRATION_HISTORY_NOT_EXTENDED: run 2026_05_22_migration_history_extend.sql first` and code 1
  - Skip files inside `backend/scripts/applied/`, `backend/scripts/archive/`, `backend/scripts/migrations/` subdirectories
  - INSERT shape: `INSERT INTO migration_history (migration_name, checksum, applied_at, notes) VALUES (%s, %s, now(), NULL) ON CONFLICT (migration_name) DO NOTHING`
  - _Requirements: 1.4, 1.8_

- [ ] 1.3 Add `CREATE INDEX CONCURRENTLY` split-phase handling to `apply_sql_migrations`
  - Detect the substring `CREATE INDEX CONCURRENTLY` (case-insensitive, after stripping `--` line comments) in each file's body before execution
  - When detected, run the file's SQL via `connection.set_autocommit(True)` for the index build; switch back to default transaction mode and write the `migration_history` row
  - Between phases, query `pg_index` for any indexes referenced by the file where `indisvalid = false` and emit `DROP INDEX CONCURRENTLY IF EXISTS <name>` cleanup
  - On any SQL error during the autocommit phase, skip the migration_history insert and exit code 1
  - _Requirements: 1.5, 1.7_

- [ ]* 1.4 Property test: forward-only `migration_history` tracking
  - Write `backend/tests/property/test_migration_history_forward_only.py` using `hypothesis`
  - Generate sequences of `apply_sql_migrations` runs against a SQLite or local Postgres instance and assert `migration_history` row count is monotonically non-decreasing across the run
  - Generate ON CONFLICT cases (same migration_name re-applied) and assert no duplicate rows result
  - Validates Properties 6, 8 from design.md
  - _Requirements: 1.8, 4.5, 8.6_

- [ ] 1.5 Add additive-only SQL lint to `apply_sql_migrations`
  - Add a pre-execution lint that scans the file body (after stripping `--` comments) for any of: `DROP COLUMN`, `DROP TABLE`, `TRUNCATE`, `DELETE FROM` (without a `WHERE` clause), `ALTER TABLE ... ALTER COLUMN ... TYPE ... USING` (narrowing conversions)
  - Reject the file with `REJECTED_NON_ADDITIVE_OPERATION: <pattern> in <filename>` and exit code 1 unless `--allow-non-additive` is passed
  - Add `--allow-non-additive` argparse flag, default `False`
  - Add unit test `backend/tests/unit/test_apply_sql_migrations_additive_lint.py` covering each rejected pattern and the `--allow-non-additive` bypass
  - _Requirements: 1.2_

- [ ] 2. Backfill `migration_history` and produce the FK index migration

- [ ] 2.1 Author `2026_05_22_migration_history_reconcile.sql` and its rollback
  - Create `backend/scripts/2026_05_22_migration_history_reconcile.sql` containing two `INSERT INTO migration_history (migration_name, checksum, applied_at, notes) VALUES (...) ON CONFLICT (migration_name) DO NOTHING` statements for `payment_hardening_indexes.sql` and `payment_hardening_preflight.sql`
  - Each row's `applied_at` is `now()`, `notes` is `'reconciled-on-2026-05-22; original applied_at not recorded'`, `checksum` is the SHA-256 of the corresponding file in `backend/scripts/applied/` at the time the script is authored (compute with `python -c 'import hashlib; print(hashlib.sha256(open("backend/scripts/applied/payment_hardening_indexes.sql","rb").read()).hexdigest())'` and embed the literal hex)
  - Create `backend/scripts/2026_05_22_migration_history_reconcile_rollback.sql` containing `DELETE FROM migration_history WHERE migration_name IN ('payment_hardening_indexes.sql', 'payment_hardening_preflight.sql') AND notes LIKE 'reconciled-on-2026-05-22%';`
  - Add the reversible-inverse header line to the rollback file
  - _Requirements: 4.1, 4.2, 4.5, 9.1, 9.2_

- [ ] 2.2 Author `2026_05_22_fk_index_backfill.sql` and its rollback
  - Create `backend/scripts/2026_05_22_fk_index_backfill.sql` containing 15 `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_<column> ON <table>(<column>);` statements in this order: `applications.admin_feedback_by`, `applications.assigned_reviewer_id`, `applications.payment_verified_by`, `applications.reviewed_by`, `application_amendments.reviewed_by`, `application_conditions.verified_by`, `application_documents.verified_by`, `application_drafts.application_id`, `application_interviews.created_by`, `application_interviews.updated_by`, `application_status_history.changed_by`, `fee_waivers.approved_by`, `payments.verified_by`, `programs.institution_id`, `settings.updated_by`
  - Create `backend/scripts/2026_05_22_fk_index_backfill_rollback.sql` with the 15 `DROP INDEX CONCURRENTLY IF EXISTS idx_<table>_<column>;` statements in reverse order
  - Add the reversible-inverse header line to the rollback file
  - _Requirements: 2.1, 2.2, 2.5, 9.1, 9.2_

- [ ] 2.3 Author rollback files for the five pre-existing pending scripts
  - For each of `2026_05_18_expand_application_status_columns.sql`, `2026_05_18_hot_query_indexes.sql`, `2026_05_19_seed_communication_templates.sql`, `application_number_sequences.sql`, `system_actor_seed.sql`, create the corresponding `_rollback.sql` sibling using only `DROP COLUMN IF EXISTS`, `DROP INDEX IF EXISTS`, `DROP SEQUENCE IF EXISTS`, `DELETE FROM <table> WHERE <pk> = '<seeded-id>'`, or `DELETE FROM migration_history WHERE migration_name = '<filename>'` — no other statements
  - For any rollback that touches `payments` or `applications`, prepend a `DO $$ BEGIN RAISE NOTICE 'Affected rows in <table>: %', (SELECT count(*) FROM <table>); END $$;` block per Requirement 9.4
  - Add the reversible-inverse header line to each rollback file
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ]* 2.4 Property test: every forward script under `backend/scripts/*.sql` has a `_rollback.sql` sibling
  - Write `backend/tests/property/test_rollback_pairing.py` enumerating every `*.sql` file in `backend/scripts/` that does not end in `_rollback.sql` and asserting a sibling `<basename>_rollback.sql` exists in the same directory
  - Exclude `00_full_schema.sql`, `legacy_columns_drop_2026_08_15.sql` (deliberately not applied), and any file inside `applied/` / `archive/`
  - Validates Requirement 9.1
  - _Requirements: 9.1_

- [ ]* 2.5 Property test: rollback files contain only inverse-additive operations
  - Write `backend/tests/property/test_rollback_safe_operations.py` reading every `*_rollback.sql` file under `backend/scripts/` and asserting after stripping `--` comments and `DO $$` notice blocks that every non-empty line starts with one of: `DROP INDEX`, `DROP COLUMN`, `DROP TABLE`, `DROP SEQUENCE`, `DELETE FROM migration_history`, `DELETE FROM <table> WHERE`
  - Reject any line containing `TRUNCATE`, `DELETE FROM <table>` without a `WHERE`, `ALTER TABLE ... ADD`, `CREATE`, or `INSERT`
  - Validates Requirement 9.2
  - _Requirements: 9.2_

- [ ] 2.6 Add a unit test that the `2026_05_22_fk_index_backfill.sql` script lists exactly the 15 unindexed FK columns
  - Write `backend/tests/unit/test_fk_index_backfill_completeness.py` parsing the script and asserting the set of `CREATE INDEX CONCURRENTLY` statements exactly matches the list in design.md Component 5
  - On a Postgres connection (skip when no DB available), assert the 15 named indexes do not yet exist before the script runs and do exist after
  - _Requirements: 2.1, 2.6_

- [ ] 3. Verify the snapshot backfill works against production data shape

- [ ] 3.1 Audit `payment_snapshot_backfill.py` against the spec contract
  - Read `backend/scripts/payment_snapshot_backfill.py`; confirm: streaming via `iterator(chunk_size=200)`, transaction batches of 200 IDs, `select_for_update` per row, ambiguous-row WARNING + skip, idempotent re-run via `Q(metadata__isnull=True) | ~Q(metadata__has_key='snapshot')` filter, `--dry-run` flag
  - If any of the above is missing, file the gap as a separate sub-task and resolve before continuing
  - _Requirements: 3.1, 3.2, 3.4, 3.5_

- [ ] 3.2 Verify the existing fallback path for `FeeResolver.resolve_for_payment_snapshot` absence
  - Confirm the script's `_build_snapshot` helper composes the snapshot from `FeeResolver.resolve_fee` + Application/Payment fields when the design-spec method is missing
  - Confirm `fee_source: "backfill"` is set on the fallback path
  - _Requirements: 3.1_

- [ ] 3.3 Add a `--verify` mode to the backfill script
  - Add `--verify` argparse flag that runs `SELECT count(*) FILTER (WHERE NOT (metadata ? 'snapshot')) FROM payments` and exits 0 only when the count is 0
  - Print `verify: count_without_snapshot=<n>` regardless of exit code
  - Used in Task 6.5 as the production post-condition check
  - _Requirements: 3.3_

- [ ]* 3.4 Property test: `Snapshot_Invariant` holds after simulated backfill
  - Write `backend/tests/property/test_schema_reconciliation_invariants.py::test_snapshot_invariant_holds_after_simulated_backfill`
  - Use `hypothesis.strategies.integers(min_value=1, max_value=100)` to generate batch sizes; INSERT that many synthetic Payment rows in a transaction, run the simulated backfill (`UPDATE payments SET metadata = jsonb_set(metadata, '{snapshot}', '{}'::jsonb) WHERE NOT (metadata ? 'snapshot')`), assert post-condition, ROLLBACK
  - Validates Requirement 8.5
  - _Requirements: 3.3, 8.5_

- [ ] 3.5 Add unit test for the backfill's ambiguous-row skip path
  - Write `backend/tests/unit/test_payment_snapshot_backfill_ambiguous.py` mocking an Application with `program=''` and asserting the backfill emits `WARNING: payment <id> ambiguous` and increments `skipped_ambiguous` without raising
  - Confirm the row's `metadata` is unchanged after the call
  - _Requirements: 3.4_

- [ ] 4. Extend the drift-guard with new flags

- [ ] 4.1 Add `--check-fk-indexes` to `check_schema_drift`
  - Update `backend/apps/common/management/commands/check_schema_drift.py` to accept `--check-fk-indexes` argparse flag
  - Implement the SQL query joining `information_schema.referential_constraints`, `information_schema.key_column_usage`, `information_schema.constraint_column_usage`, and `pg_index` to find FK columns whose first-attribute btree index is missing or `indisvalid = false`
  - Print one line per gap as `MISSING_FK_INDEX: <table>.<column> -> <ref_table>.<ref_column>` and contribute to non-zero exit
  - When the flag is omitted, the success line shows `fk-indexes=disabled`
  - _Requirements: 5.1, 5.4, 5.6_

- [ ] 4.2 Add `--check-migration-history-coverage` to `check_schema_drift`
  - Add `--check-migration-history-coverage` argparse flag and `--commit-window-days <int>` (default `7`)
  - Enumerate `backend/scripts/*.sql` excluding `applied/`, `archive/`, and `migrations/` subdirectories; exclude any filename ending in `_rollback.sql`
  - For each file, get the most recent commit timestamp via `git log -1 --format=%cI -- <file>`
  - For files committed strictly more than `commit_window_days` ago and whose basename is absent from `migration_history`, print `STALE_UNRECORDED_MIGRATION: <filename> committed=<iso8601>` and contribute to non-zero exit
  - On `git` failure, fall back to filesystem mtime and emit `UNTRACKED_MIGRATION_SCRIPT: <filename> source=mtime`
  - _Requirements: 5.2, 5.3_

- [ ] 4.3 Update the success line to the structured `OK:` form
  - When all enabled checks pass, print exactly one line of the form `OK: schema-drift=<n> fk-indexes=<m> migration-history=<k>` where `<n>`, `<m>`, `<k>` are the count of items checked or the literal `disabled` when the flag is omitted
  - Preserve existing "no schema drift" success message structure when no new flags are passed (backwards compat)
  - _Requirements: 5.6_

- [ ]* 4.4 Property tests: drift-guard correctness
  - Write `backend/tests/property/test_schema_reconciliation_invariants.py::test_fk_index_invariant_holds`, `test_coverage_invariant_holds`, and `test_migration_history_coverage` per design.md Component 9
  - Each property test uses `hypothesis.given(st.data())` to generate arbitrary subsets of FKs/models/migration files
  - Configure each with `@settings(max_examples=25, deadline=2000)` per Requirement 8.1
  - Validates Requirements 8.1 through 8.5
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 5. Add the CI drift-guard job

- [ ] 5.1 Add the `drift-guard` job to `.github/workflows/backend-governance.yml`
  - Append the `drift-guard` job per design.md Component 7
  - Trigger paths: `backend/**`, `backend/scripts/**`, `.github/workflows/backend-governance.yml`
  - Use `actions/checkout@v4` with `fetch-depth: 0` so `git log` timestamps work
  - Add `NEON_API_KEY` to the GitHub Actions secrets via the repository UI (one-shot operator step; not in code)
  - _Requirements: 5.7_

- [ ] 5.2 Implement the Neon branch-fork creation step
  - Use `curl` to POST to `https://console.neon.tech/api/v2/projects/wild-bar-37055823/branches` with `name = "ci-drift-guard-${GITHUB_RUN_ID}"`, request body includes `endpoints: [{type: "read_write"}]`
  - Parse `branch.id` and `connection_uris[0].connection_uri` from the response with `jq`
  - On parse or HTTP failure, print `NEON_BRANCH_FORK_UNAVAILABLE: <error>` and exit 1
  - Export `DATABASE_URL=<connection_uri>` to `$GITHUB_ENV` so subsequent steps connect to the fork
  - Save `branch_id` to `$GITHUB_OUTPUT` for the cleanup step
  - _Requirements: 5.7, 5.9_

- [ ] 5.3 Run the drift-guard against the fork
  - Execute `python3 manage.py check_schema_drift --check-fk-indexes --check-migration-history-coverage` from the `backend/` working directory
  - Step fails the job on non-zero exit
  - _Requirements: 5.7_

- [ ]* 5.4 Property test: CI workflow YAML schema
  - Write `backend/tests/property/test_ci_drift_guard_workflow.py` parsing `.github/workflows/backend-governance.yml` and asserting: a `drift-guard` job exists, `fetch-depth: 0` on its checkout step, `if: always()` on the cleanup step, `NEON_API_KEY` referenced via `secrets.NEON_API_KEY`, the drift-guard CLI is invoked with both `--check-fk-indexes` and `--check-migration-history-coverage`
  - Validates Requirements 5.7, 5.8
  - _Requirements: 5.7, 5.8_

- [ ]* 5.5 Property test: branch-fork failure mode emits the canonical line
  - Write `backend/tests/property/test_ci_branch_fork_failure_mode.py` parsing the workflow YAML and asserting the fork-creation step contains literal `NEON_BRANCH_FORK_UNAVAILABLE` in its failure-handling block
  - Validates Requirement 5.9
  - _Requirements: 5.9_

- [ ] 5.6 Implement the always-run cleanup step
  - Add a final step with `if: always()` that DELETEs the fork via `curl -X DELETE https://console.neon.tech/api/v2/projects/wild-bar-37055823/branches/<branch_id>`
  - On HTTP failure, print `NEON_BRANCH_FORK_CLEANUP_FAILED: <iso8601>` but do not change the outer exit code
  - Validates Requirements 5.8
  - _Requirements: 5.8_

- [ ] 6. Apply the reconciliation to production

- [ ] 6.1 Pre-flight on a Neon branch fork
  - Operator action: create a Neon branch fork via the Neon MCP `create_branch` tool, branch name `pre-prod-reconcile-2026-05-22`
  - Run `DATABASE_URL=<fork_conn> python3 manage.py apply_sql_migrations --dry-run`; review the listed pending files and confirm the order matches design.md §Data Flow
  - Run `DATABASE_URL=<fork_conn> python3 manage.py apply_sql_migrations` and confirm zero errors
  - Run `DATABASE_URL=<fork_conn> python3 manage.py check_schema_drift --strict --check-fk-indexes --check-migration-history-coverage` and confirm `OK: ...` exit 0
  - Run `DATABASE_URL=<fork_conn> python3 -m pytest backend/tests/property/ backend/tests/unit/test_payment_migration_indexes.py` and confirm green
  - Capture `EXPLAIN ANALYZE` plans for one representative join per FK-indexed table; save to `docs/runbooks/schema-reconciliation-runbook.md`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 2.3_

- [ ] 6.2 Record the maintenance window
  - Add an entry to `docs/runbooks/schema-reconciliation-runbook.md` with start timestamp (ISO 8601 UTC), expected duration (estimate `30 min`), and the list of migration scripts being applied in order
  - Pre-announce the window via the operator's standard channel (out-of-band; not code)
  - _Requirements: 1.9, 1.10_

- [ ] 6.3 Apply migrations to production
  - Operator action: run `DATABASE_URL=<prod_conn> python3 manage.py apply_sql_migrations` against the production default branch during the maintenance window
  - Watch for the per-file `OK` log output; if any file fails, stop, capture the error, and follow the rollback playbook
  - _Requirements: 1.1, 7.5_

- [ ] 6.4 Run the snapshot backfill against production
  - Operator action: `DATABASE_URL=<prod_conn> python3 backend/scripts/payment_snapshot_backfill.py --dry-run` and confirm exactly 2 planned writes (matching the live audit finding)
  - Then `DATABASE_URL=<prod_conn> python3 backend/scripts/payment_snapshot_backfill.py` and confirm `updated=2, skipped_ambiguous=0`
  - _Requirements: 3.1, 3.2_

- [ ] 6.5 Run post-condition verification queries on production
  - Operator action: run the four verification queries from design.md §Testing Strategy "Production verification queries" and confirm each returns the expected output (0 rows or 0 count for the gap queries; 10 rows for the migration_history coverage query)
  - Run `DATABASE_URL=<prod_conn> python3 backend/scripts/payment_snapshot_backfill.py --verify` and confirm exit 0 with `verify: count_without_snapshot=0`
  - Run `DATABASE_URL=<prod_conn> python3 manage.py check_schema_drift --strict --check-fk-indexes --check-migration-history-coverage` and confirm `OK: ...` exit 0
  - _Requirements: 2.6, 3.3_

- [ ] 6.6 Delete the pre-production Neon branch fork
  - Operator action: invoke the Neon MCP `delete_branch` tool against `pre-prod-reconcile-2026-05-22`
  - Confirm via the Neon dashboard the fork is gone
  - _Requirements: 7.6_

- [ ] 7. Update the documentation to match `information_schema` reality

- [ ] 7.1 Refresh `PRODUCTION-READINESS-FIX-REPORT-2026-05-19.md` (or successor)
  - Either edit the existing file in place or create `PRODUCTION-READINESS-RECONCILIATION-REPORT-2026-05-22.md` with the corrections per design.md Component 10
  - Replace "72 tables" with the verified 35-table count and cite `information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'` as the source
  - Replace "all FKs indexed" with a 4-column table (`table`, `column`, `index_name`, `applied_at`) listing the 15 indexes added by the reconciliation
  - Correct the settings module reference from `production.py` to `config.settings.prod`
  - Replace any UNIQUE-table-constraint claim about `payments.receipt_number` with the partial-unique-index wording
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 7.2 Regenerate `backend/scripts/MIGRATION_HISTORY.md` from production
  - Run `psql <prod_conn> -c "SELECT migration_name, applied_at, notes FROM migration_history ORDER BY applied_at"` and use the result to regenerate the markdown table in `MIGRATION_HISTORY.md`
  - Mark every present row as `Applied = Y` with the recorded `applied_at` timestamp
  - _Requirements: 6.5_

- [ ] 7.3 Add `migration_history` to `docs/canonical-truth-map.md`
  - Append a row to the canonical truth map with concept = `schema migration tracking`, source-of-truth = `migration_history table on production Neon project wild-bar-37055823`, mirrors = `backend/scripts/MIGRATION_HISTORY.md (manual mirror, regenerated after reconciliation)`, drift-guard = `check_schema_drift --check-migration-history-coverage`
  - _Requirements: 6.6_

- [ ] 7.4 Author `docs/runbooks/schema-reconciliation-runbook.md`
  - Sections in this exact order: pre-flight checklist, per-step maintenance window expectations, per-step rollback plan, verification queries (Coverage_Invariant, FK_Index_Invariant, Snapshot_Invariant, Receipt_Uniqueness_Invariant), post-deployment communication template
  - Include the EXPLAIN ANALYZE plans captured in Task 6.1 under the FK_Index_Invariant section
  - Include the literal SQL of each verification query so an operator can copy-paste during an incident
  - _Requirements: 6.7, 9.6_

## Mapping back to requirements

Every spec acceptance criterion in `requirements.md` is covered by at least one task above. High-risk areas (FK index correctness, snapshot completion, drift-guard accuracy) carry both unit and property tests. Tasks marked with `[ ]*` are property tests that must run alongside the implementation tasks they validate.

## Notes

- All schema changes are additive and reversible — every forward script ships with a `_rollback.sql` sibling.
- Production rollout (Wave 6) is operator-driven, not automated. CI does not orchestrate production schema changes.
- The `NEON_API_KEY` secret needed for the CI drift-guard job is added once via the GitHub Actions UI; it's not in code.
- `payment_snapshot_backfill.py` already exists and meets the spec; Task 3.1 is an audit, not a rewrite. Only the `--verify` mode (Task 3.3) is genuinely new code there.
- Tasks 6.1–6.6 require live access to the production Neon project (`wild-bar-37055823`) and a maintenance window. They cannot be run by an automated agent; they're listed here as the operator's checklist.
- After Wave 7 completes, set `"status": "completed"` in `.kiro/specs/production-schema-reconciliation/.config.kiro` per the steering convention.
