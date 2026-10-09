# Task 3.2 — Inventory and remediate canonical assignment data (evidence index)

**Spec:** `.kiro/specs/admissions-v2-canonical-rebuild/` — task **3.2 Inventory and
remediate canonical assignment data**
**Requirements:** R7.1–R7.2, R15.3–R15.7 | **Findings:** DATA-01, DATA-02, DATA-07,
DATA-10, STU-01
**Candidate commit:** `bae29a28d9657f288b3339062adb31285959c966` (branch `main`,
current HEAD). The task-3.2 artifacts (SQL scripts, contract module, verifier
test, this evidence folder) currently sit as **untracked working-tree additions
on top of** that commit and are pending commit — so the corrected backfill (see
below) lives in the working tree, not yet in any commit.

This folder is the audit trail for a three-stage, Neon-first, fail-closed
remediation of the legacy `applications` rows onto the canonical assignment IDs
(`institution_id`, `program_id` → `canonical_programs`, `program_offering_id` →
`programs`, `intake_id` → `intakes`). Nothing here was applied to the Neon
default branch or production.

| File | Stage | What it records |
|---|---|---|
| `inventory.sql` | all | READ-ONLY invariant probe (I1–I6 before-state, I5b legacy-string distribution, I7–I8 post-state gate). Lives under `docs/`, so it is NOT swept by `apply_sql_migrations`. |
| `stage1-notes.md` | 1 | Author + read-only inventory of the Neon default branch (no mutation). |
| `stage2-rehearsal.md` | 2 | Mutation rehearsal + rollback on an isolated Neon branch. |
| `README.md` (this file) | 3a | Ties Stages 1–3 together; records the pure-contract test result and the operator-gated production path. |

## Before-state (Neon default branch, read-only — Stage 1)

- **33** total applications; **all** missing every canonical id
  (null `institution_id` / `program_id` / `program_offering_id` / `intake_id` =
  **33 / 33 / 33 / 33**). Missing-any = 33; **32 non-draft** + **1 draft**.
- **0** dangling FKs, **0** snapshot mismatches, **0** ambiguous, **0** no-match,
  **0** same-name cross-tenant collisions. The legacy display strings resolve
  cleanly (including `MIHAS`⇄full-name and `KATC`⇄full-name via
  `institutions.name` OR `institutions.code`).
- Catalog: **0** `canonical_programs`; **4** offerings, **all** with
  `canonical_program_id = NULL`; **2** institutions; **3** intakes.
- **Single blocker:** the un-seeded canonical-program layer. With every offering
  lacking a canonical link, no row's `program_id` (canonical) can be derived, so
  all 32 non-draft rows classify as `offering_missing_canonical` and are
  quarantined (never force-resolved). Seeding/linking canonical programs is
  **task 5.1**; 3.2 fails closed and records the removal path (honours R7.5).

## Authored artifacts

Additive, idempotent, `apply_sql_migrations`-compatible (forward scripts use only
`IF NOT EXISTS` / `NOT VALID` / `UPDATE … WHERE` / `INSERT … ON CONFLICT` /
`VALIDATE CONSTRAINT`; `DROP`/`DELETE` live only in `*_rollback.sql`, which the
boot sweep excludes).

| File | Role |
|---|---|
| `backend/scripts/2026_07_16_01_canonical_assignment_expand.sql` | EXPAND — create `canonical_assignment_exceptions` ledger (+`owner`,`removal_path`), add `applications.assignment_quarantined`, add `chk_applications_canonical_assignment` CHECK **NOT VALID**. |
| `backend/scripts/2026_07_16_02_canonical_assignment_backfill.sql` | BACKFILL — deterministic, WHERE-scoped, idempotent: clear dangling FKs → ledger, backfill only uniquely-resolvable rows (canonical derived from the offering), quarantine everything else with reason + removal_path, self-heal on re-run. |
| `backend/scripts/2026_07_16_03_canonical_assignment_validate.sql` | VALIDATE (switch) — `VALIDATE CONSTRAINT` the 4 canonical FKs (only where still NOT VALID) and the CHECK. |
| `…_01/02/03_…_rollback.sql` | Operator-only reverse scripts (excluded from the sweep). See teardown-order note below. |
| `backend/apps/common/canonical_assignment.py` | DB-free contract source of truth: `classify_resolution`, `is_resolvable`, `removal_path_for`, reason codes, and the post-state `INVARIANT_QUERIES` / `run_invariants`. The SQL mirrors this exactly. |
| `backend/tests/unit/test_canonical_assignment_remediation.py` | Verifier: always-on pure-contract tests + Postgres-gated integration (applies expand→backfill→validate against fixtures) + release-gate CLI tests. |

## Neon rehearsal (Stage 2)

- **Rehearsal branch:** `br-jolly-pine-ahybtg2e` (`v2-task-3.2-rehearsal`),
  parent/default `br-floral-scene-aha2ybfd`, project `wild-bar-37055823`
  (`mihasApplication`), db `neondb`. Left intact for operator inspection; all
  mutation used the branch id explicitly. Neon **default** and production
  received **no** writes.
- **Apply result (expand → backfill → validate):** **0 rows backfilled**, **32
  non-draft rows quarantined** as `offering_missing_canonical`, **1 draft
  exempt** — exactly as Stage 1 predicted.

### Post-state gate — PASS

| Gate | Value | Pass |
|---|---|---|
| I8 `nondraft_nonquarantined_missing` | 0 | ✅ |
| I8 `dangling` | 0 | ✅ |
| I8 `quarantined_without_ledger` | 0 | ✅ |
| I7 open `offering_missing_canonical` ledger rows | 32 | ✅ (matches 32 quarantined) |
| `chk_applications_canonical_assignment` validated | true | ✅ |
| 4 canonical FKs validated | true (×4) | ✅ |

### Rollback proof + teardown-order note (Finding 2)

The rollback reverts cleanly. The **only correct full-teardown order is
`03_rollback` (no-op) → `01_rollback`**: `01_rollback` drops the CHECK → the
`assignment_quarantined` column → the ledger table together, which reverts the
quarantine flags and ledger by construction and returns the branch to its
pre-expand state (33 apps intact, June tenant schema's 4 validated canonical FKs
preserved). The `02_rollback` bookkeeping script is **only** valid for a
pre-CHECK partial revert: run after expand it sets `assignment_quarantined =
false` on still-unassigned non-draft rows and is (correctly) rejected by
`chk_applications_canonical_assignment` — the transaction rolls back with state
unchanged. Full **data** revert for a real backfill is forward-only → discard the
Neon branch or restore from backup (as the `02_rollback` header states).

### Corrected-backfill note (BLOCKER fixed during rehearsal)

The first apply failed with `function min(uuid) does not exist`. Postgres has no
`min(uuid)` aggregate, so the backfill's five `min(<uuid>)` calls were corrected
(user-approved) to **`min(<uuid>::text)::uuid`**: `p.id`, `p.canonical_program_id`,
`p.institution_id`, `t.id` (Step 2 backfill CTEs) and `p.canonical_program_id`
(Step 3 quarantine CTE). These aggregates are only consumed when the group has
exactly one candidate (`c = 1`), so the resolved value is unchanged — the cast
only gives Postgres a comparable type. Re-apply then succeeded (results above).
The working-tree `…_02_…_backfill.sql` now matches the proven SQL, and it would
have failed identically on the Neon default branch and production.

## Pure-contract test result (Stage 3a)

Ran the always-on, DB-free contract tests only:

```
DATABASE_URL="sqlite://:memory:" .venv/bin/python -m pytest \
  tests/unit/test_canonical_assignment_remediation.py \
  -k "not release_gate and not scripts and not idempotent" -q
```

**Result: 9 passed, 6 deselected** (the 3 Postgres-gated integration tests + the
3 release-gate CLI tests). Pinning `DATABASE_URL` to in-memory SQLite means the
run cannot reach Neon or production, and the Postgres-gated tests auto-skip
(`connection.vendor != 'postgresql'`). The 9 cover `classify_resolution` /
`is_resolvable`, every reason-code mapping, the offering-before-intake-before-
canonical precedence, negative-count rejection, and the hypothesis property
`RESOLVABLE ⇔ (one offering ∧ one intake ∧ canonical link)`.

### Contract ↔ corrected-backfill alignment (confirmed, Stage 3a item 2)

No functional drift on the three points that matter:

- **min-cast:** all five `min(<uuid>::text)::uuid` sites present in the
  working-tree backfill; no bare `min(uuid)` remains. The (Postgres-gated) test
  applies the real script file and asserts the resolvable row is fully
  backfilled, so it exercises the corrected SQL.
- **reason codes:** contract constants (`no_offering_match`, `ambiguous_offering`,
  `no_intake_match`, `ambiguous_intake`, `offering_missing_canonical`,
  `dangling_fk`) and `classify_resolution`'s precedence match the backfill's Step 3
  `CASE` order exactly.
- **draft-exempt:** enforced in SQL (`WHERE status <> 'draft'`); the pure
  classifier is status-agnostic by design, and the integration test asserts a
  draft row is neither quarantined nor ledgered.

Minor coverage gap (report-only, not fixed here): `removal_path_for` is defined
in the contract module and its strings are mirrored verbatim in the backfill
Step 3 `removal_path` text, but there is no dedicated pure-contract unit test for
it (its strings are only exercised indirectly). Candidate for a one-line test in
Stage 3b. The SQL `ELSE 'unresolved'` branch has no contract constant; it is an
unreachable defensive branch given the preceding candidate logic, not drift.

## Operator-gated production-apply steps (Neon-proven → production)

Production is the self-hosted EC2 Docker Postgres (`mihas-postgres-1`), never
edited first. After the change is proven on Neon (above), an **operator** applies
it per **`deploy/RUNBOOK.md`** — high-risk, backup-first:

1. Back up production first (`deploy/backup-db.sh`).
2. Apply on the Neon **default** branch (proven on `br-jolly-pine-ahybtg2e`), then
   copy Neon → production per `deploy/RUNBOOK.md` §3. The backend boot sweep
   (`apply_sql_migrations`) picks up the additive forward scripts
   (`…_01/02/03_…canonical_assignment_…sql`) in filename order; the `*_rollback.sql`
   scripts are excluded from the sweep.
3. **Canonical-program seeding blocker is owned by task 5.1.** Until the 4
   offerings carry a `canonical_program_id`, the backfill correctly quarantines
   all 32 non-draft rows as `offering_missing_canonical`. After task 5.1
   canonicalises the catalog, **re-running the idempotent backfill self-heals**
   the quarantine (resolves the ledger rows, clears the flags) with no manual
   edits. 3.2 stays off 5.1's turf.

## Stage 3b — completed

Candidate commit unchanged: `bae29a28d9657f288b3339062adb31285959c966`. Stage 3b
is **test + local-Postgres verification only** — it added one release-gate test
and ran the previously-deselected Postgres-gated suite. It touched **no API
surface, no model, no migration script**, so **no OpenAPI/schema regeneration was
required** and the schema fingerprint is unchanged from Stage 3a.

### Item 1 — Postgres-gated integration + release-gate tests (PASS)

Ran against a **local throwaway Postgres only** — a disposable Docker instance
(`postgres:17-alpine`, container `mihas-localtest-32`, published on
`127.0.0.1:5433`, throwaway creds `mihas/localtest`, db `mihas_localtest`;
pytest-django created/destroyed `test_mihas_localtest`). The Neon default branch,
the Stage-2 rehearsal branch, and production (EC2 Docker) received **no** writes,
and **no Neon branch was created or deleted**.

```
DATABASE_URL="postgres://mihas:localtest@127.0.0.1:5433/mihas_localtest" TESTING=1 \
  .venv/bin/python -m pytest tests/unit/test_canonical_assignment_remediation.py -v
```

**Result: 16 passed, 0 failed** (2.5 s). This includes the **6 tests deselected in
Stage 3a**, now actually executed on Postgres:

- `test_scripts_backfill_resolvable_and_quarantine_the_rest` — applies
  expand→backfill→validate against seeded fixtures; asserts the resolvable row is
  fully backfilled + not quarantined, the ambiguous / no-offering-match /
  offering-missing-canonical rows are quarantined with the right ledger reason,
  the draft row is exempt (not quarantined, no ledger), and the I8 post-state
  invariants are all zero. **PASS**
- `test_check_constraint_and_fks_are_validated_after_scripts` — reuses the task
  3.1 manifest verifier to prove `chk_applications_canonical_assignment` and all
  four canonical FKs are `validated=true` after the scripts. **PASS**
- `test_backfill_is_idempotent` — re-running the backfill leaves the ledger row
  count unchanged (1). **PASS**
- The 3 release-gate CLI tests (below). **PASS**

The 9 always-on pure-contract tests also passed in the same run. Under the
**SQLite fast profile** (`DATABASE_URL="sqlite://:memory:"`) the same file reports
**11 passed, 5 skipped** — the 5 `@pg_only` tests skip with a clear reason and the
two backend-agnostic release-gate tests still run, so the gate is exercised in
**every** CI profile (not only the Postgres one).

### Item 2 — release-gate wiring (DONE) + new fail-on-violation test (PASS)

The task-3.1 verifier command was **extended, not duplicated**:
`python manage.py schema_manifest --verify-canonical-assignment` runs
`apps.common.canonical_assignment.run_invariants` against a live DB (the Django
connection, or a read-only `--dsn-env` DSN) and **exits non-zero (DRIFT) if any
invariant count is > 0**. Behaviour matrix, all proven by tests:

| Situation | Behaviour | Test |
|---|---|---|
| remediation objects absent | `SKIP` (exit 0) — gate N/A until expand runs | `test_release_gate_skips_when_remediation_absent` (all profiles) |
| absent **and** `--require-applied` | `FAIL` (exit 1) — post-apply gate expects it live | `test_release_gate_require_applied_fails_when_absent` (all profiles) |
| applied, invariants all zero | `OK` (exit 0) | `test_release_gate_passes_after_scripts_when_invariants_zero` (pg) |
| applied, a non-draft row left unresolved+unquarantined | `DRIFT` (exit 1), then `OK` after backfill+validate | **`test_release_gate_fails_on_seeded_violation_then_passes_after_remediation`** (pg, **added in 3b**) |

The new test is the "fails on a seeded violation and passes clean" proof: it
seeds a non-draft legacy row **before** expand (so the `NOT VALID` CHECK does not
reject the insert), runs **expand only**, and asserts the gate exits 1 with
`nondraft_nonquarantined_missing = 1`; it then runs backfill+validate (which
quarantines the unresolvable row into the ledger) and asserts the **same** gate
now reports every invariant zero. Enforcement is via the pytest suite — the same
way the task-3.1 `schema_manifest` verifier is enforced (neither is a standalone
CI workflow step); the absent-case gate tests run in every profile and the
applied/violation cases run in the Postgres profile.

### Task 3.2 status

Deliverable **complete except the operator production apply**, which is owned
downstream by **task 5.1** (canonical-program seeding). Until task 5.1
canonicalises the catalog, the proven, idempotent backfill correctly quarantines
the 32 non-draft rows as `offering_missing_canonical`; re-running it after 5.1
self-heals the quarantine with no manual edits.
