# Task 3.2 — Stage 2 (Neon branch rehearsal + rollback) evidence

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/` — task **3.2 Inventory and
remediate canonical assignment data**
**Requirements:** R7.1–R7.2, R15.3–R15.7 | **Findings:** DATA-01, DATA-02, DATA-07,
DATA-10, STU-01
**Stage:** 2 of 3 — mutation rehearsal on an **isolated Neon branch only**. No
mutation was run on the Neon default branch; production (EC2 Docker) was never
touched.
**Date:** 2026-07-16.

## Rehearsal branch

| Field | Value |
|---|---|
| Project | `wild-bar-37055823` (`mihasApplication`), org `org-nameless-field-86879910`, Postgres 17 |
| Branch id | **`br-jolly-pine-ahybtg2e`** |
| Branch name | `v2-task-3.2-rehearsal` |
| Parent (default) branch | `br-floral-scene-aha2ybfd` |
| Database | `neondb` |

There is no `delete_branch` in the intended Stage-2 flow — the rehearsal branch
`br-jolly-pine-ahybtg2e` is **left intact** for the operator to inspect/discard.

> Branch-slot note: the project was at its branch cap (10/10). With explicit
> user approval, one disposable archived Vercel preview branch
> (`br-green-base-ahcliu92`, `preview/codex/fix-endpoint-auth-handling-in-comparator`,
> archived since March) was deleted to free a slot. No other branch was touched.

## Before-state on the branch (mirrors the Stage 1 default-branch snapshot)

The fork reproduces the Stage 1 read-only inventory exactly, confirming a
faithful copy of the authoring data.

| Probe | Result on `br-jolly-pine-ahybtg2e` |
|---|---|
| I1 total applications | 33 |
| I1 null institution/canonical/offering/intake id | 33 / 33 / 33 / 33 |
| I1 missing any canonical id (any / non-draft) | 33 / 32 |
| I2 dangling FKs (inst/canon/off/intake) | 0 / 0 / 0 / 0 |
| I4 uniquely_resolvable / offering_missing_canonical / no_match / ambiguous | 0 / 33 / 0 / 0 |
| I6 canonical_programs / offerings / offerings_without_canonical / institutions / intakes | 0 / 4 / 4 / 2 / 3 |
| Pre-objects: ledger table / quarantine col / CHECK | absent / absent / absent |
| Canonical FKs on `applications` (Django-named) | 4 present, all `convalidated=true` |

## Per-script apply log (in order, on the branch)

| Script | Statements | Result |
|---|---|---|
| `2026_07_16_01_..._expand.sql` | 7 (DDL) | Created `canonical_assignment_exceptions` (+4 indexes, +FK to `applications`), added `applications.assignment_quarantined`, added `chk_applications_canonical_assignment` **NOT VALID** (`convalidated=false`). Idempotent/additive — no data change. |
| `2026_07_16_02_..._backfill.sql` | 10 (DML) | dangling ledger INSERT **0**; 4× dangling-clear UPDATE **0** each; deterministic backfill UPDATE **0**; quarantine ledger INSERT **32**; quarantine-flag UPDATE **32**; self-heal resolved/unquarantine UPDATE **0** / **0**. |
| `2026_07_16_03_..._validate.sql` | 2 (DO blocks) | FK-validate loop: **no-op** (0 constraints matched the `*_fk` NOT-VALID name filter — the 4 canonical FKs already exist under Django names and were already validated). CHECK: `VALIDATE CONSTRAINT` **succeeded** → `chk_applications_canonical_assignment` `convalidated=true`. |

Outcome matches the Stage 1 prediction: **0 rows backfilled**, **32 non-draft
rows quarantined** as `offering_missing_canonical`, **1 draft exempt**. The single
blocker remains the un-seeded canonical-program layer (owner: task 5.1); 3.2 fails
closed into the ledger and never force-resolves.

## Before → after invariant counts

| Invariant | Before | After (expand+backfill+validate) |
|---|---|---|
| total applications | 33 | 33 |
| missing any canonical id (any) | 33 | 33 (0 backfilled — expected) |
| non-draft missing any canonical id | 32 | 32 (all now quarantined) |
| `assignment_quarantined = true` | n/a (col absent) | 32 |
| draft rows / of which quarantined | 1 / n/a | 1 / **0** (draft exempt) |
| open ledger rows (`offering_missing_canonical`) | n/a (table absent) | **32** |
| dangling canonical FKs | 0 | 0 |

## Post-state gate — I7 + I8 (release gate)

| Gate check | Value | Pass? |
|---|---|---|
| I8 `nondraft_nonquarantined_missing` | 0 | ✅ |
| I8 `dangling` | 0 | ✅ |
| I8 `quarantined_without_ledger` | 0 | ✅ |
| I7 open `offering_missing_canonical` ledger rows | 32 | ✅ (matches 32 quarantined) |
| `chk_applications_canonical_assignment` `convalidated` | true | ✅ |
| 4 canonical FKs (`institution`/`program_id`→canonical/`program_offering_id`→programs/`intake`) `convalidated` | true (×4) | ✅ |

**Post-state gate: PASS.**

## Rollback rehearsal (reverse-apply order, on the branch)

| Step | Script | Result |
|---|---|---|
| 1 | `..._03_..._validate_rollback.sql` | No-op (`SELECT 1`) — `VALIDATE` is not independently reversible, by design. |
| 2 | `..._02_..._backfill_rollback.sql` | **Rejected** by `chk_applications_canonical_assignment` (`new row ... violates check constraint`). Transaction rolled back cleanly — state unchanged (still 32 quarantined, 32 ledger rows). See Finding 2. |
| 3 | `..._01_..._expand_rollback.sql` | Dropped CHECK → column → ledger table. **Verified after:** ledger table `NULL`, `assignment_quarantined` absent, CHECK count 0; **data intact** (33 apps, all still all-null); **4 canonical FKs still `convalidated=true`** (June tenant schema untouched). |

**Rollback proof:** the expand rollback fully reverts every task-3.2 additive
object and, by dropping the column and table, also reverts the quarantine flags
and ledger. The branch returns to its pre-expand fork state with the June tenant
schema (4 validated canonical FKs) preserved. Full **data** revert (for a real
backfill) remains forward-only → discard the Neon branch or restore from backup,
as the 02 rollback header states.

## Findings (rehearsal caught two defects)

1. **BLOCKER (fixed) — `min(uuid)` in the backfill.** `2026_07_16_02_..._backfill.sql`
   aggregated `uuid` columns with `min(...)` in five places (`min(p.id)`,
   `min(p.canonical_program_id)`, `min(p.institution_id)`, `min(t.id)` in the
   backfill CTE; `min(p.canonical_program_id)` in the quarantine CTE). Postgres has
   no `min(uuid)` aggregate, so the first apply failed
   (`function min(uuid) does not exist`) and rolled back — it would fail identically
   on the default branch and production. **Fix applied (user-approved):**
   `min(<uuid>)` → `min(<uuid>::text)::uuid`, verbatim otherwise. These aggregates
   are only consumed when the group has exactly one candidate (`c = 1`), so the
   value is unchanged; the cast only gives Postgres a comparable type. Re-apply then
   succeeded (results above). The script file now matches the proven SQL.

2. **Rollback ordering constraint (documented).** `2026_07_16_02_..._backfill_rollback.sql`
   sets `assignment_quarantined = false` on the still-unassigned non-draft rows,
   which violates `chk_applications_canonical_assignment` while that CHECK exists
   (CHECK constraints are enforced on modified rows even when `NOT VALID`). The
   bookkeeping-only rollback therefore cannot run after expand has created the
   CHECK. In a full teardown this is harmless: `..._01_..._expand_rollback.sql`
   drops the CHECK, the column, and the ledger table together — reverting the
   flags (column dropped) and ledger (table dropped) by construction, which
   subsumes the 02 bookkeeping revert. Operator guidance: for a full task-3.2
   rollback run **03_rollback (no-op) → 01_rollback**; the 02 bookkeeping script is
   only applicable for a pre-CHECK partial revert. (No script change made — this is
   an ordering note for the deployment runbook.)

## Boundaries honoured

- All mutation ran **only** on `br-jolly-pine-ahybtg2e`, always with the branch id
  passed explicitly. The Neon **default** branch (`br-floral-scene-aha2ybfd`) and
  production (EC2 Docker `mihas-postgres-1`) received **no** writes.
- Stage 3 (running `backend/tests/unit/test_canonical_assignment_remediation.py`
  and wiring invariants into the release gate) is **not** part of Stage 2 and was
  not run.
