# Task 13.6 remediation — M1 and M2

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · remediation items **M1** and
**M2** of [`docs/v2-evidence/13.6/README.md`](../../README.md) Part II §18.1
Requirements: **R15.3–R15.4** (additive expand, no rewrite, bounded locks), **R9.2**
(rollback contract), **R18.7** (rehearsed before production), **R10** (a legal input
must not produce an unhandled 500) for M1; **R2.1, R2.2, R2.5** (the request-metric
observability contract) for M2
Findings: **GATE-13.3-13** (high — the last unfixed 13.3 finding), register finding
**STU-13** (P0, code half), **GATE-13.5-01**'s surviving gate-20 WARN for M1; the two
undiagnosed failures [`../L1-L4/README.md`](../L1-L4/README.md) §4 could not attribute,
for M2

---

## THE VERDICT: M1 CLOSED · M2 CLOSED — AND M2'S CAUSE WAS ALREADY IN L1-L4, ONE SECTION AWAY

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  M1 — the intake-name ceiling                               **CLOSED**   │
  │                                                                          │
  │    `Application.intake` WAS the only mismatch. Re-checked, not assumed:  │
  │       applications.institution  255 <- institutions.name  255   agree     │
  │       applications.intake       100 <- intakes.name       255   MISMATCH  │
  │       applications.program      255 <- programs.name      255   agree     │
  │                                                                          │
  │    **PREFLIGHT GATE 20 READS PASS ON ALL THREE LINES**  (2 PASS + 1 WARN) │
  │    width probe        1 narrower / 0 wider  ->  **0 narrower / 0 wider**  │
  │    150-char write     `varchar(100)` DataError  ->  **stored, 150**       │
  │    113-char write     DataError  ->  **stored, 113**   (13.3's own input)  │
  │    256-char write     still refused — this is a varchar, not a text col   │
  │    long-value probe   still PASS, failing_writes=0, ORM `create` ok       │
  │                                                                          │
  │    13.3's `test.fail()` row is a **passing `test()`**, input UNCHANGED    │
  │    at 113 characters and assertion UNCHANGED at `< 500`. It now measures  │
  │    **HTTP 201** on desktop AND mobile. 10 passed / 0 failed.              │
  │                                                                          │
  │    apply 1 of 46 OK · 2nd run clean no-op · boot gate 0, and 0 under      │
  │    `--strict` · rollback pair applies, re-converges, and does NOT narrow  │
  │                                                                          │
  │  M2 — the two undiagnosed metrics failures                  **CLOSED**   │
  │                                                                          │
  │    Neither the test's capture nor the middleware's sampling. A SETTINGS   │
  │    MODULE WAS MUTATING `os.environ` AT IMPORT TIME:                       │
  │      config/settings/prod.py:60-61                                        │
  │        `os.environ.setdefault("REQUEST_METRIC_SAMPLE_RATE", "0.1")`       │
  │    and `MetricsMiddleware.__init__` read that variable. So *inspecting*   │
  │    prod settings re-sampled every middleware built later in the process:  │
  │      resolved rate  1.0 -> **0.1**                                        │
  │      emissions      200/200 -> **20/200** healthy fast 200s               │
  │                                                                          │
  │    L1-L4 recorded BOTH halves of this and joined neither: §1.1 "one test  │
  │    that used to skip now runs" IS the import, and §4 "cause not           │
  │    determined" IS its consequence. Same run, same document.               │
  │                                                                          │
  │    NOT an observability hole. Errors and slow requests are always logged  │
  │    at any rate — now asserted, not assumed.                               │
  │                                                                          │
  │  backend  **93** failed / **5303** passed / **102** skipped / 2 xfailed / │
  │           1 xpassed / **1** error   (was 94 / 5278 / 103 / 2 / 1 / 1)     │
  │           -1 failure · +25 passes · **0 skips added** · error unchanged   │
  │  frontend 1 failed / 4619 passed / 1 skipped over 495 files — IDENTICAL   │
  │  lint     **0 errors** (L12's close, not regressed) · type-check exit 0   │
  │                                                                          │
  │  NOT closed: M3 M4 M5 M6 M7, B1 B2 B3 — untouched, by design             │
  └──────────────────────────────────────────────────────────────────────────┘
```

| | before | after |
|---|---|---|
| preflight **gate 20** (snapshot ceilings) | 2 × PASS, **1 × WARN** on `applications.intake \| intakes.name \| 100 \| 255` | **3 × PASS** |
| `width-drift-probe.py` | **narrower=1** (`applications.intake`: model 255, column 100), wider=0, exit 1 | **narrower=0, wider=0**, exit 0 |
| the 150-character reproduction | `ERROR: value too long for type character varying(100)` | **`UPDATE 1`, stored_length 150** |
| the 113-character reproduction (13.3's own input) | same `DataError` | **`UPDATE 1`, stored_length 113** |
| 256 characters | — | **still refused** (`character varying(255)`) |
| `long-value-probe.py` (L2-L3's) | PASS, failing_writes=0 | **PASS, failing_writes=0** — unchanged, as required |
| 13.3's GATE-13.3-13 row | `test.fail()`, expected failure, create → 500 | **`test()`, passing, create → HTTP 201**, input and assertion unchanged |
| `apply_sql_migrations` on `v2_snap_13_6` | 1 of 46 pending | **1 applied, exit 0**; second run `All 46 migrations already applied. Nothing to do.` |
| `manage.py check_schema_drift` | exit 0 | **exit 0**, also under `--strict`, 78 models verified |
| `migration_history` rows | 76 | **77** |
| rollback lint violations | **26** across 9 other lanes' files | **26** across the same 9 — no 27th |
| migration-report freshness — omitted scripts | **6** | **7** (this batch's one script; §6.2) |
| `TestMetricsMiddlewareStructuredLogs::test_emits_complete_structured_log` | `AssertionError: 0 != 1 : Expected 1 metric log, got 0` | **passes** |
| `TestMetricsMiddlewareDurationPositive::test_duration_is_non_negative` | `AssertionError: 0 != 1`, falsifying `method='GET', path='/0/', status_code=200` | **passes** |
| importing `config.settings.prod` | sets `REQUEST_METRIC_SAMPLE_RATE=0.1` process-wide | **leaves `os.environ` alone** |
| backend whole tree, serial | 94 failed / 5278 passed / 103 skipped / 2 xfailed / 1 xpassed / 1 error | **93 / 5303 / 102 / 2 / 1 / 1** |
| frontend `bun run test` | 1 failed / 4619 passed / 1 skipped over 495 files | **identical** |
| `bun run lint` | 0 errors | **0 errors** |

Sources, in order:
[`raw/00-localdb-preflight.txt`](raw/00-localdb-preflight.txt) ·
[`raw/10-m2-repro-order-dependence.txt`](raw/10-m2-repro-order-dependence.txt) ·
[`raw/11-m2-mechanism.txt`](raw/11-m2-mechanism.txt) ·
[`raw/12-m2-fix-and-discrimination.txt`](raw/12-m2-fix-and-discrimination.txt) ·
[`raw/20-m1-rehearsal-target-before.txt`](raw/20-m1-rehearsal-target-before.txt) ·
[`raw/21-m1-gates-before.txt`](raw/21-m1-gates-before.txt) ·
[`raw/22-m1-apply-idempotence-bootgate.txt`](raw/22-m1-apply-idempotence-bootgate.txt) ·
[`raw/23-m1-gates-after.txt`](raw/23-m1-gates-after.txt) ·
[`raw/24-m1-long-value-probe-after.txt`](raw/24-m1-long-value-probe-after.txt) ·
[`raw/25-m1-rollback-pair.txt`](raw/25-m1-rollback-pair.txt) ·
[`raw/26-m1-rollback-lint-and-migration-suites.txt`](raw/26-m1-rollback-lint-and-migration-suites.txt) ·
[`raw/27-django-check.txt`](raw/27-django-check.txt) ·
[`raw/30-backend-whole-tree.txt`](raw/30-backend-whole-tree.txt) (643.88 s) ·
[`raw/31-whole-tree-delta.txt`](raw/31-whole-tree-delta.txt) ·
[`raw/32-new-failure-attribution.txt`](raw/32-new-failure-attribution.txt) ·
[`raw/40-frontend-gates.txt`](raw/40-frontend-gates.txt) ·
[`raw/41-evidence-dir-isolation.txt`](raw/41-evidence-dir-isolation.txt) ·
[`raw/42-spec-validator.txt`](raw/42-spec-validator.txt) ·
[`raw/50-harness-column-width.txt`](raw/50-harness-column-width.txt) ·
[`raw/51-harness-13-3-run.txt`](raw/51-harness-13-3-run.txt) ·
[`raw/60-state-left-behind.txt`](raw/60-state-left-behind.txt) ·
[`raw/61-code-hunks.txt`](raw/61-code-hunks.txt) ·
plus one instrument, [`raw/m2-sample-rate-probe.py`](raw/m2-sample-rate-probe.py), and
the harness run's own 39 artifacts under [`raw/harness/`](raw/harness/).

The backend "before" column is
[`../../raw/pass2/10-backend-whole-tree.txt`](../../raw/pass2/10-backend-whole-tree.txt);
the frontend and lint "before" columns are
[`../../raw/pass2/12-frontend-whole-suite.txt`](../../raw/pass2/12-frontend-whole-suite.txt)
and [`../../raw/pass2/11-frontend-lint-and-type-check.txt`](../../raw/pass2/11-frontend-lint-and-type-check.txt).
Every one of those is cited, not re-derived.

---

## 1. M1 — `Application.intake` was the only mismatch, and that was established rather than assumed

13.6 §18.1 asks whether `institution` and `program` need the same treatment. They do
not, and the check is worth writing down because "L2-L3 converged them on 255" is a
claim about the *model*, and the question is about the model *versus its source*:

| snapshot column | model `max_length` | source column | source width | agree? |
|---|---:|---|---:|:--:|
| `applications.institution` | 255 | `institutions.name` | 255 | yes |
| `applications.intake` | **100** | `intakes.name` | **255** | **no** |
| `applications.program` | 255 | `programs.name` | 255 | yes |

Model widths from `backend/apps/applications/models.py:89-91` and
`backend/apps/catalog/models.py:12,54,114`; column widths measured on the rehearsal
database ([`raw/20`](raw/20-m1-rehearsal-target-before.txt)) and cross-checked against
`backend/scripts/00_full_schema.sql:27,81,83,133`, which agrees on all six numbers.
One mismatch, one line, one column.

That is also exactly the shape of gate 20's output after L2: two PASS lines and one
WARN, on the intake line, for this reason and no other
([`../L2-L3/raw/11-preflight-after.txt`](../L2-L3/raw/11-preflight-after.txt) §6.1).

### 1.1 Why it had to be two changes, and why either alone is useless

* **The model alone** would leave the column at `varchar(100)`. Django does not
  validate `max_length` on `.save()`, so the value would still reach Postgres whole
  and still raise `DataError`. Nothing would change except which number looked wrong.
* **The column alone** would leave the model declaring 100 against a 255-wide column,
  which `width-drift-probe.py` reports as `WIDER` — the drift the probe exists to
  catch, in the other direction.

So M1 is `Application.intake` `max_length` 100 → 255 **and**
`backend/scripts/2026_08_15_01_widen_application_intake_snapshot.sql`. The script's own
header states this at length, because a future reader looking at either half alone will
ask why it was done that way.

### 1.2 The reproduction, at three lengths

L2-L3 measured the residual at the write layer
([`../L2-L3/raw/18-residual-intake-ceiling.txt`](../L2-L3/raw/18-residual-intake-ceiling.txt)):
a 150-character intake name is legal in `intakes.name` and fatal in
`applications.intake`. Re-run here before and after, same database, same SQL, every
write in a transaction that is unconditionally rolled back:

| write | before ([`raw/21`](raw/21-m1-gates-before.txt)) | after ([`raw/23`](raw/23-m1-gates-after.txt)) |
|---|---|---|
| 150 characters | `ERROR: value too long for type character varying(100)` | `UPDATE 1`, `stored_length 150` |
| **113 characters** — 13.3's `OVERLONG_INTAKE_NAME` | same error | `UPDATE 1`, `stored_length 113` |
| 100 characters | `UPDATE 1` (L2's widen had landed) | — |
| 255 characters — the new ceiling exactly | — | `UPDATE 1`, `stored_length 255` |
| **256 characters** — one over | — | **`ERROR: value too long for type character varying(255)`** |

The 256-character row is there on purpose. A widen that quietly became `text` would
also make the 150 pass, and would be a different change from the one claimed. The
column is still a bounded `varchar`, still refuses a value longer than its source can
hold, and the boundary is where the script says it is.

Both probes leave the database as they found it, and assert it rather than promise it:
`rows_over_100_chars = 0` and `longest_stored_intake = 19` after the run.

### 1.3 The instruments 13.6 §18.1 names, before and after

`width-drift-probe.py` is 13.5's own file, unmodified, on the rehearsal database:

| | before | after |
|---|---|---|
| models compared / bounded-length fields | 78 / 339 | 78 / 339 |
| **NARROWER than the model** | **1** — `applications.intake`: model declares 255, column is varchar(100) → DataError at 101 chars | **0** |
| **WIDER than the model** | 0 | **0** |
| columns absent / tables absent | 0 / 0 | 0 / 0 |
| verdict | **FAIL**, exit 1 | **PASS**, exit 0 |

`0 narrower AND 0 wider` is the check that matters here: it is the statement that the
model and the column agree **in both directions**, which is precisely what a widen
paired with a model change has to prove and what a widen alone cannot.

Gate 20, from `docs/v2-evidence/13.5/preflight.sql`, read-only, all three lines:

```
before  applications.institution | institutions.name | 255 | 255 |  46 | 0 | PASS
        applications.intake      | intakes.name      | 100 | 255 |  19 | 0 | WARN - latent: a legal name longer than the ceiling will 500 (GATE-13.3-13)
        applications.program     | programs.name     | 255 | 255 |  39 | 0 | PASS

after   applications.institution | institutions.name | 255 | 255 |  46 | 0 | PASS
        applications.intake      | intakes.name      | 255 | 255 |  19 | 0 | PASS
        applications.program     | programs.name     | 255 | 255 |  39 | 0 | PASS
```

**Gate 20 now reads PASS on all three lines.** Its three detail queries (the offending
catalogue rows an operator would have to shorten) return `(0 rows)` for intakes,
programs and institutions alike, before and after.

Gate 21 still reads **FAIL** (`colliding_intake_names = 3`). That is GATE-13.2-01's
*data* half — three intake names shared across the two active institutions — it belongs
to another lane, L2-L3 §2.1 says so, and nothing here renames a tenant's intake.

L2-L3's `long-value-probe.py`, re-run unmodified, still reports
**PASS — failing_writes=0**, including `Application.objects.create` ok at 61 / 53 / 59
characters ([`raw/24`](raw/24-m1-long-value-probe-after.txt)). That is the *regression*
check for this batch: the widen must not have disturbed the writes L2 fixed, and it did
not. It is not evidence for the new ceiling — its intake name is 53 characters, which
fitted before — and it is not quoted as such.

### 1.4 The rehearsal — apply, no-op, boot gate, rollback

On **`v2_snap_13_6`**, Neon branch `br-jolly-pine-ahybtg2e`, **reused** because the
project is at its branch cap (`create_branch` → 422). The database already carried L2,
L3, L7 and L9-L11's migrations at 76 ledger rows.

| step | artifact | result |
|---|---|---|
| dry run | [`raw/22`](raw/22-m1-apply-idempotence-bootgate.txt) | `Pending migrations: 1/46` — this script and nothing else |
| apply, run 1 | `raw/22` | `2026_08_15_01_widen_application_intake_snapshot.sql (sha256=b68c5261f6f5) ... OK`, exit 0 |
| apply, run 2 — idempotence | `raw/22` | `All 46 migrations already applied. Nothing to do.` on **both** `--dry-run` and the real run, exit 0 |
| boot gate | `raw/22` | `No schema drift. Verified 78 managed=False model(s).` exit **0** — and exit 0 under `--strict` |
| ledger | `raw/22` | one row written by the **runner**, checksum `b68c5261…adb8e513`; `migration_history` 76 → **77**; all three columns 255 |
| rollback pair | [`raw/25`](raw/25-m1-rollback-pair.txt) | `DELETE 1`, ledger 77 → **76**, width **deliberately still 255**, `rows_over_the_old_100_ceiling = 0` |
| re-converge | `raw/25` | next sweep re-applies it, ledger back to 77, `--strict` boot gate exit 0 |
| **L2's pair, re-run** | `raw/25` | its rollback + re-apply leaves `intake` at **255, not 100** — the guard is width-based, so the two widens compose and neither is order-dependent |

That last row is the one worth pausing on. L2's script targets `intake → 100`, so a
naive reading says re-applying it after M1 would narrow the column back. It does not:
the guard fires only `WHILE character_maximum_length < target`, and `255 < 100` is
false. Measured rather than reasoned about, because "my guard means it cannot happen"
is exactly the sentence that precedes a truncated production column.

### 1.5 R9.2 — the rollback is ledger-only, for the same reason L2's was

A widen has no safe inverse. `varchar(255) → varchar(100)` is accepted by Postgres only
when every stored value already fits in 100; if any application stored a longer intake
name after the widen — the entire point of the widen — the narrowing either fails
outright or, with `USING left(intake, 100)`, silently truncates a real applicant's
record. R9.2 exists to forbid that trade. So the forward change is one-way at the data
level, in the same way every `ADD COLUMN` is one-way once rows use it, and the rollback
undoes the one artefact that outlives the migration and *can* be undone without
touching a row: its `migration_history` row.

L2-L3 §4 is the precedent and the rollback file applies the same honesty, including the
part that is easy to leave out — **what the rollback cannot restore**. Rolling the code
back to `max_length=100` while a row already holds a 101–255 character snapshot leaves
that row readable and writable (the wide column still accepts it); what is genuinely
lost is the *guarantee* that no row exceeds 100, and re-establishing that is a data
decision, not a migration. The file says so, and names the `SELECT count(*)` an operator
would have to run first.

`backend/tests/property/test_rollback_safe_operations.py` accepts
`DELETE FROM migration_history` in any form; the file is exactly one such statement and
nothing else. **The lint still fails with 26 violations across the same 9 other lanes'
files** — `2026_07_16_03`, `2026_07_17_02`, `2026_07_18_01`, `2026_07_20_01` (3),
`2026_07_21_01` (6), `2026_07_22_01` (6), `2026_07_25_01`, `2026_07_26_01` (6),
`2026_07_26_02` — counted from the output rather than carried forward
([`raw/26`](raw/26-m1-rollback-lint-and-migration-suites.txt): `TOTAL violations: 26`,
`files: 9`). **Not one was fixed and not one was added**; `2026_08_15` appears **0**
times in the lint output. `test_rollback_pairing.py` passes.

### 1.6 13.3's row is now a passing `test()`, with its input and its assertion untouched

`apps/admissions/tests/harness-e2e/required/long-content-tenant-strings.spec.ts`:

| | before | after |
|---|---|---|
| annotation | `test.fail(` | **`test(`** |
| title | `GATE-13.3-13: an application can be created for a legally-named long intake (expected failure)` | `GATE-13.3-13 (closed): an application can be created for a legally-named long intake` |
| `OVERLONG_INTAKE_NAME` | 113 characters | **113 characters, byte-identical** |
| the assertion | `expect(status, …).toBeLessThan(500)` | **unchanged, character for character** |
| `recordRow` | `expectedToFail: true`, owner = the applications/data lane | `expectedToFail: false`, owner = closed by M1 |

Measured on both required projects, after `harness up` rebuilt the web image so the
model change was in the container ([`raw/51`](raw/51-harness-13-3-run.txt)):

```
✓ 4 [chromium-required] GATE-13.3-13 (closed): an application can be created for a legally-named long intake (1.7s)
✓ 9 [mobile-required]   GATE-13.3-13 (closed): an application can be created for a legally-named long intake (1.7s)
10 passed (8.4m)
```

and the row's own recording, from this run's `measurements-*.jsonl`:

```json
{ "finding": "GATE-13.3-13", "intakeNameLength": 113,
  "catalogueAcceptedTheName": true, "applicationCreateStatus": 201,
  "applicationCreateBody": "{\"success\":true,\"data\":{\"id\":\"dcfd2176…\",\"application_number\":\"MIHAS202600003\"…" }
```

**HTTP 201, at 113 characters, on desktop and on mobile.** That is the point of the
annotation, spelled the way 13.2 §3.6 intended: the row fails *because it passed*, and
the day it passes is the day the widths genuinely agree. Nothing was shortened, no
assertion was weakened, and no allow-list was touched.

The `gate.allowRequest('/api/v1/applications/')` line was **kept** rather than removed
now that the create succeeds, and the reason is in the code: `allowRequest` declares
that a path *may* fail, it does not assert that it does, and the row's own assertion is
what proves the status. Removing it would only mean that a regression surfaced as a
harness-gate failure instead of as this row's own counter-example.

### 1.7 A correction: the harness does not build from `00_full_schema.sql`

13.3's comment and L5-L6 §7's table both say the harness builds from
`00_full_schema.sql`. It does not. `harness_bootstrap` creates every `managed = False`
table **from the current models** via `schema_editor` — its own docstring says so under
*"Why not `apply_sql_migrations`?"* — and mirrors `backend/tests/conftest.py`'s
`unmanaged_schema`.

The observed width was 100 either way, so no earlier measurement is wrong. It matters
here for one reason: **it is the model change, not the SQL script, that moves this row in
the harness**, while it is the SQL script that moves the production lineage. Measured
after `harness up` ([`raw/50`](raw/50-harness-column-width.txt)): all six columns 255.

`00_full_schema.sql` still declares `"intake" varchar(100)`. It was **not** edited. It
is a generated documentation snapshot, excluded from the sweep by name
(`apply_sql_migrations.py:120`, `check_schema_drift.py:300`), and its regeneration is
deliberately guarded (`schema_manifest.py:378-394`) and belongs to task 3.1. Recorded in
§9 as a residual rather than quietly fixed — the two are not the same, and a snapshot
edited by hand is worse than a snapshot known to be stale.

---

## 2. M1 — what this closes

**GATE-13.3-13 is closed.** Both halves: the production-lineage widen (L2's, `varchar(50)`
→ the model's widths) and the model-versus-source ceiling (M1's, `100` → `255` in the
model and in the column). Its own 113-character reproduction returns 201. Its `test.fail()`
row is a passing `test()`. Gate 20 reads PASS on all three lines. 13.6 §18.1's M1 row
calls it *"the last of 13.3's 16"*; that count is 13.6's, carried not re-derived, and on
it this is the sixteenth.

**Register finding STU-13 (P0) — the code half is closed.** `findings.md:323` currently
reads *"partly cleared … Needs a model change plus a matching widen — and the widen is
rehearsed on `v2_snap_13_6`, not applied to production"*. The first clause is now
satisfied. **The second is not, and M1 does not change it**: this is a rehearsal on a
restored copy of the production lineage, exactly as R18.7 asks, and applying it to
production is operator step **O3b** — which now has a fourth migration in its window.

`findings.md` was **not edited** (§8.4). The closure pass records state; this document
reports it.

---

## 3. M2 — the cause was a settings module writing to `os.environ`

### 3.1 Reproduced first, in the smallest run that shows it

L1-L4 §4 recorded the two failures with *"cause not determined. No L1/L4 code is in
either traceback"* and *"neither file appears in 13.6's failure output"*. Both
observations are correct. Both are also the fingerprint of an **order-dependent**
failure, so the first thing measured here was order
([`raw/10`](raw/10-m2-repro-order-dependence.txt)):

```
$ pytest tests/property/test_production_readiness_metrics.py
5 passed in 2.15s

$ pytest tests/property/test_production_cors_pagination_fix_exploration.py \
         tests/property/test_production_readiness_metrics.py
2 failed, 5 passed in 1.67s
      AssertionError: 0 != 1 : Expected 1 metric log, got 0
      Falsifying example: method='GET', path='/0/', status_code=200
```

Alone: green. Preceded by one file that sorts before it alphabetically — which is
whole-tree order: the two failures, **including the same falsifying example L1-L4
recorded**, `method='GET', path='/0/', status_code=200`.

### 3.2 The mechanism, measured

Two lines, in two files, neither of which is a test (line numbers are the **working
tree** as this batch found it; at `bae29a28d` the prod.py pair is `:64-65`, because tasks
8.2 and 12.4 deleted flag assignments above it):

```
backend/config/settings/prod.py:60-61
    import os as _os
    _os.environ.setdefault("REQUEST_METRIC_SAMPLE_RATE", "0.1")

backend/apps/common/middleware.py:157   (MetricsMiddleware.__init__)
    self._sample_rate = float(os.environ.get("REQUEST_METRIC_SAMPLE_RATE", "1.0"))
```

`tests/property/test_production_cors_pagination_fix_exploration.py:78` does
`from config.settings.prod import AUTH_COOKIE_SAMESITE` to inspect one cookie flag,
behind a `try/except → pytest.skip` guard. That import is **inspection, not
activation** — no Django setup, no settings swap — and it still executes prod.py's
module body, which writes to the process environment. Every `MetricsMiddleware`
constructed afterwards in that process then samples at 10 %.

[`raw/m2-sample-rate-probe.py`](raw/m2-sample-rate-probe.py) measures it rather than
arguing it ([`raw/11`](raw/11-m2-mechanism.txt), both states in one artifact):

| | with the `setdefault` (before) | with the setting (after) |
|---|---|---|
| `os.environ` before any prod import | `<unset>` | `<unset>` |
| resolved rate before | 1.0 | 1.0 |
| emissions before, healthy fast 200s | **200/200** | **200/200** |
| `os.environ` **after** `import config.settings.prod` | **`0.1`** | **`<unset>`** |
| resolved rate after | **0.1** | **1.0** |
| emissions after | **20/200** | **200/200** |
| verdict | **POLLUTION**, exit 2 | **NO POLLUTION**, exit 0 |

At 0.1, roughly nine in ten healthy fast 200s emit no log, so a property asserting
*"exactly one log per non-health request"* fails on the first 200 the generator
produces. (An earlier run of the same probe read 26/200 rather than 20/200. It is a
dice roll — that is the whole point — and both readings are quoted rather than the
tidier one.)

### 3.3 So: test or middleware? Both halves, and neither is the sampling

**It is not the test's log capture.** The `_LogCapture` handler works; Property 3 in the
same file (health paths emit zero) passes in every ordering, because zero is zero at any
sample rate.

**It is not a defect in sampling.** The rate is a documented volume control on
*healthy, fast, sub-400* responses. Errors and slow requests are always logged. There is
**no observability hole**: `request_metric` is not silently missing for any real request
class that matters for diagnosis. This batch now asserts that rather than assuming it —
`test_error_responses_are_logged_even_at_rate_zero` and
`test_slow_requests_are_logged_even_at_rate_zero` both hold at rate `0.0`, and
`test_rate_one_tenth_emits_for_roughly_a_tenth` pins that 0.1 really means ~10 %.

**The production defect is the `os.environ` write.** A settings module is read by tests,
tooling and documentation generators. Writing to the process environment at import time
makes that reading change the behaviour of unrelated code, in an order-dependent way,
with nothing in the resulting traceback pointing at the cause. That is exactly what
happened, and it cost two lanes a section each.

**The test defect is the ambient dependence.** Properties 2 and 4 state what an emitted
metric log *contains* and that its duration is non-negative. Neither mentions sampling.
Left unpinned they inherit whatever the environment holds, so they silently measure the
sampler.

### 3.4 The fix

| file | change |
|---|---|
| `backend/config/settings/prod.py` | the `os.environ.setdefault` becomes a plain Django setting, `REQUEST_METRIC_SAMPLE_RATE = 0.1`, with the mechanism and the measurement written where the next reader will find them |
| `backend/apps/common/middleware.py` | `MetricsMiddleware.resolve_sample_rate()` (new classmethod, `:161`) resolves **env → setting → 1.0**, clamps to `[0, 1]`, and falls back rather than raising; `__init__` (`:191-196`) calls it. `DEFAULT_SAMPLE_RATE = 1.0` is named instead of repeated as a string literal |
| `backend/tests/property/test_production_readiness_metrics.py` | `_run_middleware` pins the rate the properties are stated under, and its docstring says why in full. The two property bodies, their `@given` strategies, their `max_examples` and their assertions are **untouched** |
| `backend/tests/unit/test_metrics_middleware_sampling.py` | **new**, 23 cases: precedence, behaviour at each end of the range, the always-log rules, and the class-level guard |

**The env var keeps precedence, deliberately.** Under `setdefault`, an explicitly set
`REQUEST_METRIC_SAMPLE_RATE` won; after the change it still does. Production behaviour
is unchanged — healthy 200s still sampled at 10 % — and that is asserted twice, once as
a source-text pin and once through `resolve_sample_rate` itself.

### 3.5 The new tests provably discriminate

With the `os.environ.setdefault` restored byte-for-byte and everything else left alone
([`raw/12`](raw/12-m2-fix-and-discrimination.txt) step 3):

```
FAILED TestSettingsModulesDoNotMutateTheEnvironment::test_no_environ_write_at_import_time[prod.py]
        a settings module writes to os.environ at import time … prod.py:76
FAILED TestSettingsModulesDoNotMutateTheEnvironment::test_prod_still_declares_the_sample_rate_as_a_setting
FAILED TestSettingsModulesDoNotMutateTheEnvironment::test_importing_prod_settings_leaves_the_sample_rate_alone
        importing config.settings.prod changed REQUEST_METRIC_SAMPLE_RATE in os.environ (None -> '0.1')
3 failed, 27 passed
```

Restored: `30 passed`. Three independent spellings of one rule — an AST walk over all
five settings modules, a source-text pin on the production intent, and an end-to-end
import — so removing the mutation and removing the *intent* are different failures.

The AST guard is deliberately **the class, not the instance**: it fails for any
`os.environ[...] = `, `.setdefault`, `.update`, `.pop` or `.clear` in `base.py`,
`dev.py`, `test.py`, `staging.py` or `prod.py`. Today only `prod.py` had one. This is
the test that would have caught M2 on the day it was introduced.

And note what step 3 *also* shows: the two metrics properties **pass in both states**,
because the pin in `_run_middleware` is independent of the settings fix. Two layers, so
the properties cannot be re-broken by a future module that writes the same variable.

---

## 4. Verification

### 4.1 Backend whole tree, serial

[`raw/30`](raw/30-backend-whole-tree.txt) — same invocation as 13.6's own baseline
(`pytest tests/ -q -p no:cacheprovider -p no:randomly -rs`), 643.88 s:

```
93 failed, 5303 passed, 102 skipped, 2 xfailed, 1 xpassed, 1 error
```

against `94 failed, 5278 passed, 103 skipped, 2 xfailed, 1 xpassed, 1 error`.

Diffing the two artifacts' failure headers, 65 unique → 64
([`raw/31`](raw/31-whole-tree-delta.txt)):

* **only in before** — `TestMetricsMiddlewareStructuredLogs.test_emits_complete_structured_log`,
  `TestMetricsMiddlewareDurationPositive.test_duration_is_non_negative`. M2's two, and
  only those.
* **only in after** — `test_api_quality_script_passes_against_baseline`. One, and it is
  attributed in §4.2 rather than netted away.
* **skip reasons only in after** — *nothing*. **No skip was added.**

The arithmetic closes exactly:

```
passes  5278 + 23 (the new unit file) + 2 (M2's two) = 5303   measured 5303
fails   94 - 2 (M2's two) + 1 (§4.2)               = 93     measured 93
skips   103 - 1 (§4.2's, the same test)            = 102    measured 102
errors  1 -> 1   xfailed 2 -> 2   xpassed 1 -> 1
```

The single `error` is unchanged: `property/test_ip_address_column.py`'s setup error,
13.1 cluster E, untouched.

### 4.2 The one new failure, attributed two ways

`tests/unit/test_api_quality_script.py::test_api_quality_script_passes_against_baseline`
is the **same test** whose skip stopped firing — so the −1 skip and the +1 failure are
one event, not two.

**Why it ran here.** `_find_venv_python()` resolves `shutil.which("python") or
which("python3")`, then probes `import django, drf_spectacular` with that interpreter
and skips if it fails. This batch ran pytest with the venv **activated**, so PATH's
`python` is `backend/.venv/bin/python`, which has both. 13.6's baseline invoked
`.venv/bin/python -m pytest` without activation, so PATH's `python3` was
`/usr/bin/python3`, which has neither. Measured
([`raw/32`](raw/32-new-failure-attribution.txt)):

```
activated       : which(python) = backend/.venv/bin/python
not activated   : which(python) = None ; which(python3) = /usr/bin/python3
                  system python3 has django+drf_spectacular: False
same single test, run the baseline way:
    SKIPPED [1] tests/unit/test_api_quality_script.py:44: Python at /usr/bin/python3 lacks backend deps
    3 passed, 1 skipped
```

This is the same class L1-L4 §1.1 recorded in the other direction — an
environment-conditional guard resolving the other way — and it is exactly why L1-L4
wrote that section rather than letting `104 → 103` pass unexplained.

**What it reports, and whether this batch moved it.** When it does run, it fails on the
drf-spectacular **lint count against the committed baseline**. `api_quality.sh` was then
run directly, with and without this batch's three backend edits:

| | with this batch's edits | with them reverted |
|---|---|---|
| drf-spectacular errors | 26 | **26** |
| drf-spectacular warnings | 0 | **0** |
| Linter issues (baseline 883) | 1097, delta 214 | **1097, delta 214** |
| Linter errors | 1 | **1** |
| **Breaking changes** | **0** | **0** |
| exit | 1 | 1 |

Identical. The 214 belong to the accumulated V2 tree's API surface — the same
population as the pre-existing drf-spectacular cluster L1-L4 §5 item 4 attributed
elsewhere and 13.6 §18.1 assigned to **M3**. Nothing in this batch adds an endpoint, a
serializer or a schema annotation. The one schema-visible consequence of M1 is
`maxLength: 100 → 255` on the `intake` field, and the breaking-change detector reports
**0 breaking changes** either way. The three reverted files were restored and verified
byte-identical; `git stash list` is empty and the index still carries only the 9
pre-existing staged deletions.

**Not fixed, and not this batch's to fix.**

### 4.3 Frontend

| gate | result |
|---|---|
| `bun run test` | **1 failed / 4619 passed / 1 skipped over 495 files** ([`raw/40`](raw/40-frontend-gates.txt)) — the baseline exactly, file count included |
| — the one failure | `tests/unit/authPageFormMarkup.test.tsx > uses honest helper copy instead of fake email availability states` — pre-existing, not touched, M3's |
| `bun run lint` | **exit 0** (`eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0`, so a *warning* fails it too). L12's close, **not regressed** |
| `bun run type-check` | **exit 0**, no output |

The only frontend file this batch touched is 13.3's spec, and it is inside `eslint .`'s
scope and inside `tsconfig.build.json`'s, so both gates cover it.

### 4.4 Harness

`HARNESS_PW_CHANNEL=chrome` (bundled Chromium is unsupported on `ubuntu26.04-x64`),
`harness/bin/harness up` first — which rebuilds the web image, so the model change is
in the container — the 13.3 long-content spec on both required projects, then
`harness/bin/harness down`. **10 passed, 0 failed, 0 skipped**
([`raw/51`](raw/51-harness-13-3-run.txt)).

`--timeout=180000` was passed **on the command line for this run only**. 13.6 §18.1
item **M5** records that the base profile's timeout is too low on this box and that
raising it turns 7 failures into 12 passes; M5 is not this batch's, so
`playwright.harness.config.ts` was **not** edited. Two of the five rows in this file take
2.8–2.9 minutes each, so without the flag they would time out for a reason that has
nothing to do with M1.

**Evidence isolation, confirmed rather than assumed.** `V2_EVIDENCE_DIR` pointed at this
batch's own `raw/harness/` (L8 made that the mechanism). Every directory this batch must
not write was fingerprinted before and after
([`raw/41`](raw/41-evidence-dir-isolation.txt)):

| directory | files | listing md5 before | after |
|---|---:|---|---|
| `0.4/` | 5 | `4b1ec0b1e6126a8db7ea1ddd903dde8e` | **identical** |
| `2.2/` | 3 | `5c97bc8ba31065b7aa45c6d7745b3a6b` | **identical** |
| `11.1/` | 23 | `9f0ff7f71a836a2559606fd955cfdee3` | **identical** |
| `11.2/` | 38 | `6def58cc9fced2efa87376c4ffe81fad` | **identical** |
| `11.3/` | 26 | `156442bf88476248a4f7a1391c4b7a94` | **identical** |
| `11.4/` | 26 | `4a84fcfcb036c78b3b2ac5755d042ddf` | **identical** |
| `11.5/` | 35 | `4abb2096291733b5c6a01d2b6ca47b37` | **identical** |
| `13.3/` | 296 | `bc5075043dec9c0c4c425396f4a9a962` | **identical** |
| `13.4/` | 27 | `c968f3f4301070a95b8c560f2eb8bd7a` | **identical** |
| `13.5/` | 10 | `945d96d832c4aad93d04fc525eac9257` | **identical** |
| `3.6/` | 12 | `aa3d6d4859da40f68a0f4937fca73985` | **identical** |
| `13.5/sign-off.md` | — | `dae18daf72850f995d1a7bd3a532cec8` | **identical** |

The fingerprint is over path + size + mtime, so a rewrite with identical bytes would
still show. A `find docs -type f -mmin -180` outside this batch's directory returns
**nothing** — including 13.6's own README and the six earlier remediation batches.

### 4.5 `manage.py check` and the spec validator

[`raw/27`](raw/27-django-check.txt), with the real `backend/.env`, `TESTING` **not**
exported and `REDIS_URL` **not** substituted (both recorded as a guard, since either
produces a spurious `django_ratelimit.E003`):

```
System check identified no issues (1 silenced).
manage.py check exit=0
```

The two warnings it emits (`SECRET_KEY not set`, `LENCO_API_SECRET_KEY is not set`) are
byte-identical to L2-L3's own recording of the same command
([`../L2-L3/raw/17-django-check.txt`](../L2-L3/raw/17-django-check.txt)) — that is the
comparison that matters, not their absence.

[`raw/42`](raw/42-spec-validator.txt):

```
Errors: 0  Warnings: 0
[admissions-v2-canonical-rebuild] status=planned reqs=18 findings=71 tasks=73 (checked=71)
RESULT: PASS                       exit 0
Ran 20 tests … OK                  20/20, cases OK: 20
```

Both unchanged from 13.6 `raw/pass2/01` and `02`.

### 4.6 Local databases

Postgres `mihas_localtest` on `127.0.0.1:5433`, Redis on `127.0.0.1:6380`, via the
isolated `backend/.env.local.test` stack (`backend/.localtest-host-env.sh`), so the Neon
DSN cannot leak into a test run. `test_%` verified **empty before** the batch
([`raw/00`](raw/00-localdb-preflight.txt)) and **empty after** — the whole-tree run
leaves a `test_mihas_localtest` behind, which is the mechanism behind the spurious
`psycopg2.errors.DuplicateDatabase` on a concurrent second run and the reason every
backend run here was serial; it was dropped
([`raw/60`](raw/60-state-left-behind.txt)). Containers left **running**; `down -v` was
never used on them.

---

## 5. Measurements this batch takes that no earlier batch could

Two, both recorded because they are the kind of thing that gets lost:

1. **`0 narrower AND 0 wider`, at a width the model did not previously declare.** L2's
   probe run reported the same pair, but only because both sides said 100. Here the pair
   holds at 255 on both sides, which is the first time the snapshot column and its
   *source* have agreed. A future narrowing of either now fails the probe from whichever
   side moved.
2. **The two widens compose.** L2's script and M1's script target the same column at
   different widths, and re-running the older one after the newer is a no-op rather than
   a narrowing (§1.4). That is a property of the guard style both scripts use, and it is
   now measured on a real database rather than trusted.

---

## 6. Two residuals this batch measured and does not close

### 6.1 The migration-report freshness count moved 6 → 7

[`raw/26`](raw/26-m1-rollback-lint-and-migration-suites.txt):

```
release report omits June 2026+ scripts: [
  '2026_06_08_00_canonical_programs_id_default.sql',
  '2026_08_06_01_admin_saved_filters.sql',
  '2026_08_09_01_application_tracking_secret.sql',
  '2026_08_12_01_tenant_new_table_fk_validate.sql',
  '2026_08_13_01_widen_application_snapshot_columns.sql',
  '2026_08_14_01_neutral_platform_communication_templates.sql',
  '2026_08_15_01_widen_application_intake_snapshot.sql']     <- this batch
```

**Yes: this batch moved that count, by exactly its own one script**, 6 → 7. The
regeneration was **not** run, for the reason L2-L3 §6.2 gave and 13.6 §18.1 confirmed:
`manage.py migration_history_report --emit` writes
`docs/v2-evidence/3.6/migration-history.release.json` / `.md` / `README.md`, which is
another task's evidence directory and is **item M4**. Regenerating it here would also
silently absorb the six omissions that belong to other lanes, muddying which lane owes
what. `backend/scripts/MIGRATION_HISTORY.md` was not edited either — it is the retired
hand-maintained mirror (`migration_history_report.py:4`).

### 6.2 `00_full_schema.sql` still says `varchar(100)`

§1.7. It is a generated documentation snapshot, never applied by the sweep, and its
regeneration is deliberately guarded and owned by task 3.1. It has no runtime effect —
the harness builds from the models and production builds from the additive scripts —
but it is now one number out of date with the model, and the next regeneration should
pick it up. Recorded, not hand-edited.

---

## 7. What is NOT claimed

1. **Production was not contacted in any way** — no SSH, no `.pem` read, no query, no
   write, no deploy, no restart, no migration. Everything here happened on a Neon
   rehearsal database, the local test stack, and the local harness.
2. **`v2_snap_13_4`, `v2_fresh_13_4` and `v2_batch_13_4` were not touched.** No session
   was opened on any of them. `v2_snap_13_4` is still the only reproduction of
   GATE-13.4-02's original state.
3. **The Neon default branch was never written**, and was not read. All work is on
   `br-jolly-pine-ahybtg2e`, database `v2_snap_13_6`; the branch was **reused**, not
   created (the project is at its branch cap). Every measurement session pins
   `SET default_transaction_read_only = on`; every probe write is inside a transaction
   that is unconditionally rolled back. The only read-write statements are the runner's
   own apply, the two rollback `DELETE`s, and the runner's re-applies — all in §1.4.
4. **No already-applied script was edited.** `2026_08_13_01`'s checksum is still
   `a53d8a78e95d` in [`raw/25`](raw/25-m1-rollback-pair.txt), and no existing SQL file
   under `backend/scripts/` was opened for writing. `00_full_schema.sql` was read only.
5. **This is a rehearsal, not a production application.** R18.7 asks for the change to
   be rehearsed before it reaches production and that is what is proven: on a restored
   copy of the production lineage the documented one command brings the database forward
   and the boot gate exits 0. Applying it is operator step **O3b**, backup first.
6. **STU-13 is not fully cleared.** Its code half is (§2). Its production half is O3b's,
   and M1 adds a fourth migration to that window rather than removing the need for it.
7. **`request_metric` sampling is not claimed to be a defect, and no observability hole
   is claimed.** §3.3. Errors and slow requests are always logged, at any rate,
   and that is now asserted at rate 0.0.
8. **All 93 remaining backend failures were left as found** and no attempt was made on
   any of them: the task-9.2 perf goldens, `test_view_auth_classification.py`'s 38
   unclassified views, `test_public_endpoint_policy.py`'s unclassified `AllowAny` views,
   the 26 rollback-lint violations, drf-spectacular (the property test's `116 != 0`
   errors / `3 != 0` warnings), the 6 `EXPECTED_TABLES` drift rows, the `ERROR_CODES`
   catalogue gap, the capability-endpoint 404s, `authPageFormMarkup.test.tsx` on the
   frontend, and `property/test_ip_address_column.py`'s setup error. Those are **M3**.
   `test_api_quality_script_passes_against_baseline` is among the 93 and is attributed,
   not fixed, in §4.2 — its own figures (26 spectacular errors / 0 warnings / 1097 lint
   issues) come from `api_quality.sh` under its own constructed environment and are a
   **different instrument** from the property test's 116/3; no equivalence between the
   two counts is claimed here.
9. **Gate 21 is still FAIL** and GATE-13.2-01's data half is untouched. §1.3.
10. **`check_schema_drift`'s type-compatibility blind spot is not fixed.** M1 removes
    the last instance on this lineage; the gate's docstring still excludes the class,
    and `width-drift-probe.py` is still the only instrument that measures it. L2-L3 §3.2
    made the same statement and it is still true.
11. **The harness base profile's timeout was not raised.** §4.4. M5 owns it; the value
    was passed per-run.
12. **`docs/v2-evidence/3.6/` was not regenerated** and `findings.md`, `tasks.md`,
    `.config.kiro`, `docs/canonical-truth-map.md` and `13.5/sign-off.md` were not
    touched. §6.1, §8.4.
13. **No number was carried forward without a citation.** The backend, frontend, lint
    and validator baselines are 13.6 `raw/pass2/`'s own artifacts; the 26 rollback-lint
    violations were **re-counted** from this batch's output, not quoted; L2-L3's
    long-value probe was **re-run**, not cited.
14. **`git diff --stat` line counts are not this batch's line counts.** The whole V2
    body of work is uncommitted, so a per-file diff against `bae29a28d` mixes this
    batch's hunks with earlier tasks'. [`raw/61`](raw/61-code-hunks.txt) shows this
    concretely — `models.py` also carries task 5.2's snapshot columns and task 8.x's
    tracking columns, `prod.py` carries task 8.2's and 12.4's flag deletions, and
    `test_production_readiness_metrics.py` carries task 8.2's `_transition` change — so
    §8.1 attributes files and quotes **line numbers** instead.
15. **Nothing was committed or staged.** The 9 staged deletions in the index are the
    de-AI work's, pre-existing, and were not touched. `git stash list` is empty.

---

## 8. State left behind

### 8.1 Changed files — 8, of which 4 are new

Production code (3):

| file | change |
|---|---|
| `backend/apps/applications/models.py` | **one line**: `intake = models.CharField(max_length=100 → 255, db_index=True)` at `:90`, plus a 13-line comment block at `:76-88` naming both halves and forbidding a re-narrowing. Nothing else in the file was touched |
| `backend/config/settings/prod.py` | the `os.environ.setdefault` at `:60-61` becomes `REQUEST_METRIC_SAMPLE_RATE = 0.1` at `:75`, with the mechanism and the measurement above it |
| `backend/apps/common/middleware.py` | `MetricsMiddleware` only: docstring `:129-151`, `DEFAULT_SAMPLE_RATE` `:158`, `resolve_sample_rate()` `:160-189`, `__init__` `:191-196`. No other middleware in the file changed |

SQL scripts (2, both new and untracked):

| file | role |
|---|---|
| `backend/scripts/2026_08_15_01_widen_application_intake_snapshot.sql` | **M1.** One guarded widen + one `COMMENT ON COLUMN`. `sha256=b68c5261f6f5`. Guard is width-based, so it composes with L2's script in either order |
| `backend/scripts/2026_08_15_01_widen_application_intake_snapshot_rollback.sql` | ledger-only, with the narrowing that must never be written, the `SELECT count(*)` an operator would need first, and the one thing the rollback cannot restore |

Tests (2, one new):

| file | change |
|---|---|
| `backend/tests/unit/test_metrics_middleware_sampling.py` | **new, untracked** — 23 cases: precedence, behaviour, the always-log rules, and the AST guard over all five settings modules. Proven to discriminate (§3.5) |
| `backend/tests/property/test_production_readiness_metrics.py` | `patch` added to the import at `:15`; `_run_middleware`'s docstring at `:82-110` and its two-line rate pin at `:112-113`. **No property body, strategy, `max_examples` or assertion changed** |

Frontend (1, untracked because 13.3's whole harness tree is):

| file | change |
|---|---|
| `apps/admissions/tests/harness-e2e/required/long-content-tenant-strings.spec.ts` | `test.fail(` → `test(` at `:724`; the title gains `(closed)`; the `## Converted by task 13.6 remediation M1` docstring section; `recordRow`'s `expectedToFail` and `owner`; `OVERLONG_INTAKE_NAME`'s comment corrected from "120 characters" to 113. **The string itself, the assertion, and every other row in the file are unchanged** |

Evidence (this directory): this README plus **22** numbered raw artifacts, one reusable
instrument (`raw/m2-sample-rate-probe.py`), and the harness run's own 39 artifacts under
`raw/harness/` (its `playwright-report.json`, 4 measurement/restore files, and 34
screenshots).

`git status --porcelain` for exactly this batch's code files
([`raw/60`](raw/60-state-left-behind.txt)):

```
 M backend/apps/applications/models.py
 M backend/apps/common/middleware.py
 M backend/config/settings/prod.py
 M backend/tests/property/test_production_readiness_metrics.py
?? backend/scripts/2026_08_15_01_widen_application_intake_snapshot.sql
?? backend/scripts/2026_08_15_01_widen_application_intake_snapshot_rollback.sql
?? backend/tests/unit/test_metrics_middleware_sampling.py
?? apps/admissions/tests/harness-e2e/required/long-content-tenant-strings.spec.ts
```

No settings beyond the one constant, no serializer, no view, no URL, no CI workflow, no
dependency. Everything else dirty under `backend/scripts/` was already dirty before this
batch and was not touched.

### 8.2 Database state

| database | state left |
|---|---|
| `v2_snap_13_6` (Neon `br-jolly-pine-ahybtg2e`) | **46 of 46 recorded, 77 `migration_history` rows, all three snapshot columns `varchar(255)`, boot gate 0 under `--strict`.** Left in place deliberately: it is the rehearsal record gate 20 and gate 22 now pass on, and it is what O3b's window is rehearsing |
| `v2_snap_13_4`, `v2_fresh_13_4`, `v2_batch_13_4` | **untouched** — no session opened |
| Neon default branch | **never written, never read** |
| local `mihas_localtest` (5433) + Redis (6380) | **running**; `test_%` verified empty before and after |
| harness stack | `harness down` run; containers gone, volumes wiped by design. 0 remaining |
| production | **never contacted** |

### 8.3 Git

**Nothing committed. Nothing staged by this batch.** Branch `main` at `bae29a28d` with
the V2 tree dirty. The index still carries the **9 pre-existing staged deletions** from
the de-AI work (tasks 7.4 / 12.4), staged before this batch and untouched. `git stash
list` is empty — the one `git stash` used during §4.2's attribution was popped and the
three files verified byte-identical afterwards, then the technique was replaced with
plain file copies for the remaining experiments.

### 8.4 Untouched

| item | state |
|---|---|
| `.kiro/specs/admissions-v2-canonical-rebuild/tasks.md` | **unchanged** — no checkbox moved |
| `.../findings.md` | **unchanged.** GATE-13.3-13's and STU-13's state changes are reported in §2 for the closure pass to record |
| `.../.config.kiro` | **unchanged** |
| `docs/canonical-truth-map.md` | **unchanged.** M1 widens a column the map already designates a *display snapshot*; widening does not promote it and introduces no new domain concept. M2 adds a settings constant, not a domain concept |
| `docs/v2-evidence/13.5/sign-off.md` | **unchanged**, `md5 dae18daf72850f995d1a7bd3a532cec8`. Not opened for writing |
| `docs/v2-evidence/13.6/README.md` | **unchanged** — §18.1's M1/M2 rows are not ticked off here |
| `docs/v2-evidence/3.6/**` | **read, never written** — §6.1 |
| other tasks' and other batches' `docs/v2-evidence/**` | **read, never written.** Fingerprinted before and after, §4.4 |
| `backend/scripts/00_full_schema.sql`, `MIGRATION_HISTORY.md`, every existing SQL script | **read, never written** |
| `playwright.harness.config.ts`, `harness/**` | **unchanged** — §4.4 |
| `docs/runbooks/feature-flags-2026-05-17.md:71` | **unchanged, and still accurate**: it documents `REQUEST_METRIC_SAMPLE_RATE` as an env var, and the env var still wins |
| secrets | no DSN, password, token or key appears in this directory. The Neon connection string is assembled in-process by L2-L3's `raw/dsn.sh` from the gitignored `backend/.env` and is never printed |

---

## 9. For the next closure pass

**Closed outright:**

| item | why |
|---|---|
| **M1** — the intake-name ceiling | §1–§2. **Gate 20 reads PASS on all three lines.** Width probe 0 narrower / 0 wider. The 150-character reproduction stores 150 and the 256-character one is still refused. 13.3's `test.fail()` row is a passing `test()` at HTTP 201 with its 113-character input and its assertion unchanged, on desktop and mobile. Idempotent, boot gate 0 under `--strict`, rollback pair applies and re-converges |
| **GATE-13.3-13** (high) | the last of 13.3's 16 |
| **M2** — the two undiagnosed metrics failures | §3. Cause found, in production code, and fixed in production code plus the test that inherited it. 23 new cases, proven to discriminate. −2 failures |
| **register finding STU-13 (P0) — code half** | §2. The production half is O3b's and is not claimed |

**Reported for the closure pass to record, since `findings.md` is not this batch's to
edit:**

* `findings.md:273` — GATE-13.3-13 reads *"open — one half fixed"*. Both halves are now
  fixed and its own reproduction passes.
* `findings.md:323` — STU-13 reads *"partly cleared … Needs a model change plus a
  matching widen"*. The model change and the widen both shipped and are rehearsed. The
  clause that still holds is *"rehearsed on `v2_snap_13_6`, not applied to production"*.
* A **new defect class worth registering**, in the same slot L2-L3's second layer went
  into: **a settings module that writes to `os.environ` at import time makes reading it
  change unrelated runtime behaviour.** It is a class, not an instance — any future
  module-level `os.environ` write in `config/settings/` would do the same to something
  else — and it is now guarded by an AST walk over all five settings modules rather than
  by a comment.

**Handed forward, not finished:**

1. **Regenerate `docs/v2-evidence/3.6/migration-history.release.json`** — **item M4**.
   The count is now **7** omitted scripts; one is this batch's, and §6.1 attributes it.
   While regenerating, `00_full_schema.sql`'s `"intake" varchar(100)` (§6.2) is one
   number out of date with the model and should move with it, through
   `schema_manifest --regenerate`'s own guarded path, never by hand.
2. **O3b now has a fourth migration.** L2, L3, L7 and M1 are all rehearsed on
   `v2_snap_13_6` and none has reached production. The window is unchanged in shape:
   backup, `apply_sql_migrations`, `check_schema_drift`, then 13.5's preflight to confirm
   gates 20 and 22 on the real database.
3. **`test_api_quality_script_passes_against_baseline` is a latent gate** (§4.2). It
   skips or runs depending on whether PATH's `python` carries backend deps, which means
   CI and a developer shell can disagree about whether the API-lint baseline is being
   enforced at all. Worth making unconditional — by pointing it at
   `sys.executable` rather than `shutil.which` — as part of M3, which owns the 214 it
   would then report every time.
4. **One stale comment in another batch's converted row**, noticed and not fixed:
   `long-content-tenant-strings.spec.ts:542` still calls GATE-13.3-14 *"the
   `test.fail()`-annotated row at the end of this file"*, but L5-L6 converted that row to
   a passing `test()`. It is prose in a docstring with no behavioural effect. The 13.3
   row's own historical paragraph (`:677`) **was** flipped to past tense here, matching
   the convention L5-L6 used at `:852`, because that one is inside the row M1 converted.

**Not touched, and not claimed:** **M3** (the 93 remaining backend failures by cluster),
**M4** (3.6's report), **M5** (the harness timeout), **M6** (`requirements.md`'s
`_Findings:` lines and the validator's grammar), **M7** (the two undated allow-lists),
**B1** (13.5 never executed — operator), **B2** (`sign-off.md` unsigned), **B3**
(GATE-13.5-05, the hostname question).

---

One generalisation, since it is the second time in this remediation that it has cost a
lane a section. **L1-L4 recorded both halves of M2 and joined neither.** §1.1 identified
the skip that stopped firing, named the file and the line, and correctly concluded it
was not a regression. §4 recorded the two failures it caused and correctly concluded no
L1 or L4 code was involved. Both sections are right, they are four pages apart in one
document, and the cause is the sentence you get by putting them next to each other. The
instrument that closed it does exactly that and nothing cleverer: run the file alone,
run it after the file that sorts before it, and compare. Ordering is the first thing to
measure when a failure appears with nothing in its traceback — and a test that skips
conditionally is a change in the population being measured, which is why L1-L4 was right
to write §1.1 down even though it looked like a footnote.
