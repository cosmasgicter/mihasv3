# Task 13.4 — Rehearse data migration, rollback, and operational recovery

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · Phase 13, fourth bullet
Requirements: **R15, R17, R18.3–R18.7**
Findings: **DATA-03, DATA-07, DATA-08, DATA-09, DATA-10, DATA-11**
Required_Evidence: **timed rehearsal log, manifests, rollback and reconciliation output**

**Where this ran.** Every clause ran on the Neon rehearsal branch
`br-jolly-pine-ahybtg2e` (`v2-task-3.2-rehearsal`, endpoint `ep-proud-cherry-ah8n4q0f`,
project `mihasApplication` / `wild-bar-37055823`), plus one disposable local
`postgres:17-alpine` container as the restore target. The branch was **reused, not
created** — the project is at its branch cap (`create_branch` → 422 branches limit
exceeded), the same constraint task 3.4 hit. The Neon **default** branch was read
only, for comparison. **The self-hosted production Postgres was never contacted:
no SSH, no query, no write.** Production writes are operator steps
(`.kiro/steering/infrastructure.md`), and 13.5 owns the canary.

---

## The claim table

Seven clauses, each rehearsed and each timed. The `ms` column an operator needs
is in [`raw/rehearsal-log.txt`](raw/rehearsal-log.txt) — Section A in execution
order, Section B re-ordered by clause for budgeting a maintenance window.

| # | Clause | What was rehearsed | Result | Wall time |
|---|---|---|---|---|
| C1 | **from empty** | `00_full_schema.sql` → `migration_history_extend` → `apply_sql_migrations --allow-non-additive`, on Neon PG17 | **41 scripts, exit 0**, each with its sha256. Fingerprint `a48a176d…` — **byte-identical to 13.1's local PG16 build** | **254 s** |
| C2 | **production-like snapshot** | restore a snapshot into a Neon database, then run the sweep forward | restore + parity exact; **the sweep FAILS at `2026_06_08_01`** (§3) | **547 s** |
| C3 | **failed batch restart** | SIGKILL mid-sweep → restart into a poisoned script → withdraw it → restart | **converges to `19c5216b…`, identical to the clean run** (§4) | **256 s** |
| C4 | **constraint validation** | GATE-13.1-01: orphan preflight, lock measurement, validate 9 FKs, new `_validate.sql` | 9 → **0** NOT VALID FKs; `--verify` returns **ok** for the first time anywhere (§5) | **41 s** |
| C5 | **app rollback, expanded schema remains** | old application code at git `HEAD` against the fully expanded schema, 19 probes | **18 of 19 pass; the one failure is the real constraint boundary**, with a measured mitigation (§6) | **31 s** |
| C6 | **reconciliation** | payment / document / domain / communication — the platform's **own** sweeps, each run twice | **25 probes, 24 pass, 1 EXPECT-DEFECT is a new finding** (§7) | **117 s** |
| C7 | **database restore** | `deploy/RUNBOOK.md` §3 verbatim: dump → 3b → 3c → 3d → boot gate → `shred -u` | **restore 0.9 s, parity exact, dump shredded**; two RUNBOOK defects found (§8) | **85 s** |

**Named artifacts.** All three the `_Evidence:` line asks for:

| Artifact | Where |
|---|---|
| **timed rehearsal log** | [`raw/rehearsal-log.txt`](raw/rehearsal-log.txt) — 48 steps, wall ms each, plus a clause-ordered window budget |
| **manifests** | 5 in [`raw/`](raw/), comparable to 13.1's three (§2) |
| **rollback and reconciliation output** | [`raw/c5-rollback-defect-proof.txt`](raw/c5-rollback-defect-proof.txt), [`raw/c5-rollback-test-after-fix.txt`](raw/c5-rollback-test-after-fix.txt), [`raw/c5-app-rollback-expanded-schema.txt`](raw/c5-app-rollback-expanded-schema.txt), [`raw/c6-reconciliation.txt`](raw/c6-reconciliation.txt) |
| *(added)* operator gate set | [`invariants.sql`](invariants.sql) — 10 read-only gates, run against both databases (§9) |

**Two inherited findings, both settled.**

| Gate | Verdict |
|---|---|
| **GATE-13.1-01** — nine FKs permanently `NOT VALID` | **Fixed here.** The missing `_validate.sql` was the one script in the expand/validate pattern that was never written. Writing it is inside this bullet's "constraint validation" clause, and the lock cost is what made it safe to write (§5). |
| **GATE-13.1-06** — a rollback script is not inverse-additive | **The script was wrong, not the requirement.** R9.2 needs no exception. Corrected, with the reason measured on Neon (§6.1). The two tests still fail on **other lanes'** 26 violations — stated, not hidden. |

**Findings: three new, two re-measured, none of the new ones fixed.**

| id | sev | what | owner |
|---|---|---|---|
| **GATE-13.4-01** | **high** | a **migration script** seeds the platform-wide communication fallback with a **legacy tenant's brand** — all 19 rows `institution_id IS NULL` *and* MIHAS-branded, and the rehearsal watched one reach a real queued email (§7.4) | communication / tenancy lane |
| **GATE-13.4-02** | **high** | **a restore-from-backup of this snapshot cannot be brought forward.** The boot gate refuses it, and the RUNBOOK's prescribed remedy is the sweep — which fails on this very snapshot (§8.3) | data-migration lane (this lane) + 13.5 |
| **GATE-13.4-03** | med | `deploy/RUNBOOK.md` §3a pins `postgres:16-alpine` to dump a **PG17** server, so the runbook's first command cannot succeed as written (§8.1) | deploy/runbook lane |
| GATE-13.2-02 | med | `CapacityService.SEAT_STATUSES` omits `enrolled`; `reconcile()` released an enrolled student's seat — **measured on an isolated capacity row** (§7.5) | capacity lane (5.3 / 9.x) |
| GATE-13.1-04 | med | the two 12-char truncated `migration_history` checksums are still present on snapshot-derived databases and can never match (§9.2) | data lane |

---

## 1. What this task establishes

1. **The from-empty build is reproducible across engines.** C1 on Neon
   PostgreSQL 17.10 produced fingerprint `sha256:a48a176d78ed2663…` over 89
   tables. 13.1's run of the same 41 scripts on a **local PostgreSQL 16.14**
   produced `sha256:a48a176d78ed2663…` — the same value. The schema this release
   builds is a function of the scripts, not of the server it lands on. That is
   the strongest single statement this rehearsal can make, and it is why the
   fingerprint is usable as a release gate rather than a local curiosity.

2. **A killed, restarted, once-failed sweep lands byte-identically on the clean
   result.** C3 did not assume `apply_sql_migrations` is idempotent; it SIGKILLed
   it, restarted it into a deliberately broken script, withdrew the script and
   restarted again — and the resulting schema fingerprint `19c5216bb175de41…`
   equals the uninterrupted run's. `--matrix` reports `0 failures`.

3. **`schema_manifest --verify` can now return ok.** Before C4 it could not — not
   on any database, ever — because nine FKs were left permanently `NOT VALID`.
   That is now `0`, and the release fingerprint is recorded with it.

4. **Old application code runs against the new schema, with exactly one named
   exception and a measured mitigation for it.** That is the expand/contract
   promise, and §6 states precisely where it stops holding.

5. **Reconciliation is the platform's own sweeps, not SQL written for the
   occasion**, and each one converges when replayed. §7.

6. **A restore is fast and faithful, and still leaves an unbootable database.**
   §8 is the most operationally important section in this document.

---

## 2. Manifests

Five manifests, emitted by task 3.1's `manage.py schema_manifest`, deliberately
comparable with 13.1's three.

| manifest | tables | migrations | fingerprint | what it is |
|---|---:|---:|---|---|
| `fresh-from-empty-neon` | 89 | 43 | `a48a176d78ed2663…` | C1: the 41-script build on Neon, **before** the FK validation |
| `fresh-from-empty-neon-validated` | 89 | 43 | `2c940e65de0353d2…` | C4: after validating the nine FKs by hand |
| `fresh-from-empty-neon-final` | 89 | 44 | `19c5216bb175de41…` | C4: after the new 42nd script is recorded — **the release fingerprint** |
| `restart-converged-neon` | 89 | 44 | `19c5216bb175de41…` | C3: the killed-and-restarted sweep — **identical to the line above** |
| `migrated-snapshot-neon` | 77 | 50 | `249fcd553f06ea8c…` | C2: the snapshot after the sweep **failed** partway |

### 2.1 Against 13.1's three

| 13.1 manifest | tables | fingerprint | relation to this task |
|---|---:|---|---|
| `fresh-from-empty` | 89 | `a48a176d78ed2663…` | **equal** to `fresh-from-empty-neon` |
| `migrated-snapshot` | 87 | `bc5ab0499c8b0ef1…` | different snapshot, different stopping point |
| `neon-authoring` | 78 | `9d4bc5c7f5233e9d…` | the default branch, read-only comparison |

DATA-09's headline was that 13.1's three manifests all differ. They still do, and
this task adds the reason the from-empty one is nevertheless trustworthy: it is
**reproducible**, and the two 89-table fingerprints that differ from it
(`2c940e65…`, `19c5216b…`) differ for reasons that are named and intended — FK
validation, then one recorded script. Every fingerprint transition in this task
has a cause written next to it.

Three-way comparison: [`raw/schema-matrix-13.4.json`](raw/schema-matrix-13.4.json).
`--verify` output: [`raw/verify.fresh-from-empty-neon.BEFORE.json`](raw/verify.fresh-from-empty-neon.BEFORE.json)
(9 failures) → [`raw/verify.fresh-from-empty-neon.AFTER.json`](raw/verify.fresh-from-empty-neon.AFTER.json)
(`0 failures`).

---

## 3. C2 — the production-like snapshot, and what "production-like" is not

**The honest boundary first.** Production cannot be copied from here. Production
is a Docker Postgres on an EC2 box reached by SSH, its writes are operator steps,
and this task did not touch it. So C2 is an **approximation**, and the following
table says exactly how good an approximation it is.

| dimension | this snapshot | real production | honest? |
|---|---|---|---|
| engine | PostgreSQL 17.10 | `postgres:17-alpine` | **matches** |
| schema shape | 77 base tables, pre-July | the same lineage | **close** |
| migration ledger | 50 rows, 38 with NULL checksums, 2 truncated | same ledger lineage | **matches, including the defects** |
| task 3.2 cohort | 33 applications, **33** missing a canonical id, 32 non-draft | the cohort 12.3 gate 4 measured as 33 | **matches** |
| task 12.3 legacy cohort | 92 non-null values across the 7 contraction candidates | what keeps the contraction refusing to run | **matches** |
| task 3.5 cohort | 21 payments, 0 without an application | — | **matches** |
| **row volume** | 33 applications, 716 KB dump | **unknown, larger** | **THIS IS THE GAP** |

So: the **cohort shapes** are production-like, because they are the same rows the
12.3 and 3.2 lanes characterised. The **volume** is not. Any timing in this
document that scales with row count — the `pg_restore`, the backfill steps — is a
floor, not an estimate. The DDL timings (101 s for `00_full_schema.sql`, 113 s for
the sweep) are dominated by round-trips and locks rather than rows, so they
travel much better.

Characterisation SQL: [`raw/snapshot-characterisation.sql`](raw/snapshot-characterisation.sql).
Full output: [`raw/c2-production-like-snapshot.txt`](raw/c2-production-like-snapshot.txt).

### 3.1 The sweep fails on the snapshot, and the root cause is a missing default

```
Pending migrations: 23/42
  applying: 2026_06_08_01_multi_tenant_beanola_admissions.sql ... FAIL
psycopg2.errors.NotNullViolation: null value in column "id" of relation
  "canonical_programs" violates not-null constraint
DETAIL:  Failing row contains (null, Diploma in Registered Nursing, DRN, ...)
```

Root cause, measured rather than guessed (`c2-…txt` §2f):

| | `canonical_programs.id` default | rows | June migration recorded |
|---|---|---:|---|
| the snapshot | **none** | 0 | **no** |
| fresh-from-empty | `gen_random_uuid()` | 0 | yes |

The snapshot carries the `canonical_programs` **table** without the `id` default,
and has not recorded the June migration — so the sweep tries to apply a script
whose `INSERT` supplies no id, against a column that cannot generate one. This is
not a transient failure and it will recur on every database with that shape. It
is the first half of **GATE-13.4-02**.

The resulting drift is large and expected: `migrated-snapshot-neon` vs the release
fingerprint is **511 failures, 184 warnings**, of which 23 are `missing_migration`
(the scripts the sweep never reached), 2 are the truncated checksums, and the bulk
are `column_changed: default` — the same "defaults live in the script, not the
snapshot" family as the root cause above.

---

## 4. C3 — failed batch restart, in the order an operator actually meets it

Not one interruption but the compound sequence:

| step | what happened | ledger after |
|---|---|---|
| 1 | `SIGKILL` 30 s into the sweep (container OOM / node eviction) | **14 recorded** |
| 2 | operator restarts; sweep hits a deliberately broken script | **16 recorded**; the bad file's own change **did not survive**, and the bad file **was not recorded** |
| 3 | broken script withdrawn; restart against the real `backend/scripts/` | **44 recorded**, `not_valid_fks=0` |
| 4 | compare to the uninterrupted build | fingerprint **`19c5216bb175de41…` — identical** |

The middle row is the one that matters. A migration runner that recorded a script
it had not fully applied would leave a database that looks migrated and is not.
This one records **after** success, in the script's own transaction, so a failure
is atomic: no partial DDL, no ledger row, and the next restart re-attempts exactly
that file.

[`raw/c3-failed-batch-restart.txt`](raw/c3-failed-batch-restart.txt). One
invocation in that file was cut off by the shell harness before Python flushed;
it is annotated in place rather than deleted, and the restart that matters is
complete.

---

## 5. C4 — constraint validation, and closing GATE-13.1-01

Nine FKs on the three July tenant tables (`tenant_onboarding` ×2,
`tenant_staff_invitations` ×4, `tenant_change_requests` ×3) got the *expand* half
of expand/validate and no `_validate.sql`, while five sibling scripts have one.

**Why that is worse than untidy:** while any FK is `NOT VALID`,
`schema_manifest --verify` reports drift on **every** database, forever — so a
real future violation is indistinguishable from the permanent one. The instrument
was blind for as long as this was true.

**Rehearsed before writing anything** (task 3.4 set this precedent):

| step | measurement (server-side `\timing`) |
|---|---|
| orphan preflight — one anti-join per FK (R15.4) | 479 ms, **all 9 → 0 orphans** |
| `VALIDATE CONSTRAINT` on one FK, locks introspected | `ShareUpdateExclusiveLock` + `AccessShareLock`, **361 ms** |
| the whole 9-FK `DO` block (the shipped script, verbatim) | **374 ms** |
| idempotent re-run | **338 ms**, matches 0 constraints, no error |
| after | **`not_valid_fks_anywhere = 0`** |

These are server-side statement times. The `7823 ms` row in the timed log is the
whole `psql` session for this step — connection setup over the internet to Neon
plus all six sections above — and the `41 s` in the claim table is the clause
including the two manifest emits and the verify. The number that matters for a
production window is the **374 ms** one: that is the lock being held.

`ShareUpdateExclusiveLock` is the point: it does **not** block reads or writes, so
this is safe to run on a live database. That is why writing the script was the
right call rather than deferring it — the operation is cheap precisely because
these are new tables with nothing to validate.

**The decision, and why.** Writing the missing `_validate.sql` sits inside this
bullet's "constraint validation" clause, so it is this task's to do. Deferring it
to the tenant lane would also have been defensible — but it would have left the
verify instrument blind for another lane's cycle, and the whole point of a
rehearsal is to find the thing that stops the release gate from working. It ships
as:

- `backend/scripts/2026_08_12_01_tenant_new_table_fk_validate.sql` — guarded per
  constraint on `convalidated = false`, so it is a no-op where already valid
- `backend/scripts/2026_08_12_01_tenant_new_table_fk_validate_rollback.sql` — the
  sibling every validate script in this repo has

It passes the repo's own migration-script test suite (**23 passed**,
[`raw/c4-pytest-validate-script.txt`](raw/c4-pytest-validate-script.txt)) and the
sweep picks it up as the 42nd script.

**Re-verified at the end of the task** with a clean environment
([`raw/c9-final-verification.txt`](raw/c9-final-verification.txt)):
`manage.py check` clean, and `test_rollback_pairing` — the gate that fails a
forward script with no `_rollback.sql` sibling — **passes**, which is why the
sibling was written alongside rather than after. That run also shows **4 failures
in the wider migration-governance suite; all four were already failing in 13.1's
full backend run** (cluster D / GATE-13.1-05 — `verify_schema_static.py`'s
`EXPECTED_TABLES` registry is 6 tables behind the code). Neither new script
appears anywhere in that output. Another lane's registry drift, not fixed here.

Full output: [`raw/c4-constraint-validation.txt`](raw/c4-constraint-validation.txt).

---

## 6. C5 — rollback

### 6.1 GATE-13.1-06 settled: the script was wrong

The shipped rollback carried

```sql
UPDATE applications SET assignment_quarantined = false
 WHERE assignment_quarantined = true;
```

and **that statement cannot run.** Proved on Neon by manufacturing the exact row
the backfill leaves behind — non-draft, no canonical ids, `quarantined = true` —
and running the rollback verbatim:

```
ERROR:  new row for relation "applications" violates check constraint
        "chk_applications_canonical_assignment"
```

`chk_applications_canonical_assignment` exempts a non-draft row from the
four-canonical-id requirement **only while `assignment_quarantined = true`**, and
Postgres enforces a CHECK on `UPDATE` even when the constraint is `NOT VALID` —
`NOT VALID` only skips the initial scan of pre-existing rows. So the rollback
aborts and leaves the operator worse off than before they ran it. The row was
verified untouched afterwards: the statement did not partially apply.

**R9.2 needs no exception.** Nothing has to replace the `UPDATE`, because
`assignment_quarantined` is an **additive column that the `01_` expand rollback
drops wholesale** (`ALTER TABLE applications DROP COLUMN IF EXISTS
assignment_quarantined`). Dropping the column reverts the data. Run order is
`03_ → 02_ → 01_`, and the `03_` validate rollback runs first, so no constraint
depends on the flag by the time the column goes. The `02_` rollback therefore owes
only a **scoped `DELETE`** of the ledger rows it inserted — which is inside R9.2's
closed set.

The decisive argument is precedent, not taste: task 3.5's sibling
`2026_07_19_02_payments_documents_backfill_rollback.sql` already does exactly this
for the identical payments quarantine flag. **One lane diverged from its own
lane's precedent.** That is a defect, not a spec tension.

**What is still not green, stated plainly.** Both tests still fail, and this task
did not make them pass. `2026_07_16_02_canonical_assignment_backfill_rollback.sql`
no longer appears in the violation list, but the two assertions are whole-corpus,
so they fail on **26 statements in 9 other lanes' files**. Those are classified by
cause in [`raw/c5-rollback-lint-inventory.txt`](raw/c5-rollback-lint-inventory.txt):

| group | n | cause | reading |
|---|---:|---|---|
| INSTRUMENT-A | 16 / 4 files | `DO` block not stripped — files end `END$$;`, the regex demands `END\s+\$\$` | the **instrument** is too narrow |
| INSTRUMENT-B | 6 / 1 file | `ALTER TABLE IF EXISTS … DROP CONSTRAINT` not in the allow-list | the **instrument** is too narrow |
| INSTRUMENT-C | 2 / 2 files | inert `SELECT 1` no-op rollback not allow-listed | the **instrument** is too narrow |
| **SPEC-GAP** | **2 / 2 files** | genuinely data-restoring rollbacks (an `UPDATE`, a CTE) | **the real R9.2 tension 13.1 suspected — but in the subject-catalog and document lanes, not this gate** |

So 13.1's instinct was right that a spec/instrument tension exists; it was simply
attributed to the wrong file. The two files that actually carry it are named
above. Not fixed here: they are not this bullet's.

[`raw/c5-rollback-defect-proof.txt`](raw/c5-rollback-defect-proof.txt),
[`raw/c5-rollback-test-after-fix.txt`](raw/c5-rollback-test-after-fix.txt).

### 6.2 App rollback while the expanded schema remains

The rollback target is a **real** git worktree at `HEAD` (`bae29a28d`), not a
synthetic one: every V2 artefact (the July/August scripts, `payment_phase.py`,
`settlement_service.py`, `schema_manifest.py`) exists only in the working tree, so
`HEAD` genuinely predates them. `HEAD` carries 15 of the 42 scripts the sweep
applies; everything from `2026_07_16` onward is V2-only. Target schema:
`v2_fresh_13_4`, 89 tables, 44 migrations, 0 NOT VALID FKs.

**18 of 19 probes pass.** Old code starts (`manage.py check` clean), reads every
core model, does not see the V2-only columns (52 mapped columns, none of them
V2's), creates a draft, and updates it.

**The one failure is the boundary, and it is a CHECK constraint doing its job:**

```
PROBE FAIL | EXPECT-FAIL old-code WRITE: submit with NO canonical ids
  IntegrityError: new row for relation "applications" violates check
  constraint "chk_applications_canonical_assignment"
```

Old code sets no canonical ids, and the expanded schema requires a non-draft row
to carry all four unless quarantined. So **rolling the app back while the expanded
schema remains blocks new submissions** — reads, drafts and payments are fine.

The mitigation was measured, not asserted:

| probe | result |
|---|---|
| drop **only** `chk_applications_canonical_assignment` | CHECK dropped, **6/6 expanded columns still present** |
| old code submits with no canonical ids, after the mitigation | **succeeds** |
| re-add the CHECK as `NOT VALID` (rolling forward again) | re-added, `convalidated=False` |
| V2 quarantines what the old app wrote | quarantined; **unquarantined violators = 0** |

That is a complete round trip: roll back, keep serving, roll forward, and the rows
the old app wrote are absorbed by the quarantine mechanism rather than blocking the
re-validation. **Operator note:** the mitigation drops one CHECK, not a column — no
data is lost, and it is reversible in one statement.

[`raw/c5-app-rollback-expanded-schema.txt`](raw/c5-app-rollback-expanded-schema.txt).

---

## 7. C6 — reconciliation

Each domain is rehearsed the same way, because that is what an operator does:
seed the post-incident condition, measure it, run **the platform's own sweep**,
then run it **again** — a reconciliation sweep that is not idempotent is a second
incident. 25 probes; 24 pass; the one failure is `EXPECT-DEFECT` and is §7.4.

**Substitutions, stated because they matter.** The cache/lock is the **real Redis**
(`127.0.0.1:6380/1`), so every sweep's `celery_lock:` guard behaves as in
production. There is no broker: the domain sweep runs with `task_always_eager` so
its dispatch actually executes the verifier, and the email sweep runs with eager
**off** so its documented broker-down path is what gets measured. Lenco and R2 are
unconfigured **deliberately** — the provider-unavailable branch is the branch an
incident produces, and the requirement is that it does not transition state.
Nothing here is a mock; each is shipped code down a path production also takes.

### 7.1 Payment — `poll_pending_payments_task`

| probe | result |
|---|---|
| a payment pending **30 h** | `pending → expired` via `PaymentService.expire_stale` (24 h cutoff) |
| a payment pending **30 min**, Lenco unconfigured | **stays `pending`** — skipped, not decided for the provider (R6.3) |
| replay | `(expired, pending)` → `(expired, pending)`, converged |
| a concurrent run with the lock held | returns without touching rows |
| `uq_payments_one_active_per_application` | **live** — two open collections needed two applications |

The second row is the one worth keeping: a sweep that guessed `failed` when the
provider was unreachable would strand a student who had already paid.

### 7.2 Document — `reconcile_document_storage_task` (7.3)

| seeded condition | outcome |
|---|---|
| `staged` row whose metadata **did** commit (same object key) | **`committed`** — self-heal wins; the sweep did **not** delete live evidence |
| `staged` row with nothing committed | `compensation_pending` — deferred to retry, never silently dropped |
| `compensation_pending` with `attempts = 5` | **`orphaned`** — a terminal operator queue entry, not an endless retry |
| replay | terminal states not re-decided; `attempts` bounded at ≤ 5 |

The self-heal ordering is the safety property: matching a stage to a committed
document **before** considering deletion is what makes this sweep safe to run
while uploads are in flight.

### 7.3 Domain — `sweep_pending_domain_verifications_task` → `verify_institution_domain_task` (4.4)

| probe | result |
|---|---|
| `pending_dns` with `last_checked_at IS NULL` (broker was down at create) | **dispatched** — this is the backlog the sweep exists for |
| unresolvable host | **stays `pending_dns`** — no `pending_dns → pending_review` jump on a failed lookup (R7.5) |
| the failure | `last_error` recorded (111 chars, cap 1000), `last_checked_at` stamped — visible, not swallowed |
| immediate replay | **0 dispatched** — the 600 s retry cutoff bounds the sweep |
| a non-`pending_dns` domain | verifier is a no-op |

### 7.4 Communication — `process_pending_emails_task` (9.5 / 10.4), and GATE-13.4-01

| probe | result |
|---|---|
| an email wedged in `processing` for > 10 min | **reclaimed to `retrying`** — "Recovered stale processing email for re-dispatch" |
| a stale `pending` row, no broker | left re-dispatchable; the sweep **stops dispatching rather than dropping rows** |
| replay | does not re-reclaim an already-reclaimed row |
| `outbox_events` | untouched by the email sweep — a separate durable ledger |
| **the payment expiry from §7.1** | queued **1 email + 1 `email.queued` outbox row** — reconciliation is not silent, and the notification is durable |

That last row is how the finding surfaced. The email the expiry actually queued:

```
'MIHAS Admissions — Payment Expired'
```

Measured on the fresh-from-empty database:

| communication_templates | count |
|---|---:|
| total | **19** |
| `institution_id IS NULL` (the platform-wide fallback) | **19** |
| legacy-branded (`MIHAS`/`KATC` in subject or body) | **19** |

**GATE-13.4-01.** Beanola owns the platform; MIHAS and KATC are example tenants.
A template with `institution_id IS NULL` is the fallback **every** tenant gets, so
it must carry neutral platform branding — the steering rule is explicit that a
missing tenant asset falls back to the neutral Beanola asset, *never* to MIHAS or
KATC. Here the platform-wide default **is** one tenant's brand, all 19 rows of it.

Three things make this worse than a copy nit:

1. It arrives via a **migration script**
   (`2026_05_19_seed_communication_templates.sql`), so it lands on **every**
   database the sweep touches — including a brand-new tenant's fresh-from-empty
   deploy, which is exactly the from-empty path C1 rehearsed.
2. It is not dormant. The rehearsal watched it reach a **real queued email** to a
   real recipient address, through the normal reconciliation path.
3. On the production-like snapshot it is 31 of 33 rows (§9.1) — so it is present
   in the production lineage too, not just in a fresh build.

Not fixed here: this is the communication/tenancy lane's, and it is a content
change to a seeded migration plus a decision about neutral wording. Gate 19 of
[`invariants.sql`](invariants.sql) is the drift guard for it.

### 7.5 Capacity — GATE-13.2-02 re-measured on an isolated row

13.2 attributed counter drift to `SEAT_STATUSES` omitting `enrolled`. Measured
here on a **dedicated** offering + intake carrying exactly one `enrolled`
application and nothing else — sharing the earlier offering would have counted
other rehearsal rows and hidden the defect behind a coincidence:

```
SEAT_STATUSES = ('submitted', 'under_review', 'approved', 'waitlisted')
'enrolled' in SEAT_STATUSES: False
before: current_enrollment=1, seat-status rows on this offering+intake=0
after : reconcile() returned 0, current_enrollment=0
```

**The seat was released while the student was still enrolled.** Confirmed, not
repaired — the capacity lane owns it, and `capacity_service.py` says redefining
occupancy is deliberately out of scope for task 5.3.

**Coverage caveat (GATE-13.1-02).** 86 backend tests have not run since task 9.4,
and `test_waitlist.py` is among them, so capacity/waitlist reconciliation has thin
live coverage. This §7.5 measurement and 13.2's gate 5 are most of what exists.

Full output, including the cleanup proof that the schema was left as found:
[`raw/c6-reconciliation.txt`](raw/c6-reconciliation.txt).

---

## 8. C7 — database restore

`deploy/RUNBOOK.md` §3 and `deploy/backup-db.sh` are authoritative and were
followed rather than improvised. Target: a **disposable** `postgres:17-alpine`
container — production's actual image — published on `127.0.0.1` only, so the
boot gate could be run from the host. Production publishes no port and runs that
gate in-container; loopback here is the closest honest reach and is not a network
exposure.

### 8.1 GATE-13.4-03 — the runbook's first command cannot work

§3a verbatim:

```
docker run --rm postgres:16-alpine pg_dump ... "postgresql://…neon…"
→ pg_dump: error: aborting because of server version mismatch
  pg_dump: detail: server version: 17.10; pg_dump version: 16.14
  exit=1  bytes=0
```

The same command on `postgres:17-alpine`: **exit 0, 715 996 bytes**. Neon and the
production container both run PostgreSQL 17; the runbook pins a 16 client. One
character of the image tag. Any operator following §3 during an incident hits this
on the first command, and the fix is `postgres:17-alpine`.

### 8.2 The restore itself

| step | wall time | result |
|---|---:|---|
| 3b start postgres + wait ready | 1.3 s | ready after 2 s |
| **3c `pg_restore --no-owner --no-privileges --clean --if-exists`** | **0.9 s** | exit 0 |
| 3d row counts | 0.2 s | 77 tables · 33 applications · 21 payments · 15 profiles · 50 ledger rows · 2 NOT VALID FKs |
| parity vs the clause-2 source | — | **`PARITY OK` — exact on all five counts** |
| `shred -u` the dump | 0.02 s | **dump gone** (verified absent) |
| teardown | 0.3 s | container and volume removed |

**No dump was left on disk.** `shred -u` is part of the procedure, and the
inherited `neon-branch-dump.pgcustom` from the earlier dispatch was consumed by
this step (sha256 recorded first, in `c7-database-restore.txt`).

Restore time is **dominated by data volume**, and this snapshot is 716 KB. The
0.9 s figure is honest for what was restored and is **not** an estimate for
production. The 515 s sibling figure in the log is the same dump restored into
**Neon over the public internet** — the right number if the target is Neon, the
wrong one if the target is the same-host production container.

### 8.3 GATE-13.4-02 — the restore succeeds and the database will not boot

The RUNBOOK says, correctly, that `check_schema_drift` "will fail the boot loudly
if the restored schema disagrees with what the code expects — that is the signal
to stop and reconcile, not to force past it." So it was run against the restored
database:

```
Missing tables (2): tenant_change_requests, tenant_staff_invitations
Schema drift detected — 5 missing column(s) across 1 table(s):
  applications: configuration_version, requirements_snapshot,
                eligibility_snapshot, assignment_version, draft_name
Apply pending SQL migrations before starting the app:
  python manage.py apply_sql_migrations
check_schema_drift exit=1
```

The gate works: it refuses a database the code cannot serve, before traffic. And
its prescribed remedy is `apply_sql_migrations`, which `--dry-run` says would
apply 23 scripts — **and which §3.1 measured failing at the first of those 23,
`2026_06_08_01`, on this very snapshot.**

Compose the two and the operator's position is: *the restore worked, the app will
not start, and the documented fix does not complete.* That is **GATE-13.4-02**,
and it is the single most important thing this rehearsal found. The prerequisite —
give `canonical_programs.id` a default, or make the June script supply ids — is
this lane's to write and 13.5's to verify on the canary **before** anyone needs a
restore under pressure.

**A smaller thing worth fixing.** `apply_sql_migrations --dry-run` ends with
`Applied 23 migration(s) successfully.` It applied nothing. An operator reading
that line during an incident could reasonably believe the work was done.

[`raw/c7-database-restore.txt`](raw/c7-database-restore.txt).

---

## 9. The gate set an operator runs afterwards

[`invariants.sql`](invariants.sql) — **10 read-only gates**, numbered 10–19 so it
composes with 13.2's nine without collision. Run under a forced
`default_transaction_read_only = on` session to prove it cannot write:

**Reused, not restated.** 13.2's gates 3 (payments), 5 (capacity), 6 (waitlist),
7 (documents), 8 (domains) and 9 (pending payments + outbox) already cover the
data-integrity ground, and 12.3 covers the legacy-cohort counts. This file adds
only what is about the **migration and the restore**: ledger integrity,
unvalidated FKs, restore completeness, expanded-column presence, the canonical
guard, the one-open-collection index, the three sweep backlogs, and the neutral
fallback.

### 9.1 Both databases, same gates

| gate | expanded (`v2_fresh_13_4`) | un-migrated restored snapshot (`v2_snap_13_4`) |
|---|---|---|
| 10 migration ledger integrity | **PASS** — 44 rows, 0 null, 0 truncated | **FAIL** — 50 rows, **38 null**, **2 truncated** |
| 11 unvalidated foreign keys | **PASS** — 0 | **FAIL** — 2 (`tenant_onboarding`) |
| 12 restore completeness | **PASS** — 89 tables | **PASS** — 77 tables, no core table missing |
| 13 expanded columns present | **PASS** — 0 missing | **FAIL** — **6 missing** on `applications` |
| 14 canonical assignment guard | **PASS** | **N/A — expand has not run** (reports, does not abort) |
| 15 one open collection per application | **PASS** | **PASS** |
| 16 document stage reconciliation | **PASS** | **PASS** |
| 17 domain verification backlog | **PASS** | **PASS** |
| 18 communication queue liveness | **PASS** | **PASS** — with **106 pending** emails as context |
| 19 neutral communication fallback | **FAIL** — 19/19/19 | **FAIL** — 33 templates, 33 fallbacks, **31 legacy-branded** |

The right-hand column is the value of this file: it is a one-command answer to
"is this restored database safe to serve?", and on the snapshot it says **no**
in four specific, actionable ways before anything is started. Gate 14 is
deliberately built to **report** `N/A` on a pre-expand database rather than abort
on the missing column — the first version aborted, which is useless precisely
when an operator needs the answer most.

Gate 19 confirms GATE-13.4-01 independently of §7.4, on both databases.

[`raw/c8-invariants-run.txt`](raw/c8-invariants-run.txt),
[`raw/c8-invariants-on-restored-snapshot.txt`](raw/c8-invariants-on-restored-snapshot.txt).

### 9.2 GATE-13.1-04, still present

`schema_cleanup_device_session_default.sql` and
`schema_cleanup_drop_stale_columns.sql` carry **12-character** checksums where the
runner writes a full 64-char sha256, so those two rows can never match a
`--verify` on any snapshot-derived database. Gate 10 reports them by name.
On the fresh build they are correct (44 rows, 0 wrong-length), which locates the
defect precisely: it is in the **recorded history**, not in the runner.

---

## 10. What is NOT claimed here

1. **Production was not touched.** No SSH, no query, no write. Every clause ran on
   the Neon rehearsal branch or in a disposable container.
2. **No clause needed production to be rehearsed** — but three need production to
   be *verified*, and they are **operator steps for 13.5**, not gaps:
   - the C1 from-empty timings against production's disk and CPU rather than a
     serverless endpoint over the internet;
   - the C7 restore against production's **real data volume** — the 0.9 s figure
     is honest for 716 KB and says nothing about the real dump;
   - the GATE-13.4-02 fix, which must be proven on the canary before a real
     restore depends on it.
3. **"Production-like" means cohort-shaped, not volume-matched.** §3 states this
   in a table rather than a caveat, and every timing that scales with rows is
   labelled a floor.
4. **The rollback lint tests still fail.** GATE-13.1-06's script is fixed; the two
   whole-corpus assertions fail on 26 statements in 9 other lanes' files. §6.1
   names them and does not fix them.
5. **Three new findings are measured, not repaired** — GATE-13.4-01,
   GATE-13.4-02, GATE-13.4-03 — and two inherited ones re-measured
   (GATE-13.2-02, GATE-13.1-04).
6. **Other lanes' failures were left alone**: 13.1's seven findings, 13.2's four,
   13.3's sixteen, `authPageFormMarkup.test.tsx`, the 15 lint errors,
   `tenant-launch.spec.ts:139` ×2, and `bun run validate:tailwind` exiting 127.
7. **The capacity defect's live coverage is thin** (GATE-13.1-02): 86 backend
   tests including `test_waitlist.py` have not run since 9.4. §7.5 is a
   measurement, not a substitute for that suite.
8. **The first two rows of the timed log are not measurements.** They came from a
   broken `date +%s%3N` idiom in an early attempt and are annotated in place, with
   the correct re-runs of the same two steps immediately below them.

---

## 11. State left behind

| item | state |
|---|---|
| production Postgres | **never contacted** — no SSH, no query, no write |
| Neon **default** branch | **read only**, for manifest comparison |
| the dump taken in C7 | **`shred -u`'d**, absence verified. No `.pgcustom` exists anywhere on this machine |
| disposable restore container + volume | removed |
| C5's `git HEAD` worktree | removed (`git worktree list` back to one entry) |
| throwaway local Postgres `:5433` + Redis `:6380` | **stopped** |
| evidence directory | scanned for DSNs / passwords / tokens — **clean**; only the public branch and endpoint ids appear |
| **three scratch databases on the rehearsal branch** | **left in place, deliberately** — see below |

**Why the scratch databases were not dropped.** `v2_fresh_13_4` (13 MB, the
expanded release schema), `v2_batch_13_4` (12 MB, C3's restart target) and
`v2_snap_13_4` (17 MB, the restored snapshot) are still on
`br-jolly-pine-ahybtg2e`. Dropping a database is irreversible and the steering
rule is to confirm destructive SQL rather than run it autonomously, so they are
left for two reasons: 13.5 may want to inspect the exact databases these claims
were measured on, and `v2_snap_13_4` in particular is the only reproduction of
GATE-13.4-02 that exists. When they are no longer wanted:

```sql
-- on the rehearsal branch, NOT the default branch, NOT production
DROP DATABASE v2_fresh_13_4;
DROP DATABASE v2_batch_13_4;
DROP DATABASE v2_snap_13_4;
```

---

## 12. What 13.5 should carry forward

| # | Item | Why it matters to the canary |
|---|---|---|
| 1 | **GATE-13.4-02** — the restore/boot/remedy deadlock (§8.3) | Verify on the canary that a restored production snapshot can actually be brought forward, **before** an incident requires it. This is the highest-value single check. |
| 2 | **GATE-13.4-03** — RUNBOOK §3a's `postgres:16-alpine` (§8.1) | One-character fix. An operator hits it on the runbook's **first** command. |
| 3 | **The release fingerprint** `19c5216bb175de41…` (89 tables, 44 migrations) | Compare the canary's post-migration manifest against it. C3 proved a converged sweep reproduces it exactly, so any difference is real. |
| 4 | **`invariants.sql`** gates 10–19 alongside 13.2's 1–9 | Read-only, one command, safe on production. Gates 10/11/13 are the go/no-go after any migration. |
| 5 | **Timings from `rehearsal-log.txt` §B** | ~4 min from empty, ~4 min for a killed-and-restarted sweep, 41 s for the FK validation, and a restore whose cost is data volume. |
| 6 | **The C5 mitigation** (§6.2) | If the app must be rolled back while the expanded schema remains, submissions stop until `chk_applications_canonical_assignment` is dropped. One statement, reversible, no data loss — and V2 re-absorbs the rows via quarantine. |
| 7 | **GATE-13.4-01** (§7.4) | A new tenant's fresh deploy currently emails students under another school's name. Visible to real users. |
