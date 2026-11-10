# Task 13.6 remediation — L2 and L3

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · remediation items **L2** and
**L3** of [`docs/v2-evidence/13.6/README.md`](../../README.md) §8.1
Requirements: **R15.3–R15.4** (additive expand, no rewrite, bounded locks),
**R15.7–R15.8** (a restored backup SHALL be able to be brought forward),
**R9.2** (rollback contract), **R18.7** (rehearsed before production)
Findings: **GATE-13.4-02**, **GATE-13.5-01**, **GATE-13.3-13**, **STU-13**;
blocking items **B5** and **B6**

---

## THE VERDICT: L2 CLOSED · L3 CLOSED · GATE-13.4-02 WAS TWO DEFECTS

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  L2 — three snapshot columns narrower than the model        **CLOSED**    │
  │  L3 — a restored backup cannot be brought forward           **CLOSED**    │
  │                                                                          │
  │  PREFLIGHT GATE 22 READS **PASS**  (it read FAIL before)                  │
  │                                                                          │
  │  GATE-13.4-02 was TWO defects stacked in one script. 13.5 measured the    │
  │  first and could not see the second, because the sweep died on the        │
  │  first. Both are now fixed and the whole 44-file sweep completes.        │
  │                                                                          │
  │  width probe        3 narrower → **0**                                   │
  │  long-value probe   4 failing writes → **0**                             │
  │  boot gate          exit 1 → **exit 0** (and 0 under --strict)           │
  │  sweep              aborts at script 1 of 23 → **24/24 OK, exit 0**      │
  │  idempotence        2nd complete run: **clean no-op**                    │
  │  rollback           both pairs applied, re-converged, boot gate still 0  │
  │                                                                          │
  │  Whole tree:  −2 failures · +5 passes · skips UNCHANGED (103)            │
  │               · error count UNCHANGED (1) · zero new failures            │
  │                                                                          │
  │  NOT closed:  B1 B2 B3 B7 B8 B10 B11 — untouched, by design              │
  └──────────────────────────────────────────────────────────────────────────┘
```

| | before | after |
|---|---|---|
| preflight **gate 22** (forward-migration prerequisite) | **FAIL** — `apply_sql_migrations will abort at 2026_06_08_01 here` | **PASS** |
| preflight **gate 20** (snapshot ceilings) | 3 × WARN | **2 × PASS**, 1 × WARN (§6.1 — not L2's) |
| `apply_sql_migrations` on `v2_snap_13_6` | 23 pending, **0 applied**, exit 1 | **24 applied, exit 0** |
| `manage.py check_schema_drift` | exit **1** — 2 missing tables, 5 missing columns | **exit 0**, 78 models verified (also 0 with `--strict`) |
| `width-drift-probe.py` | **narrower=3**, 2 absent columns, 2 absent tables, exit 1 | **narrower=0, wider=0**, 0 absent, exit 0 |
| `long-value-probe.py` (GATE-13.3-13) | **failing_writes=4**, ORM create *unavailable* | **failing_writes=0**, ORM create **ok** |
| `migration_history` rows / base tables / `canonical_programs` rows | 50 / 77 / 0 | **75 / 80 / 4** |
| whole backend tree | 96 failed / 5232 passed / 103 skipped / 2 xfailed / 1 xpassed / 1 error | **94 failed / 5237 passed / 103 skipped / 2 xfailed / 1 xpassed / 1 error** |

Sources, in order:
[`raw/03-preflight-before.txt`](raw/03-preflight-before.txt) ·
[`raw/11-preflight-after.txt`](raw/11-preflight-after.txt) ·
[`raw/05-sweep-before.txt`](raw/05-sweep-before.txt) ·
[`raw/06-sweep-after-run1.txt`](raw/06-sweep-after-run1.txt) ·
[`raw/07-pending-trigger-diagnosis.txt`](raw/07-pending-trigger-diagnosis.txt) ·
[`raw/08-sweep-after-run2.txt`](raw/08-sweep-after-run2.txt) ·
[`raw/09-idempotence-and-boot-gate.txt`](raw/09-idempotence-and-boot-gate.txt) ·
[`raw/02-width-probe-before.txt`](raw/02-width-probe-before.txt) ·
[`raw/10-width-probe-after.txt`](raw/10-width-probe-after.txt) ·
[`raw/04-long-value-before.txt`](raw/04-long-value-before.txt) ·
[`raw/12-long-value-after.txt`](raw/12-long-value-after.txt) ·
[`raw/13-rollback-pairs.txt`](raw/13-rollback-pairs.txt) ·
[`raw/14-migration-suites.txt`](raw/14-migration-suites.txt) ·
[`raw/15-runner-fix-tests.txt`](raw/15-runner-fix-tests.txt) ·
[`raw/16-backend-whole-tree-after.txt`](raw/16-backend-whole-tree-after.txt) (360.49 s) ·
[`raw/17-django-check.txt`](raw/17-django-check.txt) ·
[`raw/18-residual-intake-ceiling.txt`](raw/18-residual-intake-ceiling.txt).

The "before" whole-tree column is
[`../L1-L4/raw/backend-whole-tree-after.txt`](../L1-L4/raw/backend-whole-tree-after.txt).
L1-L4 §4 flagged that artifact as ≈ 7 minutes stale against a later
`test_enrollment.py` edit; `raw/16` **supersedes it** as the clean measurement and
is the number to quote from here on.

---

## 1. The headline: GATE-13.4-02 is two defects, and 13.5 could only see one

13.5 §4.1 named the root cause and named it correctly:
`canonical_programs.id` on the production lineage has no `gen_random_uuid()`
default, so the June script's own `INSERT … SELECT FROM programs` — which supplies
no id — violates the not-null constraint and the sweep aborts. Measured on this
batch's scratch copy of the restored snapshot
(`raw/05-sweep-before.txt`):

```
psycopg2.errors.NotNullViolation: null value in column "id" of relation "canonical_programs"
DETAIL:  Failing row contains (null, Diploma in Registered Nursing, DRN, …)
CommandError: Migration 2026_06_08_01_multi_tenant_beanola_admissions.sql failed
```

L3's one-statement script clears it. `raw/06-sweep-after-run1.txt` shows
`2026_06_08_00_canonical_programs_id_default.sql … OK` and the `INSERT` succeeding.
And then **the same script fails again, on a different error**:

```
psycopg2.errors.ObjectInUse: cannot CREATE INDEX "programs" because it has pending trigger events
CommandError: Migration 2026_06_08_01_multi_tenant_beanola_admissions.sql failed
apply_sql_migrations exit=1
```

**Stated plainly: 13.5's root cause was correct and incomplete, and a restored
production-lineage backup still could not be brought forward after fixing it.**
13.5 could not have seen this — the sweep never reached the statement, because
the missing default aborted the transaction eleven statements earlier. This is a
new finding, and it is filed here rather than folded into L3's success.

### 1.1 What the second layer actually is

`CheckTableNotInUse` → `AfterTriggerPendingOnRel`: Postgres refuses DDL on a
relation that has **queued after-trigger events** in the current transaction. A
`DEFERRABLE INITIALLY DEFERRED` foreign key queues its referential check to
**COMMIT** rather than to end-of-statement, so any row write leaves that table
"in use" for the rest of the transaction.

Three facts have to coincide, and on this lineage all three do:

| fact | evidence |
|---|---|
| The runner puts the **whole file in one transaction** — one `cursor.execute(sql)` inside one `transaction.atomic()` | `backend/apps/common/management/commands/apply_sql_migrations.py:733-759` (`_apply_transactional`) |
| The June script **backfills and then indexes the same tables**: `UPDATE programs SET canonical_program_id = cp.id`, `UPDATE applications SET institution_id = …`, then `CREATE INDEX … ON programs`, `… ON applications`, then `ALTER TABLE applications ADD CONSTRAINT` | `backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql` |
| The database carries **17 `DEFERRABLE INITIALLY DEFERRED`** foreign keys on the tables that script writes — Django-created duplicates sitting *alongside* the hand-written non-deferrable ones | `raw/07-pending-trigger-diagnosis.txt` (inventory printed in every mode) |

The duplication is the tell. `programs.canonical_program_id` carries **two** FK
constraints to `canonical_programs`: the hand-written
`programs_canonical_program_id_fk` (`condeferrable = f`) and Django's
`programs_canonical_program_id_0a4d4e8d_fk_canonical_programs_id`
(`condeferrable = t`, `condeferred = t`). Django's schema editor declares every
foreign key it manages `DEFERRABLE INITIALLY DEFERRED`; a from-empty
`00_full_schema.sql` build has only the hand-written non-deferrable ones and
therefore queues nothing. **That is why the fresh-build rehearsal never saw
this and only the restored-backup lineage does** — the same asymmetry that made
GATE-13.4-02 a restore-path finding in the first place.

### 1.2 It is four statements, not one index — measured

`raw/pending-trigger-probe.py` walks the June script statement by statement using
**the runner's own `_split_sql_statements`**, wrapping each statement in its own
savepoint so a failure is recorded and stepped over instead of aborting the walk.
The sweep can only ever show the first collision; this shows all of them
(`raw/07-pending-trigger-diagnosis.txt`, `--mode baseline`):

| # of 40 | statement | error |
|---|---|---|
| 30 | `CREATE INDEX IF NOT EXISTS idx_programs_canonical_program_id` | `cannot CREATE INDEX "programs" …` |
| 31 | `CREATE INDEX IF NOT EXISTS idx_programs_offering_assignment` | `cannot CREATE INDEX "programs" …` |
| 33 | `CREATE INDEX IF NOT EXISTS idx_applications_tenant_ids` | `cannot CREATE INDEX "applications" …` |
| 40 | the terminal `DO $$ … $$` block | `cannot ALTER TABLE "applications" …` |

Statement 40 matters for the choice of fix: it is
`ALTER TABLE applications ADD CONSTRAINT applications_program_offering_id_fk …
NOT VALID`, and on this lineage that hand-written constraint genuinely does not
exist yet (only Django's `applications_program_offering_id_faed250f_fk_programs_id`
does), so the guarded `ALTER TABLE` really does run — and really does collide.

**Two currency notes, because this instrument dates quickly.**
`raw/07` pins the state it was measured in — its own tail reports
`migration_history rows : 51` and `canonical_programs rows : 0`, i.e. after L3 and
before the June script. **Re-running it against `v2_snap_13_6` today reads PASS in
every mode**, and correctly so: the backfills now match zero rows
(`canonical_program_id IS NULL` is satisfied by nothing), so no deferred check is
queued and there is nothing to collide with. The reproduction lives in the
pre-June state, which is why it was recorded there and why `v2_snap_13_4` must
stay untouched — a fresh `TEMPLATE` copy is the only way to get it back.
Separately, the probe's source was edited **after** `raw/07` was recorded: the
`precreate` statement list was re-parenthesised for readability. The concatenated
SQL is byte-identical and no logic changed.

### 1.3 Two candidate fixes measured and rejected, one measured and taken

The remediation preference is "additive follow-on script, leaving the June script
untouched". It **cannot work here**, and the reason is structural rather than a
matter of taste:

1. **An additive follow-on script never runs.** The failure is *inside* the June
   script's own transaction, and `apply_sql_migrations` aborts the whole sweep at
   the first failing file. Anything sorting after it is unreachable. This is the
   mirror image of why L3 *could* be done additively: L3 changes a **precondition**
   and therefore had to sort *before* `2026_06_08_01`.
2. **Pre-creating the indexes does not work either** — measured, not assumed
   (`--mode precreate`, still **4 of 40 failing**). Postgres performs the
   pending-events check **before** the `IF NOT EXISTS` short-circuit: the probe's
   own tail shows `idx_programs_canonical_program_id : 1`, i.e. the index already
   existed on this snapshot and `CREATE INDEX IF NOT EXISTS` raised anyway. And it
   would do nothing for statement 40's `ALTER TABLE`.
3. **`SET CONSTRAINTS ALL IMMEDIATE` clears all four** — `--mode immediate`,
   **0 of 40 failing**.

`SET CONSTRAINTS` is scoped to the **current transaction**, and each migration
gets its own transaction. So no other SQL file can issue it on the June script's
behalf; the only two places it can come from are the June script itself or the
runner. **The June script was not edited.** Its checksum (`sha256=7f0e69390dff`)
is recorded in the `migration_history` of every database that applied it cleanly,
and changing a file whose checksum is already in the ledger breaks the
migration-history contract. The statement is issued by the runner instead.

### 1.4 The fix

`backend/apps/common/management/commands/apply_sql_migrations.py`

* `_set_constraints_immediate()` at `:459` — Postgres-only, best-effort, with the
  measurement, the mechanism and the two rejected alternatives written down where
  the next reader will find them.
* called at `:752`, as the first statement inside `_apply_transactional`'s
  `transaction.atomic()`, before the file body at `:754`.
* the module docstring's design notes gain a *Deferred-constraint handling*
  bullet at `:42`, next to the *Atomicity* bullet it qualifies.

**This makes checking stricter, not weaker.** Every deferred check still runs,
inside the same transaction, just at end-of-statement instead of at COMMIT. A
violation still aborts the migration, still rolls the write back, and still
leaves `migration_history` unwritten — `raw/15-runner-fix-tests.txt` case 2.

**The one capability it gives up**, pinned deliberately rather than discovered
later: a migration file may no longer hold a foreign key violated *across
statement boundaries* and repair it before COMMIT. No script in
`backend/scripts/` relies on that — the whole 44-file sweep applies clean
(`raw/08`) — and the additive-only contract does not permit it in the first
place. `test_immediate_mode_is_in_effect_during_the_file` states this in a test
rather than in a comment.

### 1.5 The new tests provably discriminate

`backend/tests/unit/test_apply_sql_migrations_deferred_constraints.py` — 3 cases,
real Postgres, no mocks: a parent/child pair whose FK is
`DEFERRABLE INITIALLY DEFERRED`, and a migration file that writes rows and then
indexes the same table.

With the one call at `:752` commented out (`raw/15-runner-fix-tests.txt` case 2):

```
django.db.utils.OperationalError: cannot CREATE INDEX "_aux_deferred_child" because it has pending trigger events
...
test_immediate_mode_is_in_effect_during_the_file: DID NOT RAISE <class 'CommandError'>
2 failed, 1 passed
```

The production error, reproduced verbatim in a unit test, and a positive control
proving the mode really is IMMEDIATE now. Restored, `3 passed`. The middle case —
a genuine referential violation — fails the migration in **both** modes, which is
exactly what it should do.

---

## 2. L3 — the rehearsal, end to end

Rehearsed on **`v2_snap_13_6`**, this batch's own scratch database on Neon branch
`br-jolly-pine-ahybtg2e`, created `TEMPLATE v2_snap_13_4 STRATEGY file_copy`
(`raw/00-scratch-db-create.txt`) and shown faithful to the template
(`raw/01-scratch-db-parity.txt`: identical base tables, migrations recorded,
row counts, missing id default and identical 50/50/50 widths).
**`v2_snap_13_4` was read as a template and never written**, so the only
reproduction of GATE-13.4-02's original state still exists.

| step | artifact | result |
|---|---|---|
| sweep, before | `raw/05` | 23 pending; dies on script 1 of 23; `migration_history` unchanged at 50 |
| sweep, run 1 (L3 + L2 on disk) | `raw/06` | L3 `OK`; June script dies on the **second** layer |
| diagnosis | `raw/07` | 4 colliding statements; `immediate` clears all 4 |
| sweep, run 2 (runner fixed) | `raw/08` | **24 of 24 `OK`, `exit=0`** — including `2026_08_13_01` (L2) 23rd and `perf_idx_…` last |
| sweep, run 3 — idempotence | `raw/09` | `All 44 migrations already applied. Nothing to do.` on **both** `--dry-run` and the real run, `exit=0` |
| boot gate | `raw/09` | `No schema drift. Verified 78 managed=False model(s).` `exit=0` — and `exit=0` under `--strict`, so the 2 previously-missing tables are really there |

Before, the boot gate refused with 2 missing tables and **5** missing columns on
`applications` (`configuration_version`, `requirements_snapshot`,
`eligibility_snapshot`, `assignment_version`, `draft_name`) — the exact shape of
"restore works, the app will not start".

### 2.1 Preflight gate 22 — the check this batch exists for

`raw/03` → `raw/11`, same file, same database, read-only:

```
before  gate22 forward-migration prerequisite | f | 0 | f | 50 |
        FAIL - GATE-13.4-02: apply_sql_migrations will abort at 2026_06_08_01 here

after   gate22 forward-migration prerequisite | t | 4 | t | 75 |
        PASS - the June script is already recorded; the sweep will not retry it
```

All four of gate 22's inputs moved: the id default is present, `canonical_programs`
has 4 rows, the June script is recorded, and `migration_history` is at 75.
**That is what turns "data-level rollback unproven" into proven**: a restored
production-lineage backup can now be brought forward with the documented one
command, and the app starts against the result.

Gate 21 (`colliding_intake_names = 3`) still reads **FAIL**. That is
GATE-13.2-01's *data* half — three intake names shared across the two active
institutions — and it belongs to another lane. L1 removed the code path that
weaponised those names; nothing in this batch renames a tenant's intake, and
nothing should.

One incidental improvement worth naming because it is visible in the artifact:
gate 24 reported `submitted_or_beyond = 0` for both tenants before and
`KATC 9 / MIHAS 23` after. The applications were always there; the canonical
linkage the June backfill writes is what lets a per-tenant rollup see them.

---

## 3. L2 — three columns narrower than the model

`applications.institution` `varchar(50) → varchar(255)`,
`applications.intake` `50 → 100`,
`applications.program` `50 → 255`.

The targets are not new numbers: they are exactly what
`backend/apps/applications/models.py:76-78` declares (255 / 100 / 255) and
exactly what a from-empty `00_full_schema.sql` build produces. The script
converges the inherited lineage on the shape a fresh build already has.

| | before (`raw/02`) | after (`raw/10`) |
|---|---|---|
| NARROWER than the model | **3** | **0** |
| WIDER than the model | 0 | **0** |
| columns absent | 2 | 0 |
| `managed=False` tables absent | 2 | 0 |
| models compared / bounded-length fields | 76 / 330 | 78 / 339 |
| verdict | FAIL, exit 1 | **PASS, exit 0** |

The absent-column and absent-table lines going to zero is L3's work showing up in
L2's instrument; the `narrower 3 → 0` line is L2's.

### 3.1 GATE-13.3-13's actual reproduction, at the write layer

A catalogue fact is not a 500. 13.3 filed the finding from a failure — *a legally
named long intake returns HTTP 500 on every application create* — so
`raw/long-value-probe.py` gives real catalogue rows longer but still legal names
(each inside its own `varchar(255)` ceiling) and writes an `applications` row
carrying them, inside an always-rolled-back transaction.

| write | before (`raw/04`) | after (`raw/12`) |
|---|---|---|
| institution only, 61 chars | `DataError: value too long for type character varying(50)` | `ok: stored institution=61` |
| intake only, 53 chars | `DataError` | `ok: stored intake=53` |
| program only, 59 chars | `DataError` | `ok: stored program=59` |
| all three at once | `DataError` | `ok: 61 / 53 / 59` |
| `Application.objects.create` | **`unavailable`** — `column "configuration_version" … does not exist` | **`ok: 61 / 53 / 59`** |
| verdict | **FAIL — failing_writes=4** | **PASS — failing_writes=0** |

The rename is the ordinary one: `Mukuba Institute of Health and Allied Sciences`
(46 of 50 characters before the widen — **four** characters of headroom, per
13.5 gate 20) plus ` (Ndola Campus)`.

The ORM row is the sharper result. Before, `Application.objects.create` could not
run *at all* on the un-migrated snapshot — the V2 model declares columns that
database never had, so it failed with `ProgrammingError` before reaching a width
ceiling. That was GATE-13.4-02 restated from the application side. It now
succeeds, which means L2 and L3 are proven **together**: the columns are wide
enough *and* the database is far enough forward for V2 code to write to it.

Both probes leave the database unchanged, and both assert it rather than promise
it: `raw/12` re-reads the three catalogue names at their original 46 / 19 / 29
characters and `probe rows remaining : 0`.

### 3.2 Why the boot gate never caught this

`check_schema_drift`'s own docstring, under *What it does NOT check
(intentionally)*, excludes type compatibility because "Postgres auto-coerces most
compatible types". True for a column **wider** than the model; false for one
**narrower** — Django sends the whole value, Postgres raises `DataError`, and
`envelope_exception_handler` answers HTTP 500. The column exists, so the gate
passes and reports the schema as fine. L2 removes the instance rather than
arguing with the gate; the gate's blind spot is unchanged and is not claimed
fixed.

---

## 4. R9.2 — how a widening satisfies a rollback contract

Both forward scripts ship a `*_rollback.sql`. Both rollbacks are **ledger-only**,
and that is a decision with reasons, not an omission.

**A widening has no safe inverse.** The mechanical inverse of
`varchar(50) → varchar(255)` is `varchar(255) → varchar(50)`, which Postgres
accepts only when every stored value already fits in 50. If any application
stored a longer name after the widen — the entire point of the widen — the
narrowing either fails outright or, with `USING left(col, 50)`, silently
truncates a real applicant's record. R9.2 exists to forbid exactly that trade.
So the forward change is one-way at the data level, in the same way every
`ADD COLUMN` is one-way once rows use it.

**Dropping L3's default would re-create the defect.**
`ALTER COLUMN id DROP DEFAULT` is harmless to data and is still deliberately
absent: its effect is that `apply_sql_migrations` aborts again, the boot gate
refuses again, and a restored backup can no longer be brought forward. A rollback
whose outcome is "the database can no longer start" is not a rollback.

**What the pairs therefore undo** is the one artefact that outlives the migration
and *can* be undone without touching a row: the `migration_history` tracking row.
That is not a formality — removing it lets the next sweep re-assert the change,
and on a database that already has it the re-run is a complete no-op because both
forward scripts are guarded (`column_default IS NULL` for L3; `still narrower
than target` for L2).

**Proven, not asserted** (`raw/13-rollback-pairs.txt`):

| step | result |
|---|---|
| both rollbacks applied with `psql` | `DELETE 1`, `DELETE 1`, `exit 0` |
| ledger rows for the two scripts | 2 → **0** (`migration_history` 75 → 73) |
| schema after rollback | **deliberately unchanged**: widths still `255 / 100 / 255`, id default still `gen_random_uuid()`, and `0` rows over the old 50-char ceiling |
| next sweep | `Pending migrations: 2/44` → both `OK` — re-applied as no-ops, `migration_history` back to 75 |
| boot gate after the cycle | `exit 0` under `--strict` |

**Does the lint accept them? Yes.**
`backend/tests/property/test_rollback_safe_operations.py` allows
`DELETE FROM migration_history` in any form; each file is exactly one such
statement and nothing else. Neither file appears anywhere in the violation
output. The lint still fails with **26 violations across the same 9 other lanes'
files** — `2026_07_16_03`, `2026_07_17_02`, `2026_07_18_01`, `2026_07_20_01` (3),
`2026_07_21_01` (6), `2026_07_22_01` (6), `2026_07_25_01`, `2026_07_26_01` (6),
`2026_07_26_02` — the same 26 13.4 §6.1 recorded. **Not one was fixed and not one
was added.** The allow-list was not widened to make room for anything either:
L3's rollback deliberately omits `ALTER COLUMN … DROP DEFAULT` partly *because*
it falls outside R9.2's closed set.

`test_rollback_pairing.py` (every forward script has a rollback sibling) passes.

---

## 5. Tests

### 5.1 The migration / boot-gate / rollback suites

`raw/14-migration-suites.txt` — 21 files, serial, the suites that own the runner,
the boot gate, migration history, drift and rollback pairing:
**8 failed / 159 passed / 19 skipped**.

**All 8 failures are pre-existing**, each present in
`../L1-L4/raw/backend-whole-tree-after.txt`:

| failure | owner |
|---|---|
| `test_schema_reconciliation_invariants::test_snapshot_invariant_holds_after_simulated_backfill` | `payments.application_quarantined` NOT NULL — the payments-quarantine lane. No L2/L3 code in the traceback |
| `test_migration_history_report_freshness` × 2 | the release-report freshness item — §6.2 |
| `test_rollback_safe_operations` × 2 | the 26 pre-existing violations — §4 |
| `test_migration_properties::TestSchemaCompatibility` × 3 | `AdminSavedFilter` / `EXPECTED_TABLES` drift (`50 != 49`) — the `verify_schema_static.py` lane |

The `+3` on the pass column against the same run before the new test file is
exactly `test_apply_sql_migrations_deferred_constraints.py`.

### 5.2 The two residual L1 failures — both fixed

L1-L4 §4 left two failing, both the same defect L4 fixed: a mock encoding the
retired display-name lookup, in a file outside the 12-file corpus.

| test | why it failed | the change |
|---|---|---|
| `test_enrollment.py::TestEnrollmentDeadlineComputation::test_deadline_from_calendar_event` — `assert datetime(2025,6,15) == datetime(2025,7,15,23,59,59)` | the application is a `MagicMock`, so `_coerce_uuid(app.intake_ref_id)` is `None`, `resolve_intake` fails closed, and `compute_deadline` correctly returns `decision_date + 14 days` — never reaching the patched `Intake.objects` | give the app the **canonical id** `app.intake_ref_id = mock_intake.id`, and mock the chain `resolve_intake(require_active=True)` actually walks: `.filter(id=…)` **then** `.filter(is_active=True)` then `.first()` |
| `test_late_applications.py::TestLateFeeRequirement::test_late_fee_required_error` — `assert 'ALREADY_SUBMITTED' == 'LATE_FEE_REQUIRED'` | same shape — `_resolve_offering_for_fees` returns `None` for a `MagicMock` offering id, the late-fee gate never runs, and submission proceeds to `ALREADY_SUBMITTED` at `apps/applications/services.py:861` | `app.program_offering_id = uuid.uuid4()`, and the same two-step `.filter().filter().first()` chain |

`20 passed` across both files. **No assertion was weakened and no fail-closed
guard was relaxed** — the production code is correct, and both cases now reach
the behaviour they are named for instead of documenting the guard by accident.
The comments say which canonical id and why, so the next reader does not
re-derive it.

### 5.3 Whole tree, serial

`raw/16-backend-whole-tree-after.txt` — same invocation as the L1-L4 artifact
(`pytest tests/ -q -p no:cacheprovider -p no:randomly -rs`), 360.49 s:

```
94 failed, 5237 passed, 103 skipped, 2 xfailed, 1 xpassed, 1 error
```

against `96 failed, 5232 passed, 103 skipped, 2 xfailed, 1 xpassed, 1 error`.

Diffing the two artifacts' failure headers (69 unique → 67 unique):

* **only in before**: `TestEnrollmentDeadlineComputation.test_deadline_from_calendar_event`,
  `TestLateFeeRequirement.test_late_fee_required_error` — §5.2's two.
* **only in after**: *nothing.* Zero new failures.

`−2` failures, `+5` passes (the two residuals plus three new tests), skips
**unchanged** at 103, `xfailed` / `xpassed` unchanged at 2 / 1, error count
**unchanged** at 1.

### 5.4 `manage.py check`

`raw/17-django-check.txt` — with the real `backend/.env`, `TESTING` **not**
exported and `REDIS_URL` **not** substituted (the artifact records both as a
guard, since either one produces a spurious `django_ratelimit.E003`):

```
System check identified no issues (1 silenced).
manage.py check exit=0
```

### 5.5 Local databases

Postgres `mihas_localtest` on `127.0.0.1:5433`, Redis on `127.0.0.1:6380`; the
isolated `backend/.env.local.test` stack via `backend/.localtest-host-env.sh`, so
the Neon DSN cannot leak into a test run. `test_%` was verified **empty before**
each measuring run and **empty after** the batch. One honest detail: a leftover
`test_mihas_localtest` was found *at the start* and dropped, and the whole-tree
run leaves one behind again — which is precisely the mechanism behind the
spurious `psycopg2.errors.DuplicateDatabase` on a concurrent second run, and the
reason everything here ran serially. It was dropped again at the end. Containers
were left running; `down -v` was never used.

---

## 6. Two residuals this batch measured but does not close

### 6.1 Gate 20 still WARNs on `applications.intake` — and it is not a width drift

`raw/11` after the widen:

```
applications.institution | institutions.name | 255 | 255 | PASS
applications.intake      | intakes.name      | 100 | 255 | WARN
applications.program     | programs.name     | 255 | 255 | PASS
```

Gate 20's **stated** criterion is `rows_exceeding_ceiling = 0` on every line and
`snapshot_width >= 100 for intake / 255 for program and institution`. L2 meets
that on all three lines. The residual WARN comes from the gate's **verdict
expression**, which fires on `snapshot_width < source_width` — and `intakes.name`
is `varchar(255)` while `Application.intake` is `max_length=100`.

So this is a **model-versus-source mismatch, not schema drift**: the column now
matches the model *exactly*, which is why the width probe reports 0 narrower
**and** 0 wider. The underlying risk is real and measured
(`raw/18-residual-intake-ceiling.txt`): a 150-character intake name is legal in
`intakes.name` and in the `Intake` model, Django does not validate `max_length`
on `.save()`, and the write still raises
`value too long for type character varying(100)`. 100 characters fits, so the
widen did land.

**Not claimed as fixed.** Closing it means changing `Application.intake`'s
`max_length` to 255 *and* widening the column to match — a model change outside
L2's scope. L2 deliberately converged on the model's declared widths rather than
inventing a larger number nobody could later justify.

### 6.2 The migration-report freshness count moved 3 → 5, and was not regenerated

`raw/14` names five omitted scripts where L1-L4 §5 named three:

```
release report omits June 2026+ scripts: [
  '2026_06_08_00_canonical_programs_id_default.sql',        <- this batch
  '2026_08_06_01_admin_saved_filters.sql',
  '2026_08_09_01_application_tracking_secret.sql',
  '2026_08_12_01_tenant_new_table_fk_validate.sql',
  '2026_08_13_01_widen_application_snapshot_columns.sql']   <- this batch
```

**Yes: this batch moved that count, by exactly its own two scripts.** The
intended workflow *is* regeneration — `manage.py migration_history_report --emit`
from a fresh-from-empty database built via the canonical committed path, the
precedent being task 7.3 §6.7, which regenerated it when five June+ scripts had
accumulated unrecorded. It was **not** run here, for two reasons stated rather
than glossed:

1. It writes `docs/v2-evidence/3.6/migration-history.release.json` / `.md` /
   `README.md` — **another task's evidence directory**, which this batch is
   forbidden to touch.
2. It would also silently absorb the **three** omissions that belong to other
   lanes, muddying which lane owes what.

So the count is reported, the two additions are attributed, the workflow is
named, and the regeneration is handed to 13.6's next pass (§8).

`backend/scripts/MIGRATION_HISTORY.md` was **not** edited: it is explicitly the
retired hand-maintained mirror (`migration_history_report.py:4`) and already
lists none of the recent scripts.

---

## 7. What is NOT claimed

1. **Production was not contacted in any way** — no SSH, no `.pem` read, no
   query, no write, no deploy, no restart, no migration. Everything here happened
   on a Neon scratch database.
2. **`v2_snap_13_4`, `v2_fresh_13_4` and `v2_batch_13_4` were not touched.**
   `v2_snap_13_4` was read once, as a `CREATE DATABASE … TEMPLATE` source, and is
   still the only reproduction of GATE-13.4-02's original state. No session was
   opened on `v2_fresh_13_4` or `v2_batch_13_4` at all — the from-empty widths
   quoted in §3 are 13.4's measurement, cited, not re-derived.
3. **The Neon default branch was never written.** All work is on
   `br-jolly-pine-ahybtg2e`, database `v2_snap_13_6`. Every measurement session
   pins `SET default_transaction_read_only = on`; every probe write is inside a
   transaction that is unconditionally rolled back.
4. **`2026_06_08_01_multi_tenant_beanola_admissions.sql` was not edited.** Its
   checksum is still `sha256=7f0e69390dff` in `raw/05`, `raw/06` and `raw/08`.
   No other existing SQL script was edited either.
5. **The 94 remaining whole-tree failures were not fixed** and no attempt was
   made on any of them: the task-9.2 perf goldens, `test_view_auth_classification`'s
   38 unclassified views, the 3 unclassified public endpoints, the 26
   rollback-lint violations, drf-spectacular's 116/3, the 6 `EXPECTED_TABLES`
   drift rows, the `ERROR_CODES` catalogue gap, the capability-endpoint 404s, the
   two undiagnosed `test_production_readiness_metrics.py` failures, and
   `property/test_ip_address_column.py`'s setup error (13.1 cluster E, still the
   single `1 error`). The 15 frontend lint errors were not looked at; no frontend
   file was opened.
6. **Gate 21 is still FAIL** and GATE-13.2-01's data half is untouched. §2.1.
7. **`check_schema_drift`'s type-compatibility blind spot is not fixed.** L2
   removes the instance, not the class. §3.2.
8. **This is a rehearsal, not a production application.** R18.7 asks for the
   change to be *rehearsed* before it reaches production, and that is what is
   proven: on a restored production-lineage copy, the documented one command now
   brings the database forward and the app starts against the result. Applying it
   to production remains an operator step — backup first, per
   `.kiro/steering/infrastructure.md`.
9. **The runner change is proven on 44 real scripts and 3 synthetic ones, not on
   every database in existence.** A script that needs a foreign key violated
   across statement boundaries would now fail; none does today (§1.4).
10. **No number was carried forward without a citation.** The "before" whole-tree
    column is L1-L4's own artifact; the 26 rollback-lint violations are 13.4
    §6.1's figure, re-counted here from `raw/14` and found unchanged.
11. **`git diff --stat` line counts are not this batch's line counts.** The whole
    V2 body of work is uncommitted, so a per-file diff against `bae29a28d` mixes
    this batch's hunks with every earlier task's. §8.1 attributes files and
    quotes line numbers instead.

---

## 8. State left behind

### 8.1 Changed files — 8, of which 5 are new

SQL scripts (4, all new and untracked) — written by this remediation's earlier
pass and unchanged since:

| file | role |
|---|---|
| `backend/scripts/2026_06_08_00_canonical_programs_id_default.sql` | **L3.** One guarded statement. Numbered `…_00` so it sorts **ahead** of the failing `2026_06_08_01` — the ordering is load-bearing and the header says so |
| `backend/scripts/2026_06_08_00_canonical_programs_id_default_rollback.sql` | ledger-only, with the two reasons the mechanical inverse is absent |
| `backend/scripts/2026_08_13_01_widen_application_snapshot_columns.sql` | **L2.** Three guarded widenings + three `COMMENT ON COLUMN` |
| `backend/scripts/2026_08_13_01_widen_application_snapshot_columns_rollback.sql` | ledger-only, with the narrowing that must never be written |

Production code (1):

| file | change |
|---|---|
| `backend/apps/common/management/commands/apply_sql_migrations.py` | `_set_constraints_immediate()` new at `:459`; called at `:752`; design-notes bullet at `:42`. Nothing else in the runner changed |

Tests (3):

| file | change |
|---|---|
| `backend/tests/unit/test_apply_sql_migrations_deferred_constraints.py` | **new, untracked** — 3 cases over a real deferred FK, proven to discriminate (§1.5) |
| `backend/tests/unit/test_enrollment.py` | 1 case — canonical `intake_ref_id` + the real `.filter().filter().first()` chain |
| `backend/tests/unit/test_late_applications.py` | 1 case — canonical `program_offering_id` + the same chain |

Evidence (this directory): this README plus **19** numbered raw artifacts
(`00`–`18`, of which `00`–`06` are this remediation's earlier pass) and 3 reusable
instruments — `raw/dsn.sh` (derives the branch DSN from the gitignored
`backend/.env` at run time and never prints it), `raw/long-value-probe.py`, and
`raw/pending-trigger-probe.py` (new here).

`git status --porcelain` for exactly this batch's code files:

```
 M backend/apps/common/management/commands/apply_sql_migrations.py
 M backend/tests/unit/test_enrollment.py
 M backend/tests/unit/test_late_applications.py
?? backend/scripts/2026_06_08_00_canonical_programs_id_default.sql
?? backend/scripts/2026_06_08_00_canonical_programs_id_default_rollback.sql
?? backend/scripts/2026_08_13_01_widen_application_snapshot_columns.sql
?? backend/scripts/2026_08_13_01_widen_application_snapshot_columns_rollback.sql
?? backend/tests/unit/test_apply_sql_migrations_deferred_constraints.py
```

No settings, no models, no frontend, no CI workflow, no dependency. The other
dirty files under `backend/scripts/` (`MIGRATION_HISTORY.md`,
`legacy_columns_drop_2026_08_15.sql`, `verify_schema_static.py`) were **already
modified** before this batch and were not touched.

### 8.2 Database state

| database | state left |
|---|---|
| `v2_snap_13_6` (Neon `br-jolly-pine-ahybtg2e`) | **fully migrated: 44/44 recorded, 75 `migration_history` rows, 80 base tables, boot gate 0 under `--strict`.** Left in place deliberately — it is the rehearsal record gate 22 now passes on, and re-creating it costs another `TEMPLATE` read of `v2_snap_13_4`. It **no longer reproduces** either layer of GATE-13.4-02: it has been brought forward, which was the point (§1.2) |
| `v2_snap_13_4`, `v2_fresh_13_4`, `v2_batch_13_4` | untouched |
| Neon default branch | never written |
| local `mihas_localtest` (5433) | running; `test_%` empty |
| production | never contacted |

### 8.3 Git

**Nothing committed. Nothing staged by this batch.** Branch `main` at
`bae29a28d` with the V2 tree dirty. The index still carries the **9 pre-existing
staged deletions** from the de-AI work (task 7.4 / 12.4), staged before this
batch and untouched. The five new files remain **untracked**; `git add` was not
run.

### 8.4 Untouched

| item | state |
|---|---|
| `.kiro/specs/admissions-v2-canonical-rebuild/tasks.md` | **unchanged** — no checkbox moved |
| `.../findings.md` | **unchanged** — the second layer of GATE-13.4-02 is filed *here*, in §1, and is still unregistered there (13.6's item L9) |
| `.../.config.kiro` | **unchanged** |
| `docs/canonical-truth-map.md` | **unchanged.** L2 widens two columns the map already designates *display snapshots*; widening does not promote them and introduces no new domain concept |
| `docs/v2-evidence/3.6/**` | **read, never written** — §6.2 |
| other tasks' `docs/v2-evidence/**` | read, never written |
| `docs/v2-evidence/13.6/README.md` | **unchanged** — §8.1's L2/L3 rows are not ticked off here |
| secrets | no DSN, password, token or key appears in this directory |

---

## 9. For 13.6's next pass

**Closed outright:**

| item | why |
|---|---|
| **B5** — GATE-13.5-01 / GATE-13.3-13, the three `varchar(50)` columns | §3. Width probe 3 → 0 narrower and 0 wider; the long-value reproduction goes 4 failing writes → 0, including the ORM's own `create` |
| **B6** — GATE-13.4-02, data-level rollback | §1–2. **Preflight gate 22 reads PASS.** The sweep completes 24/24, the second run is a clean no-op, the boot gate exits 0 under `--strict`, and both rollback pairs apply and re-converge |

**New finding to register** (`findings.md`, item L9's backlog): GATE-13.4-02 had a
**second layer** — a backfill-then-index migration cannot apply on any database
carrying `DEFERRABLE INITIALLY DEFERRED` foreign keys while the runner wraps a
whole file in one transaction. Fixed in the runner, not in the SQL. It is a
*class*, not an instance: any future script that writes rows and then indexes or
alters the same table would have hit it, and only on the restored-backup lineage.

**Handed forward, not finished:**

1. **`Application.intake`'s 100-character ceiling** (§6.1). Gate 20's last WARN.
   Needs a model change plus a matching widen; a 101–255-character intake name
   still 500s, and that is measured, not theoretical.
2. **Regenerate `docs/v2-evidence/3.6/migration-history.release.json`** (§6.2).
   Five June+ scripts are now omitted; two are this batch's. The regeneration
   belongs to whoever may write 3.6's directory.
3. **Apply to production** — an operator step. Backup first, then
   `apply_sql_migrations`, then `check_schema_drift`, then 13.5's preflight to
   confirm gate 22 on the real database. This batch proves the sequence works on
   a restored copy of that database; it does not run it there.

**Not touched, and not claimed:** **B1** (13.5 never executed — operator),
**B2** (`sign-off.md` unsigned), **B3** (GATE-13.5-05, the hostname question),
**B4** / **B9** (closed by L1-L4), **B7** (GATE-13.3-09, `/student/status`),
**B8** (the mobile/a11y cluster), **B10** (4.1 and 7.4 evidence directories),
**B11** (GATE-13.6-01).

One generalisation, since it cost this batch its whole middle section. L3 was
authored from a read-only measurement — 13.5 §4.1 read `information_schema`, found
the missing default, and named the fix. The fix was right. It was also only the
first of two, and **the second was invisible to any read-only probe**: it exists
only while a transaction is open, in the interaction between one script's
statement order and one *other* lineage's constraint deferrability. Nothing short
of actually running the sweep on a restored copy would have found it. That is the
argument for rehearsing a restore rather than reasoning about one — and it is why
the instrument that found it (`raw/pending-trigger-probe.py`) reports **every**
colliding statement rather than stopping, as the sweep must, at the first.
