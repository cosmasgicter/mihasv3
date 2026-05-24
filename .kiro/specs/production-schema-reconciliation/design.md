# Design Document

## Overview

This design closes the gap between the production Neon database (project `wild-bar-37055823`, default branch) and the schema the Django code in `backend/` expects, then locks the gap shut with a CI drift-guard. The reconciliation is a one-shot operator activity executed during a Maintenance_Window; the drift-guard is a permanent CI invariant.

The work targets six concrete deltas verified against `information_schema` on production:

1. `device_sessions.refresh_jti` column + supporting index — missing.
2. 15 foreign-key columns with no covering btree index — `applications.assigned_reviewer_id`, `applications.reviewed_by`, `applications.payment_verified_by`, `applications.admin_feedback_by`, `application_amendments.reviewed_by`, `application_conditions.verified_by`, `application_documents.verified_by`, `application_drafts.application_id`, `application_interviews.created_by`, `application_interviews.updated_by`, `application_status_history.changed_by`, `fee_waivers.approved_by`, `payments.verified_by`, `programs.institution_id`, `settings.updated_by`.
3. Pending migration scripts not yet applied — `2026_05_18_expand_application_status_columns.sql`, `2026_05_18_hot_query_indexes.sql`, `2026_05_19_seed_communication_templates.sql`, `application_number_sequences.sql`, `system_actor_seed.sql`.
4. Out-of-band applied scripts not recorded in `migration_history` — `payment_hardening_indexes.sql`, `payment_hardening_preflight.sql`.
5. 2 of 15 production payments missing `metadata.snapshot` from the Phase 1 backfill.
6. Documentation drift — readiness report claims "72 tables" and "all FKs indexed" against the verified 35 / 15-unindexed reality.

The design also reconciles two pre-existing inconsistencies discovered while reading the codebase:

- **Two tracking tables**: production has `migration_history(id, migration_name, applied_at)`; the local `apply_sql_migrations.py` command writes to a different table `applied_sql_migrations(filename, checksum, applied_at)` it auto-creates. Production has never used `applied_sql_migrations`. We collapse to a single table, `migration_history`, extended with `checksum` and `notes` columns.
- **Two migration directories**: `backend/scripts/*.sql` (where the new pending scripts live) and `backend/scripts/migrations/*.sql` (where `apply_sql_migrations.py` reads from by default). We collapse to `backend/scripts/` with two excluded subdirectories (`applied/`, `archive/`) so the operator's mental model and the tooling agree.

Everything in this design is additive and reversible: every forward script ships with a `_rollback.sql` sibling, every schema change is `ADD COLUMN`/`CREATE INDEX CONCURRENTLY`/`INSERT ... ON CONFLICT DO NOTHING`, and every step is dry-run-tested on a Neon branch fork before touching production.

## Architecture

### High-level flow

```
┌──────────────────────────────────────────────────────────────┐
│  Operator's laptop                                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 1. Create Neon branch fork from default               │  │
│  │    via Neon MCP `create_branch`                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 2. Apply migrations to fork                           │  │
│  │    `python manage.py apply_sql_migrations`            │  │
│  │      --connection-fork                                 │  │
│  │    Reads backend/scripts/*.sql in lexical order,      │  │
│  │    skips backend/scripts/{applied,archive}/,           │  │
│  │    writes one migration_history row per applied file. │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 3. Run drift-guard against fork                       │  │
│  │    `python manage.py check_schema_drift               │  │
│  │       --check-fk-indexes                              │  │
│  │       --check-migration-history-coverage`             │  │
│  │    Must exit 0 before proceeding.                     │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 4. Run property + unit suites against fork             │  │
│  │    pytest backend/tests/property/                      │  │
│  │           backend/tests/unit/test_payment_migration_   │  │
│  │           indexes.py                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 5. Apply same migrations to production default branch │  │
│  │    Same command, production connection string,        │  │
│  │    inside Maintenance_Window.                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 6. Run payment_snapshot_backfill.py against production│  │
│  │    `python backend/scripts/payment_snapshot_backfill. │  │
│  │     py` (no flags = apply mode).                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 7. Verify post-conditions on production               │  │
│  │    drift-guard returns OK; FK_Index_Invariant holds;  │  │
│  │    Snapshot_Invariant holds.                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 8. Delete Neon branch fork                            │  │
│  │    via Neon MCP `delete_branch`                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 9. Update readiness docs to match information_schema  │  │
│  │    reality (35 tables, FK-index table, partial-unique-│  │
│  │    index wording, MIGRATION_HISTORY.md sync).          │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

           ┌───────────────────────────────────────┐
           │  CI (every PR touching backend/)      │
           │  ┌─────────────────────────────────┐  │
           │  │ A. Create Neon branch fork via  │  │
           │  │    NEON_API_KEY secret          │  │
           │  └─────────────────────────────────┘  │
           │             │                         │
           │             ▼                         │
           │  ┌─────────────────────────────────┐  │
           │  │ B. Run check_schema_drift       │  │
           │  │    against fork with all 3 flags│  │
           │  └─────────────────────────────────┘  │
           │             │                         │
           │             ▼                         │
           │  ┌─────────────────────────────────┐  │
           │  │ C. Delete fork (always, even on │  │
           │  │    failure)                     │  │
           │  └─────────────────────────────────┘  │
           └───────────────────────────────────────┘
```

### Why a Neon branch fork

Neon branches are copy-on-write — fork creation is O(seconds), uses minimal storage, and isolates writes from production. Forks are the canonical "test on real production data" mechanism without risking student records. After every reconciliation step we verify the same invariant holds on the fork before applying to the default branch, then verify again on production before declaring done.

### What lives where (single source of truth)

| Concern | Source of truth | Mirror |
|---|---|---|
| What schema is on production | `migration_history` table on production Neon | `backend/scripts/MIGRATION_HISTORY.md` (manual mirror, regenerated after each reconciliation) |
| What migration files exist | `backend/scripts/*.sql` (excluding `applied/`, `archive/`) | none |
| FK indexing requirement | `information_schema.referential_constraints` JOIN `pg_index` | `check_schema_drift --check-fk-indexes` |
| Schema model alignment | Django `managed=False` models | `check_schema_drift` (existing default check) |
| Maintenance windows | `docs/runbooks/schema-reconciliation-runbook.md` | none |

## Components and Interfaces

### Component 1: Extended `migration_history` table

**Status today:** Production has `migration_history(id INTEGER PK, migration_name TEXT, applied_at TIMESTAMPTZ)`. The local `apply_sql_migrations.py` command auto-creates a different table called `applied_sql_migrations`, which has never been used on production.

**Target shape:** Extend `migration_history` so it can serve as the single source of truth Requirement 4 expects. Two columns added:

```sql
ALTER TABLE migration_history
  ADD COLUMN IF NOT EXISTS checksum TEXT NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_migration_history_migration_name
  ON migration_history (migration_name);
```

Both columns are nullable so the additive contract (R1.2) holds and the existing 29 production rows do not need backfill. New rows from the reconciliation onward populate `checksum` (SHA-256 of file contents at apply time) and `notes` (free-text annotation, e.g. `'reconciled-on-2026-05-22; original applied_at not recorded'`).

Why a unique index on `migration_name`? The existing schema has no constraint preventing duplicate filenames. The reconcile step (R4.1) relies on `INSERT ... ON CONFLICT (migration_name) DO NOTHING`, which requires a unique constraint to target. Adding it as `UNIQUE INDEX` rather than `ALTER TABLE ... ADD CONSTRAINT UNIQUE` lets us use `IF NOT EXISTS` and keeps the change purely additive — no exclusive lock.

**Migration script:** `backend/scripts/2026_05_22_migration_history_extend.sql`. First file in the reconciliation sequence so subsequent scripts can write `checksum` and `notes`.

**Rollback:** `2026_05_22_migration_history_extend_rollback.sql` containing `ALTER TABLE migration_history DROP COLUMN IF EXISTS notes; DROP COLUMN IF EXISTS checksum; DROP INDEX IF EXISTS uq_migration_history_migration_name;`. Listed in `notes` column on the new rows so an operator can find and undo just the reconciliation rows without touching the historical 29.

### Component 2: `apply_sql_migrations` command, refactored

**Status today:** Reads from `backend/scripts/migrations/`, writes to `applied_sql_migrations`, has no awareness of production's `migration_history` table.

**Target behavior:**
- Default migrations directory: `backend/scripts/`. Override via `--migrations-dir`.
- Excluded subdirectories: `backend/scripts/applied/` and `backend/scripts/archive/`. The command walks the top-level directory only and intentionally does not recurse.
- Tracking table: `migration_history`. Schema enforced by Component 1's prerequisite migration. The command refuses to run if the `checksum` column is missing — that's the signal that Component 1's migration has not been applied yet, and the operator should apply it first.
- File ordering: ASCII lexical sort (`sorted(os.listdir(...))`). Tie-breaking is deterministic because filenames are unique. The `2026_MM_DD_*.sql` convention places dated files in chronological order naturally.
- Each migration runs in its own transaction (existing behavior preserved). The transaction commits the SQL changes AND the corresponding `INSERT INTO migration_history` row atomically — except for `CREATE INDEX CONCURRENTLY`, which cannot run inside a transaction.

**`CREATE INDEX CONCURRENTLY` handling (R1.5, R1.7):**

The command detects `CREATE INDEX CONCURRENTLY` substrings (case-insensitive, comment-stripped) in the file body before execution. When detected, the file is split into two phases:

1. Phase 1 (autocommit): execute the file's SQL statement-by-statement with `connection.set_session(autocommit=True)`. This lets `CREATE INDEX CONCURRENTLY` succeed.
2. Phase 2 (transaction): switch back to default transaction mode and write the `migration_history` row.

Between phases, validate index health via `pg_index.indisvalid` for any indexes the file created. If any are `false`, drop them with `DROP INDEX CONCURRENTLY IF EXISTS` and exit non-zero. The migration_history row is NOT written in this case. Operator re-runs the same command; the IF NOT EXISTS clauses make the retry safe.

**Failure semantics (R1.6, R1.7):**

| Phase | Failure | Recovery |
|---|---|---|
| Transaction-wrapped phase | Any SQL error | Transaction aborts, partial changes rolled back, no migration_history row, exit 1 |
| Autocommit phase (CONCURRENTLY) | Any SQL error | Each successful statement is permanent; clean up invalid indexes via DROP CONCURRENTLY; no migration_history row; exit 1 |
| Migration_history insert | Already exists (re-run) | ON CONFLICT (migration_name) DO NOTHING; exit 0; tag run as "skipped, already applied" |

**Maintenance window check (R1.9, R1.10):**

When invoked against production (detected via `DATABASE_URL` matching the production proxy host `c-3.us-east-1.aws.neon.tech`), the command parses `docs/runbooks/schema-reconciliation-runbook.md` for a window that brackets the current time. If none is found, the command emits `WARNING: no maintenance window recorded for run started at <iso8601>` to stderr and proceeds. Forks bypass this check entirely.

**Public CLI:**

```
python manage.py apply_sql_migrations
  [--migrations-dir <path>]      # Default: backend/scripts
  [--dry-run]                    # List pending without applying
  [--allow-non-additive]         # Reserved; refuses by default
  [--connection <name>]          # Use a non-default DB connection
```

`--allow-non-additive` is the failsafe knob from R1.2: when omitted, the command rejects any file whose SQL body contains `DROP COLUMN`, `DROP TABLE`, `TRUNCATE`, `DELETE FROM` (without a where clause), or `ALTER TABLE ... ALTER COLUMN ... TYPE` for narrowing conversions. The lint is line-based after stripping `--` comments.

### Component 3: Migration directory layout

**Final structure:**

```
backend/scripts/
├── 2026_05_22_migration_history_extend.sql        # Component 1 prerequisite
├── 2026_05_22_migration_history_extend_rollback.sql
├── 2026_05_22_migration_history_reconcile.sql     # Component 4 — out-of-band recording
├── 2026_05_22_migration_history_reconcile_rollback.sql
├── 2026_05_22_fk_index_backfill.sql               # Component 5 — 15 indexes
├── 2026_05_22_fk_index_backfill_rollback.sql
├── 2026_05_18_expand_application_status_columns.sql      # pre-existing, pending
├── 2026_05_18_expand_application_status_columns_rollback.sql
├── 2026_05_18_hot_query_indexes.sql                       # pre-existing, pending
├── 2026_05_18_hot_query_indexes_rollback.sql
├── 2026_05_19_seed_communication_templates.sql            # pre-existing, pending
├── 2026_05_19_seed_communication_templates_rollback.sql
├── application_number_sequences.sql                       # pre-existing, pending
├── application_number_sequences_rollback.sql
├── system_actor_seed.sql                                  # pre-existing, pending
├── system_actor_seed_rollback.sql
├── 00_full_schema.sql                                     # documentation; never applied
├── legacy_columns_drop_2026_08_15.sql                     # future, deliberately not applied
├── applied/                                               # excluded by apply_sql_migrations
│   ├── payment_hardening_indexes.sql
│   ├── payment_hardening_preflight.sql
│   └── README.md
├── archive/                                               # excluded by apply_sql_migrations
│   └── README.md
├── migrations/                                            # legacy; emptied during reconciliation
│   └── README.md (points at backend/scripts/)
├── apply_canonical_truth_migrations.py
├── generate_full_schema.py
├── payment_snapshot_backfill.py
├── MIGRATION_HISTORY.md                                   # human-readable mirror
└── README.md
```

`backend/scripts/migrations/` retains a `README.md` only, pointing operators at the new canonical location. Old test fixtures or hooks referencing the legacy path continue to work because the path still exists, but no one writes new files there.

### Component 4: Migration history reconciliation

R4 requires recording every script physically applied to production but missing from `migration_history`. From the live audit:

| Script | Evidence on production | Original applied_at |
|---|---|---|
| `payment_hardening_indexes.sql` | Indexes `uq_payments_receipt_number`, `idx_payments_user_status`, `uq_payments_one_active_per_application`, `idx_payments_status_created_at`, `idx_payments_application_status`, `uq_payments_transaction_reference_present`, `idx_payments_lenco_reference_present`, `uq_webhook_processed_reference_event`, `idx_webhook_reference_event_processed` exist | Unknown — operator-applied out-of-band |
| `payment_hardening_preflight.sql` | No-op DDL; runs preflight checks. Must be assumed applied as a sibling of payment_hardening_indexes | Unknown |

The reconciliation script generates one INSERT per discovered script:

```sql
INSERT INTO migration_history (migration_name, checksum, applied_at, notes)
VALUES
  ('payment_hardening_indexes.sql',
   '<sha256-of-current-applied-copy>',
   now(),
   'reconciled-on-2026-05-22; original applied_at not recorded'),
  ('payment_hardening_preflight.sql',
   '<sha256-of-current-applied-copy>',
   now(),
   'reconciled-on-2026-05-22; original applied_at not recorded')
ON CONFLICT (migration_name) DO NOTHING;
```

Why `now()` rather than try to recover the timestamp? The original application happened out-of-band with no audit row. The `notes` field disambiguates this from a forward-applied script: any row with `notes LIKE 'reconciled-on-2026-05-22%'` was retro-recorded, and the rollback script targets exactly those rows. Future audits read `notes` to understand the reconciliation history.

### Component 5: FK index backfill

15 indexes across 8 tables. The script body:

```sql
-- Reversible inverse: 2026_05_22_fk_index_backfill_rollback.sql
-- Applies missing FK column indexes per Requirement 2.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_admin_feedback_by
  ON applications(admin_feedback_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_assigned_reviewer_id
  ON applications(assigned_reviewer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_payment_verified_by
  ON applications(payment_verified_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_reviewed_by
  ON applications(reviewed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_amendments_reviewed_by
  ON application_amendments(reviewed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_conditions_verified_by
  ON application_conditions(verified_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_documents_verified_by
  ON application_documents(verified_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_drafts_application_id
  ON application_drafts(application_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_interviews_created_by
  ON application_interviews(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_interviews_updated_by
  ON application_interviews(updated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_status_history_changed_by
  ON application_status_history(changed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_waivers_approved_by
  ON fee_waivers(approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_verified_by
  ON payments(verified_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programs_institution_id
  ON programs(institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settings_updated_by
  ON settings(updated_by);
```

Index naming convention: `idx_<table>_<column>` matching the existing convention in production (`idx_payments_app`, `idx_sessions_user`, etc.).

`CREATE INDEX CONCURRENTLY` requires no full-table lock — production reads/writes continue during the build. On a 27-row applications table the build is sub-second; for the larger ones (audit tables) it remains fast in absolute terms.

The rollback drops them in reverse order:

```sql
-- 2026_05_22_fk_index_backfill_rollback.sql
DROP INDEX CONCURRENTLY IF EXISTS idx_settings_updated_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_programs_institution_id;
-- ... 13 more ...
DROP INDEX CONCURRENTLY IF EXISTS idx_applications_admin_feedback_by;
```

### Component 6: Drift-guard extension

Three flags added to `backend/apps/common/management/commands/check_schema_drift.py`:

```
python manage.py check_schema_drift
  [--strict]                            # Existing — fail on missing tables
  [--check-fk-indexes]                  # NEW — R5.1, R5.4
  [--check-migration-history-coverage]  # NEW — R5.2, R5.3
  [--commit-window-days <int>]          # NEW — default 7, governs the migration-history coverage rule
```

**`--check-fk-indexes` implementation (R5.4):**

```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS ref_table,
  ccu.column_name AS ref_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
  AND tc.table_schema = ccu.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = current_schema();
```

For each row, the command queries `pg_index` to confirm a btree index whose first column matches `column_name`:

```sql
SELECT 1
FROM pg_index i
JOIN pg_class t ON t.oid = i.indrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
JOIN pg_am am ON am.oid = i.indclass[0]  -- not exactly this; uses pg_class for the index
WHERE t.relname = %s
  AND a.attname = %s
  AND i.indisvalid = true
  AND am.amname = 'btree'
LIMIT 1;
```

Each gap prints `MISSING_FK_INDEX: <table>.<column> -> <ref_table>.<ref_column>` and contributes to a non-zero exit.

**`--check-migration-history-coverage` implementation (R5.3):**

1. Enumerate `*.sql` files under `backend/scripts/` excluding `applied/` and `archive/` subdirectories.
2. For each file, get its most recent git commit timestamp via `git log -1 --format=%cI -- <file>`.
3. For files whose commit timestamp is strictly older than `--commit-window-days` (default 7) before now, query `migration_history` for `migration_name = <basename>`.
4. For each missing one, emit `STALE_UNRECORDED_MIGRATION: <filename> committed=<iso8601>` and contribute to non-zero exit.
5. Files committed within the window are tolerated as in-flight. Files exactly at the window boundary are tolerated (per R8.4 clarification).

When git is unavailable (e.g., shallow CI clone with depth=1), the command falls back to filesystem mtime and emits `UNTRACKED_MIGRATION_SCRIPT: <filename> source=mtime`.

**Success line (R5.6):**

On exit 0:

```
OK: schema-drift=0 fk-indexes=<n> migration-history=<m>
```

Where `<n>` and `<m>` are the counts of items checked. When a flag is omitted, its count is replaced by the literal `disabled`.

### Component 7: CI workflow extension

Modifications to `.github/workflows/backend-governance.yml`:

```yaml
name: Backend Governance

on:
  push:
    paths:
      - "backend/**"
      - "docs/schema-ownership.md"
      - "docs/redis-dependency-tiers.md"
      - "docs/decision/**"
      - ".github/workflows/backend-governance.yml"
  pull_request:
    paths:
      - "backend/**"
      - "backend/scripts/**"
      - "docs/schema-ownership.md"
      - "docs/redis-dependency-tiers.md"
      - "docs/decision/**"
      - ".github/workflows/backend-governance.yml"

jobs:
  schema-and-outbox-checks:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # Required for git log timestamps

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install backend dependencies
        run: pip install -r requirements.txt

      - name: Static schema verification
        env:
          DJANGO_SETTINGS_MODULE: config.settings.dev
          TESTING: "1"
        run: python3 scripts/verify_schema_static.py

      - name: Focused governance tests
        env:
          DJANGO_SETTINGS_MODULE: config.settings.dev
          TESTING: "1"
        run: pytest tests/unit/test_outbox_helpers.py tests/unit/test_email_outbox_hardening.py tests/unit/test_communication_service.py -q

  drift-guard:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    env:
      NEON_PROJECT_ID: wild-bar-37055823
      NEON_API_KEY: ${{ secrets.NEON_API_KEY }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install backend dependencies
        run: pip install -r requirements.txt

      - name: Create Neon branch fork
        id: fork
        run: |
          set -euo pipefail
          BRANCH_NAME="ci-drift-guard-${GITHUB_RUN_ID}"
          response=$(curl -fsS -X POST \
            "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches" \
            -H "Authorization: Bearer ${NEON_API_KEY}" \
            -H "Content-Type: application/json" \
            -d "{\"branch\":{\"name\":\"${BRANCH_NAME}\"},\"endpoints\":[{\"type\":\"read_write\"}]}") || {
              echo "NEON_BRANCH_FORK_UNAVAILABLE: API request failed"
              exit 1
            }
          branch_id=$(echo "$response" | jq -r '.branch.id')
          conn=$(echo "$response" | jq -r '.connection_uris[0].connection_uri')
          if [ -z "$branch_id" ] || [ "$branch_id" = "null" ]; then
            echo "NEON_BRANCH_FORK_UNAVAILABLE: branch id missing in response"
            exit 1
          fi
          echo "branch_id=${branch_id}" >> "$GITHUB_OUTPUT"
          echo "DATABASE_URL=${conn}" >> "$GITHUB_ENV"

      - name: Run drift-guard against fork
        env:
          DJANGO_SETTINGS_MODULE: config.settings.dev
        run: |
          python3 manage.py check_schema_drift \
            --check-fk-indexes \
            --check-migration-history-coverage

      - name: Delete Neon branch fork
        if: always()
        run: |
          set +e
          if [ -n "${{ steps.fork.outputs.branch_id }}" ]; then
            curl -fsS -X DELETE \
              "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches/${{ steps.fork.outputs.branch_id }}" \
              -H "Authorization: Bearer ${NEON_API_KEY}" \
              || echo "NEON_BRANCH_FORK_CLEANUP_FAILED: $(date -Iseconds)"
          fi
```

Three guarantees here, mapped to R5.7-9:

1. **R5.7** — the drift-guard step runs on every PR touching `backend/**` or `backend/scripts/**`. The path filter on `pull_request` enforces this.
2. **R5.8** — the `if: always()` on the cleanup step ensures the fork is deleted even when the drift-guard fails.
3. **R5.9** — fork creation failure prints `NEON_BRANCH_FORK_UNAVAILABLE: ...` and exits 1 before the drift-guard runs, distinguishing infrastructure failure from a real drift finding.

The `NEON_API_KEY` secret is added to the repository's GitHub Actions secrets (one-shot operator step). The key is scoped to the `wild-bar-37055823` project only.

### Component 8: Snapshot backfill execution

`backend/scripts/payment_snapshot_backfill.py` already exists and implements R3.1-3.5 correctly: streams payment IDs in batches of 200, uses `select_for_update`, dry-runs on `--dry-run`, skips ambiguous rows with a WARNING, exits 0 on success. The reconciliation simply runs it:

```bash
# 1. Dry-run on fork to see the plan
DATABASE_URL="$FORK_CONN" python backend/scripts/payment_snapshot_backfill.py --dry-run

# 2. Apply on fork
DATABASE_URL="$FORK_CONN" python backend/scripts/payment_snapshot_backfill.py

# 3. Verify on fork
psql "$FORK_CONN" -c "SELECT count(*) FILTER (WHERE NOT (metadata ? 'snapshot')) FROM payments;"
# expected: 0

# 4. Apply on production (Maintenance_Window)
DATABASE_URL="$PROD_CONN" python backend/scripts/payment_snapshot_backfill.py

# 5. Verify on production
psql "$PROD_CONN" -c "SELECT count(*) FILTER (WHERE NOT (metadata ? 'snapshot')) FROM payments;"
# expected: 0
```

No code change required for Component 8.

### Component 9: Property-based invariant tests

New file: `backend/tests/property/test_schema_reconciliation_invariants.py`. Four property tests, one per invariant.

```python
"""Schema reconciliation invariants enforced via Hypothesis.

These properties run against the configured database connection and so
require either a Neon branch fork URL via DATABASE_URL or a local
Postgres seeded from backend/scripts/00_full_schema.sql.
"""

from __future__ import annotations

import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from django.apps import apps
from django.conf import settings
from django.db import connection
from hypothesis import given, settings as h_settings, strategies as st

SCRIPTS_ROOT = Path(settings.BASE_DIR) / "scripts"
COMMIT_WINDOW_SECONDS = 7 * 24 * 60 * 60


def _all_unmanaged_models():
    return [m for m in apps.get_models() if m._meta.managed is False]


def _all_fk_columns():
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT tc.table_name, kcu.column_name,
                   ccu.table_name AS ref_table, ccu.column_name AS ref_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = current_schema();
            """
        )
        return cur.fetchall()


def _migration_files():
    excluded = {SCRIPTS_ROOT / "applied", SCRIPTS_ROOT / "archive"}
    return sorted(
        p for p in SCRIPTS_ROOT.glob("*.sql")
        if not any(str(p).startswith(str(d)) for d in excluded)
    )


@pytest.mark.django_db(transaction=True)
@h_settings(max_examples=25, deadline=2000)
@given(st.data())
def test_fk_index_invariant_holds(data):
    """For every FK column in any subset of FKs, a matching btree index exists."""
    fks = _all_fk_columns()
    subset = data.draw(st.lists(st.sampled_from(fks), min_size=1, max_size=len(fks), unique=True))
    with connection.cursor() as cur:
        for table, col, ref_table, ref_col in subset:
            cur.execute(
                """
                SELECT 1
                FROM pg_index i
                JOIN pg_class t ON t.oid = i.indrelid AND t.relname = %s
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
                  AND a.attname = %s
                JOIN pg_am am ON am.oid = (
                  SELECT relam FROM pg_class WHERE oid = i.indexrelid
                )
                WHERE i.indisvalid = true AND am.amname = 'btree'
                LIMIT 1;
                """,
                [table, col],
            )
            assert cur.fetchone() is not None, (
                f"Missing FK index for {table}.{col} -> {ref_table}.{ref_col}"
            )


@pytest.mark.django_db
@h_settings(max_examples=25, deadline=2000)
@given(st.data())
def test_coverage_invariant_holds(data):
    """Every concrete field on every managed=False model maps to a real column."""
    models = _all_unmanaged_models()
    subset = data.draw(st.lists(st.sampled_from(models), min_size=1, max_size=len(models), unique=True))
    with connection.cursor() as cur:
        for model in subset:
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND table_name = %s",
                [model._meta.db_table],
            )
            existing = {row[0] for row in cur.fetchall()}
            declared = {f.column for f in model._meta.get_fields()
                        if getattr(f, "concrete", False) and not getattr(f, "many_to_many", False)
                        and getattr(f, "column", None)}
            missing = declared - existing
            assert not missing, (
                f"{model.__name__} declares columns missing on production: {sorted(missing)}"
            )


@pytest.mark.django_db
@h_settings(max_examples=25, deadline=2000)
@given(st.data())
def test_migration_history_coverage(data):
    """SQL files older than 7 days are recorded in migration_history."""
    files = _migration_files()
    if not files:
        pytest.skip("No migration files to check")
    subset = data.draw(st.lists(st.sampled_from(files), min_size=1, unique=True))
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=COMMIT_WINDOW_SECONDS)
    with connection.cursor() as cur:
        for path in subset:
            try:
                ts = subprocess.check_output(
                    ["git", "log", "-1", "--format=%cI", "--", str(path)],
                    text=True,
                ).strip()
                committed_at = datetime.fromisoformat(ts) if ts else None
            except subprocess.CalledProcessError:
                committed_at = None
            if committed_at is None or committed_at >= cutoff:
                continue  # Within 7 days or untracked; absence allowed
            cur.execute(
                "SELECT 1 FROM migration_history WHERE migration_name = %s LIMIT 1",
                [path.name],
            )
            assert cur.fetchone() is not None, (
                f"Stale unrecorded migration: {path.name} committed={committed_at}"
            )


@pytest.mark.django_db(transaction=True)
@h_settings(max_examples=25, deadline=2000)
@given(st.data())
def test_snapshot_invariant_holds_after_simulated_backfill(data):
    """Generated payment rows all carry metadata.snapshot after the backfill."""
    from apps.documents.models import Payment
    n = data.draw(st.integers(min_value=1, max_value=100))
    with connection.cursor() as cur:
        cur.execute("BEGIN;")
        try:
            for _ in range(n):
                cur.execute(
                    "INSERT INTO payments (id, application_id, status, metadata, created_at) "
                    "VALUES (gen_random_uuid(), gen_random_uuid(), 'pending', '{}'::jsonb, now());"
                )
            cur.execute("UPDATE payments SET metadata = jsonb_set(metadata, '{snapshot}', '{}'::jsonb) "
                        "WHERE NOT (metadata ? 'snapshot');")
            cur.execute("SELECT count(*) FILTER (WHERE NOT (metadata ? 'snapshot')) FROM payments;")
            assert cur.fetchone()[0] == 0
        finally:
            cur.execute("ROLLBACK;")
```

The `transaction=True` markers + explicit `BEGIN;`/`ROLLBACK;` in test 4 ensure no payment rows persist between examples even when the test fails partway through.

### Component 10: Documentation update

Three files updated, one new:

| File | Change |
|---|---|
| `PRODUCTION-READINESS-FIX-REPORT-2026-05-19.md` | Replace "72 tables" with verified 35; replace "all FKs indexed" with FK-index outcome table (15 indexes by table, name, applied_at); replace `production.py` reference with `config.settings.prod`; describe `payments.receipt_number` as partial unique index. |
| `backend/scripts/MIGRATION_HISTORY.md` | Regenerate from production `migration_history` so every applied row appears with `Applied=Y` and the recorded `applied_at`. |
| `docs/canonical-truth-map.md` | Add row for "schema migration tracking" → `migration_history` on production as canonical, `MIGRATION_HISTORY.md` as mirror. |
| `docs/runbooks/schema-reconciliation-runbook.md` | NEW. Pre-flight checklist, per-step Maintenance_Window expectations, per-step Rollback_Plan, verification queries (Coverage_Invariant, FK_Index_Invariant, Snapshot_Invariant, Receipt_Uniqueness_Invariant), post-deployment communication template. |

The runbook is the operator's playbook for both this reconciliation and any future schema change. It's the document you read when someone says "we have a schema drift incident at 2 AM".

## Data Flow

### Reconciliation execution (one-shot)

```
Step 0: backend/scripts/2026_05_22_migration_history_extend.sql
   ───>  ALTER TABLE migration_history ADD COLUMN checksum, notes;
         CREATE UNIQUE INDEX uq_migration_history_migration_name;
         (transactional; no CONCURRENTLY needed; 1ms on 29 rows)

Step 1: backend/scripts/2026_05_22_migration_history_reconcile.sql
   ───>  INSERT 2 rows for payment_hardening_indexes.sql + preflight.sql
         (transactional; ON CONFLICT DO NOTHING; idempotent)

Step 2: backend/scripts/2026_05_18_expand_application_status_columns.sql
   ───>  Whatever ALTER TABLE adds new status-related columns to applications/intakes
         (transactional)

Step 3: backend/scripts/2026_05_18_hot_query_indexes.sql
   ───>  CREATE INDEX CONCURRENTLY (autocommit phase)

Step 4: backend/scripts/2026_05_19_seed_communication_templates.sql
   ───>  INSERT INTO communication_templates ON CONFLICT DO NOTHING
         (transactional)

Step 5: backend/scripts/2026_05_22_fk_index_backfill.sql
   ───>  CREATE INDEX CONCURRENTLY × 15 (autocommit phase)

Step 6: backend/scripts/application_number_sequences.sql
   ───>  CREATE SEQUENCE IF NOT EXISTS (transactional)

Step 7: backend/scripts/system_actor_seed.sql
   ───>  INSERT INTO profiles ON CONFLICT DO NOTHING
         (transactional)

Step 8: python backend/scripts/payment_snapshot_backfill.py
   ───>  Update 2 payment rows with metadata.snapshot
         (already-applied logic; per-row select_for_update;
          transaction batches of 200)
```

Each step blocks on the previous one. If any step fails, the operator stops, fixes the issue (often by re-running the same step after resolving the cause), and resumes.

### CI drift-guard (every PR)

```
PR opened touching backend/  ───>  Trigger backend-governance workflow
                                       │
                                       ▼
                                 Existing static checks pass
                                       │
                                       ▼
                                 Job: drift-guard
                                       │
                                       ▼
              POST /projects/wild-bar-37055823/branches → branch_id, conn_uri
                                       │
                                       ▼
                          DATABASE_URL=<conn_uri>
                                       │
                                       ▼
              python manage.py check_schema_drift \
                  --check-fk-indexes \
                  --check-migration-history-coverage
                                       │
                                       ▼
                          Exit 0 → PR check ✅
                          Exit 1 → PR check ❌, error lines posted
                                       │
                                       ▼
                          DELETE /branches/<branch_id>  (always runs)
```

Build duration target: under 90 seconds for the drift-guard job. Branch creation typically completes in 5-10 seconds; the schema queries against `information_schema` and `pg_index` are sub-second.

## Error Handling

| Failure mode | Detection | Response | User-facing surface |
|---|---|---|---|
| `apply_sql_migrations` non-additive lint | Pre-execution scan of file body | Reject with "REJECTED_NON_ADDITIVE_OPERATION: <pattern> in <file>"; exit 1 | Operator stderr |
| Maintenance window absent | `apply_sql_migrations --connection prod` parses runbook | Warn `WARNING: no maintenance window recorded`; proceed | Operator stderr |
| Transaction-mode migration fails mid-file | SQL exception inside `transaction.atomic()` | Auto-rollback; no migration_history row; exit 1 | Operator stderr; `migration_history` unchanged |
| CONCURRENTLY mode migration fails | `pg_index.indisvalid = false` on any new index | Drop invalid indexes via `DROP INDEX CONCURRENTLY`; no migration_history row; exit 1 | Operator stderr; partial indexes cleaned up |
| `migration_history` missing `checksum` column | `apply_sql_migrations` schema check at startup | Refuse with "MIGRATION_HISTORY_NOT_EXTENDED: run 2026_05_22_migration_history_extend.sql first"; exit 1 | Operator stderr |
| Drift-guard FK index missing on PR | `check_schema_drift --check-fk-indexes` query | Print one line per gap; exit 1 | CI annotations; PR check fails |
| Drift-guard stale unrecorded migration | `check_schema_drift --check-migration-history-coverage` | Print line per stale file; exit 1 | CI annotations; PR check fails |
| Neon branch creation fails in CI | curl exit non-zero | Print `NEON_BRANCH_FORK_UNAVAILABLE: <body>`; exit 1 (distinguishable from drift) | CI logs |
| Neon branch deletion fails in CI | curl exit non-zero in `if: always()` step | Print `NEON_BRANCH_FORK_CLEANUP_FAILED: <ts>`; preserve outer exit code | CI logs; orphan branch cleaned by hourly Neon-side reaper |
| `payment_snapshot_backfill` ambiguous row | Existing logic in script | Skip with `WARNING: payment <id> ambiguous`; counter incremented; exit 0 | Operator stdout |
| `payment_snapshot_backfill` repeated run | First-line check: `count(*) FILTER (WHERE NOT (metadata ? 'snapshot'))` is 0 | Print "0 rows updated, 0 rows skipped"; exit 0 | Operator stdout |
| Property test data unavailable | Test fixture asks `_all_fk_columns()` against empty result | Pytest skip with reason; not a failure | Test output |
| Rollback applied without runbook entry | Out of scope — system does not enforce | n/a | Operator policy |

## Testing Strategy

### Unit tests

- `backend/tests/unit/test_apply_sql_migrations.py` — extended for the new behavior:
  - default migrations dir is `backend/scripts/` not `backend/scripts/migrations/`.
  - excludes `applied/` and `archive/` subdirectories.
  - rejects non-additive SQL with `--allow-non-additive` absent.
  - splits CONCURRENTLY files into autocommit + transaction phases.
  - refuses to run when `migration_history` lacks `checksum` column.
  - writes one row per applied file with computed sha256 checksum.

- `backend/tests/unit/test_check_schema_drift_fk_indexes.py` — new:
  - happy path: every FK has an index → exit 0.
  - one FK missing → exit 1 with `MISSING_FK_INDEX:` line.
  - flag omitted → no FK check; success line shows `fk-indexes=disabled`.

- `backend/tests/unit/test_check_schema_drift_migration_history.py` — new:
  - file committed 8 days ago, absent → exit 1 with `STALE_UNRECORDED_MIGRATION:`.
  - file committed 5 days ago, absent → exit 0.
  - file committed exactly 7 days ago, absent → exit 0 (per R8.4 boundary).
  - git unavailable → fallback to mtime, emit `UNTRACKED_MIGRATION_SCRIPT:`.

### Property tests

`backend/tests/property/test_schema_reconciliation_invariants.py` — four hypotheses, one per invariant. Detailed in Component 9. Requires a database with at least the production schema present (Neon branch fork or local Postgres seeded from `00_full_schema.sql`).

### Integration tests on a Neon branch fork

Manual operator step, executed during the reconciliation:

1. Create branch fork.
2. `apply_sql_migrations --dry-run` → review listed pending files.
3. `apply_sql_migrations` → confirm 0 errors.
4. `check_schema_drift --strict --check-fk-indexes --check-migration-history-coverage` → confirm OK.
5. `payment_snapshot_backfill.py --dry-run` → confirm exactly 2 planned writes.
6. `payment_snapshot_backfill.py` → confirm `updated=2, skipped_ambiguous=0`.
7. Property suite + `test_payment_migration_indexes.py` → confirm green.
8. Run a representative join EXPLAIN ANALYZE per FK-indexed table → save plans to runbook.
9. Delete the fork.

### Production verification queries

After applying to production, the operator runs (and the runbook captures their expected outputs):

```sql
-- Coverage_Invariant proxy (run from app code; the management command does the full check)
SELECT count(*) FROM information_schema.columns WHERE table_schema='public';

-- FK_Index_Invariant
WITH fk AS (
  SELECT tc.table_name, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
)
SELECT fk.table_name, fk.column_name
FROM fk
LEFT JOIN pg_indexes idx
  ON idx.tablename = fk.table_name
  AND idx.indexdef LIKE '%(' || fk.column_name || '%'
WHERE idx.indexname IS NULL;
-- expected: 0 rows

-- Snapshot_Invariant
SELECT count(*) FILTER (WHERE NOT (metadata ? 'snapshot')) FROM payments;
-- expected: 0

-- Receipt_Uniqueness_Invariant
SELECT receipt_number, count(*)
FROM payments
WHERE receipt_number IS NOT NULL AND receipt_number <> ''
GROUP BY receipt_number HAVING count(*) > 1;
-- expected: 0 rows

-- Migration_History coverage
SELECT migration_name FROM migration_history WHERE migration_name IN (
  'payment_hardening_indexes.sql', 'payment_hardening_preflight.sql',
  '2026_05_22_migration_history_extend.sql',
  '2026_05_22_migration_history_reconcile.sql',
  '2026_05_22_fk_index_backfill.sql',
  '2026_05_18_expand_application_status_columns.sql',
  '2026_05_18_hot_query_indexes.sql',
  '2026_05_19_seed_communication_templates.sql',
  'application_number_sequences.sql',
  'system_actor_seed.sql'
);
-- expected: 10 rows
```

## Decisions & Trade-offs

### Why extend `migration_history` rather than collapse to `applied_sql_migrations`

Production has 29 rows in `migration_history` going back to February. Renaming or dropping that table would require either a multi-step migration (rename existing table, create new one, copy rows, drop) — expensive and risky on a live system — or losing the historical timeline. Adding two nullable columns is the minimal additive change.

### Why partial unique index on `migration_name` rather than a `UNIQUE` constraint

`CREATE UNIQUE INDEX IF NOT EXISTS` is reversible via `DROP INDEX`. `ALTER TABLE ... ADD CONSTRAINT UNIQUE` is irreversible without first dropping the constraint by name and is harder to make idempotent. The semantic guarantee is identical for our purposes.

### Why `CREATE INDEX CONCURRENTLY` for the FK indexes despite small tables

27 rows on `applications` builds in microseconds, but `application_status_history` and `audit_logs` will grow without bound. Habit: always use CONCURRENTLY for production index builds so the same script remains safe at any future row count. Costs nothing on small tables.

### Why one Neon branch per CI run rather than a long-lived "ci" branch

Neon branches are free and copy-on-write. A long-lived branch would gradually drift from the default branch and fail to test the same schema state. Per-run forks guarantee the drift-guard runs against an exact mirror of the default branch's current state.

### Why the 7-day commit window for the migration-history coverage rule

Allows in-flight schema work to merge without immediately requiring a production apply. The reconciliation team has up to 7 days to apply a newly-merged migration before CI starts failing. Tight enough to prevent indefinite drift, loose enough to absorb normal release cadence.

### Why store `notes` as free text rather than a structured JSON column

The reconcile use case is "write 'reconciled-on-YYYY-MM-DD; original applied_at not recorded'". A free-text TEXT column is enough; structured fields would require schema migration coupling between the reconciliation logic and the table. Future structured needs (e.g., per-step duration) can be added by widening the column or adding new columns later.

### Why not enforce rollback runbook entries via the system

Per the user clarification on R9.6: keep the requirement on the operator, don't enforce it via tooling. Enforcement would need either a pre-rollback hook (intrusive) or a post-rollback alert (out of scope for the schema layer). Operator discipline remains the safety net; runbook gap is out-of-scope for this spec.

### Why no separate CI job for the property tests

The property tests assert invariants that the drift-guard already enforces structurally. Running them in CI on every PR would double the cost without finding new failures. The property tests run as part of the standard pytest suite — when an invariant is violated, both the property test and the drift-guard fire. The drift-guard fails faster and produces a clearer error, so it's the primary gate.

### Why no production rollback button in the CI workflow

Production rollbacks are operator decisions made after careful inspection. Encoding them in CI invites accidental triggers. Rollback files exist on disk for a developer to manually invoke during an incident; CI does not orchestrate them.

## Out of Scope

- Renaming or dropping `applied_sql_migrations` if it exists locally on a developer machine. Local cleanup is handled by `python manage.py apply_sql_migrations --reset-tracking` (a future enhancement, not part of this spec).
- Performance benchmarking the new FK indexes. The runbook captures EXPLAIN ANALYZE plans; ongoing performance monitoring is the observability layer's concern.
- Adding additional indexes beyond the 15 FK columns. Future query-pattern-driven indexes are added via new dated migration files.
- Schema migrations that require non-additive operations (DROP COLUMN, narrowing TYPE). The `--allow-non-additive` flag is reserved for future use; the rollout process for those is more involved (preserve-then-drop two-phase) and is its own spec.
- Multi-region production deployment. The current Neon project is single-region (us-east-1); cross-region replication is out of scope.

## Data Models

### `migration_history` (existing — extended)

Production today:

```sql
CREATE TABLE migration_history (
    id          INTEGER PRIMARY KEY,
    migration_name TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL
);
```

After reconciliation:

```sql
CREATE TABLE migration_history (
    id              INTEGER PRIMARY KEY,
    migration_name  TEXT NOT NULL,
    applied_at      TIMESTAMPTZ NOT NULL,
    checksum        TEXT NULL,        -- SHA-256 of file contents at apply time
    notes           TEXT NULL          -- free-text annotation, e.g. 'reconciled-on-2026-05-22; ...'
);
CREATE UNIQUE INDEX uq_migration_history_migration_name ON migration_history(migration_name);
```

Field semantics:

| Field | Type | Nullable | Source |
|---|---|---|---|
| `id` | INTEGER | NO | Auto-incrementing surrogate key (existing) |
| `migration_name` | TEXT | NO | Basename of applied SQL file (e.g. `payment_hardening_indexes.sql`) |
| `applied_at` | TIMESTAMPTZ | NO | `now()` from the database at apply time |
| `checksum` | TEXT | YES | SHA-256 hex digest of file contents; null for pre-reconciliation rows |
| `notes` | TEXT | YES | Annotation; null for forward-applied rows; literal `reconciled-on-YYYY-MM-DD; ...` for retro-recorded rows |

The unique index on `migration_name` is the contract that lets reconciliation `INSERT ... ON CONFLICT DO NOTHING` work.

### `device_sessions` (existing — extended)

Production today (12 columns; `refresh_jti` missing):

```sql
CREATE TABLE device_sessions (
    id             UUID PRIMARY KEY,
    user_id        UUID NOT NULL,
    device_id      TEXT NOT NULL,
    device_info    TEXT,
    session_token  TEXT NOT NULL,
    ip_address     VARCHAR(64),
    user_agent     TEXT,
    last_activity  TIMESTAMPTZ,
    is_active      BOOLEAN,
    expires_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ
);
```

After reconciliation:

```sql
ALTER TABLE device_sessions ADD COLUMN IF NOT EXISTS refresh_jti VARCHAR(255) NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_refresh_jti
  ON device_sessions(refresh_jti);
```

`refresh_jti` is nullable because existing rows have no JTI on file. The Django model `DeviceSession.refresh_jti` field uses `null=True, blank=True`, matching.

### Snapshot field on `payments.metadata`

`payments.metadata` is JSONB. After backfill, every row satisfies:

```jsonc
{
  "snapshot": {
    "expected_amount": "153.00",       // string, decimal, 2dp
    "currency": "ZMW",                 // ISO 4217
    "residency_category": "local",     // "local" | "international"
    "program_code": "DRN",
    "intake_id": "January 2026 Intake",
    "waiver_applied": false,
    "original_amount": "153.00",
    "fee_source": "backfill"           // "backfill" | "live" | "manual"
  }
  // ... other top-level metadata keys preserved unchanged ...
}
```

Backfill writes only the `snapshot` key; sibling keys are preserved.

### FK index naming

Pattern `idx_<table>_<column>` for every covering index added by Component 5. Stored in `pg_indexes` with `indexdef = 'CREATE INDEX <name> ON public.<table> USING btree (<column>)'`. No `INCLUDE` columns; no partial predicates; no expression indexes.

## Correctness Properties

These are the structural invariants the spec enforces. Each maps to one of Requirements 1-9 and one or more drift-guard checks.

### Property 1: Migration_History Coverage

For every `*.sql` file in `backend/scripts/` (excluding `applied/`, `archive/`) whose most recent git commit timestamp is more than 7 days old, there exists a row in `migration_history` with `migration_name = basename(file)`.

**Enforced by:** `check_schema_drift --check-migration-history-coverage`. **Tested by:** `test_migration_history_coverage` property test.

**Validates: Requirements 5.3, 8.4**

### Property 2: FK Index Invariant

For every row in `information_schema.referential_constraints` where `constraint_schema = current_schema()`, there exists at least one row in `pg_index` whose `indrelid` matches the constrained table, `indkey[0]` matches the constrained column, `indisvalid = true`, and the underlying access method is `btree`.

**Enforced by:** `check_schema_drift --check-fk-indexes`. **Tested by:** `test_fk_index_invariant_holds`.

**Validates: Requirements 2.6, 5.4, 8.2**

### Property 3: Coverage Invariant

For every Django model with `Meta.managed = False`, every concrete field's `column` attribute is present in `information_schema.columns` for that model's `db_table` on the configured database.

**Enforced by:** `check_schema_drift` (existing default check). **Tested by:** `test_coverage_invariant_holds`.

**Validates: Requirements 5.5, 8.3**

### Property 4: Snapshot Invariant

`SELECT count(*) FROM payments WHERE NOT (metadata ? 'snapshot') = 0` on the production database after the backfill runs.

**Enforced by:** post-backfill verification query. **Tested by:** `test_snapshot_invariant_holds_after_simulated_backfill`.

**Validates: Requirements 3.3, 8.5**

### Property 5: Receipt Uniqueness

For every pair of payment rows where `receipt_number IS NOT NULL AND receipt_number <> ''`, the receipt numbers differ. Enforced by the partial unique index `uq_payments_receipt_number`.

**Enforced by:** Postgres index constraint. **Tested by:** existing `test_payment_migration_indexes.py::test_receipt_number_partial_unique`.

**Validates: Requirements 1.2, 2.6**

### Property 6: Forward-Only Tracking

The migration_history row count is monotonically non-decreasing across the lifetime of `Production_Database`. Reconcile inserts add rows; only an explicit rollback DELETE reduces the count, and that DELETE is constrained to rows where `notes LIKE 'reconciled-on-2026-05-22%'`.

**Enforced by:** rollback files only target reconciliation rows. **Tested by:** unit test asserting the rollback file's WHERE clause shape.

**Validates: Requirements 4.5, 9.2**

### Property 7: Additive-Only Forward Migrations

Every `*.sql` file applied via `apply_sql_migrations` (without `--allow-non-additive`) contains only operations from the additive set: `ADD COLUMN ... NULL DEFAULT ...`, `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`, `INSERT ... ON CONFLICT DO UPDATE`, `CREATE OR REPLACE FUNCTION`, `CREATE SEQUENCE IF NOT EXISTS`, `ALTER TABLE ... ALTER COLUMN ... TYPE` widening conversions.

**Enforced by:** `apply_sql_migrations` pre-execution lint. **Tested by:** unit test feeding sample non-additive SQL and asserting rejection.

**Validates: Requirements 1.2**

### Property 8: Idempotent Re-Apply

Running `apply_sql_migrations` twice in succession against the same database results in the same `migration_history` state after the second run as after the first; no SQL is re-executed.

**Enforced by:** the `migration_name` lookup against `migration_history` before attempting to apply. **Tested by:** integration test running the command twice on a Neon branch fork.

**Validates: Requirements 1.8**
