# Task 3.5 — Stage 2: expand/backfill/validate + rollback rehearsal (Neon branch)

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

**Branch:** `br-jolly-pine-ahybtg2e` (name `v2-task-3.2-rehearsal`), **reused** per
the dispatch (Neon branch limit reached — `create_branch` returns 422; no new
branch created). Parent: `br-floral-scene-aha2ybfd`. Applied via the Neon MCP
`run_sql_transaction`, statements split from the exact `backend/scripts/*.sql`
files with the runner's own `_split_sql_statements` (each `DO $$…$$` block is one
statement). Nothing was applied to the Neon default branch or the self-hosted
production Postgres. Raw log: [`raw/rehearsal-neon-branch.txt`](raw/rehearsal-neon-branch.txt).

The rehearsal branch started identical to the authoring DB: 21 payments (0
orphans), 91 documents, 10 duplicate `(application, document_type)` groups, FK
`ON DELETE SET NULL`, none of the task-3.5 objects present.

## Forward transition

| Phase | Key observations |
|---|---|
| **EXPAND** (`2026_07_19_01`, 15 stmts) | 7 document columns added; `payment_orphan_exceptions` ledger created; `payments_application_id_not_null` + `chk_application_documents_version_positive` added `NOT VALID` (`convalidated=false`); all 91 docs still `is_current=true` by default (the index would fail here — proving the backfill ordering matters). |
| **BACKFILL** (`2026_07_19_02`, 6 stmts) | **91 docs preserved** (nothing deleted); **0 groups with multiple current**; 66 current + **25 superseded** (= 17 + 7 + 1, matching the Stage 1 dup inventory exactly); `max_version = 7`; provenance populated on every row; 0 orphan payments to recover/quarantine (0 ledger rows). |
| **VALIDATE** (`2026_07_19_03`, 5 stmts) | `uq_application_documents_one_current` built; both CHECKs `convalidated=true`; provenance FKs validated; FK reconciled to `ON DELETE CASCADE`. |

This reproduces, on the real 91-document / 21-payment data set, the outcome the
Postgres test suite proves on synthetic duplicates + orphans.

## Rollback rehearsal (Required Evidence)

Operator-only `*_rollback.sql` applied in reverse order `03 -> 02 -> 01`. All three
are **inverse-additive-only** (production-schema-reconciliation Requirement 9.2 —
`test_rollback_safe_operations.py`): DROP / scoped `DELETE ... WHERE` / DROP
CONSTRAINT only, never `UPDATE`/`INSERT`/`CREATE`. This task's rollbacks pass that
per-file audit (locked by `test_task_3_5_rollbacks_are_inverse_additive_safe`); the
suite-wide gate remains red only on the pre-existing sibling task-3.2/3.3/3.4
rollbacks, which is out of this task's scope.

- **03 validate_rollback** (2 stmts) — dropped `uq_application_documents_one_current`; FK `CASCADE -> SET NULL`.
- **02 backfill_rollback** (1 stmt) — scoped `DELETE` of the orphan-quarantine ledger rows. The additive-column bookkeeping (version/is_current/provenance/quarantine flag) is reverted by the **01 expand rollback's `DROP COLUMN`**, not by an `UPDATE`, so no inverse-additive rule is violated.
- **01 expand_rollback** (16 stmts) — dropped both CHECKs, provenance FKs, 7 document columns, the payments CHECK, the ledger (FK/indexes/table), and the quarantine column.

The rehearsal was executed twice — once with the original rollback and again after
the 02 rollback was tightened to Requirement 9.2; both returned the branch to the
identical pre-3.5 state below.

### After-rollback equals before (round-trip proof)

| Field | BEFORE | AFTER_ROLLBACK | Match |
|---|---|---|---|
| payments / orphans | 21 / 0 | 21 / 0 | ✅ |
| docs / dup groups | 91 / 10 | 91 / 10 | ✅ (25 superseded rows restored as dups — nothing deleted) |
| doc new columns | 0 | 0 | ✅ |
| quarantine column | absent | absent | ✅ |
| exception ledger | absent | absent | ✅ |
| mandatory CHECK | absent | absent | ✅ |
| one-current index | absent | absent | ✅ |
| payments FK | `SET NULL` | `SET NULL` | ✅ |

## Lock behaviour (design §19 "bounded locks")

- `ADD COLUMN ... DEFAULT <const>` is metadata-only (PG 11+); `ADD CONSTRAINT …
  NOT VALID` takes a brief lock and does not scan.
- `VALIDATE CONSTRAINT` takes only `SHARE UPDATE EXCLUSIVE` — concurrent
  reads/writes continue.
- The one-current unique index is built non-`CONCURRENTLY` (tables are small —
  91 rows here, production similar since restored from Neon); the brief `SHARE`
  lock is immaterial. A future large-table apply would switch to
  `CREATE UNIQUE INDEX CONCURRENTLY`.
- The FK `SET NULL -> CASCADE` swap is a `DROP CONSTRAINT` + `ADD CONSTRAINT`
  pair (additive-lint permits it — not a DROP COLUMN/TABLE); the rollback restores
  `SET NULL`.

## Operator-gated production path (NOT run here)

Author on Neon, prove, then production (infrastructure.md; production writes are
backup-first and deployment-window-gated):

1. Back up production (`deploy/backup-db.sh`).
2. Run [`inventory.sql`](inventory.sql) Blocks A–E on production (read-only). If
   Block A shows orphan payments, the backfill recovers/quarantines them; any that
   remain un-quarantined make the `VALIDATE` in `2026_07_19_03` fail closed
   (R15.3) — investigate before retry.
3. Apply `2026_07_19_01/02/03` via `apply_sql_migrations` (the boot sweep runs the
   forward scripts in filename order; the `*_rollback.sql` siblings are excluded by
   suffix).
4. Run [`inventory.sql`](inventory.sql) Block F on production: **0**
   groups-with-multiple-current and **0** un-quarantined orphan payments; then
   regenerate the production schema manifest for the release gate.
