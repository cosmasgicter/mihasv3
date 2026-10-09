# Task 12.3 — Contract legacy identity and payment columns safely

Evidence index for task **12.3** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- 12.3 Contract legacy identity and payment columns safely
  - Reconcile the user-edited legacy-column deprecation runbook with live source
    and DB evidence without overwriting unrelated changes.
  - Prove zero runtime references, legacy rows, canonical/snapshot mismatches,
    payment projection mismatches, and required external callers.
  - Apply contract migrations on Neon, rehearse rollback, then production.
  - _Requirements: R15.6-R15.9, R18.7_
  - _Findings: DATA-01, DATA-10, DATA-11_
  - _Evidence: grep, telemetry, invariant queries, migration/rollback manifests_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: **2026-08-11** (UTC). The date is load-bearing here, not incidental:
  the announced sunset is **2026-08-15**, four days away, and §3.3 is what that
  means.
- **Schema: no.** No column was dropped, no table was dropped, no migration was
  recorded, on any database. §7 of `raw/openapi-schema.txt` records the OpenAPI
  contract regenerated and **byte-identical** (SHA-256 `35fe05d4…`) to task
  12.1/12.2's anchor. §5 is why "nothing applied" is the correct outcome rather
  than an unfinished one.
- PBT: task 12.3 has **no numbered property-based-testing sub-task**, so nothing
  is recorded through `update_pbt_status` and no numbered spec property is
  claimed. The database gates are recorded as SQL and as unit tests instead
  (§2, §6).
- **Neon writes: one branch only.** `br-jolly-pine-ahybtg2e` was read *and*
  written (the rehearsal, which aborts itself). The Neon **default** branch was
  read and never written. No branch was created — the project's branch limit is
  exceeded, so the existing rehearsal branch was reused.
- **Production: not touched at all.** Not SSH'd to, not queried, not written.
  §11.
- **Browser gate: run, on a freshly seeded stack.** 220 required journeys, **218
  passed / 2 failed / 0 did not run**; `gatecheck-negative` fails with all four
  gates firing; drained; torn down. The one difference from 12.2's 217/3 is a
  *pass*, on a spec and a bundle that are unchanged since that run — measured, not
  claimed as a fix (§9.1, §9.2).

---

## What "complete" means here — read this before anything else

**The contraction was proven unsafe and was not performed.** Nothing was dropped.
This task's deliverable is the proof, the blocked exception, and the operator's
instrument — not a schema change.

Specifically, marking this bullet complete claims exactly three things and no
fourth:

1. **All four artifacts the `_Evidence:` line asks for exist and were measured**
   — grep, telemetry, invariant queries, and migration/rollback manifests (the
   claim table below maps each to where it is settled).
2. **The gates were run and they refuse, decisively.** Five of six. The load-
   bearing one is that **16 applications carry a money fact with no `payments`
   row behind it** — for those rows the legacy column *is* the record, `DROP
   COLUMN` is irreversible with respect to data, and R9.2 forbids `ADD COLUMN` in
   a rollback, so there is no way back (§3.2).
3. **The blocked contraction is registered as a Legacy_Exception** with an owner,
   an announced end date, and a mechanically evaluable exit criterion (§10), and
   the production procedure is written and ready for the day the gates pass (§5.3).

It does **not** claim that any column was dropped, that the 2026-08-15 sunset was
met, or that production was measured. The bullet's third clause — *"apply contract
migrations on Neon, rehearse rollback, then production"* — is answered by
measurement: **applying is forbidden by the data.** Rehearsing the rollback was
possible and was done (§5.2). Applying was not, and the honest ceiling for a
contraction whose own preconditions are unmet is: prove the DDL, prove the way
back, change nothing.

## The Required_Evidence claim

The `_Evidence:` line asks for **four** things. All four exist and each is a
measurement rather than an assertion.

| Claim | Where it is settled |
|---|---|
| **grep** | [`raw/legacy-column-grep.txt`](raw/legacy-column-grep.txt) — **every** hit for all 9 columns across 5 source roots, printed with its classification (`production` / `generated_contract` / `schema_ddl` / `other_model` / `test` / `comment` / `self` / `dev-preview`) so a reader can dispute a classification instead of trusting a count. Pattern is deliberately the barest possible `\b<column>\b`; narrowing it would hide the hits that need classifying. **0 production references** on the 7 contraction candidates; **8** and **14** on the two that are therefore not candidates (§1) |
| **telemetry** | [`scripts/v1_surface_telemetry.py --columns`](../../../scripts/v1_surface_telemetry.py) half 4 → [`raw/legacy-column-telemetry.txt`](raw/legacy-column-telemetry.txt) + [`.json`](raw/legacy-column-telemetry.json). The same measurement as a tool with a disposition per column, an ORM-mapping column that explains *why* a hit can or cannot reach the column, and `HALF 4 PASS=False` printed rather than smoothed (§1.2) |
| **invariant queries** | [`invariants.sql`](invariants.sql) — the four database gates R15.6 names, as read-only SQL runnable on any deployment including production, with the precedence `CASE` lifted from `APP_PAYMENT_STATUS_PRECEDENCE` and drift-guarded by a test (§2). Measured: [`raw/invariants-neon.txt`](raw/invariants-neon.txt), on the Neon default branch **and** `br-jolly-pine-ahybtg2e` |
| **migration / rollback manifests** | [`raw/migration-manifest.md`](raw/migration-manifest.md) (4 files, scope, order of operations, locking, rollback layers, schema fingerprint) + [`raw/production-procedure.md`](raw/production-procedure.md) (the operator's 7 steps, backup first) + [`raw/neon-rehearsal.txt`](raw/neon-rehearsal.txt) (the guards firing, and a drop/rollback round trip on the real table that proves the DDL and then aborts) |

### The browser gate

Task 12.3 adds **no** browser journey, deliberately. It changes no rendered
output — it touches four SQL files, one register, two backend test files, one
repo script and a runbook, and nothing under `apps/admissions/src`. What it must
show is that the existing journeys still pass on a freshly seeded stack, which §9
records. That is a *"nothing moved"* claim, so the whole value is in the numbers
not moving — and where one did move, by a single test in the **passing**
direction, §9.2 accounts for it by measurement instead of calling the run
identical.

## What this task establishes

1. **The gates were measured for the first time, four days before the sunset they
   were supposed to authorise.** The 2026-05-17 cycle shipped a drop script whose
   only guard was the calendar. A calendar answers *"is it time yet"*; R15.6 asks
   *"is it safe yet"*, and nobody had asked. Asking found three unsafe answers.
2. **16 applications' payments exist only in the columns the script was about to
   drop** (§3.2). That is the finding that decides the task, and it is a data
   finding, not a code finding: source telemetry says all seven columns are
   clean, and they are. Task 3.5 measured this same 18-row cohort and handed it
   here by name; it was re-measured rather than inherited, on both Neon branches.
3. **An empty comparison domain was reported as an empty comparison domain**
   (§3.5). All 33 applications have NULL canonical ids and `canonical_programs`
   is empty on Neon, so the three snapshot-mismatch counts are zero because there
   is nothing to compare — a null reading, not a pass. Guard 4a fires *before*
   guard 4b for exactly this reason, and reporting "0 mismatches" here would have
   been the most defensible-looking wrong answer available.
4. **Scope narrowed from 12 things to 7, and the boundary is ORM mapping**
   (§1.3). `payment_verified_at` / `payment_verified_by` are live model fields,
   four fields of the published API response, present in
   `apps/admissions/src/generated/api.d.ts`, and one is rendered by a student-
   facing component. Dropping a declared field's column breaks *every* query
   against `Application`, not one endpoint. They get an announced window, not a
   removal. `error_logs` is out of scope twice over: it is a table, not a column.
5. **The superseded drop script is neutralised, not left lying around** (§7). It
   was never in the boot sweep, so the exposure was never automation — it was the
   runbook telling a human to run it, behind a guard that stops refusing on
   2026-08-15. It is now a stub that raises and explains.
6. **The allow-list in the no-writes test was suppressing six findings that were
   never violations** (§6.1). Six `payment_method` entries described as writes to
   `applications` are every one of them writes to `Payment.payment_method`;
   `Application` does not declare `payment_method`, so no ORM write can reach that
   column. The runbook's Day-60 review inherited the same mistake. The test now
   filters by ORM mapping, the allow-list is down to the two real entries, and a
   new case refuses to let it grow.
7. **The runbook was reconciled, not rewritten** (§4). It is a human's file with
   retroactive completion notes in a distinctive style; the corrections follow
   that style, sit beside the original text rather than replacing it, and where
   the measurement and their text disagree both are stated with the measurement
   marked as the measurement.
8. **The blocked contraction is a registered Legacy_Exception, which widens what
   that register is for — deliberately** (§10). By task 12.2's rule a surface with
   zero callers and no published contract is dead code to delete, not
   compatibility to register. These seven columns are exactly that on *source*,
   and they are registered anyway, because the blocker is **data**. An exception
   whose blocker is data still needs an owner, a date, and someone auditing it.
9. **The projection mismatch is a vocabulary gap between two canonical constants,
   and it was left to the lane that owns them** (§6.3). `_ADMIN_REVIEW_STATUS_MAP`
   can write `rejected` onto `applications.payment_status`;
   `APP_PAYMENT_STATUS_PRECEDENCE` can never derive it. Any row carrying it is a
   permanent mismatch by construction. Closing it here would have been a
   payment-semantics change smuggled into a contraction task.

## Files

```
docs/v2-evidence/12.3/
├── README.md                        ← this index
├── invariants.sql                   ← THE read-only instrument (§2); the operator runs this one
└── raw/
    ├── legacy-column-grep.txt       (EVERY hit, all 9 columns, each classified — §1)
    ├── legacy-column-telemetry.txt  (the same as a tool, with disposition + ORM mapping)
    ├── legacy-column-telemetry.json (machine-readable, incl. the suppressed other_model hits)
    ├── invariants-neon.txt          (the four gates measured — Neon default AND the branch — §3)
    ├── neon-rehearsal.txt           (5 of 6 guards refuse; drop/rollback round trip aborts — §5)
    ├── migration-manifest.md         (4 files, scope, order, locking, rollback, fingerprint)
    ├── production-procedure.md       (operator-gated, 7 steps, backup FIRST — §5.3)
    ├── guard-parity-test.txt         (the drift guard executed, and broken on purpose — §6.4)
    ├── backend-selection.txt         (the 11-file selection and why it is not the 51 — §8)
    ├── backend-tests.txt             (149 passed, 0 failed, 0 errors, serial)
    ├── django-check.txt              (no issues — no TESTING=1, no substitute REDIS_URL)
    ├── openapi-schema.txt            (byte-identical, SHA-256 35fe05d4…, and why that is correct)
    ├── frontend-test.txt             (1 failed / 4592 passed / 1 skipped / 493 files — identical)
    ├── frontend-lint.txt             (15 errors, 13 files — identical set)
    ├── frontend-lint-files.txt       (the 13)
    ├── frontend-build.txt            (exit 0, incl. tsc and the CSP gate)
    ├── harness-down-pre.txt          (teardown BEFORE the fresh up, so "fresh" is measured)
    ├── harness-up.txt                (fresh stack: volumes wiped, SPA rebuilt, reseeded)
    ├── harness-required-suite.txt    (218 passed / 2 failed / 0 did not run of 220 — §9.2)
    ├── harness-gatecheck.txt         (must fail — the gates fire)
    ├── harness-drain.txt             (broker 0, unsettled payment collections 0)
    └── harness-down.txt              (teardown: 0 containers, 0 volumes)
```

Source of the change. Note what is **not** here: no model, no view, no serializer,
no URL, no setting, no frontend file.

| Path | What changed |
|---|---|
| **`docs/v2-evidence/12.3/invariants.sql`** | **new**, 227 — the four database gates as read-only SQL. Runnable on production, and the file the production procedure copies onto the box (§2) |
| **`backend/scripts/future/legacy_columns_contract_2026_08_15.sql`** | **new**, 339 — the contraction, with all six gates as **fail-closed guards** that each name their offending number. Lives in `future/` so the boot sweep cannot reach it |
| **`backend/scripts/future/legacy_columns_contract_2026_08_15_rollback.sql`** | **new**, 45 — bookkeeping rollback. **No `ADD COLUMN`** (R9.2), and it says so: the rollback of record for a contraction is a restore |
| **`backend/tests/unit/test_legacy_column_contraction_12_3.py`** | **new**, 340 / **17 cases** — the decision encoded rather than narrated (§6.2, §6.4) |
| **`backend/apps/common/compatibility_register.py`** | 3 `kind="column"` entries added — the first ones; the dataclass has anticipated them since 12.2 (§10) |
| `backend/scripts/legacy_columns_drop_2026_08_15.sql` | **neutralised** to a refusing stub, +81/−69. Kept as a marker, not deleted, so a copied instruction lands on the explanation (§7) |
| `backend/tests/unit/test_legacy_columns_no_writes.py` | +100/−13 — ORM-mapping filter added; allow-list **8 → 2**; 1 new case that refuses to let it grow (2 → 3 cases) (§6.1) |
| `scripts/v1_surface_telemetry.py` | **half 4** added — the legacy-column telemetry, with per-column disposition and ORM mapping (§1.2) |
| `docs/runbooks/legacy-column-deprecation.md` | reconciled — every correction marked and dated, none of the human's prose replaced (§4). Its working-tree diff is **+385/−24 vs HEAD**, but that number is **not** all this task's: the human's own uncommitted 2026-07-11 retroactive-completion edits are in the same diff. See §4.1 for the split |

---

## 1. The source gate — grep and telemetry

### 1.1 Zero production references, and the hits are shown rather than counted

```
$ python3 scripts/v1_surface_telemetry.py --columns
```

[`raw/legacy-column-grep.txt`](raw/legacy-column-grep.txt) prints **every** match
for all nine registered `applications` columns across `backend/apps`,
`backend/scripts`, `apps/admissions/src`, `apps/admissions/tests` and
`apps/jobs-ops/src`, each tagged with its class. The result:

| column | production | generated contract | schema DDL | same-named on another model | disposition |
|---|---|---|---|---|---|
| `payment_method` | **0** | 4 | 2 | 38 | source-clean |
| `payer_name` | **0** | 0 | 1 | 1 | source-clean |
| `payer_phone` | **0** | 0 | 1 | 1 | source-clean |
| `amount` | **0** | 7 | 11 | 305 | source-clean |
| `paid_at` | **0** | 3 | 1 | 9 | source-clean |
| `momo_ref` | **0** | 0 | 1 | 1 | source-clean |
| `pop_url` | **0** | 0 | 1 | 1 | source-clean |
| `payment_verified_at` | **8** | 3 (**blocking**) | 2 | 0 | **BLOCKED** |
| `payment_verified_by` | **14** | 2 (**blocking**) | 5 | 0 | **BLOCKED** |

The pattern is `\b<column>\b` — the barest possible. That is a choice: a narrower
pattern would have produced a cleaner-looking zero by hiding the 305 `amount`
hits instead of explaining them.

### 1.2 The column that makes the 305 hits harmless is `orm_mapped`

`applications.amount` has 305 matches on a same-named attribute of a *different*
model. None of them can reach the column, and the reason is mechanical:
`Application` does not **declare** an `amount` field, and Django can only name a
column it declares. An ORM-unmapped column is unreachable through the ORM no
matter what any code assigns to something spelled the same way.

That is why half 4 prints an `orm` column beside every count, and why the seven
`generated_contract` hits on `amount` are labelled a **name collision** rather
than a blocker: the identically named serializer field is a
`SerializerMethodField` sourced from the payments ledger, so dropping the column
cannot move the published contract.

`HALF 4 PASS=False` is printed, not smoothed, and the tool says why in its own
footer: *"HALF 4 measures SOURCE only… a column with zero source references is
still not contractable while it holds data."*

### 1.3 Which is exactly what separates 7 from 9

`payment_verified_at` and `payment_verified_by` are `orm_mapped=True`. Their hits
are not name collisions — they are the real thing: model field declarations, two
serializers' field lists, four response fields, three
`select_related('payment_verified_by')` call sites, entries in
`apps/admissions/src/generated/api.d.ts`, and `ApplicationDetailsSection.tsx`
rendering one of them to a student. Dropping a declared field's column does not
break that field; it breaks **every** query against `Application`, because Django
puts every declared field in the default `SELECT`.

So they are not contraction candidates on this cycle. R2.6 gives a published
surface a measured window (§10), and the contract migration is asserted never to
name them (§6.2).

---

## 2. The instrument — why the gates are a separate read-only file

[`invariants.sql`](invariants.sql) is `SELECT`-only, takes no lock beyond an
ordinary read snapshot, and is safe on production at any time. It is deliberately
**separate** from the contract migration, which embeds the same gates as
fail-closed guards. The division is:

- `invariants.sql` answers *"may we contract yet?"* — and can be run by anyone,
  anywhere, including on production before anything is decided.
- the contract migration **refuses to run** when the answer is no.

One file that both measures and mutates would force an operator to choose between
finding out and being safe. Two files means the first thing the production
procedure asks for is a measurement (§5.3 step 3), and the expected outcome of
that measurement today is *stop*.

`test_legacy_column_contraction_12_3.py::test_invariants_are_read_only` fails if
`invariants.sql` ever acquires a `DROP` / `DELETE` / `UPDATE` / `INSERT` /
`ALTER` / `TRUNCATE`, comment-stripped first so the file's own prose about
`DROP COLUMN` does not trip it.

---

## 3. The gates, measured

`raw/invariants-neon.txt`, on the Neon **default** branch and on
`br-jolly-pine-ahybtg2e`. Every count that matters is **identical on both**, so
none of this is a stale-branch artifact.

### 3.1 The scoreboard

| # | Gate | Reading | Verdict |
|---|---|---|---|
| 1 | announced sunset reached | `2026-08-15` vs today `2026-08-11` | **REFUSES** (§3.3) |
| 2 | legacy-row count zero | **92** non-null values across the 7 candidates | **REFUSES** (§3.4) |
| 3 | unbacked money rows zero | **16** applications | **REFUSES — decisive** (§3.2) |
| 4 | canonical / snapshot consistent | **33** rows with no canonical id → empty comparison domain | **REFUSES** (§3.5) |
| 5 | payment projection consistent | **1** permanent mismatch | **REFUSES** (§3.6) |
| 6 | registered exceptions still intact | 2 of 2 present | **PASSES** (§3.7) |

Deployment fingerprint: 33 applications, 21 payments, 0 `canonical_programs`, 186
`error_logs` rows; 44 migrations on the Neon default, 50 on the branch (it carries
task 3.5's expand/backfill/validate rows, rolled back on the branch but recorded).
`legacy_columns_drop_2026_08_15.sql` appears in **no** `migration_history` Neon can
see — it was never applied anywhere.

### 3.2 The finding that decides it — 16 applications whose payment exists only in the column

```
 legacy_rows_total                     | 18
 legacy_rows_with_canonical_payment    |  1
 legacy_rows_with_no_canonical_payment | 17
 unbacked_money_rows                   | 16
```

A per-column non-null count cannot tell a **redundant copy of a `payments` row**
from **the only surviving record of a payment**. Gate 1b can, and the answer is
that 16 applications carry a money fact — an `amount`, a `paid_at`, or a
`momo_ref` — with no `payments` row behind it at all.

For those rows the legacy column **is** the record. Three facts compose into a
one-way door:

- `DROP COLUMN` is irreversible with respect to values.
- R9.2 forbids `ADD COLUMN` in a rollback script — so the repo's own rollback
  convention cannot restore the shape, let alone the data.
- Re-adding them later would bring them back **empty**, and an empty `amount` on
  a paid application is worse than a missing one: it reads as authoritative.

So the rollback of record for this contraction is a **restore from backup**, which
is why the production procedure takes the backup before anything else (§5.3) and
why Neon point-in-time recovery is explicitly noted as *not* covering production.

**What the unblocking work actually is.** The exit criterion is
`unbacked_money_rows = 0`, reached one of two ways: **backfill** those 16 rows
into `payments` as historical ledger entries, or **quarantine** them somewhere the
money fact is preserved and no longer lives only in a column scheduled for
deletion. Both are the reverse-orphan direction task 3.5 named and deliberately
left (`docs/v2-evidence/3.5/README.md` — *"18 reverse-orphan mismatches (baseline
that blocks column contraction; owned by task 12.3)"*). Task 3.5 measured **18**;
re-measured here, still 18, on both branches.

**And it is not this task's bullet.** Authoring 16 historical ledger rows for real
applicants' money means deciding what `status` they get, whether they count as
verified, whether a receipt number is minted, and what the audit trail says about
who recorded them. That is a judgement about financial records with student-facing
consequences, not a mechanical migration. §10 is where it is registered with an
owner instead of being done quietly here.

### 3.3 The date — the sunset is four days away and has not arrived

```
ERROR: GATE 1 (date): announced sunset 2026-08-15 not yet reached
       (current_date = 2026-08-11). Nothing was changed.
```

This is the guard the 2026-05-17 cycle shipped, and on **2026-08-15** it stops
firing while every gate in §3.2, §3.4, §3.5 and §3.6 still holds. A date guard
alone would therefore have authorised the drop in four days' time. That is the
whole argument for §7: the calendar is not a safety gate, and a script whose only
guard is the calendar has to be neutralised rather than trusted to expire safely.

### 3.4 The legacy-row count — 92 values, on every column

```
 applications_total  | 33      momo_ref            |  1
 payment_method      | 17      pop_url             | 12
 payer_name          | 15      payment_verified_at | 13
 payer_phone         | 13      payment_verified_by | 13
 amount              | 17
 paid_at             | 17
```

**92** non-null values across the seven candidates, plus **26** across the two
registered exceptions. R15.6's phrasing is *"legacy-row count … zero"*, and the
gate is not zero on a single column. §3.2 is what makes 16 of those rows
different in kind from the rest.

### 3.5 Canonical / snapshot — three zeros over an empty comparison domain

```
 applications_total             | 33
 missing_canonical_ids          | 33      <-- read this first
 comparable_rows                |  0
 institution_snapshot_mismatch  |  0
 program_snapshot_mismatch      |  0
 intake_snapshot_mismatch       |  0
```

**This is not a pass.** All 33 applications have NULL `institution_id` /
`program_id` / `intake_id`, and `canonical_programs` is **empty** on both Neon
branches. The query cannot find a disagreement because there is nothing to
disagree with. Reporting "0 mismatches" would be a null reading dressed as a
gate, and it is the most plausible-looking wrong answer this task could have
produced.

`invariants.sql` says so in its own comment (*"Read `missing_canonical_ids`
FIRST"*), and the contract migration enforces the reading ordering: **guard 4a**
(empty domain) fires **before** guard 4b (a real disagreement), so 4b never gets
the chance to report clean over nothing.

What it actually means: on the Neon authoring database the task-3.2 canonical
assignment backfill has never been applied, so `applications.institution` /
`program` / `intake` are not yet display snapshots of anything — they are the only
identity record those rows have. Which is an independent reason the **identity**
columns are not contraction candidates, on top of their being `NOT NULL` and read
by the official-document renderer (`tasks/pdf_generation.py` reads
`application.program` / `.intake` / `.institution`). That is precisely the
output-only-snapshot use R15.6's first option permits.

### 3.6 Payment projection — one permanent mismatch, by construction

```
 applications_total                   | 33
 no_ledger_rows_projection_undefined  | 20
 projectable_rows                     | 13
 projection_mismatches                |  1

 application_number | stored   | derived  | ledger_statuses
 KATC202541031      | rejected | not_paid | expired
```

Not corrupt data — a vocabulary gap between two canonical constants:

- `_ADMIN_REVIEW_STATUS_MAP` (`apps/documents/payment_helpers.py:468`) lets an
  admin write `rejected` straight onto `applications.payment_status`.
- `APP_PAYMENT_STATUS_PRECEDENCE` (`payment_constants.py`) can only ever derive
  `verified` / `deferred` / `pending_review` / `failed` / `not_paid`.

`rejected` is a value the projection can never reproduce, so **any** row carrying
it is a permanent mismatch. §6.3 is why this task did not change either constant.

The 20 rows with no ledger row are counted **separately**, not as mismatches:
`derive_application_payment_status()` returns `None` for them and its contract is
that the caller leaves the stored summary alone. Folding them into the mismatch
count would have inflated the failure; folding them into the pass would have
hidden it.

### 3.7 The one guard that passes, recorded passing on purpose

Guard 6 asserts that `payment_verified_at` and `payment_verified_by` are **still
present** — it fails if a future edit widens the script's scope onto the two
registered exceptions. It found 2 of 2 and did not fire.

It is written up because a guard that never passes on a healthy database teaches a
reader nothing about what passing looks like. Recording the one green light is
what makes the five red ones legible as measurements rather than as a foregone
conclusion.

### 3.8 `error_logs` — out of scope, twice

186 historical rows, no canonical destination (GlitchTip holds nothing pre-dating
its cutover), and still an `EXPECTED_TABLE` in **both**
`backend/scripts/verify_schema_static.py:71` and
`backend/scripts/verify_migration.py:80` — so dropping it fails the release gate
(R15.3) until both verifiers change in the same commit. It is also a **table**,
and this bullet contracts columns. The contract migration is asserted to contain
no `DROP TABLE` at all (§6.2).

---

## 4. Reconciling the runbook without overwriting the human's edits

`docs/runbooks/legacy-column-deprecation.md` is a person's file. It carries
retroactive completion notes in a recognisable voice — *"Retroactive completion
note (2026-07-11)"*, *"Early-completion note"*, honest admissions like *"no proof
of a human notification exists; only documentation exists"*. The task's first
clause is to reconcile it *"without overwriting unrelated changes"*, so the method
was: **add beside, never replace; date and attribute every correction; and where
their text and the measurement disagree, state both and mark which is which.**

Nothing in their prose was deleted. Every original table row and checklist item is
still there.

| What their text said | What the measurement found | How it was handled |
|---|---|---|
| `profiles` (3 columns) — pending Day-90 drop | **already dropped 2026-07-12** by `schema_cleanup_drop_stale_columns.sql` (`migration_history.applied_at = 2026-07-12T13:12:37.913Z`), model fields absent, registry entry empty | section marked **✅ DONE 2026-07-12** with a reconciliation note; the table kept as the historical record of what went where |
| Day-60 blocker: `Profile.refresh_token_hash` / `failed_login_attempts` / `locked_until` are still live model fields and must be removed before Day 90 | **already done.** Verified by AST, and now permanently: `test_profiles_legacy_columns_are_fully_retired` fails if either a declaration or a registry entry returns | the blocker bullet kept, with a **✅ DONE — verified 2026-08-11** note naming the test; the `Application` half of the same blocker explicitly flagged as **still live** |
| Day-60 item 1: six "tracked, allow-listed writes" of `payment_method` to `applications` | **not violations at all** — every one writes `Payment.payment_method`; `Application` declares no `payment_method`, so no ORM write can reach it | corrected in place as *"One correction to the Day-60 findings"*, which also credits what item 1 got **right** (its `payment_verified_at` half) and that item 2 was right in full (§6.1) |
| Day-60 open item: *"review any downstream consumers (analytics, exports)"* — not performed | **performed**, running exactly the three searches that item specified: `auditExports.ts`, `exportUtils.ts`, `apps/analytics/` → **zero** consumers | completed inline under their bullet, with the two out-of-path hits named and both shown to read `Payment`, not `applications` |
| Day-90 post-execution: *"this query should return 0 rows"* (9 columns) | must now return **exactly 2** — the contraction covers 7 | reconciliation note; **zero** rows here would mean something dropped two columns that are still declared fields and four published API fields |
| Day-90 post-execution: *"verify `error_logs` is gone"* | it is **not** dropped; this must return **1 row** (§3.8) | reconciliation note with both verifier line numbers |
| Replacement table: `payments.method`, `payments.paid_at` | **neither column exists.** Real names are `payments.payment_method` and `payments.verified_at`, measured against `00_full_schema.sql:125` and `documents/models.py` | a successor-name reconciliation table added **below** theirs; theirs kept verbatim as the original announcement, with the note explicitly marked as the measurement |
| Replacement table: `payments.phone_hash` / `payments.phone_last4` | **jsonb keys inside `payments.metadata`** (ADR-005), not columns | recorded as *imprecise, not wrong* — the values do live there. The same imprecision was corrected in this task's own `migration-manifest.md` §2 |
| Day-90 execution: *"run `legacy_columns_drop_2026_08_15.sql`"* | that script would have destroyed 16 applicants' payment records | a **⛔** section: the sunset will not be met, the script is superseded, the date is revised to 2027-02-07, and scope narrowed 12 → 7 (§7) |

Two things were deliberately **not** done to their file: no checklist item was
un-ticked (their `[x]` marks record that *they* ran something on a date, which is
true regardless of what it found), and the original `SUNSET_DATE` of 2026-08-15 was
left in place everywhere it appears as a historical record. §7 is where the
revision is recorded as a revision.

### 4.1 Whose edits are whose

The runbook's diff against HEAD is **+385/−24**, and it would be wrong to present
that as this task's footprint. The working tree was already carrying the human's
own uncommitted edits — the Day-30 and Day-60 retroactive-completion notes dated
**2026-07-11**, from
`.kiro/specs/full-platform-remediation-2026-07/` Phase 5 — and those are in the
same diff.

Counted rather than estimated:

| | lines |
|---|---|
| added lines carrying a **2026-08-11 / task 12.3** marker | **13** |
| added lines carrying a **2026-07-11** marker (the human's) | 9 |
| total added lines in the diff | 385 |

The remaining additions are the bodies of both sets of notes, interleaved. There is
no clean line-count attribution available and inventing one would be worse than
saying so — **every** paragraph this task added is signed and dated in the file
itself (`admissions-v2 task 12.3`, `2026-08-11`), so attribution is by marker, not
by arithmetic.

The 24 deleted lines are worth being equally precise about. **Fifteen of them are
the human's**, not this task's: unchecked `- [ ]` Day-30/Day-60 checklist items and
an example SQL block, replaced by their own `- [x]` versions with the 2026-07-11
notes. The nine that belong to task 12.3 are the ones that had to stop saying what
they said:

- `psql … -f backend/scripts/legacy_columns_drop_2026_08_15.sql` — the instruction
  to run the script that would have destroyed 16 applicants' payment records (§7.1);
- three renumbered pre-execution steps, now preceded by the read-only gate run;
- three renumbered post-execution steps, now scoped to *the 7 dropped columns*
  rather than all of them;
- the `Drop script:` registry-location bullet, struck through rather than removed
  so the old name still resolves to an explanation;
- the `### profiles (3 columns)` heading, which became
  `### profiles (3 columns) — ✅ DONE 2026-07-12`.

---

## 5. The migration, the rehearsal, and the rollback

### 5.1 Every guard fires on real data

`raw/neon-rehearsal.txt` Part A. Neon MCP `run_sql` executes one statement per
call, so the guard blocks were run **individually** — which is strictly more
informative than running the file, because the file stops at the first guard (the
date) and running them separately shows that four more would have fired behind it.

**5 of 6 refuse**, each naming its offending number rather than just saying no:

```
GATE 1 (date):    announced sunset 2026-08-15 not yet reached (current_date = 2026-08-11)
GATE 2 (legacy rows): 92 non-null legacy value(s) remain - payment_method=17, …
GATE 3 (unbacked money rows): 16 application(s) carry a money fact … with NO canonical payments row
GATE 4a (empty comparison domain): 33 application(s) have no canonical … id
GATE 5 (payment projection): 1 application(s) … disagrees with the derived ledger projection
GATE 6: PASS (2 of 2 present)
```

A guard that reports only *"refused"* sends the operator back to the invariant
queries to find out why; each of these carries its measurement out with it. The
script is unrunnable today **by its own rules** — arrived at by measurement, not
by decision.

### 5.2 The rollback was rehearsed on the real table, and nothing was lost

The guards prove the preconditions are unmet. They prove nothing about whether the
DDL behind them is valid, or whether rolling back restores the database. Part B
answers both, on the real `applications` table, without losing a row: the seven
`ALTER`s run inside a `DO` block that measures the effect and then `RAISE`s.
Postgres DDL is transactional, so the abort rolls the whole thing back atomically
and the exception message carries the measurement out.

```
ERROR: REHEARSAL_ROUNDTRIP_OK: 7-column contract DDL executed against the real
       applications table. columns_before=7 columns_after=0 rows_before=33
       rows_after=33 legacy_values_that_would_have_been_destroyed=92.
       Aborting deliberately so nothing is lost.
```

State after the abort, in a fresh transaction: 7 columns restored, 33 rows, 92
legacy values, 21 payments, **0** `migration_history` rows written. The branch is
byte-for-byte as found.

`legacy_values_that_would_have_been_destroyed=92` is the same number as Gate 2,
deliberately — it prices the drop in the units the gate refuses in.

**No lock duration is quoted.** `ALTER TABLE … DROP COLUMN` takes `ACCESS
EXCLUSIVE` but only rewrites the catalog, not the heap, so it is O(1) in table
size; a timing from 33 rows would be meaningless at production scale. The manifest
states the lock **class** and the real risk — **lock queueing** behind a
long-running `SELECT` — and the production procedure sets `lock_timeout` so the
migration yields rather than stalling the platform.

### 5.3 Production is a written procedure whose first instruction is to measure

`raw/production-procedure.md`. Seven steps, and the ordering is the point:

1. **Back up first.** `./deploy/backup-db.sh`. This dump *is* the rollback; Neon
   PITR does not cover this database.
2. Copy the read-only instrument onto the box.
3. **Measure production, and read the output before doing anything.** With a table
   of *if X then* **STOP**, one row per gate. On current evidence the expected
   outcome of step 3 is **stop — and that is a successful run of the procedure,
   not a failed one.**
4. Apply, only if every gate read zero. `--allow-non-additive` is mandatory, and
   the procedure says in bold not to add that flag to the `Dockerfile` CMD: its
   absence is what stops a contraction from ever running unattended at boot.
5. Verify — expect **exactly 2** surviving columns, not zero.
6. Rollback = **restore the step-1 dump.** *"Do not try to re-add the columns as a
   fix. They would come back empty."*
7. Housekeeping, including `shred -u` of the output file, which names application
   numbers.

Production was **not** touched by this task (§11). The procedure's own Step 0
requires that someone other than the operator has read §3 of this README and
agrees the gates are genuinely met — a second reader, because the first one is the
person about to run an irreversible command.

---

## 6. What changed in code — and what deliberately did not

### 6.1 The no-writes allow-list was suppressing six findings that were never violations

`test_legacy_columns_no_writes.py` AST-scans `backend/apps/` for writes to any
registered deprecated column, and carried an eight-entry
`_KNOWN_DAY0_VIOLATIONS` allow-list. Six of those entries named `payment_method`
writes in `payment_service.py`, its three mixins, `views.py` and
`payment_widget_views.py`, described as *"legacy sync writes … to applications"*.

Re-measured: **every one of them writes `Payment.payment_method`.** The scan
matches attribute assignments by *name*, and it cannot by itself tell
`application.payment_method = x` from `payment.payment_method = x`. Both models
have the attribute; only one table is in the registry.

The rigorous distinction is **ORM mapping**, and it is now the filter: a
deprecated column its owning model does not declare cannot be written through the
ORM at all, so it is partitioned into `_UNMAPPED_DEPRECATED_COLUMNS` and cannot be
"violated". Result:

- allow-list **8 → 2**. Both survivors are real: they assign
  `Application.payment_verified_at` / `payment_verified_by_id`, which `Application`
  does declare. Removing that dev-bypass write is **item 3** of the exit criteria
  on `applications.payment_verified_at` in the register.
- a third case added (2 → 3): `test_allow_list_does_not_grow_and_names_only_reachable_columns`
  asserts every entry names an ORM-reachable column **and** that
  `len(...) <= 2`. Task 12.2 §18 #8 is the general rule — *"remove it later"* is
  not a plan, `assert len(...) <= N` is.

An allow-list entry for an unmapped column is worse than no entry: it reads as
evidence of a write that does not exist. The runbook's Day-60 review inherited
exactly that mistake, which is why §4 corrects it there too, while crediting the
half of that finding which was correct.

### 6.2 The decision is encoded, not narrated

`test_legacy_column_contraction_12_3.py`, **17 cases**. A non-contraction rots:
six months from now someone reads *"contract the legacy columns"*, sees the sunset
long past, and runs the drop. So the tests fail if —

| Class | Fails when |
|---|---|
| `TestOrmMappingIsWhatMakesTheContractionSafe` (3) | any of the 7 becomes a declared `Application` field; either of the 2 loses its declaration; `profiles` re-acquires a registry entry or a model field for a column dropped on 2026-07-12 |
| `TestRegisteredLegacyExceptions` (4) | any of the 3 column entries loses its owner, end date, successor, or evaluable exit criteria (`len > 80`, so it cannot be a restatement of the surface name); the revised end date is not actually later than the original; `SUNSET_DATE` is edited instead of the register |
| `TestContractMigrationIsGuardedAndUnreachable` (6) | a guard goes missing; a guard refuses without naming its number; the migration leaves `future/` and becomes reachable by the boot sweep; the drop set widens past the 7; `ADD COLUMN` appears in the rollback; the superseded script becomes runnable |
| `TestInvariantSqlMatchesTheProjectionItClaimsToCheck` (4) | the SQL projection drifts from `APP_PAYMENT_STATUS_PRECEDENCE` in membership **or order**; `invariants.sql` acquires any mutating statement; a gate marker disappears |

All 17 are pure source/AST checks — `ast.parse` over two model modules and
`read_text` over four SQL files — so they run anywhere the unit suite runs.

### 6.3 The projection mismatch belongs to the payment lane, and that is a decision

Gate 5's single mismatch (§3.6) has an obvious-looking fix: teach
`APP_PAYMENT_STATUS_PRECEDENCE` about `rejected`, or stop
`_ADMIN_REVIEW_STATUS_MAP` from writing it. **Neither was done here**, for three
reasons:

1. **Task 8.2 owns the projection.** It is the task that converged the platform
   onto one payment state machine and one projection, and both constants are
   registered in `docs/canonical-truth-map.md`. Changing a canonical enum from a
   contraction task means the change is reviewed as schema cleanup rather than as
   payment semantics.
2. **Either edit changes behaviour a student or an admin can see.** Adding
   `rejected` to the precedence makes some applications project to a status they
   do not project to today; removing it from the admin map takes away a value an
   admin can currently set. That is not a no-op and it does not belong in a task
   whose entire premise is that nothing observable moves.
3. **It does not unblock anything.** Even at zero projection mismatches, §3.2 and
   §3.5 still refuse. Fixing gate 5 would buy no contraction — it would only make
   the scoreboard look better.

Recorded as the payment lane's, with the root cause named to the line
(`payment_helpers.py:468`) so the lane does not have to re-derive it.

### 6.4 The comment that made a promise about another file, executed

`invariants.sql` claims in a comment that a named test parses it and fails on
drift. An un-executed claim in a comment is worth nothing, so
[`raw/guard-parity-test.txt`](raw/guard-parity-test.txt) runs it, names the two
cases that carry it, and **breaks it on purpose**: swapping the `deferred` and
`pending_review` branches in the first projection `CASE` — a change that leaves
every status present, so only the *order* assertion can catch it — fails `path0`
and leaves `path1` (the contract migration, untouched) passing. The file was
restored and verified byte-identical by SHA-256.

It also records an environment trap: run with `backend/.env` sourced (Neon), all
17 report as **errors** from a session-fixture collision in the shared authoring
database, not from anything these tests assert. Against the local socket Postgres
the backend suites use, all 17 pass in 0.58s. Written down because a reader who
runs it the obvious way will see 17 errors and should know instantly that it is
the fixture, not the gate.

---

## 7. The superseded drop script, and the revised end date

### 7.1 The script

`backend/scripts/legacy_columns_drop_2026_08_15.sql` dropped **12** things behind
**one** guard — the calendar. It was already in `EXCLUDED_TOP_LEVEL_FILES`, so it
was never auto-applied and no boot sweep was ever at risk from it. **The exposure
was a person:** the runbook's Day-90 section told an operator to run it by hand,
and from 2026-08-15 the date guard stops refusing. Leaving a loaded script next to
an instruction to fire it is not a documentation problem.

It is now a stub that raises and points at the invariant queries, the contract
migration, and this section. **Kept as a marker rather than deleted**, so that the
instruction — wherever it has already been copied to — lands on the explanation
instead of on a missing file.
`test_superseded_drop_script_is_neutralised` fails if an executable `DROP COLUMN`
or `DROP TABLE` returns to it, and accepts outright deletion as equally fine.

### 7.2 The date

The announced sunset **2026-08-15 will be missed**, and the window is revised to
**2027-02-07** — recorded in `compatibility_register.py` with an owner and exit
criteria per entry, which is the shape task 12.5 audits.

Two things make that defensible rather than convenient:

- **It was an internal target, not a published promise.** No `Sunset` header ever
  carried 2026-08-15 to a caller, and the runbook's own Day-60 note already
  admitted *"no proof of a human notification exists; only documentation
  exists."* The revision leans on the human's own honesty, not around it.
- **It is moved once, onto a date that already exists.** 2027-02-07 is the same
  180-day window every other V1 surface registered by task 12.2 already uses — not
  a third new convention.

`legacy_columns.SUNSET_DATE` is deliberately left at `"2026-08-15"` as the
historical record of what the 2026-05-17 cycle announced. This task's evidence
reads *against* it, and
`test_registered_end_date_is_later_than_the_original_sunset` fails if someone
quietly edits that constant forward instead of recording a revision where a
revision is auditable.

---

## 8. Backend result

`raw/backend-selection.txt`, `raw/backend-tests.txt`. **149 passed, 0 failed, 0
errors**, run **serially** with `-p no:randomly` on the local socket Postgres.

The `0 errors` matters: 12.1 §15.1 records that a *concurrent* pytest run produces
spurious `psycopg2.errors.DuplicateDatabase` errors that make a before/after
comparison unmeasurable. Nothing else was running.

**Why an 11-file selection and not the 51-file baseline.** This change touches SQL
scripts under `backend/scripts/` (none swept), the compatibility register, two
legacy-column test files, and one repo script. It touches **no** view, serializer,
model, URL or setting. The 11 files are every suite that reads any of those: the
migration runner and its additive lint, the rollback-pairing and schema-drift
properties, 12.2's register suite, both legacy-column suites, and the
payment/canonical suites whose invariants this task re-measured (3.5, 8.2, the
canonical drift guard).

The **33 pre-existing failures** in the dispatch's 51-file baseline live in files
this change cannot reach. They are not fixed, not re-run under a new name, and not
claimed. The largest cluster —
`test_view_auth_classification.py`'s 38 assertions — is held deliberately by tasks
12.1 §19 and 12.2, and the 3 unclassified public endpoints are named with their
owning lane in 12.2 §9.3.

Also measured:

| Gate | Result |
|---|---|
| `python manage.py check` | **no issues** (1 silenced). No `TESTING=1`, no substitute `REDIS_URL` — both produce a spurious `django_ratelimit.E003` |
| `python manage.py spectacular` | **byte-identical** to `backend/schema/openapi.v2.candidate.yaml`, SHA-256 `35fe05d4…`, 22135 lines, `diff` empty. Warnings 3 / errors 116 — identical counts to 12.1 and 12.2 |

A byte-identical schema is the **correct** reading here rather than a null one:
this task's whole claim is that no published surface moved. Had the hash changed,
that claim would be false.

---

## 9. Frontend and harness — the "nothing moved" claim

This task renders nothing and changes no frontend file, so these are regression
checks. The bar is that nothing moves: a moved number would mean a blast radius
this change should not have. The three unit/lint/build gates below are identical
on every number. The browser gate moved by **one test, in the passing direction**,
and §9.2 is why that is a statement about the test rather than about this change.

| Gate | Result | Baseline | Reading |
|---|---|---|---|
| `bun run test` | **1 failed / 4592 passed / 1 skipped**, 493 files ([`raw/frontend-test.txt`](raw/frontend-test.txt)) | 1 / 4592 / 1 over 493 | identical on every number |
| `bun run lint` | **15 errors, 13 files** ([`raw/frontend-lint.txt`](raw/frontend-lint.txt), [files](raw/frontend-lint-files.txt)) | the same 15 / 13 | identical set |
| `bun run build` | **exit 0**, incl. `tsc`, critters, and the CSP gate ([`raw/frontend-build.txt`](raw/frontend-build.txt)) | exit 0 | unchanged |

The single test failure is `authPageFormMarkup.test.tsx` — the sign-up-page
helper-copy assertion that tasks 11.1–11.5, both 12.1 passes and 12.2 have each
recorded at this base commit. Seven prior recordings; another lane's; untouched.

The 15 lint errors break down as **9** `no-restricted-imports` (a page or
component importing `@/services/client` directly instead of a domain service
module) and **6** unused `eslint-disable` directives. All 13 files are wizard
hooks/steps, dev-preview hooks, or the two harness helpers task 8.3 added. None is
in this task's lane. `bun run validate:tailwind` exits 127 in this environment and
is likewise not this task's.

### 9.1 The browser gate, on a freshly seeded stack

Isolated local harness (task 0.4), strict gates active,
`HARNESS_PW_CHANNEL=chrome` (bundled Chromium is unsupported on this OS), volumes
wiped and reseeded, SPA rebuilt, and **torn down afterwards**. The pre-teardown is
recorded separately so that *"fresh"* is a measurement rather than an assumption.

| Run | Result |
|---|---|
| `harness down` **before** the fresh `up` | 0 harness containers, 0 harness volumes — so *"freshly seeded"* is a measurement, not an assumption ([`raw/harness-down-pre.txt`](raw/harness-down-pre.txt)) |
| `harness down` then `harness up` | volumes wiped, SPA rebuilt (3652 modules, `dist/index.html`, CSP gate scanned), backend healthy (schema + seed), edge serving ([`raw/harness-up.txt`](raw/harness-up.txt)) |
| the whole required profile, **fresh stack** | **218 passed**, 2 failed, **0 did not run** — 220 tests, 1 worker, `retries: 0`, 18.2 min ([`raw/harness-required-suite.txt`](raw/harness-required-suite.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`raw/harness-gatecheck.txt`](raw/harness-gatecheck.txt)) |
| drain | `{"broker_queue_depth": 0, "celery_queues": ["celery"], "unsettled_payment_collections": 0, "unsettled_references": []}` ([`raw/harness-drain.txt`](raw/harness-drain.txt)) |
| teardown | 0 harness containers, 0 harness volumes ([`raw/harness-down.txt`](raw/harness-down.txt)) |

Total **220**, the same as 12.1's and 12.2's. This task adds no journey.

### 9.2 The count moved by one, in the passing direction — and it is not this task

12.2's candidate recorded **217 passed / 3 failed**; this run is **218 / 2**. The
whole difference is `ocr-manual-fallback.spec.ts:146`, which **passed on both
projects** here — 15.3 s on chromium, 13.7 s on mobile — after failing on chromium
there.

§9's bar is that nothing moves, so a moved number has to be accounted for rather
than welcomed — a number moving the *convenient* way is still a number moving, and
taking it as good news is how a regression check stops being one. It is accounted
for by measurement, and the measurement is that **the input did not change**:

- **Zero files under `apps/admissions/src` and zero under
  `apps/admissions/tests/harness-e2e` have been modified since 12.2's run**
  (`find -newer` against that run's own capture time: 0 and 0). The SPA the harness
  rebuilt and the spec that ran are byte-for-byte the same source.
- This task's footprint (the Files table above) contains **no** frontend file at
  all — four SQL files, one register, two backend test files, one repo script, one
  runbook.
- `retries: 0` and `workers: 1`, so the pass is a first-attempt pass, not a
  retry masking a failure. Playwright reported no `flaky` line.

A test that flips outcome while its own source, the bundle it drives, and the
platform code beneath it are all unchanged is telling us about **the test**, not
about the change. Which makes this run **counter-evidence to 12.2 §8.2's
concern**: that section found the OCR failure newly reproducible in isolation and
flagged that it *"may be hardening from a flake into a defect."* On a freshly
seeded stack one run later it did not reproduce at all. That is not a fix and this
task claims none — it is a third data point for the wizard lane, and it points
back toward the intermittent step-advance race 11.2 §16–§17 documented rather than
toward a settled defect.

Recorded rather than smoothed, because the tidier thing to write would have been
*"identical to baseline"* and it would have been false.

### 9.3 The two failures, attributed

| Failure | Reading |
|---|---|
| `tenant-launch.spec.ts:139` × **both** projects | **stable pre-existing.** The same pair tasks 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5, both 12.1 passes and 12.2 each recorded at this base commit — this is the **eleventh** consecutive recording. Its assertion is `getByText('Fees')` against a `Program Fees` step label `TenantOnboardingWizard.tsx` renders `hidden` on mobile; the call log shows the locator resolving 9 times to that span and reporting `hidden`. The tenant lane's; 12.1 §21 is why that file is declined |
| — | There is no second entry. `ocr-manual-fallback.spec.ts:146` is the third *known* failure and it **did not fire** this run (§9.2) |

Not fixed here. Both failing cases are the same assertion in the same tenant-lane
spec, once per project, and quietly repairing a tenant-wizard mobile layout
assertion would mix an unrelated behaviour change into a task whose entire premise
is that nothing observable moves.

---

## 10. The registered exception: owner, blocker, exit criterion

A contraction blocked by 16 unbacked money rows is a real Legacy_Exception. Task
12.2 built `backend/apps/common/compatibility_register.py` for exactly this shape,
and task 12.5 audits it. Three `kind="column"` entries were added — the register's
first.

| Entry | Why registered | Owner | End date |
|---|---|---|---|
| `applications.payment_verified_at` | **published surface** — live model field, 2 serializers, 4 response fields, in `generated/api.d.ts`, rendered by `ApplicationDetailsSection.tsx`. R2.6 gives that a measured window | `platform-admissions` | **2027-02-07** |
| `applications.payment_verified_by` | **published surface** — declared FK, 14 production refs, 3 `select_related()` sites. Dropping it while the FK is declared breaks every `Application` query | `platform-admissions` | **2027-02-07** |
| `applications.prelenco_payment_columns` (the 7) | **source-clean but data-blocked** — 0 production refs, none ORM-mapped, published contract unaffected. Blocked entirely by §3.2 | `platform-admissions` | **2027-02-07** |

**The third entry widens what this register is for, deliberately.** By task 12.2's
own rule, a surface with zero first-party callers and no published contract is
*dead code to delete*, not compatibility to register — and on source, those seven
columns are exactly that. They are registered anyway because the blocker is
**data**: for 16 applications the column is the only record of a payment. A window
here is not compatibility for a caller; it is a promise about data that has an
owner and a date, so it cannot quietly become permanent. That is written into the
register's own module docstring so a future reader does not mistake it for a
category error.

### 10.1 Who reconciles the 16 rows, and what "done" means

**Registered owner: `platform-admissions`** — the same owner every other entry in
the register carries, and the team that owns `backend/apps/applications/`.

The exit criterion is mechanically evaluable, which is the property task 12.5
audits for:

> Exit when **Gate 1b of `docs/v2-evidence/12.3/invariants.sql` reports
> `unbacked_money_rows = 0`**, by backfilling **or quarantining** that cohort into
> `payments` — the reverse-orphan direction task 3.5 named and deliberately left.

Two things are said plainly rather than left implied:

- **It is one query to check.** Not a judgement call, not a review — run
  `invariants.sql` and read one number. Anyone can verify the exception is still
  warranted, which is what stops it from aging into an exemption.
- **The reconciliation itself needs a named human, and the register cannot invent
  one.** *"Authoring 16 historical ledger rows is an owner's judgement about
  applicant financial records, not a mechanical migration"* — someone has to
  decide what `status` those rows get, whether they count as verified, whether a
  receipt is minted, and what the audit trail says about who recorded a payment
  nobody witnessed. The register names the accountable team; the production
  procedure's Step 0 requires a **second reader** before any irreversible step;
  and `test_column_exception_is_registered_with_owner_and_end_date` fails if the
  owner, the date, the successor, or the exit criteria ever go missing. Naming an
  individual here would be inventing a commitment this task has no standing to
  make — flagging that a human sign-off is *required* is within it.

Quarantine is offered as a first-class alternative to backfill for a reason: it
preserves the money fact without asserting a payment status the platform cannot
substantiate. If the truth is *"we know K450 arrived on 2025-11-03 by mobile money
and we have no ledger row for it"*, then a record saying exactly that is more
honest than a synthesised `successful` payment.

---

## 11. Boundaries honoured

| Boundary | What was done |
|---|---|
| **Production untouched** | Not SSH'd to. No `apply_sql_migrations`. No read query against `mihas-postgres-1`, including the invariant queries. No backup taken, moved, or inspected. Per `.kiro/steering/infrastructure.md`, production writes are operator steps — so the deliverable is `raw/production-procedure.md`, backup step first |
| **Neon default branch never written** | Read only. All writing (the rehearsal, which aborts itself) went to `br-jolly-pine-ahybtg2e`, reused because the project's branch limit is exceeded. No branch created, none deleted, no `reset_from_parent` |
| **The 5 failing guards were not "fixed"** | Reconciling 16 unbacked money rows is a data-migration decision with real money semantics. It is not this bullet, and doing it quietly would have been the worst outcome available. It is registered instead (§10) |
| **`_ADMIN_REVIEW_STATUS_MAP` / `APP_PAYMENT_STATUS_PRECEDENCE` unchanged** | The projection mismatch is the payment lane's; task 8.2 owns the projection. Root cause named to the line and handed over (§6.3) |
| **Other lanes' failures not touched** | `authPageFormMarkup.test.tsx`; the 15 lint errors; `tenant-launch.spec.ts:139` ×2; the task-9.2 perf-golden divergences; `test_view_auth_classification.py`'s 38; the 3 unclassified public endpoints; `validate:tailwind` exiting 127. And `ocr-manual-fallback.spec.ts:146`, which **passed** on this run — not touched either, and explicitly not claimed as fixed (§9.2) |
| **No destructive SQL run autonomously** | The only DDL executed anywhere was inside a `DO` block that aborts itself, on a rehearsal branch, with the before/after state measured and published (§5.2) |
| **No PII in evidence** | The projection query selects `application_number` only. `raw/legacy-column-grep.txt` shows source lines, not data. The production procedure's step 7 requires `shred -u` of its own output because that output names application numbers |

---

## 12. Not claimed here

- **That any column was dropped.** None was, on any database. Not on the Neon
  default, not on the rehearsal branch, not on production.
- **That the 2026-08-15 sunset was met.** It was not, and §7.2 records the
  revision to 2027-02-07 as a revision rather than absorbing it silently.
- **That production is safe to contract.** Production was not measured. Neon and
  production hold different data, and a Neon reading says nothing about
  production's own unbacked rows — which is why the production procedure's Step 0
  requires all gates read zero **on production**, not only on Neon.
- **A lock-duration estimate.** `DROP COLUMN` is O(1) in table size, and a timing
  from 33 rows would be a number without meaning. The lock **class** and the
  queueing risk are stated instead (§5.2).
- **That the canonical/snapshot gate passes.** It returns three zeros and they are
  **not** a pass (§3.5).
- **That `error_logs` was assessed for removal.** It is out of scope; it needs its
  own decision plus a change to both schema verifiers (§3.8).
- **That the 16-row cohort has been reconciled, or that a plan for reconciling it
  has been agreed.** It is measured, named, owned, and given an exit criterion.
  Nobody has yet decided backfill vs quarantine.
- **That the 33 pre-existing backend failures or the frontend/harness failures
  were investigated.** They are attributed to their lanes and left (§8, §9).
- **That `ocr-manual-fallback.spec.ts:146` was fixed.** It passed on this run
  after failing in 12.2's, and nothing in this task's footprint could have caused
  either outcome — the SPA source and the spec are unchanged since that run. It is
  reported as a third data point for the wizard lane, not as a repair (§9.2).
- **That this harness run is identical to the baseline.** It is not: 218 / 2
  against 217 / 3. The one-test difference is measured and attributed rather than
  described as identical (§9.2).
- **Any numbered spec property.** This task has no PBT sub-task; the gates are
  recorded as SQL and as 17 unit tests instead.

---

## 13. What a future task on these columns should know

1. **Run `invariants.sql` first, and read `missing_canonical_ids` and
   `unbacked_money_rows` before anything else.** Everything else in the output is
   less informative than those two numbers.
2. **A zero mismatch count over an empty comparison domain is not a pass.** It is
   the failure mode most likely to produce a confident wrong answer, and the
   reason guard 4a precedes 4b.
3. **ORM mapping — not grep count — is what makes a column droppable.** A
   deprecated column its owning model does not declare cannot be reached through
   the ORM regardless of how many same-named attributes exist elsewhere. Two
   separate mistakes in this cycle (the Day-60 review, the no-writes allow-list)
   came from missing that distinction.
4. **The rollback of record for a contraction is a restore, not a script.** R9.2
   forbids `ADD COLUMN` in a rollback, and re-added columns come back empty. Take
   the backup first, always.
5. **Contracting the 7 needs a money decision made by a person.** Not more
   telemetry. Source has been clean since before this task started; the blocker
   is 16 applicants' payment records, and the choice is backfill or quarantine.
6. **When the gates pass, the mechanical path is already written**: manifest §3
   steps 5–8, then `raw/production-procedure.md`. Promote the migration out of
   `future/`, apply with `--allow-non-additive`, and never add that flag to the
   `Dockerfile` CMD — its absence is the only thing preventing an unattended
   contraction at boot.
7. **Expect exactly 2 surviving columns after a successful contraction, not 0.**
   Zero would mean something dropped two registered exceptions that are still
   declared model fields and still four fields of the published API response.

---

## 14. Closure — 2026-10-09: accepted as proof plus a registered Legacy_Exception

Appended **2026-10-09 (UTC)**. §1–§13 are left exactly as captured on
2026-08-11: the first 64,343 bytes of this file are that record (SHA-256
`2dda63268508b830…` before this section was added). Nothing in them was edited to
match today.

### 14.1 The decision, and what it does and does not claim

The user has accepted task 12.3 as complete on the basis set out in *"What
'complete' means here"*: the contraction was proven unsafe, the data forbids the
drop, and the blocked contraction is a registered Legacy_Exception with an owner,
an end date and an evaluable exit criterion. This pass checked that the basis
still holds before recording the closure. It does (§14.3).

The closure claims the same three things the top of this README defines, and
nothing more:

1. **The four Required_Evidence artifacts exist and were measured** — and the two
   that can go stale (telemetry, invariant queries) were measured again today.
2. **The gates refuse.** Re-measured today on both Neon databases with
   **identical** numbers. The decisive one is unchanged: **16 applications carry a
   money fact with no `payments` row behind it.**
3. **The blocked contraction stays registered** in `compatibility_register.py`
   (owner `platform-admissions`, end date **2027-02-07**, exit = Gate 1b reads
   `unbacked_money_rows = 0`), and the production procedure is written.

It does **not** claim:

- **That any column was dropped.** None was, on any database. Gate 0 today still
  finds all 9 columns on the Neon default branch and on `br-jolly-pine-ahybtg2e`.
- **That production was measured.** It was not, then or now: no SSH, no query. A
  Neon reading says nothing about production's own rows (§12).
- **That the announced sunset was met.** 2026-08-15 passed 55 days ago with the
  gates still refusing. The window was revised **once**, to 2027-02-07, and that
  revision lives in the register (§7.2); `legacy_columns.SUNSET_DATE` keeps
  `2026-08-15` as the historical announcement.
- **That the bullet's third clause was executed.** *Rehearse rollback* was done
  (§5.2). *Apply on Neon, then production* was not, because the data forbids it.
- **That the 16-row cohort is reconciled, or that backfill vs quarantine has been
  decided.** Neither has happened.

### 14.2 Re-verification, 2026-10-09

| # | Check | Raw | Result | Against 2026-08-11 |
|---|---|---|---|---|
| 01 | `tests/unit/test_legacy_column_contraction_12_3.py` | [`closure-01-contraction-tests.txt`](raw/closure-01-contraction-tests.txt) | **17 passed**, 0 failed, 0 errors, 0.12 s, no database. Supplementary: `test_legacy_columns_no_writes.py` **3 passed** | same 17 cases (§6.2) |
| 02 | telemetry half 4, `scripts/v1_surface_telemetry.py --columns` | [`closure-02-legacy-column-telemetry.txt`](raw/closure-02-legacy-column-telemetry.txt) | **0 production references on all 7 candidates**; `HALF 4 PASS=False`; contractable 7 / blocked 2 / already done 2; exit 1 | **verdict identical**; some counts moved, each explained (§14.2.2) |
| 03 | 02 compared hit by hit with `raw/legacy-column-telemetry.json` | [`closure-03-telemetry-compare.txt`](raw/closure-03-telemetry-compare.txt) | every moved count attributed | — |
| 04 | the three `kind="column"` register entries | [`closure-04-register-entries.txt`](raw/closure-04-register-entries.txt) | owner `platform-admissions`, end date `2027-02-07` (**121 days** away), successor and exit criteria on all three | unchanged; file not written since 2026-08-11 08:09 |
| 05 | `invariants.sql`, Neon **default** branch, read-only | [`closure-05-neon-invariants-default.txt`](raw/closure-05-neon-invariants-default.txt) | every gate count identical; **16** unbacked money rows | identical |
| 06 | `invariants.sql`, **`br-jolly-pine-ahybtg2e`**, read-only | [`closure-06-neon-invariants-branch.txt`](raw/closure-06-neon-invariants-branch.txt) | identical to 05; **16** | identical |

#### 14.2.1 Why the test command was not run verbatim

The requested command (`cd backend && python3 -m pytest … -q`) stops at
collection: `/usr/bin/python3` has pytest but no Django, and
`tests/conftest.py` line 5 is `import django` (exit 4, recorded in closure-01 A).

Under `backend/.venv/bin/python3` it would collect, but the session is not
database-free even though the 17 cases are. `tests/conftest.py:88` is an
**autouse, session-scoped** fixture (`unmanaged_schema`) that requests
`django_db_setup`, so every pytest session under `backend/tests/` creates and then
drops the test database. With no `DATABASE_URL` exported, that is `test_beanola`
on the local Postgres listening at `127.0.0.1:5432` — the database-backed pytest
this pass was told not to run while task 12.5 runs. So the same file ran with
`--noconftest -p no:django -p no:cacheprovider`, and `pytest -VV` in closure-01
shows pytest-django is not loaded. The cases import three dependency-free modules
and use no fixture beyond `parametrize`, so the assertion set is the same.

One correction for future readers: the test module's docstring says *"no
database, no network"*. That is true of the 17 assertions, not of a pytest
session under `backend/tests/`. **A database-free run of this file needs
`--noconftest -p no:django`.**

#### 14.2.2 Telemetry: same verdict, and why the counts moved

- **The 7 candidates read 0 production references**, as on 2026-08-11. That zero
  holds by construction: `run_columns()` relabels any production-classified hit
  on an ORM-unmapped column as `other_model`. Their safety argument was never the
  grep count. It is ORM mapping (§1.2–§1.3, re-confirmed by closure-01) plus the
  database gates, which refuse (§14.3).
- **`payment_verified_at` 8 → 7 and `payment_verified_by` 14 → 13 is an
  instrument change, not a removed reference.** The scanner was edited after
  2026-08-11 (task 12.5 added Python handling to the comment classifier). Its `#`
  rule marks the **whole line** as prose on any `#`, including a trailing comment
  after code, and both field declarations (`applications/models.py:96–97`) end in
  `# DEPRECATED - use payments table`. Both fields are still declared
  (closure-01), and both columns stay BLOCKED on their remaining references and
  generated-contract hits. **Not fixed here**: the scanner is task 12.5's, half 5
  classifies with the same rule, and 12.5 is running concurrently. It is reported
  to the orchestrator for that lane.
- **46 `other_model` → `comment` reclassifications are correct**: docstring prose
  the 2026-08-11 classifier could not see.
- The remaining deltas (`test`, `self`, `dev-preview`, `other_model`, and one
  more `amount` name in `generated/api.d.ts`) are source changes since
  2026-08-11, none a production reference. Some are this task's own: the
  2026-08-11 telemetry JSON was captured at 08:07 local, before 12.3's final edits
  to the register (08:09) and the drop-script stub (08:11).
- The register's `measured_zero_first_party` text still says 8 and 14. That is
  the 2026-08-11 measurement, left as written (no register edits during 12.5).

### 14.3 The gates, re-measured: the blocker holds

**Transport.** The Neon MCP server is not connected in this session (`MCP server
'power-neon-Neon' is not connected`), so the instrument ran through `psql` 18.6,
the other Neon access route `infrastructure.md` names. Credentials were read from
`backend/.env` in-process and reached `psql` only as `PG*` environment variables:
never printed, never on argv. All six closure files were scanned for the password,
the role name and a credentialed DSN, and contain none. The whole file ran inside
`BEGIN TRANSACTION READ ONLY … ROLLBACK`, and each output prints
`transaction_read_only = on` first.

psql cannot take a branch id, so the **endpoint id** is the explicit identifier:
`ep-dawn-unit-ahj08a5x-pooler` is the default branch (the 3.6 and 0.5 evidence
label it so) and `ep-proud-cherry-ah8n4q0f-pooler` is `br-jolly-pine-ahybtg2e`
(13.4, 13.5), database `neondb` on each. Their `neon.timeline_id` values differ
(`4a0f9314…` vs `079068d2…`), so these are two databases, not one read twice. No
branch was created, reset or written.

The contract migration was **not** executed, not even as the self-aborting
rehearsal of §5.2: that is DDL on the branch, and this pass was read-only. Its six
guards are evaluated from the invariant readings instead:

| Guard (contract migration) | `invariants.sql` reading | 2026-08-11 | 2026-10-09, default = branch | Today |
|---|---|---|---|---|
| 1 date | `current_date` vs `2026-08-15` | 08-11 | **10-09** | **open** |
| 2 legacy rows | Gate 1, the 7 columns | 92 (+26 on the 2) | 92 (+26) | refuses |
| 3 unbacked money rows | Gate 1b `unbacked_money_rows` | 16 | **16** | **refuses — decisive** |
| 4a empty comparison domain | Gate 2 `missing_canonical_ids` | 33 of 33 | 33 of 33 | refuses |
| 5 payment projection | Gate 3 `projection_mismatches` | 1 (`KATC202541031`, `rejected` vs `not_paid`) | 1, same row | refuses |
| 6 registered exceptions intact | Gate 0 | 2 of 2 | 2 of 2 | passes |

Fingerprints match 2026-08-11 exactly: 33 applications, 21 payments, 0
`canonical_programs`, 186 `error_logs` rows; 44 migrations on the default (latest
2026-07-12) and 50 on the branch (latest 2026-08-05). **Nothing has been applied
to either database since.** Gate 1b's cohort is the same 18 / 1 / 17 / 16.

So **4 of 6 guards refuse today, down from 5 of 6, and the one that moved is the
calendar.** That is §3.3's prediction coming true: on 2026-08-15 the date guard
stopped firing while every data gate held. The contract migration is now held
back by its data guards and its location (`future/`, unreachable by the boot
sweep; `--allow-non-additive` never in the `Dockerfile` CMD), not by the date.
For the same reason, `raw/production-procedure.md` Step 3's *"today's date <
2026-08-15 → STOP"* row can no longer fire. Every other STOP row still would, on
these readings.

**This pass's stop condition was not met.** The gates do not pass on Neon, and
the 16 unbacked money rows are unchanged on both databases. The closure is
therefore recorded as *blocked and registered*, not as a contraction.

### 14.4 The operator path, for the day the gates pass

Nothing below has been done. It is the existing route, gathered in one place.

1. **Make the money decision first.** The exit criterion (§10.1, and the
   register's `applications.prelenco_payment_columns` entry) is Gate 1b of
   `invariants.sql` reading `unbacked_money_rows = 0`, reached by **backfilling or
   quarantining** the 16-row cohort into `payments`. That is a named person's
   judgement about applicant financial records on behalf of `platform-admissions`,
   not a migration to write unattended.
2. **Measure, read-only** (manifest §3 steps 1–4). Run
   `docs/v2-evidence/12.3/invariants.sql` and read `unbacked_money_rows` and
   `missing_canonical_ids` first (§13). Stop on any non-zero gate. Gate 2 needs the
   task-3.2 canonical assignment backfill before it can read anything, and Gate 0
   must still show the two registered exceptions. The file's own *HOW TO RUN*
   comment names `backend/scripts/legacy_column_invariants.sql`, which does not
   exist: use the file at its real path, as the procedure's Step 2 does.
3. **Neon first** (manifest §3 steps 5–6). Promote the migration out of `future/`,
   apply it on the rehearsal branch and then the Neon default, and re-measure.
   Production is never the first apply.
4. **Production, operator-gated: `raw/production-procedure.md`.** Step 0 requires a
   second reader of §3. **Step 1 is the backup, `./deploy/backup-db.sh`, before
   anything else**: that dump is the rollback of record, and Neon PITR does not
   cover production. Step 3 measures production with the same file and stops on
   any non-zero reading. Step 4 applies with `--allow-non-additive` under a
   `lock_timeout`. Step 5 expects **exactly 2** surviving columns. Step 6's
   rollback is restoring the Step 1 dump, never re-adding columns. Step 7 shreds
   the copied file and its output.
5. **Close out** (manifest §3 step 8): retire the 7 from `legacy_columns.py`, drop
   the `prelenco_payment_columns` register entry, update the drift-test
   exclusions, and move the migration to `backend/scripts/applied/`.
6. **If 2027-02-07 arrives first.** No guard fails on that date for these three
   entries: `test_legacy_column_contraction_12_3.py` only checks that it is later
   than 2026-08-15, and the one date-vs-today assertion in
   `test_compatibility_surfaces_12_2.py` (line 332) concerns 12.2's re-export
   shims. Reaching it with the gates still refusing needs a re-decision recorded as
   a revision (§7.2): not a silent extension, and never a drop.

### 14.5 Boundaries kept by this pass

| Boundary | What was done |
|---|---|
| Production | not contacted: no SSH, no query, no write |
| Neon | read-only, two databases, each inside a `READ ONLY` transaction. MCP unavailable, so psql. No branch created, reset or written; no `complete_database_migration`. 13.4/13.6's databases on the same branch (`v2_snap_13_4`, `v2_fresh_13_4`, `v2_batch_13_4`, `v2_snap_13_6`) were not read |
| Local database | no database-backed pytest (§14.2.1); the browser harness was not started |
| Registers and spec files | `compatibility_register.py` and every other register read, not edited. `findings.md`, `requirements.md`, `.config.kiro`, `docs/canonical-truth-map.md` and other tasks' evidence untouched. `tasks.md` edited only inside the 12.3 entry, with no checkbox changed |
| This README | appended only; §1–§13 byte-identical |
| git | nothing committed or staged by this pass. The index already held 9 staged deletions of retired admissions-AI files from earlier work; left alone |
| Scratch | the telemetry `--json` copy under `/tmp` deleted after closure-03 |
