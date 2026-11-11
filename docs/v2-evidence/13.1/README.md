# Task 13.1 — Run the complete functional and quality gate

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · Phase 13, first bullet
Requirements: **R17, R18.1-R18.4**
Findings: **GOV-04, GOV-05**
Required_Evidence: **a signed candidate manifest with raw command outputs/artifacts**

---

## The Required_Evidence claim

[`manifest.json`](manifest.json) — the signed candidate manifest: the candidate
commit, the schema hash, every command, its exit code and its artifact path,
following [`docs/v2-evidence/0.5/manifest.json`](../0.5/manifest.json)'s shape so
the before/after comparison is mechanical.

**The gate is not clean, and the manifest says so on its first line.** That is
the deliverable. A manifest reporting a clean sweep would be false, and the
useful thing here is a complete, attributed inventory of what does not pass:

| Gate | Result |
|---|---|
| backend, **whole tree**, serial, real Postgres | 5419 collected · **5133 passed · 106 failed · 73 errored** · 104 skipped · 524 s |
| backend, the 52-file selection 12.1-12.5 measured | **33 failed / 809 passed / 0 errored** — reproduces 12.5 exactly |
| frontend `bun run test` | 1 failed / **4607 passed** / 1 skipped, 494 files — byte-identical to 12.5 |
| frontend `bun run lint` | **15 errors, the same 13 files** — unchanged since 12.1 |
| frontend `bun run type-check` (the repo's gate) | **exit 0** |
| frontend `bun run build` | **exit 0**, 229 dist files, CSP gate passes |
| generated OpenAPI client | regenerated **byte-identical**, compiles clean under `--strict` |
| OpenAPI schema vs the committed contract | **byte-identical against Postgres** (`35fe05d4…`, 22,135 lines) |
| migration-from-empty | **41 scripts, exit 0** on an empty Postgres 16.14 |
| schema diff, 3 manifests | **DRIFT** — all three fingerprints differ (3.1's headline, current numbers) |
| query budgets, 14 files | 377 passed / 5 failed (all 5 known) |
| harness required profile, run 1 | **218 passed / 2 failed / 0 did not run** (220, 15.3 min) |
| harness required profile, run 2 | **216 passed / 3 failed / 1 did not run** (220, 19.5 min) |
| `gatecheck-negative` | **4 failed, as required** — all four gates fire |
| drain | `broker_queue_depth: 0`, `unsettled_payment_collections: 0` |
| jobs-ops type-check / lint / vite build | exit 0 / exit 0 / exit 0 |
| register re-audit (12.5's instrument) | 13 categories · 838 hits · **0 unregistered** · 7 registers · 60 entries |

Seven items are **new** findings this gate produced (§7), five of which only a
complete run could find. Fourteen are **carried forward** with their owning lane
(§8). Nothing was fixed.

---

## What this task establishes

1. **The whole backend tree had never been run, and running it found 146
   non-passing tests nobody had catalogued** (§2). Every task from 12.1 to 12.5
   measured a 52-file selection. That selection reproduces here to the test name
   — 33 failed / 809 passed / 0 errored — so the known baseline is intact and the
   extra 146 are additional population, not regression. 179 of 179 are attributed
   to twelve cause clusters plus a fully-listed 39-item remainder.
2. **72 backend tests have not run since task 9.4, and the correct fix is already
   in the tree** (§2.2, finding GATE-13.1-02). Eight modules patch
   `apps.applications.document_views.AccessScopeService`; 9.4 removed that import
   and fixed **one** module with a `hasattr` guard, documenting why in a comment.
   The other eight error at setup. None of the eight is in the 52-file selection,
   which is why five consecutive recordings could not see it.
3. **The committed OpenAPI contract is only byte-reproducible against Postgres,
   and the repo's own generator script defaults to SQLite** (§4, finding
   GATE-13.1-03). Django derives `IntegerField` validators from
   `connection.ops.integer_field_range()`, and SQLite returns 64-bit ranges for
   every integer field. Under `config.settings.test` the schema diverges in 20
   integer-bound places. CI is safe — both workflows pin `config.settings.dev`
   against a Postgres service — but `scripts/generate-api-types.sh` writes
   *directly over the committed contract* with `DATABASE_URL` defaulted to
   `sqlite:///tmp/schema-gen.db`.
4. **Nine foreign keys are permanently `NOT VALID`, on both the from-empty schema
   and Neon** (§5, finding GATE-13.1-01). Three tables created by this spec's own
   tasks 4.4/5.1 add their FKs `NOT VALID` with a comment deferring validation,
   and no `_validate.sql` was ever written — while five sibling expand scripts do
   have one. They are new tables, so this is not a data hole; the cost is that
   `schema_manifest --verify` can never return ok on any environment.
5. **GOV-04's replacement was exercised end to end, and that is the sharpest
   difference from the 0.5 baseline** (§6, §9). 0.5 could only *enumerate* 138
   runtime-gated legacy e2e tests and record that they do not run. This gate ran
   **220** un-gated harness tests on a freshly seeded stack, twice, plus the
   negative profile and the drain check.
6. **Run 1 was the cleanest full-profile result any lane has posted, and run 2
   disagrees with it — both are recorded** (§6.1). 218/2/0 then 216/3/1 on a
   byte-identical build. The one moved test is `design-system-defluff.spec.ts:664`,
   and six measurements of it produce a complete account: **no axe violation in any
   run**, only `Test timeout of 30000ms exceeded`, and it recovers on a *freshly
   seeded* stack (17.5 s) while failing alone on a *used* one (38.3 s). That last
   data point is new — 12.4 §12.2 could only show the concurrent case — and it
   moves the cause from "other specs running" to "stack and box age".
7. **12.5's register audit reproduces unchanged, gap included** (§8.1). 838 hits
   over 13 declared categories, 0 unregistered, 7 registers, 60 entries, all
   shrink-only and all staleness-checked; four still carry no per-entry owner or
   removal date. That measurement is handed to 13.6, whose closure criterion is
   "no unregistered Legacy_Exception" — whether a *dated* owner is required is
   13.6's question, and this task's job was to hand it the number.

---

## Files

```
docs/v2-evidence/13.1/
├── README.md                              ← this index
├── manifest.json                          ← THE DELIVERABLE: signed candidate manifest
└── raw/
    ├── identity-toolchain.txt             (commit, tree counts, toolchain, lock checksums)
    ├── backend-full.txt                   (the whole tree, serial: 106 failed / 5133 passed / 73 errored)
    ├── backend-full-junit.xml             (machine-readable)
    ├── backend-full-inventory.txt         (every non-passing test, grouped by module)
    ├── backend-full-failures.json         (the same, machine-readable)
    ├── backend-attribution.txt            (179 of 179 attributed to 12 clusters + a listed remainder)
    ├── backend-new-vs-known.txt/.json     (set difference vs the 52-file selection: 33 known, 146 new)
    ├── backend-error-rootcause.txt        (GATE-13.1-02: the removed patch target, and the guard 9.4 did write)
    ├── backend-skips.txt                  (104 skips, 33 distinct reasons)
    ├── backend-selection-52.txt           (12.5's selection, copied verbatim)
    ├── backend-selection-52-run.txt       (33 failed / 809 passed / 0 errored — 12.5 reproduced)
    ├── query-budgets.txt                  (14 query-count files: 377 passed / 5 known failures)
    ├── query-budget-selection.txt, query-budget-values.txt
    ├── django-check.txt                   (no issues; no TESTING=1, no substitute REDIS_URL)
    ├── frontend-test.txt                  (1 failed / 4607 passed / 1 skipped, 494 files)
    ├── frontend-clause-coverage.txt       (which files cover contract / a11y / visual, named)
    ├── frontend-lint.txt, frontend-lint-files.txt   (15 errors, 13 files — identical set to 12.5)
    ├── frontend-typecheck.txt             (repo gate, exit 0)
    ├── frontend-typecheck-full.txt/-summary.txt  (the NON-gate: 607 pre-existing errors, 0 in src/)
    ├── frontend-build.txt, dist-files.txt (exit 0; 229 files, path set identical to 12.5)
    ├── frontend-guards.txt                (check:all PASS; validate:tailwind 127; bundle guard FAIL)
    ├── jobs-ops-gates.txt                 (type-check / lint / vite build, all exit 0)
    ├── openapi-schema.txt                 (byte-identical to the committed contract, on Postgres)
    ├── openapi-divergence-investigation.txt  (GATE-13.1-03: determinism + which fields moved)
    ├── openapi-divergence-cause.txt       (GATE-13.1-03: the Postgres/SQLite proof)
    ├── openapi-consumers.txt              (who regenerates it, and with which settings)
    ├── openapi-client-compile.txt         (regenerated byte-identical; tsc --strict exit 0)
    ├── schema-fresh-from-empty-apply.txt  (00_full_schema.sql + migration_history extend)
    ├── schema-fresh-from-empty-migrate.txt (41 migrations, exit 0)
    ├── schema-manifests.txt, schema-manifest-neon.txt
    ├── manifest.fresh-from-empty.json     (89 tables, fp a48a176d…)
    ├── manifest.migrated-snapshot.json    (87 tables, fp bc5ab049…)
    ├── manifest.neon-authoring.json       (78 tables, fp 9d4bc5c7…, READ-ONLY)
    ├── schema-diff.txt, schema-diff-summary.txt, schema-diff-report.json
    ├── schema-verify.*.json               (intrinsic verify per manifest)
    ├── schema-unvalidated-fk.txt          (GATE-13.1-01: the 9 NOT VALID FKs and the missing validate half)
    ├── register-audit.txt                 (12.5's five halves, reproduced: 838 hits / 0 unregistered)
    ├── r2-7-side-effect.txt               (GATE-13.1-07: the 3 write paths + hashes of all 65 rewritten files)
    ├── baseline-0.5-vs-13.1.txt           (0.5's 14 backend failures re-measured, plus headline rows)
    ├── artifact-hashes.txt                (this task's own artifact digests + manifest meta)
    ├── harness-down-pre.txt               (0 containers / 0 volumes — "freshly seeded" as a measurement)
    ├── harness-build.txt, harness-up.txt, harness-up-2.txt, harness-down-mid.txt, harness-down.txt
    ├── harness-required-suite.txt         (run 1: 218 passed / 2 failed / 0 did not run)
    ├── harness-required-suite-2.txt       (run 2: 216 passed / 3 failed / 1 did not run)
    ├── harness-run1-detail.txt            (per-project counts; the two tracked items)
    ├── harness-run2-detail.txt            (run 1 vs run 2 on the one test that moved)
    ├── harness-axe-isolation.txt          (the moved test alone on a USED stack: FAILS at 38.3 s)
    ├── harness-axe-isolation-fresh.txt    (the same test alone on a FRESH stack: PASSES in 17.5 s)
    ├── harness-up-3.txt, harness-down-mid2.txt
    ├── harness-gatecheck.txt              (4 failed, as required)
    ├── harness-drain.txt                  (broker 0, unsettled collections 0)
    ├── parse_junit.py, categorise_backend.py, compare_selection.py  (the instruments)
    └── sign-manifest.py                   (recompute/verify the manifest's artifact digest)
```

---

## 1. What "everything" meant, and how the environment was made readable first

Every task in phases 1-12 ran a **selection**. This bullet says *complete*, so
the backend command is `pytest tests/` over all **519** test files — **5,419
collected**, which no task in this spec has done.

Three preconditions, each measured rather than assumed:

- **`test_%` database list verified empty** before starting, and no other pytest
  process. 12.1 §15.1 is why: a concurrent run produces spurious
  `psycopg2.errors.DuplicateDatabase: database "test_mihas_localtest" already exists`
  and 17 tests silently never ran, which made "no new failures" unmeasurable
  against that capture. This run is **serial**, `-p no:randomly`, and reports its
  errors as real (they are — §2.2).
- **A real Postgres, not SQLite.** 0.5 ran the backend on `config.settings.test`
  (SQLite) and recorded 138 skips dominated by Postgres-only checks. This run uses
  the throwaway `mihas_localtest` Postgres 16.14 (`127.0.0.1:5433`) and local
  Redis (`127.0.0.1:6380`), so those suites **execute**: skips fall 138 → 104 and
  the remaining reasons are Phase-gated future work, not vendor gaps
  ([`raw/backend-skips.txt`](raw/backend-skips.txt)).
- **`manage.py check` with no `TESTING=1` and no substitute `REDIS_URL`** — both
  produce a spurious `django_ratelimit.E003`. Result: *System check identified no
  issues (1 silenced)* ([`raw/django-check.txt`](raw/django-check.txt)).

**Neon and production untouched.** The only Neon operation is a read-only
introspection of the authoring default branch (§5), which is what 0.5 did. No
write, no migration, no branch. Neon branch `br-jolly-pine-ahybtg2e` was offered
and **was not needed** — the from-empty rehearsal ran in a throwaway database
inside the isolated localtest container, which is strictly safer.

---

## 2. The backend: 179 non-passing, 146 of them never catalogued

```
$ cd backend && DATABASE_URL=<localtest pg 5433> REDIS_URL=<local 6380> TESTING=1 \
    .venv/bin/python3 -m pytest tests/ -q -p no:cacheprovider -p no:randomly -rs   # SERIAL
106 failed, 5133 passed, 104 skipped, 2 xfailed, 1 xpassed, 2549 warnings, 73 errors in 524.08s
```

### 2.1 The control that makes the number readable

Before attributing anything, the **same 52-file selection** 12.1-12.5 measured was
run from `12.5/raw/backend-selection.txt` verbatim:

```
33 failed, 809 passed, 891 warnings in 92.93s     ← identical to 12.5's recording
```

Set difference ([`raw/backend-new-vs-known.txt`](raw/backend-new-vs-known.txt)):

| | n |
|---|---:|
| non-passing **inside** the 52-file selection | **33** |
| of those, matched by name to 12.5's recorded 33 | **33** |
| non-passing **outside** it — never catalogued | **146** |

So the accumulated known baseline is intact to the test name, and the 146 are
population that no gate in this spec has ever looked at. That is the finding, and
it is a governance finding (GOV-04's sibling): a selection that never grows
cannot tell you what a full run would.

### 2.2 The largest cluster: 86 tests that have not run since task 9.4

**Finding GATE-13.1-02.** Eight test modules do this:

```python
targets.append("apps.applications.document_views.AccessScopeService")
```

Task 9.4 rewired `document_views` onto the shared `resolve_scoped_application`
seam and dropped the module-level `AccessScopeService` import. The patch target no
longer exists, so `mock.patch` raises `AttributeError` **at fixture setup** and
every case in those files **errors instead of running**: 72 setup errors, plus
`tests/property/test_application_endpoints.py`'s 13 failures and
`tests/property/test_interview_status_validation.py`'s 1 on
`interview_views._staff_can_access_application` — the same shape, other module.
**86 tests.**

The reason this is worth a finding rather than a shrug is that **9.4 already fixed
one of them**, and left a comment saying exactly what happened
([`raw/backend-error-rootcause.txt`](raw/backend-error-rootcause.txt)):

```python
# ``document_views`` onto the shared ``resolve_scoped_application`` seam and
# dropped its module-level ``AccessScopeService`` import, at which point
# this fixture began raising ``AttributeError`` **at setup** and every case
# in this file errored rather than ran. Guarding the patch target (rather
# than only the import) is what makes the fixture describe the code that
# exists (admissions-v2 task 9.4).
if hasattr(_document_views, "AccessScopeService"):
```

One module got the guard. Eight did not. None of the eight is in the 52-file
selection, so the hole was invisible for five consecutive recordings — which is
12.1 §15.1's lesson recurring in a different disguise: **a test that errors at
setup is not a failing test, it is an absent one**, and absence does not show up
in a failure diff.

Not fixed here: this bullet runs and records, and the owning lane is the one that
wrote the guard.

### 2.3 The rest, attributed

[`raw/backend-attribution.txt`](raw/backend-attribution.txt) — **179 of 179**, no
residual bucket:

| n | cluster | in selection |
|---:|---|---:|
| 83 + 3 | **A** 9.4's removed patch target, and its downstream `500 == 403` | 0 |
| 13 | **G** task 9.2 perf-golden divergence vs the 2026-06-21 baseline | 13 |
| 11 | **C** `test_admin_endpoint_auth.py` asserts the retired `IsAdmin` class | 0 |
| 9 | **D** `verify_schema_static.py` `EXPECTED_TABLES` missing 6 new tables | 0 |
| 6 | **F** task 1.3 V2 demo endpoints — catalogued at 0.5, unchanged | 0 |
| 3 | **E** new `NOT NULL` columns vs raw-insert test factories | 0 |
| 3 | **J** a bare `except: pass` at line 1214 of an accounts view module | 0 |
| 3 | **K** 12.1 §19 / 12.2 §9.3's deliberately-held classification counts | 2 |
| 2 | **B** task 7.4's retired AI-summary views, still imported by two tests | 0 |
| 2 | **I** R9.2 rollback-file inverse-additive violation | 0 |
| 2 | **H** `communication_templates` `ON CONFLICT` with no matching constraint | 0 |
| 39 | **Z** unattributed — **listed individually** with message and location | 18 |

Cluster **C** deserves one sentence, because the failing test is the wrong one:
all eleven assert `IsAdmin` is in `permission_classes`, and the V2 code resolves
authority through `AdminCapabilityService` / `HasTenantCapability` instead. The
steering rule is *"never compare raw role strings in endpoint code"*, so the code
is right and the test encodes the retired model. Saying so is not the same as
changing it, and this task changed nothing.

Cluster **Z** is deliberately a list rather than a bucket. 12.5 §1.2's rule — a
classification that is broader than the register it defers to *is* a second
register — applies to failure attribution too: a thirteenth cluster called
"miscellaneous" would have made the count tidier and the manifest less true. All
39 are printed with their `file::name` and message.

### 2.4 The skips, and what changed from the baseline

104 skipped over **33 distinct reasons**. The dominant groups all name their own
enforcement anchor: the payment sensitive-fields lock (Task 17.1, 37), dev-bypass
Phase 5 (20), stale pre-admin-force submission-gate property files (13), the
legacy lenco archive absent from this checkout (10), tenant-migration idempotency
requiring `TENANT_MIGRATION_NEON_BRANCH=1` against a dedicated Neon branch (7),
`RECEIPT_NOT_ELIGIBLE` (4), the CSRF middleware refactor (5). **No skip is
relabelled as a pass**, and no *required* job is skipped.

The 138 → 104 fall is the Postgres move: 0.5's dominant skip reason was
"Postgres-only check on SQLite", and those now run.

### 2.5 Query budgets

The bullet names query budgets separately, so they were run separately: the
**14** backend test files that assert a SQL query count
(`assertNumQueries` / `CaptureQueriesContext` / `captured_queries`).

```
5 failed, 377 passed in 15.47s
```

All five failures are `test_perf_capability_invalidation.py` and are part of the
known 33. **Every query-count assertion itself passes**, and the budgets they
hold are: a grade read is **1** query independent of grade count; canonical
offerings cost **0** extra queries when cached and **1** when not, independent of
offering count; the collapsed admin-dashboard aggregate block is **≤ 3**
count/aggregate queries (R2.6); notification cursor paging issues **no**
`COUNT(*)`; and the application query contract is run-to-run **stable** in query
count ([`raw/query-budgets.txt`](raw/query-budgets.txt)).

---

## 3. The frontend

```
$ cd apps/admissions && bun run test
Test Files  1 failed | 492 passed | 1 skipped (494)
     Tests  1 failed | 4607 passed | 1 skipped (4609)      61.61s
```

**Byte-identical to 12.5 and 12.4.** The one failure is the same
`authPageFormMarkup.test.tsx > uses honest helper copy instead of fake email
availability states` — the sign-up page's helper copy, now the **eleventh**
consecutive recording.

The bullet asks for *contract*, *accessibility* and *visual* suites by name, so
[`raw/frontend-clause-coverage.txt`](raw/frontend-clause-coverage.txt) names the
files that actually executed rather than asserting coverage: **13** accessibility
files (`ariaAttributes`, `colorContrast`, `keyboard-navigation`, `reducedMotion`,
`altText`, `form-error-aria`, `ui-ux-accessibility`, `application-wizard-accessibility`,
…), **9** visual/responsive files (`responsiveDesign`, `ui-ux-design-tokens`,
`bottom-navigation.mobile`, `routeMobileOverflowGuard`, `skeletonConsistency`, …)
and **16** contract/drift-guard files (`openApiContractDriftGuard`,
`rolesBackendMirror`, `paymentStatusMappingDriftGuard`, `versionDriftGuard`,
`submissionGatesDriftGuard`, …). The Playwright half of the accessibility and
visual clauses is §6.

| Gate | Result |
|---|---|
| `bun run lint` | **15 errors, 13 files** — file set diffed against 12.5's: **identical** |
| `bun run type-check` (`tsconfig.build.json`) | **exit 0** |
| `bun run build` (tsc + vite + CSP gate) | **exit 0**; 229 dist files, path set identical to 12.5 |
| `bun run check:all` | **exit 0**; entry path 94.7 KB gz |
| `bun scripts/launch-bundle-guard.ts` | **exit 1** — see below |
| `bun run validate:tailwind` | **exit 127** — the script it points at does not exist (11.5's) |

**One honest note on a non-gate.** `bun run type-check:full` (`tsc --noEmit`,
which includes `tests/`) reports **607** errors across **127** files under
`tests/` plus `vite.config.ts` — 219 `TS2532` + 181 `TS18048` + 107 `TS2345`
dominant, i.e. pre-existing `strict` / `noUncheckedIndexedAccess` complaints in
harness helpers and specs. **Zero are in `src/`.** The gate the repo actually
runs is `tsconfig.build.json`, which passes. 12.4 §10 recorded this the same way
and this task reports it identically rather than promoting it to a failure or
hiding it.

**The bundle guard fails on one rule and improved on another.** Only the
forbidden-chunk rule fails — `vendor-framer-motion-UG34w3ZA.js` on the entry path
against a threshold of 0, which is 0.5's baseline finding BL-0.5-06. The budgets
pass, and the *first PDF action* figure has moved from 0.5's **766.4 KB gz** to
**129.1 KB gz** because 12.4 §3 took the dev-only preview chunks out of the
production bundle. The guard rewrites a tracked file
(`docs/launch-evidence/05-bundle/bundle-evidence.json`) as a side effect; it was
restored and verified (`aa33658203b8…`), which is 0.5's precedent.

**jobs-ops** — the boundary 12.4 established stays green: `type-check`, `lint` and
`vite build` all exit 0 (1,674 modules; JS 356.09 KB / gz 102.33 KB).

---

## 4. The OpenAPI contract, and a generator that can silently corrupt it

### 4.1 The clean part

```
$ cd backend && DJANGO_SETTINGS_MODULE=config.settings.dev DATABASE_URL=<localtest pg> \
    .venv/bin/python3 manage.py spectacular --file /tmp/schema-13-1-pg.yaml
$ diff backend/schema/openapi.v2.candidate.yaml /tmp/schema-13-1-pg.yaml     # no output
35fe05d4cd3fa69ddfa9b0f0b3f9370c4649fa83b8258f29dc9100231cc3ef58  (both)
```

**Byte-identical**, 22,135 lines, 192 paths, `info.version` 2.0.0 — the hash the
dispatch names. The generated client follows: `openapi-typescript` 7.6.1
reproduces `apps/admissions/src/generated/api.d.ts` byte-identically
(`a4d1e96a3555d39a…`, 24,252 lines) and `tsc --noEmit --strict` on it exits 0
([`raw/openapi-client-compile.txt`](raw/openapi-client-compile.txt)).

Recorded honestly: the schema still generates **116** non-fatal drf-spectacular
errors (26 unique) from APIViews without a `serializer_class` — staff invitations
5, change requests 6, onboarding 10, V2 demo 5 — plus 3 `operationId` collision
warnings. 0.5 recorded **20**. `test_launch_verification_spectacular.py` fails on
both counts, and that failure is in §2.3's remainder.

### 4.2 Finding GATE-13.1-03: the contract is Postgres-only, and the script defaults to SQLite

The first regeneration attempt used `config.settings.test`, the documented fast
local suite, and **diverged** — 22,155 lines, `03ee43ab…`, differing in 20 places:

```yaml
  version:
    type: integer
-   maximum: 2147483647            # committed (Postgres)
-   minimum: -2147483648
+   maximum: 9223372036854775807   # generated under SQLite
+   minimum: -9223372036854775808
+   format: int64
```

Generation is **deterministic within each environment** (verified by a second
run), so this is not flake. The cause is one line of Django: `IntegerField.validators`
is derived from `connection.ops.integer_field_range()`, and the SQLite backend
returns 64-bit ranges for *every* integer field because SQLite does not enforce
integer width. DRF copies those validators onto the serializer field, and
drf-spectacular renders them — so **the emitted contract depends on the database
vendor the generator happened to be pointed at**. `version = models.IntegerField()`
is int32 on Postgres and int64 on SQLite.

Why it is a finding and not a curiosity: `scripts/generate-api-types.sh` writes
**directly over** `backend/schema/openapi.v2.candidate.yaml`, and its default is

```bash
DATABASE_URL="${DATABASE_URL:-sqlite:///tmp/schema-gen.db}"
```

so a developer running it with no env overrides rewrites the committed contract
with the int64 variant, and the generated client changes with it. **CI is not
affected** — `.github/workflows/ci.yml` and `backend-governance.yml` both pin
`DJANGO_SETTINGS_MODULE=config.settings.dev` against a Postgres service, and the
script's own settings default is `config.settings.dev` too; it is only the
`DATABASE_URL` default that is wrong. Because of this, types here were regenerated
from the **committed** schema into a temp file and the committed schema was never
written. Unfixed; proposed owner the API-contract lane (tasks 1.2 / 1.5).

---

## 5. Migration-from-empty, the snapshot, and the schema diff

Task 3.1 built the live schema manifest/diff tool, so it was reused rather than
re-derived: `manage.py schema_manifest --emit / --matrix / --verify`.

**From empty** — a throwaway `v2_fresh_13_1` database created *inside* the
isolated localtest Postgres container, then `00_full_schema.sql`, then
`2026_05_22_migration_history_extend.sql`, then
`apply_sql_migrations --allow-non-additive`:

```
Applied 41 migration(s) successfully.      exit 0
```

Every script applied, each with its recorded sha256
([`raw/schema-fresh-from-empty-migrate.txt`](raw/schema-fresh-from-empty-migrate.txt)).
That is R15/R17's from-empty path exercised end to end on a real Postgres.

**Three manifests, three fingerprints:**

| Manifest | vendor / server | tables | FKs | `NOT VALID` | fingerprint |
|---|---|---:|---:|---:|---|
| `fresh-from-empty` | Postgres 16.14 (throwaway) | 89 | 117 | **9** | `a48a176d…` |
| `migrated-snapshot` | Postgres 16.14 (`mihas_localtest`, read-only) | 87 | 119 | **28** | `bc5ab049…` |
| `neon-authoring` | Postgres 17.10 (Neon default branch, **read-only**) | 78 | 108 | **9** | `9d4bc5c7…` |

**All three differ**, which is 3.1's honest headline (DATA-09) reproduced with
current numbers: the repo SQL, a previously-migrated local database, and the Neon
authoring branch are three different schemas. The matrix
([`raw/schema-diff-summary.txt`](raw/schema-diff-summary.txt)) with
`fresh-from-empty` as baseline:

| pair | failures | warnings | dominant categories |
|---|---:|---:|---|
| → `migrated-snapshot` | 230 | 60 | `column_changed` 56, `missing_migration` 38, `foreign_key_changed` 28, `unvalidated_foreign_key` 28 |
| → `neon-authoring` | 628 | 186 | `column_changed` 257, `missing_index` 120, `extra_foreign_key` 80, `missing_foreign_key` 78 |

One data-side item worth naming: two Neon `migration_history` rows carry a
**12-character truncated** checksum where the repo's own runner writes a full
sha256 (`schema_cleanup_device_session_default.sql`,
`schema_cleanup_drop_stale_columns.sql`), so those two scripts can never match on
Neon regardless of content. Recorded; the data lane's.

### 5.1 Finding GATE-13.1-01: an expand with no validate

The intrinsic `--verify` fails on **all three** manifests, and on two of them it
fails on the *same nine* foreign keys — `tenant_onboarding` (2),
`tenant_staff_invitations` (4), `tenant_change_requests` (3). Their creating
scripts say:

```sql
-- NOT VALID FKs: enforced for new rows; validation of any pre-existing rows is
--   … FOREIGN KEY (institution_id) REFERENCES institutions (id) NOT VALID;
```

and `grep -rn "VALIDATE CONSTRAINT" backend/scripts/*.sql` returns **nothing** for
those three tables, while five sibling expand scripts
(`canonical_assignment`, `payments_documents`, `tenant_fk`,
`document_evidence_lifecycle`) all have a paired `_validate.sql`
([`raw/schema-unvalidated-fk.txt`](raw/schema-unvalidated-fk.txt)).

**The reading matters as much as the count.** These are *new* tables, so there are
no pre-existing rows to validate and the FK is enforced for every row that can
exist — this is **not** a data-integrity hole today. The cost is that
`schema_manifest --verify` can never return ok on any environment, so a real
future `NOT VALID` would be indistinguishable from this permanent one, and the
comment describes deferred work nobody scheduled. Direction of travel is good:
3.1's from-empty manifest had **28** unvalidated FKs and this one has **9**, so
the pattern was followed five times and dropped three times.

Unfixed; proposed owner the tenant lane, which wrote all three scripts.

---

## 6. All Playwright projects

Isolated task-0.4 harness, strict gates active, `HARNESS_PW_CHANNEL=chrome`
(bundled Chromium unsupported on this OS), `harness build` after checkout, volumes
wiped and reseeded, torn down afterwards. Pre-teardown recorded separately so
*"freshly seeded"* is a measurement, not an adjective
([`raw/harness-down-pre.txt`](raw/harness-down-pre.txt): **0** harness containers,
**0** harness volumes).

| Run | Result |
|---|---|
| fresh stack, whole required profile — **run 1** | **218 passed, 2 failed, 0 did not run** — 220 tests, 22 spec files, 15.3 min ([`raw/harness-required-suite.txt`](raw/harness-required-suite.txt)) |
| `harness down` → `up`, whole required profile — **run 2** | **216 passed, 3 failed, 1 did not run** — 19.5 min ([`raw/harness-required-suite-2.txt`](raw/harness-required-suite-2.txt)) |
| the one moved test, **alone on the used stack** | **FAILS** at 38.3 s — `page.goto('/admin/intakes')` timeout ([`raw/harness-axe-isolation.txt`](raw/harness-axe-isolation.txt)) |
| the same test, **alone on a third freshly seeded stack** | **PASSES in 17.5 s** of a 30 s budget ([`raw/harness-axe-isolation-fresh.txt`](raw/harness-axe-isolation-fresh.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`raw/harness-gatecheck.txt`](raw/harness-gatecheck.txt)) |
| drain | `{"broker_queue_depth": 0, "celery_queues": ["celery"], "unsettled_payment_collections": 0, "unsettled_references": []}` ([`raw/harness-drain.txt`](raw/harness-drain.txt)) |
| teardown | **0** harness containers, **0** harness volumes ([`raw/harness-down.txt`](raw/harness-down.txt)) |

Total **220** in both runs, the same as 12.1/12.2/12.3/12.4/12.5's. This task adds
no journey.

### 6.1 The two runs disagree, and the disagreement is 12.4 §12.2's, reproduced

**The stable pair is in both runs.** `tenant-launch.spec.ts:139` ×
`chromium-required` **and** `mobile-required`, in run 1 and run 2 — the
**sixteenth and seventeenth** consecutive recording. Its assertion is
`getByText('Fees')` against a `Program Fees` step label
`TenantOnboardingWizard.tsx` renders `hidden` on mobile. Tenant lane; 12.1 §21 is
why that file is declined. Not touched here.

**Run 2's third failure is the difference, and it is a duration:**

| `design-system-defluff.spec.ts:664` — *every surface passes an axe WCAG A/AA scan* | result |
|---|---|
| run 1, `chromium-required`, full profile | ✓ 13.1 s |
| run 1, `mobile-required`, full profile | **✓ 19.1 s** |
| run 2, `chromium-required`, full profile | ✓ 13.0 s |
| run 2, `mobile-required`, full profile | **✘ 31.1 s** — `Test timeout of 30000ms exceeded` |
| alone, on the stack that had just run a 19.5-min profile | **✘ 38.3 s** — timeout on `page.goto('/admin/intakes')` |
| alone, on a third **freshly seeded** stack | **✓ 17.5 s** (22.7 s wall) |

**No axe violation is reported in any of the six runs.** The failure is always
`Test timeout of 30000ms exceeded`, and in the isolation run the call log names the
exact step: navigating to `/admin/intakes` with `waitUntil: 'domcontentloaded'`.
The test sweeps several admin routes at two viewport widths inside one 30 s
test-level budget, so its margin is thin by construction — 19.1 s and 17.5 s are
passes with ~11 s of headroom, and 31.1 s is that headroom gone.

The middle row is **new information 12.4 did not have**, and it sharpens the
attribution rather than softening it: running the test *alone* is not enough — it
failed alone, at 38.3 s, on a stack that had been driven for twenty minutes. What
recovers it is a **freshly seeded stack**, where it passes in 17.5 s. So the driver
is the age/load of the stack and the box, not concurrency with other specs, and not
the input: run 1 and run 2 served a byte-identical build.

12.4 §12.2 established the same thing from the other direction — two full-profile
runs on byte-identical input gave 216/3/1 and 209/4/7, with *different* extra
failures and growing worker aborts. Run 1 here (218/2/**0** did-not-run) is the
cleanest full-profile result any lane has posted, and run 2 (216/3/**1**) lands
exactly on 12.4's first pair. Publishing run 1 alone would have been the tidy
choice and the false one; 12.3 §9.2 and 12.4 §12.2 are the models for accounting
for a moved number, including when it moves the convenient way. **The claim this
task makes is therefore the narrow one: one stable failure pair attributable to
the tenant lane, and one axe scan whose duration — never its assertions — sits on
the edge of a 30 s budget on this machine.**

### 6.2 The other item another lane flagged as possibly hardening into a defect

**`ocr-manual-fallback.spec.ts:146` passed on both projects in both runs**
(chromium 10.9 s / 14.6 s, mobile 12.4 s / 17.4 s —
[`raw/harness-run1-detail.txt`](raw/harness-run1-detail.txt),
[`raw/harness-run2-detail.txt`](raw/harness-run2-detail.txt)). 12.2 §8.2
reproduced it failing in isolation and flagged it as possibly hardening into a
defect; 12.3 §9.2 and 12.4 §12.3 then recorded it passing, 12.4's own reading
being *"four project-runs out of four"*. **This gate adds four more.** Its sibling
`:256` — *the served bundle ships no browser OCR asset* (R11.9, STU-07) — also
passed on all four project-runs, on a bundle rebuilt from the current source.

That is as much as this task claims. A run of consecutive passes is evidence about
this environment, not proof the earlier isolated failure was imaginary, and no
cumulative total is asserted across tasks whose per-test timings this task did not
re-read. The wizard lane still owns it.

---

## 7. New findings this gate produced

All seven are **unfixed**, each with a proposed owner. This task runs and records.

| id | sev | what | owner |
|---|---|---|---|
| **GATE-13.1-01** | med | 9 FKs permanently `NOT VALID` — three tables got the expand half and no validate half (§5.1) | tenant lane (4.4 / 5.1) |
| **GATE-13.1-02** | **high** | 86 tests have not run since task 9.4; the correct `hasattr` guard exists in one of nine modules (§2.2) | admin-query/scope lane (9.4) |
| **GATE-13.1-03** | med | the committed OpenAPI contract is Postgres-only, and `generate-api-types.sh` defaults `DATABASE_URL` to SQLite while writing over it (§4.2) | API-contract lane (1.2 / 1.5) |
| **GATE-13.1-04** | med | concurrent reviewer auto-assign allocated **8** against a workload cap of **3** (`test_reviewer_assignment_concurrency.py`) | reviewer-assignment lane (9.5) |
| **GATE-13.1-05** | low | three registries drifted behind their code: `EXPECTED_TABLES` missing 6 tables, the migration-history release report missing 2 August scripts, `ERROR_CODES` missing `DOCUMENT_NOT_READY` / `EXPORT_TOO_LARGE` | data (3.x) / release (1.7) / API (10.4) |
| **GATE-13.1-06** | low | `2026_07_16_02_canonical_assignment_backfill_rollback.sql` is not inverse-additive against R9.2 — plausibly a real spec/instrument tension, since undoing a backfill is not a `DROP` | data-migration lane (3.4 / 13.4) |
| **GATE-13.1-07** | med | **three instruments write into `docs/v2-evidence/**`**, so five earlier tasks' Required_Evidence artifacts are not immutable (§7.1) | harness lane (0.4) owns two mechanisms; 2.2 owns the third |

### 7.1 GATE-13.1-07: R2.7's immutable evidence is not immutable

This gate rewrote **65 files across seven earlier task directories** — 11.5 (20),
11.4 (16), 11.3 (10), 11.2 (10), 11.1 (7), 2.2 (1), 0.4 (1) — and it did so
*without this task writing a single line into any of them*. Three instruments do
it on their own ([`raw/r2-7-side-effect.txt`](raw/r2-7-side-effect.txt)):

```ts
// apps/admissions/playwright.harness.config.ts:37-40
reporter: [
  ['list'],
  ['json', { outputFile: '../../docs/v2-evidence/0.4/playwright-report.json' }],
],
```

1. **The harness Playwright config hard-codes task 0.4's report path.** Every
   harness run by *any* task overwrites 0.4's Required_Evidence artifact. Every
   task from 0.4 to 12.5 that ran the harness has been doing this.
2. **Six required specs write screenshots into 11.1-11.5's evidence directories**
   (`admin-mobile-journeys` → `11.4/screenshots`, `design-system-defluff` →
   `11.5/screenshots`, `student-dashboard-task-first` → `11.1/screenshots`,
   `student-document-density` → `11.3/screenshots`, `student-wizard-mobile` →
   `11.2/screenshots`). Running the required profile regenerates five tasks'
   visual evidence.
3. **`backend/tests/property/test_authority_matrix_generated.py:555` writes task
   2.2's `authority-conformance-summary.json`.** Running the backend suite
   overwrites 2.2's Required_Evidence artifact.

This is not a violation 13.1 introduced — it is how those tasks *produced* their
evidence, and each rewrite is a fresh capture of the same journey rather than an
edit. But it does mean R2.7's guarantee does not hold for these five tasks'
artifacts: they reflect whoever ran the gate last, not what that task measured on
its date. 13.1 is simply the first task to trigger all three mechanisms in one
run.

**Not restored, and stated rather than quietly fixed.** `docs/v2-evidence/` is
untracked in git, and none of the five tasks recorded content hashes for these
artifacts, so there is nothing to restore *to*. The current hashes of all 65 files
are recorded in [`raw/r2-7-side-effect.txt`](raw/r2-7-side-effect.txt) so a
reviewer can at least see what the run touched. The fix is small and belongs to
the harness lane — parameterise the reporter path and the screenshot directories
per run — and 13.6, which has to assert "every required task evidenced", is the
bullet that most needs this to be true.

GATE-13.1-04 is the bullet's *concurrency* clause producing a signal, and it is
outside the 52-file selection, so no prior recording covered it. This task did not
investigate whether the cap is advisory or enforced; the number is reported as
measured.

Five of the seven are things **only a complete run could find**: GATE-13.1-02 and
-04 because their tests are outside the selection, -01 and -05 because a partial
schema check never reached them, and -07 because it takes running the backend suite
*and* the browser profile in one pass to see all three write paths fire.

---

## 8. Carried forward, not fixed

Each was measured against a real run in this gate and attributed elsewhere:

| Item | Status here |
|---|---|
| `authPageFormMarkup.test.tsx > uses honest helper copy` | reproduced — **eleventh** consecutive recording. Sign-up lane |
| 15 lint errors / 13 files | reproduced; file set **byte-identical** to 12.5's |
| `tenant-launch.spec.ts:139` × both projects | reproduced — **sixteenth and seventeenth**. Tenant lane; 12.1 §21 declined the file |
| 14 task-9.2 perf-golden divergences | 13 reproduced as failures inside the selection. Task 9.2's contract rewrite |
| `test_view_auth_classification.py` — **38** unclassified views | reproduced at exactly 38; held by 12.1 §19 and 12.2-12.5 |
| `test_public_endpoint_policy.py` — **3** unclassified public endpoints | reproduced; 12.2 §9.3 named them with owning lanes |
| 13 unused non-import locals | untouched (12.4 §6.3) |
| `puppeteer-core` undeclared import | untouched (12.4 §4.4) |
| `bun run validate:tailwind` exits 127 | reproduced; the shell script it names does not exist (11.5) |
| `ocr-manual-fallback.spec.ts:146` | **passed** all four project-runs here (§6.2) |
| `design-system-defluff.spec.ts:664` | passed run 1 (19.1 s) and **failed run 2** (31.1 s) on mobile; six measurements recorded, no axe violation in any (§6.1) |
| launch-bundle-guard forbidden chunk | reproduced; 0.5's BL-0.5-06 |
| `type-check:full`'s pre-existing `tests/` errors | reproduced (607 / 127 files / 0 in `src/`); not the repo's gate (12.4 §10) |
| the four registers with no per-entry owner/date | re-measured **unchanged** — §8.1 |

### 8.1 The register gap, measured and handed to 13.6

12.5's instrument was re-run in full
([`raw/register-audit.txt`](raw/register-audit.txt)) and reproduces exactly:

```
   categories declared : 13        total hits : 838        UNREGISTERED : 0
   guards named but missing : none
   HALF 5 PASS=True                HALF 5b PASS=True
   OVERALL PASS = True   (halves 1-3)      HALF 4 PASS=False   (12.3's, source-only)

   register                                           n  own  date  shrink  stale-chk
   compatibility_register.COMPATIBILITY_SURFACES      7  yes   yes     yes        yes
   module-size-report.DECLINED_REMOVALS               3  yes    NO     yes        yes
   architectureEnforcement.LEGACY_EXCEPTIONS          9   NO    NO     yes        yes
   canonical_tenant_drift_guard._ALLOWED_PREDICATES  11   NO    NO     yes        yes
   documentFlowDriftGuard.PREVIEW_ALLOWLIST           5   NO    NO     yes        yes
   legacy-brand-allowlist.allowlist                  19   NO    NO     yes        yes
   test_compatibility_surfaces_12_2.SHIMS             6  yes    NO     yes        yes
   broken (fails half 5) : none
   gaps (reported, not failed): 4 registers
```

**60 entries, 0 unregistered, 0 broken, 4 with no per-entry owner or removal
date** — all seven shrink-only, all seven staleness-checked, every mechanism file
verified to exist. This is 12.5 §7.4's gap re-measured unchanged, and it is
carried into this manifest **as a named item** rather than dropped, because
13.6's closure criterion is *"no unregistered Legacy_Exception"*. Whether a
**dated owner** is required to satisfy that is 13.6's question to answer; this
task's job was to hand it the measurement.

---

## 9. The pair: 0.5 → 13.1

0.5 is the immutable pre-change baseline; this is its counterpart. Both are at
commit `bae29a28` with a dirty tree. The one methodological difference is stated
loudly because it moves numbers: **0.5 ran the backend on SQLite; this runs it on
a real Postgres**, so the Postgres-only suites execute here rather than skipping.
Row by row in [`raw/baseline-0.5-vs-13.1.txt`](raw/baseline-0.5-vs-13.1.txt).

| Gate | 0.5 (pre-change) | 13.1 (candidate) |
|---|---|---|
| backend | 3720 collected / 3565 passed / **14 failed** / 138 skipped / 0 errored (SQLite) | 5419 collected / 5133 passed / **106 failed** / 104 skipped / **73 errored** (Postgres) |
| 0.5's 14 failures, re-measured | — | **8 still failing, 6 no longer** |
| vitest | 431 files / 3499 tests / 3 failed **+ 5 collection-error files** | 494 files / 4609 tests / **1 failed**, **0** collection-error files |
| lint | 24 errors | **15 errors** |
| type-check | PASS | PASS |
| build | PASS | PASS, 229 dist files |
| OpenAPI | 2.0.0 / 147 paths / committed candidate **142 paths and stale** / 20 spectacular errors | 2.0.0 / **192 paths** / committed candidate **byte-identical to source** / 116 spectacular errors |
| browser | **NOT RUN** — 138 legacy e2e tests enumerated, all env-gated (**GOV-04**) | **220 run** — 218 passed / 2 failed / 0 did not run, twice, plus the negative profile and drain |
| Neon schema | 73 tables / 93 FKs / **0** `NOT VALID` / fp `c48f57d9` | 78 tables / 108 FKs / **9** `NOT VALID` / fp `9d4bc5c7` |
| bundle guard | FAIL — framer-motion; entry 144.1 KB gz; first PDF action **766.4 KB** gz | FAIL — same chunk; entry 141.8 KB gz; first PDF action **129.1 KB** gz |
| `verify_migration.py` | BLOCKED (localhost:5432, no credentials, 59 errors) | **superseded** by 3.1's `schema_manifest`, which reached three real databases |

Read as a pair, four things moved in the right direction and two in the wrong one,
and both directions are stated:

- **Right:** the browser gate exists and runs (GOV-04's whole point); the committed
  API contract is no longer stale against its own source (GOV-05's); the frontend
  suite grew by 1,110 tests while its failure count fell 3 → 1 and its five
  collection-error files went to zero; lint fell 24 → 15; the first-PDF-action
  bundle fell 766 → 129 KB gz.
- **Wrong:** 0 → **9** `NOT VALID` FKs on Neon (GATE-13.1-01), and 20 → **116**
  drf-spectacular errors as 21 more `APIView`s shipped without a
  `serializer_class`.
- **Neither, and the most important row:** backend failures 14 → 106 is **not** a
  fourfold regression. 0.5 measured 3,720 tests on SQLite; this measures 5,419 on
  Postgres, and 146 of the 179 non-passing tests sit outside the selection every
  intervening task used. The comparable figure is the control in §2.1 — the
  52-file selection, which reproduces 12.5's 33/809 exactly.

---

## 10. Boundaries honoured

| Boundary | What was done |
|---|---|
| **Runs and records; does not repair** | No product source, test, schema, script, register or document was changed. The only writes are `docs/v2-evidence/13.1/**` |
| **No fix to make a suite greener** | Every failure is recorded with its message and an owner. The `hasattr` one-liner that would recover 86 tests was **not** applied (§2.2) |
| **No selection or pattern narrowed** | The backend command is `pytest tests/`. The 52-file selection is run *as a control*, from 12.5's file verbatim, and is labelled as such |
| **Neon: read-only, default branch, no write** | One introspection query set. No migration, no branch created, `br-jolly-pine-ahybtg2e` not needed |
| **Production untouched** | Not connected to, not queried, not modified |
| **`docs/v2-evidence/**` — read, never edited by this task** | 0.5, 12.3, 12.4 and 12.5 were **read** for comparison. 12.5's `backend-selection.txt` was **copied** into `13.1/raw/`, not moved. **But the instruments rewrote 65 files across seven task dirs on their own** — that is finding GATE-13.1-07 (§7.1), reported rather than hidden |
| **Backend serial, DB list verified empty** | 12.1 §15.1's condition, checked before starting; both runs report their errors as real |
| **Harness measured on a freshly seeded stack, then torn down** | `harness down` (volumes wiped) before and after; pre-teardown state recorded |
| **No secret printed** | The Neon DSN was passed by env var name (`--dsn-env`) and never echoed; only its host appears |
| **jobs-ops boundary respected** | Its three gates run and pass; nothing in `apps/jobs-ops` was touched |

---

## 11. Not claimed here

- **That the gate is clean.** It is not. 179 backend tests, 1 frontend test, 15
  lint errors, 2 browser tests, 1 bundle rule, 1 broken npm script and 4
  schema/register items do not pass. A complete manifest with attributed failures
  is what this bullet asks for.
- **That any of the 146 never-catalogued backend items was investigated beyond
  attribution.** They were measured, clustered, and — for the 39-item remainder —
  listed individually with message and location. Nothing was fixed.
- **That the 39-item remainder has a cause.** It has a name, a message and a
  location, and is labelled *unattributed*. A thirteenth cluster called
  "miscellaneous" would have been tidier and less true.
- **That the harness result is strong evidence on its own.** 12.4 §12.2
  established this machine is load-limited; two full-profile runs are recorded so
  the variance is visible, including where it moved the convenient way.
- **That production or a canary was measured.** Nothing touched production. The
  Neon reading is the authoring default branch, read-only. 13.4 owns the
  rehearsal, 13.5 the canary.
- **That the register owner/removal-date gap was closed.** Re-measured unchanged
  and handed to 13.6 (§8.1).
- **That `verify_migration.py` was run.** 3.1's `schema_manifest` supersedes it
  and reached three real databases; 0.5 recorded it as environment-blocked and
  nothing here changes that.
- **That 13.2-13.6 were performed.** The two-tenant golden and adversarial matrix,
  the mobile/zoom/accessibility sweep, the migration and rollback rehearsal, the
  canary, and spec closure are their own bullets.
- **That the 65 earlier-task evidence files the instruments rewrote were
  restored.** They were not, and could not be (§7.1). Their current hashes are
  recorded instead.
- **Any numbered spec property.** This task has no PBT sub-task; the deliverable is
  the manifest.

---

## 12. What a future task on this gate should know

The checkbox is `[x]`, so this is not a continuation plan.

1. **A selection that never grows cannot tell you what a full run would.** Five
   consecutive recordings measured 52 files, correctly, and the 52 were
   byte-stable — which read as stability and was partly invisibility. 146 of the
   179 non-passing tests live outside it (§2.1).
2. **A test that errors at fixture setup is absent, not failing, and absence does
   not appear in a failure diff.** 72 tests stopped running at task 9.4 and five
   gates did not notice. Count *errors* separately from *failures* and treat a
   non-zero error count as a hole in the measurement, which is 12.1 §15.1's
   lesson (§2.2).
3. **When a rewiring breaks a patch target, `grep` for the target, not for the
   file you fixed.** 9.4 wrote the correct `hasattr` guard and a good comment in
   one of nine modules. One `grep -rl` would have found the other eight (§2.2).
4. **The emitted OpenAPI schema depends on the database vendor.** Django derives
   integer-field validators from the connection, so the same source generates two
   different contracts on Postgres and SQLite. Any command that regenerates a
   committed schema must pin the vendor, and a generator that writes over the
   committed file must not default to the wrong one (§4.2).
5. **An `expand` script without a paired `validate` script leaves a permanent
   red.** Nine `NOT VALID` FKs mean `schema_manifest --verify` can never return
   ok, so the next real one is invisible. New tables have nothing to validate —
   which is exactly why the `VALIDATE CONSTRAINT` is cheap and should just be
   written (§5.1).
6. **Record the second harness run even when the first one is the best number
   anyone has posted.** 218/2/0 was tempting to publish alone. 12.4 §12.2 earned
   the rule with two runs that disagreed; the rule is worth keeping when it costs
   you the flattering figure (§6.1).
7. **Run the control before attributing anything.** Re-running 12.5's exact
   selection first is what turned "106 failures" from alarming into readable, and
   it took 93 seconds (§2.1).
8. **Pair a candidate manifest with its baseline on shape, not just on numbers.**
   0.5's schema made §9 mechanical. The one place the two are not comparable —
   SQLite vs Postgres for the backend suite — has to be said out loud, because
   every derived delta depends on it (§9).
