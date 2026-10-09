# Task 13.6 — Close the spec truthfully

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · Phase 13, sixth bullet
Requirements: **R1, R18.5–R18.6**
Findings: **all**
Required_Evidence: **final closure manifest and reviewer/operator approvals**

---

## THE VERDICT: NOT CLOSED

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  ADMISSIONS V2 CANONICAL REBUILD — FINAL GATE: **FAIL**                  │
  │                                                                          │
  │  Closure clauses:      2 of 5 PASS · 3 FAIL                              │
  │  Blocking items:       **11**                                            │
  │  Spec status:          left at "planned" — NOT set to "completed"         │
  │  Canonical truth map:  UNCHANGED — V2 is not relabelled as shipped        │
  │  tasks.md 13.6:        [-]  (in progress) — NOT [x]                       │
  └──────────────────────────────────────────────────────────────────────────┘
```

The bullet says *"update canonical truth map and spec status **only after the
final gate passes**"*. The gate does not pass. So neither was updated, and this
document is the reason, item by item.

### The 11 blocking items

| # | blocking item | clause | owner | can 13.6 close it? |
|---:|---|---|---|---|
| **B1** | **13.5 was never executed.** The canary is prepared; production was never contacted. Deploy + operator sign-off are human-only. | (ii) | **operator (human)** | **No** — by design |
| **B2** | **`sign-off.md` is wholly unsigned.** This bullet's own `_Evidence:` line asks for *"reviewer/operator approvals"*. Part 4a/4b are blank rule lines. | evidence | **operator + a second reviewer** | **No** — an agent signing its own sign-off is the artifact this spec must not produce |
| **B3** | **GATE-13.5-05** — the shipped bundle's CSP pins `api.beanola.com` literally; `deploy/RUNBOOK.md` cuts DNS to `api.mihas.edu.zm` (15 refs, 0 to beanola). Until settled, no smoke result means anything. | (i) | deploy/runbook lane | **No** — needs a production fact |
| **B4** | **GATE-13.5-02 / GATE-13.2-01** — a **live** cross-tenant capacity read on the production lineage: 3 intake names shared across the 2 active institutions, resolved by display name at `student_draft_views.py:185` + 4 siblings. | (i) | admin-query lane | No (code fix, one lane) |
| **B5** | **GATE-13.5-01** — `applications.institution/intake/program` are `varchar(50)` on the production lineage against a `varchar(255)`/`varchar(100)` model; `check_schema_drift` documents the class as out of scope so the boot gate passes. Longest `institutions.name` is **46 of 50**. | (i) | data-migration + applications lanes | No (migration) |
| **B6** | **GATE-13.4-02** — a restored production-lineage backup **cannot be brought forward**: boot gate refuses, `apply_sql_migrations` dies at `2026_06_08_01`. Data-level rollback is unproven. | (i) | data-migration lane | No (migration, needs rehearsal) |
| **B7** | **GATE-13.3-09** — `/student/status`, the canonical workspace 10.6 chose, tells a student who owns **2** applications that none exists. Finding **STU-23 (P1)** is therefore **not closed** although task 10.6 is `[x]`. | (i) | student-workspace lane | No |
| **B8** | **GATE-13.3-16 / -10 / -11 / -01..-06, -15** — the bottom nav occludes 26.7 % of the dashboard's primary next action in the first mobile viewport; offline shows a raw `TypeError`; the 320 px bottom nav has no accessible name; 7 sub-44 controls. Findings **STU-03/04/05/10/24** are not closed although 11.1–11.5 are `[x]`. | (i) | shell / wizard / design-system / dashboard lanes | No |
| **B9** | **36 backend tests fail** in the corpus this task un-blocked (§5). They ran for the first time since task 9.4 and assert retired pre-9.4 / pre-5.3 shapes. An unrun test is not a passing test — and now that they run, they are not passing either. | (iii) | admin-query + capacity lanes | No (36 stale assertions across 5 modules, 2 lanes) |
| **B10** | **Tasks 4.1 and 7.4 are `[x]` with no `docs/v2-evidence/<id>/` at all.** The blocking spec validator fails on exactly these two, and so do its own self-tests (§2). | (ii) | tenant-onboarding lane (4.1), de-AI lane (7.4) | No — fabricating another task's evidence directory is the failure mode this spec exists to prevent |
| **B11** | **12.5's clause is stricter than 13.6's and is not met**: 4 of 7 registers carry no per-entry owner, 6 of 7 no removal date, while 12.5's bullet requires *"a registered Legacy_Exception **with owner/removal date**"* — and 12.5 is `[x]`. Filed here as **GATE-13.6-01** (§7). | (iv), governance | admissions-v2 (2 registers) + 2 other specs | Partly — the criterion is **decided** here (§7); the dates are not invented here |

**Not blocking, but must not be lost** — 13.3's remaining findings, 13.2's
GATE-13.2-02/-03, 13.1's GATE-13.1-03/-04/-05/-07, 10.5's unpromoted SQL script,
12.3's blocked column contraction, and the 15 frontend lint errors. All are in
§8 with owners, and each was re-verified to still be present in the repo:
[`raw/residual-items.txt`](raw/residual-items.txt) — which also records one of
this task's **own** instruments being wrong and the correction, in the style
13.3 §9 used (a `grep` that appeared to find 12 filled sign-off fields was a
regex artefact; Part 4 read directly is blank).

---

## 1. What this task actually did

| # | action | result |
|---|---|---|
| 1 | Re-ran the **spec validator** built by task 0.2, and its self-tests | **FAIL, exit 2**, 2 errors — and **2 of its own 20 self-tests fail** (§2) |
| 2 | Built the **finding traceability report** over all 71 register findings **+ all 34 Phase 13 GATE findings** | §3–4. **0 of the 34 GATE findings are in `findings.md`** |
| 3 | Audited **all 73 tasks** for the evidence their `_Evidence:` line names | §6. 2 directories absent, 0 orphan directories, 1,417 files / 302 MB |
| 4 | **Fixed GATE-13.1-02** — the one blocker in reach — and re-ran the 86 tests **serially** | 86 absent → **0 errors**; 5 passing → **55**; **36 genuine failures uncovered** (§5) |
| 5 | Measured clause **(v)** "no hanging required job/outbox" read-only on two Neon databases | **PASS** on both; `LLEN celery` **unanswerable** off production (§9) |
| 6 | Re-ran the **register / search-manifest audit** and **decided** item B11's criterion | 847 hits, **0 unregistered**; 4 registers still undated → **GATE-13.6-01** (§7) |
| 7 | Ran the **named instruments** of 4.1 and 7.4, whose evidence directories are absent | both green — **18 passed** and **46 passed** — the claims hold, the evidence links do not (§6.1) |

Files changed: **11 backend test files**, all for item 4, all listed in §10.
Nothing was committed. Production was not contacted. Neon was read-only.

---

## 2. The spec validator

`scripts/validate_spec_governance.py` — task 0.2's R1.3 validator, wired into CI
by `.github/workflows/spec-governance.yml`. Raw:
[`raw/spec-governance-validator.txt`](raw/spec-governance-validator.txt),
[`raw/spec-validator-selftests.txt`](raw/spec-validator-selftests.txt).

```
Target:        admissions-v2-canonical-rebuild
Errors: 2  Warnings: 0
[admissions-v2-canonical-rebuild] status=planned reqs=18 findings=71 tasks=73 (checked=71)

ERRORS (block):
  (missing-evidence) task 4.1 is checked but has no linked Required_Evidence at
                     docs/v2-evidence/4.1 (a checklist mark is not evidence)
  (missing-evidence) task 7.4 is checked but has no linked Required_Evidence at
                     docs/v2-evidence/7.4 (a checklist mark is not evidence)
RESULT: FAIL (governance violations present)
EXIT=2
```

**Read the clean rules too, because they are the substance of what did pass.**

| R1.3 rule | verdict | measurement |
|---|---|---|
| 1 — a checked task must carry Required_Evidence | **FAIL** | 71 checked tasks, **2** with no evidence directory (4.1, 7.4); **0** with no `_Evidence:` descriptor |
| 2 — every requirement referenced by a task | **PASS** | 18 requirements, 0 unreferenced |
| 3 — every finding has an owner requirement | **PASS** | 71 findings, 0 unowned |
| 4 — unique live spec IDs, valid `.config.kiro` | **PASS** | 8 live specs, 0 duplicate IDs, 0 invalid JSON (2 informational warnings on *other* specs) |
| 5 — a completed spec has no unchecked tasks | **PASS, vacuously** | status is `planned`, not `completed`. **This rule is the trap 13.6 must not walk into**: writing `"status": "completed"` today turns this PASS into a FAIL naming 13.5 and 13.6 |

### 2.1 The validator's own self-tests fail — 2 of 20

This is worth stating separately, because it means **the CI gate is red right now**
and would stay red on a push:

```
FAIL: RealRepoRegressionTests.test_admissions_v2_spec_passes_all_rules
      AssertionError: V2 governance errors: [4.1 missing evidence, 7.4 missing evidence]

FAIL: RealRepoRegressionTests.test_v2_spec_shape_is_parsed
      AssertionError: 71 != 70          # findings.md gained a finding after 0.2 pinned the count
Ran 20 tests — FAILED (failures=2)
```

The second one is a **pin drift**, not a defect: `findings.md` holds 71 rows and
0.2's regression test asserts 70. The register grew by one finding (**AUTH-07**,
filed by task 2.1's disclosure-policy analysis) after task 0.2 froze the number.
The right fix is to update the pin *when the register is next edited*; 13.6 did
not touch it, because moving another task's assertion to make a gate green is the
exact move this manifest exists to refuse.

The metadata validator (`validate_spec_metadata.py`, task 0.1) is **clean**:
9/9 self-tests pass, repo scan `RESULT: PASS`, exit 0.

---

## 3. Finding traceability — the register

Full table: [`raw/traceability-report.md`](raw/traceability-report.md), generated by
[`raw/traceability.py`](raw/traceability.py), which **imports the blocking
validator's own parsers** so the report and the gate cannot disagree about what a
finding or a task is.

### 3.1 Totals

| | n |
|---|---:|
| findings defined in `findings.md` | **71** |
| — P0 | **29** |
| — P1 | **40** |
| — P2 | **2** |
| findings with **no owner requirement** | **0** |
| findings claimed **only** by a wildcard (`_Findings: all`) task | **0** |
| findings whose owning task(s) are **all** `[x]` | **70** |
| findings with at least one **non-`[x]`** owning task | **1** — GOV-05 (owned by 13.5 `[~]` and 13.6 `[~]`) |

Wildcard tasks, listed rather than silently credited with 71 closures:
`0.3 [x]`, `12.5 [x]`, `13.2 [x]`, `13.5 [~]`, `13.6 [~]`.

### 3.2 Why "70 of 71 have all-`[x]` owners" is **not** "70 findings closed"

This is the single most important sentence in this document.

A checkbox is a statement about a *task*. A finding is closed when the *behaviour*
is fixed. Phase 13 went and looked, and found **register findings whose owning
tasks are `[x]` and whose behaviour is still broken**. The traceability table
above cannot see that, by construction — so here it is, traced to the Phase 13
measurement that contradicts the checkbox:

| register finding | sev | owning task(s) | task state | contradicted by | still open because |
|---|---|---|---|---|---|
| **GOV-04** | **P0** | 0.3–0.5, 13.1 | `[x]` | GATE-13.1-02, GATE-13.1-07 | 86 tests had not run since 9.4 (fixed here, §5, and **36 now fail**); three instruments still write into `docs/v2-evidence/**`, so five tasks' evidence is not immutable |
| **GOV-05** | P1 | 0.1–0.5, 1.2, 3.6, 13.1, **13.5**, **13.6** | `[~]` ×2 | — | its own owning tasks are not complete. The only finding the validator can see as open |
| **STU-23** | P1 | 10.6, 11.x, 13.3 | `[x]` | **GATE-13.3-09** | the canonical `/student/status` route reports "Application Not Found" to a student who owns 2 applications |
| **STU-03 / STU-04 / STU-05 / STU-10 / STU-24** | P1/P2 | 11.1–11.5, 13.3 | `[x]` | **GATE-13.3-01..-06, -10, -11, -15, -16** | 7 sub-44 controls incl. the authenticated mobile header at 40×40 on every route; unlabelled bottom nav at 320 px; raw `TypeError` offline; bottom nav occluding 26.7 % of the dashboard's primary next action |
| **STU-13 / DATA-01** | **P0** | 5.2, 6.4, 7.2, 13.3 | `[x]` | **GATE-13.3-13**, **GATE-13.5-01** | a legally-named long intake 500s every application create; the production-lineage ceiling is **50**, not the 100 the model implies, with 4 characters of headroom |
| **DATA-01 / STU-01** | **P0** | 3.2, 5.2, 6.4, 12.3 | `[x]` | **GATE-13.2-01**, **GATE-13.5-02** | the staff application read still resolves an intake by **display name**, and the production lineage already shares 3 intake names across its 2 active tenants |
| **TEN-09** | P1 | 2.3, 11.5 | `[x]` | **GATE-13.4-01** | a **migration script** seeds all 19 platform-wide communication fallback templates with a legacy tenant's brand; the rehearsal watched one reach a queued email |
| **DATA-07** | P1 | 3.1–3.4, 13.4 | `[x]` | GATE-13.1-01 → **fixed in 13.4** | closed. Recorded so the table is not read as uniformly negative |
| **DATA-10 / DATA-11** | P1/**P0** | 3.5, 8.2, 12.3 | `[x]` | 12.3's own registered exception | the legacy-column *contraction* is blocked behind 16 unbacked money rows, with exit criterion `unbacked_money_rows = 0` |

**So clause (i) — "every P0/P1 finding closed" — fails on at least 6 P0 and 5 P1
register findings**, independently of the 34 GATE findings.

---

## 4. Finding traceability — the 34 Phase 13 GATE findings

Phase 13's five verification bullets filed **34 new findings**. They are real,
mostly unfixed, and **not one of them is in `findings.md`**:

```
Distinct GATE findings mentioned across Phase 13 evidence: 34
GATE findings present in `findings.md`:                     0
```

That is itself a governance defect: R1.3 rule 3 ("a finding has no owner
requirement") is structurally unable to fire for a finding that was never
registered. The register audit says 0 unowned findings **because the register
does not know these exist**. Filed as **GATE-13.6-02** (§7).

### 4.1 The 34, by severity and state

| filing task | id | sev | state | owning lane |
|---|---|---|---|---|
| 13.1 | GATE-13.1-01 | med | **FIXED** (13.4 §5) | tenant lane |
| 13.1 | **GATE-13.1-02** | **high** | **FIXED HERE** (§5) — and it uncovered 36 failures | admin-query lane |
| 13.1 | GATE-13.1-03 | med | open | API-contract lane (1.2 / 1.5) |
| 13.1 | GATE-13.1-04 | med | open — **accepted** (unfixable by re-running: 2 truncated ledger checksums) | data lane |
| 13.1 | GATE-13.1-05 | low | open | data / release / API |
| 13.1 | GATE-13.1-06 | low | **FIXED** (13.4 §6.1) | data-migration lane |
| 13.1 | GATE-13.1-07 | med | open — **five tasks' evidence is not immutable** | harness lane (0.4) + 2.2 |
| 13.2 | **GATE-13.2-01** | **high** | open — and **live on production lineage** (GATE-13.5-02) | admin-query lane |
| 13.2 | GATE-13.2-02 | med | open | capacity lane (5.3 / 9.x) |
| 13.2 | GATE-13.2-03 | med | open — intermittent (2 of 3 recordings) | wizard lane |
| 13.3 | GATE-13.3-01 | **high** | open | shell — `AppLayout.tsx` |
| 13.3 | GATE-13.3-02 | **high** | open | wizard — `EnhancedProgressIndicator.tsx:345` |
| 13.3 | GATE-13.3-03 | **high** | open | design system — `ui/switch.tsx` |
| 13.3 | GATE-13.3-04 | med | open | design system — `ui/ErrorDisplay.tsx:64,109` |
| 13.3 | GATE-13.3-05 | med | open | shell — `DesktopSidebar.tsx:146` |
| 13.3 | GATE-13.3-06 | low | open | wizard — `KeyboardShortcutsHelp.tsx:28` |
| 13.3 | GATE-13.3-07 | med | open — CLS 0.116 @375, 0.105 @390 vs 0.100 budget | dashboard (11.1) |
| 13.3 | GATE-13.3-08 | med | open — heading order `h2→h1`, `h2→h4`, `h1→h3` | dashboard + shell |
| 13.3 | **GATE-13.3-09** | **high** | open — **STU-23 is not closed** | student workspace |
| 13.3 | **GATE-13.3-10** | **high** | open — raw `TypeError` shown to the student offline | wizard/shell |
| 13.3 | **GATE-13.3-11** | **high** | open — 4 bottom-nav links unnamed at R16.1's own 320 px | shell — `BottomNavigation.tsx:221` |
| 13.3 | GATE-13.3-12 | med | open — 9 axe contrast rows | wizard + shell |
| 13.3 | **GATE-13.3-13** | **high** | open — subsumed and tightened by GATE-13.5-01 | applications / data |
| 13.3 | GATE-13.3-14 | med | open — font chain fixed in config, still reduced in the browser | design system — `index.css:51` |
| 13.3 | GATE-13.3-15 | med | open | student workspace — `AmendmentForm.tsx:50,65` |
| 13.3 | **GATE-13.3-16** | **high** | open — 26.7 % occlusion of the primary next action | dashboard or shell |
| 13.4 | **GATE-13.4-01** | **high** | open — 19 MIHAS-branded platform-wide fallback rows | communication / tenancy lane |
| 13.4 | **GATE-13.4-02** | **high** | open — **data-level rollback unproven** | data-migration lane |
| 13.4 | GATE-13.4-03 | med | **FIXED** (13.5 §1) | deploy/runbook lane |
| 13.5 | **GATE-13.5-01** | **high** | open — 3 narrower columns, invisible to the boot gate | data-migration + applications |
| 13.5 | **GATE-13.5-02** | **high** | open — live cross-tenant read | admin-query lane |
| 13.5 | **GATE-13.5-03** | **high** | open — **accepted**, canary redefined as tenant activation | deploy/edge + tenancy |
| 13.5 | GATE-13.5-04 | med | open — 2 tenants exposed at once | operations (a decision) |
| 13.5 | **GATE-13.5-05** | med | open — **first to resolve**; invalidates every HTTP check until settled | deploy/runbook lane |

| state | n |
|---|---:|
| **fixed** | **4** (13.1-01, 13.1-02, 13.1-06, 13.4-03) |
| open — explicitly **accepted** with reasoning | 2 (13.1-04, 13.5-03) |
| **open** | **28** |
| of which **high** | **13** |

Cross-references: [`raw/traceability-report.md`](raw/traceability-report.md) §B
lists which other Phase 13 tasks re-measured each finding — GATE-13.1-02 appears
in **five** of the five bullets, which is why closing it was worth this task's one
code change.

---

## 5. GATE-13.1-02 — fixed, and what fixing it revealed

13.5 §4 classified this *"ACCEPT for the canary — **BLOCK for 13.6**"*, because
13.6 must assert "no required skips" and could not while 86 tests errored at
fixture setup. It was the one blocker in reach, so it was taken.

### 5.1 The defect, restated in one paragraph

Task 9.4 moved `apps/applications/document_views.py` onto the shared
`resolve_scoped_application` seam and dropped its module-level
`AccessScopeService` import. Nine test modules patch
`apps.applications.document_views.AccessScopeService` in an autouse fixture.
**One** of the nine (`test_admin_export_hardening.py`) guards the patch target
with `hasattr`; the other eight did not, so `mock.patch` raised `AttributeError`
**at fixture setup** and every case in those files *errored instead of running*.
Two more modules carried the same defect in different shapes. Total: **86 tests
absent for five consecutive recordings**. `document_views.py` confirmed:
`from apps.common.tenant_authorization import resolve_scoped_application`, no
`AccessScopeService` anywhere.

### 5.2 Baseline, reproduced before touching anything

[`raw/gate-13.1-02-baseline.txt`](raw/gate-13.1-02-baseline.txt) — 12 files, serial,
real Postgres `mihas_localtest` (`127.0.0.1:5433`), Redis `127.0.0.1:6380`,
`test_%` database list verified empty first:

```
14 failed, 5 passed, 1 warning, 72 errors in 7.00s      ← 72 + 14 = 86, exactly GATE-13.1-02
```

The 14 decompose exactly as 13.1 said: **13** in `property/test_application_endpoints.py`
plus **1** in `property/test_interview_status_validation.py`.

### 5.3 The three shapes, and the change made to each

| shape | modules | change |
|---|---|---|
| `targets.append(...)` inside `try/except`, then `ExitStack` | **8** — `test_application_number_generator`, `test_application_review_force_approved`, `test_application_review_payment_gate`, `test_live_500_fixes`, `test_payment_review_reopen`, `test_review_notifications`, `test_student_number_generation`, `test_waitlist` | the **exact `hasattr` guard the ninth module already carried**, plus the reason as a comment. Applied mechanically by [`raw/gate-13.1-02-guard-applied.txt`](raw/gate-13.1-02-guard-applied.txt) after asserting exactly one match per file |
| `with patch(doc), patch(src):` unconditional | 1 — `unit/test_application_endpoints.py` | same guard, expressed as an `ExitStack` over a guarded target list |
| `_SCOPE = "…document_views.AccessScopeService"` used at 13 call sites | 1 — `property/test_application_endpoints.py` | **one line**: `_SCOPE` now names `apps.catalog.services.AccessScopeService` |
| retired authority helpers (`Application.objects.get`, `_staff_can_access_application`) | 1 — `property/test_interview_status_validation.py` | patch the seam that replaced them (`resolve_scoped_application` + `ApplicationReviewWorkspaceService.assert_version`) |

**Why none of these weakens a test, argued rather than asserted.**
`resolve_scoped_application` imports `AccessScopeService` **lazily from
`apps.catalog.services`** (`tenant_authorization.py::_services`). So the canonical
source *is* the live seam. And note what the old code actually did: because the
`ExitStack` died on the **first** target, `apps.catalog.services.AccessScopeService`
was **never patched either**. After the guard it is. The fixture therefore
neutralises **more** than before, not less — so the failures in §5.4 cannot be an
artifact of lost neutralisation. For the interview property test, both the old and
the new patch set neutralise *authority* so that *status validation* is what the
assertion observes; the `400` / `INVALID_STATUS` claim is untouched, and it now
**passes**.

### 5.4 After the fix — and the honest bad news

[`raw/gate-13.1-02-after-fix.txt`](raw/gate-13.1-02-after-fix.txt):

```
36 failed, 55 passed, 1 warning in 2.79s        ← 0 errors
```

| | baseline | after | Δ |
|---|---:|---:|---:|
| **errors (absent tests)** | **72** | **0** | **−72** |
| failures | 14 | 36 | +22 |
| passing | 5 | **55** | **+50** |

Whole tree, serial, same conditions as 13.1 §2
([`raw/backend-whole-tree-after.txt`](raw/backend-whole-tree-after.txt)):

```
13.1:  106 failed, 5133 passed, 104 skipped, 2 xfailed, 1 xpassed, 73 errors   (5419 collected, 524 s)
13.6:  128 failed, 5192 passed, 104 skipped, 2 xfailed, 1 xpassed,  1 error    (5428 collected, 271 s)
```

- **errors 73 → 1.** The one survivor is `property/test_ip_address_column.py`'s
  raw-insert factory against the new `NOT NULL assignment_version` column —
  13.1's cluster **E**, pre-existing, not touched.
- **skipped 104 → 104.** No skip was added, and none was hidden. 33 distinct skip
  reasons, all phase-gated future work.
- **non-passing 179 → 129.**
- Collected differs by 9 because 13.2–13.5 ran after 13.1 and the corpus is no
  longer byte-identical to 13.1's; the run time difference is machine load and
  no conclusion is drawn from it.

**The 36 failures are genuine and they are not mine.** They are what 13.1 §2.3
predicted for cluster **A** (*"9.4's removed patch target, and its downstream
`500 == 403`"*, 83 + 3 = 86). Sampled from the raw output:

| failure | what it asserts | why it fails |
|---|---|---|
| `test_waitlist.py::TestPromotionTriggeredByRejection` | `promote_next('CS', 'Jan 2026')` | task **5.3** replaced string signatures with canonical IDs (R7.6–R7.7) — the code is right, the test encodes the retired signature |
| `test_waitlist.py::TestPromoteNext::test_reindexes_after_promotion` | `reindex_positions('CS', 'Jan 2026')` | actual is `reindex_positions('CS', 'Jan 2026', offering_id=None, intake_id=None)` — same cause |
| `test_review_notifications.py` ×4 | `send('application_rejected', objects.get(), …)` | actual is `objects.all().select_for_update().get()` — 9.4's scoped, locked lookup |
| `test_live_500_fixes.py` ×2 | `admin_user_views.AuditLog` | the same removed-module-level-import class of defect, in a second module |
| `test_application_endpoints.py` ×10, `property/…` ×11 | `200`/`403` from the document/letter/receipt views | `500` — the downstream half of cluster A |

**This is the correct outcome and it is worse news than the error count was.**
An unrun test is not a passing test; a *running, failing* test is a defect
statement. GATE-13.1-02 is closed as a **measurement** hole (item 4 of the
verdict table), and it converts into **B9**: 36 stale assertions in 5 modules
across 2 lanes. Fixing them is those lanes' work — rewriting 36 assertions here
would destroy the attribution that makes them fixable, and this task's own rule
against writing other lanes' code applies to test code too.

---

## 6. The 73-task evidence audit

Full table: [`raw/evidence-audit.md`](raw/evidence-audit.md), generated by
[`raw/evidence-audit.py`](raw/evidence-audit.py).

| | value |
|---|---|
| tasks in `tasks.md` | **73** — 71 `[x]`, 2 `[~]` (13.5, 13.6) |
| evidence directories present | **71** of 73 |
| **absent** | **2 — `4.1`, `7.4`** |
| `[x]` tasks with no `_Evidence:` descriptor line | **0** |
| evidence directories with no matching task | **0** |
| total files under `docs/v2-evidence/` | **1,417** |
| total bytes | **302,432,671** (≈ 302 MB) |

**Eight** directories hold no `README.md` but do hold non-empty artifacts — 0.1,
0.2, 0.3, 1.1, 1.2, 1.3, 2.5, 10.1. The validator requires a non-empty file, not
a README, so that is compliant. Recorded because a reader scanning for READMEs
would otherwise conclude those eight tasks were unevidenced.

### 6.1 The two absent directories — checked, not assumed

Both tasks' `_Evidence:` descriptors name instruments, and **both instruments
exist in the repo and are green today**
([`raw/named-instruments-4.1-7.4.txt`](raw/named-instruments-4.1-7.4.txt),
[`raw/evidence-gap-4.1-7.4.txt`](raw/evidence-gap-4.1-7.4.txt)):

| task | `_Evidence:` names | instrument found | run here |
|---|---|---|---|
| **4.1** | *service/integration tests for every state, retry, and compensation* | `tests/unit/test_tenant_onboarding_service.py`, `tests/integration/test_tenant_onboarding_workflow.py`, `tests/unit/test_scenario_super_admin_onboarding.py` | **46 passed** |
| **7.4** | *grep/import/runtime network guard proving zero admissions AI calls* | `tests/unit/test_no_admissions_generative_ai_guard.py` | **18 passed** |

Neither has an evidence directory anywhere. A search of the repo finds no
alternate location: the only references are `7.2/README.md` line 244 — which
**already flagged 4.1 as a pre-existing gap** — and `docs/ai-data-flows.md`
lines 14 and 178, which point at `docs/v2-evidence/7.4/` as though it existed.
`docs/audits/ai-and-ocr-final.md` exists but is a May-dated audit, not this
task's run record.

**The distinction that matters.** The *claims* hold; the *evidence links* do not.
The spec's own execution rule is *"Do not check a task because code exists. Link
its Required_Evidence under `docs/v2-evidence/<task-id>/`."* A green test file is
code existing. So 4.1 and 7.4 are **checked without evidence**, exactly as the
validator says, and **13.6 did not create their directories** — the 46 and 18
passes above are 13.6's *audit record*, in 13.6's own directory, not a
retroactive evidence pack authored on another task's behalf. Fabricating one
would be the precise failure GOV-02 describes.

---

## 7. The five closure clauses, evaluated separately

### (i) Every P0/P1 finding closed — **FAIL**

| evidence | verdict |
|---|---|
| register: 71 findings, 29 P0 + 40 P1, all owned, 70 with all-`[x]` owners | checkbox-clean |
| §3.2: **6 P0 and 5 P1 register findings contradicted by a Phase 13 measurement** | **FAIL** |
| §4: **28 of 34 GATE findings open, 13 of them high** | **FAIL** |
| 13.5 §4's four BLOCK findings (B3–B6) — none closable by this task | **FAIL** |

### (ii) Every required task evidenced — **FAIL**

| evidence | verdict |
|---|---|
| 71 of 73 evidence directories present, 0 orphans, 0 missing descriptors | mostly clean |
| **tasks 4.1 and 7.4** are `[x]` with **no evidence directory** (§6) | **FAIL** — and it is the blocking validator's own verdict |
| **13.5 is `[~]`**: prepared, never executed. Its `_Evidence:` line names three artifacts; two exist as instruments, the third (**operator sign-off**) is deliberately blank | **FAIL** |
| **13.6's own `_Evidence:` line** — *"final closure manifest and reviewer/operator approvals"* — this document is the manifest; **the approvals do not exist and cannot be produced by an agent** | **FAIL** |
| GATE-13.1-07: three instruments write into `docs/v2-evidence/**`, so five earlier tasks' artifacts are **not immutable** | **weakens every row above** |

### (iii) No required skips — **FAIL** (but materially better than before)

| evidence | verdict |
|---|---|
| 86 tests absent at fixture setup since task 9.4 | **CLOSED HERE** — 0 errors, §5 |
| whole-tree skips **104 → 104**, no skip added, 33 distinct reasons, all phase-gated | clean |
| harness required projects fail on `test.skip` (task 0.4) | clean |
| **36 tests now run and fail** (B9) | **FAIL** — "not skipped" is a floor, not a pass |
| 1 residual setup error (`test_ip_address_column.py`, cluster E) | **FAIL**, pre-existing |
| whole tree: **128 failed / 5192 passed / 1 error**; 52-file selection at 13.1: 33 failed / 809 passed; frontend 1 failed / 4607 passed / 1 skipped over 494 files; lint **15 errors in 13 files**; harness load-limited (218/2/0 then 216/3/1 on byte-identical input) | **FAIL** — a required gate with 128 backend failures and 15 lint errors is not a pass |

### (iv) No unregistered Legacy_Exception — **PASS**, with a named residual

Re-ran 12.5's search manifest / register audit in full
([`raw/register-audit-13.6.txt`](raw/register-audit-13.6.txt)):

```
categories declared : 13        total hits : 847        UNREGISTERED : 0
guards named but missing : none
HALF 5 PASS=True     HALF 5b PASS=True     OVERALL PASS = True (halves 1-3)
HALF 4 PASS=False    (12.3's, source-only — the legacy-column contraction)

register                                           n  own  date  shrink  stale-chk
compatibility_register.COMPATIBILITY_SURFACES      7  yes   yes     yes        yes
module-size-report.DECLINED_REMOVALS               3  yes    NO     yes        yes
architectureEnforcement.LEGACY_EXCEPTIONS          9   NO    NO     yes        yes
canonical_tenant_drift_guard._ALLOWED_PREDICATES  11   NO    NO     yes        yes
documentFlowDriftGuard.PREVIEW_ALLOWLIST           5   NO    NO     yes        yes
legacy-brand-allowlist.allowlist                  19   NO    NO     yes        yes
test_compatibility_surfaces_12_2.SHIMS             6  yes    NO     yes        yes
broken (fails half 5) : none      gaps (reported, not failed): 4 registers
```

**0 unregistered across 847 hits, 60 entries, 7 registers, all shrink-only, all
staleness-checked, every named guard present.** Hit count moved 838 → 847 since
13.1 (category 1 +6, category 13 +3); **13.6's own 11 changed files appear zero
times** in the audit, so the delta belongs to 13.2–13.5, and 0 unregistered holds
before and after.

**Clause (iv) therefore PASSES.**

#### 7.1 Item D — the decision, made here rather than deferred a third time

12.5 §7.4 measured it and reported it. 13.1 §8.1 re-measured it unchanged and
handed 13.6 the question. Here is the answer, in two parts, because the question
conflates two different sentences in `tasks.md`.

**Part 1 — the criterion for clause (iv) is settled: a per-entry dated owner is
NOT required.** 13.6's clause is *"no unregistered Legacy_Exception"*. That is a
statement about **registration**, and registration is measured at 0 unregistered
over 847 hits. Three reasons this is the right reading rather than a convenient
one:

1. The property a removal date is *supposed* to buy — an exception not outliving
   the violation it covers — is bought more cheaply and sooner by a **staleness
   check**, which all 7 registers have. A date says *"this should be gone by
   2027-02-07"*; a staleness check says *"the thing you exempted is already gone,
   delete the exemption"* — and it said exactly that about **three** entries in
   task 12.5 alone.
2. All 7 registers are **shrink-only**, so an undated register cannot grow.
3. A date invented by this task is a commitment nobody made. Task 12.3 §10.1's
   reasoning applies verbatim: *"Naming an individual here would be inventing a
   commitment this task has no standing to make."*

**Part 2 — but 12.5's clause is stricter, is not met, and 12.5 is `[x]`.** Task
12.5's bullet reads *"canonical, test fixture, immutable evidence, or a
registered Legacy_Exception **with owner/removal date**"*. Four registers carry
no per-entry owner and six carry no removal date. So 12.5 is checked on a clause
it self-reported as not fully met. 13.6 will not silently merge the two
sentences, and will not edit another task's checkbox, so it files the residual as
a finding with an owner and an ordered plan:

> **GATE-13.6-01** (med) — *4 of 7 legacy registers carry no per-entry owner and
> 6 of 7 no removal date, while task 12.5's bullet requires a registered
> Legacy_Exception **with owner/removal date**. Task 12.5 is `[x]`.*
> Owner: **admissions-v2** for the two registers it owns; the other two need
> their owning specs' agreement. Ordered work, from 12.5 §7.4:
> (1) `COMPATIBILITY_SURFACES` is the shape to copy — it already has both;
> (2) `SHIMS` needs only a date and its six entries share one owner;
> (3) `LEGACY_EXCEPTIONS` (9) and `PREVIEW_ALLOWLIST` (5) are **admissions-v2's
> own** and can take `platform-admissions` + `2027-02-07` without inventing
> anything — **this is the cheapest real closure and it is this spec's to make**;
> (4) `_ALLOWED_PREDICATES` (11) and the brand allowlist (19) belong to
> `beanola-production-readiness` / `multi-tenant-beanola` / system-alignment-audit
> and need those specs' agreement.

> **GATE-13.6-02** (med) — *all 34 Phase 13 GATE findings are absent from
> `findings.md`, so R1.3 rule 3 ("a finding has no owner requirement") is
> structurally unable to fire for any of them, and rule 3's "0 unowned" is
> measured against a register that does not know they exist.* Owner:
> **admissions-v2 governance (this spec)**. Fix: register the 34 in `findings.md`
> with severity and an owner requirement, then update task 0.2's finding-count
> pin in the same edit (which also clears §2.1's second self-test failure).

Both are recorded here rather than added to `findings.md`, because editing the
register is precisely the act GATE-13.6-02 describes and it should be done once,
deliberately, with the owning requirement chosen — not as a side effect of a
closure audit.

### (v) No hanging required job/outbox — **PASS on what is reachable; NOT MEASURED on production**

13.5 §10 item 5 names the instrument: `canary-dashboard.sql`'s
`s6_outbox_failed`, `s6_outbox_stale`, and `LLEN celery`. Two of the three are SQL
and were run; the third is not a query.

Instrument: [`raw/outbox-clause.sql`](raw/outbox-clause.sql) — 13.5's S6 block plus
its `s6_*` export columns and the beat-sweep liveness proxies. Output:
[`raw/outbox-clause-two-databases.txt`](raw/outbox-clause-two-databases.txt).

| database | what it is | `outbox_total` | `s6_outbox_failed` | `s6_outbox_stale` | beat proxies | verdict |
|---|---|---:|---:|---:|---|---|
| `v2_snap_13_4` | 13.4's restored **production-lineage** snapshot | **347** | **0** | **0** | domain backlog 0 · payment sweep overdue 0 · email wedged 0 · email failed 0 | **PASS — no hanging outbox event** |
| `v2_fresh_13_4` | 13.4's expanded **release** schema | 0 | 0 | 0 | all 0 | PASS (trivially — the ledger is empty) |

**Three honest limits on that PASS, because they change how it reads:**

1. **A snapshot is frozen.** Nothing produces or consumes it, so "nothing is
   stuck" is a weaker statement than the same numbers on a live system. The 347
   rows on the production lineage with 0 pending and 0 failed is nonetheless a
   real measurement on real inherited data.
2. **`LLEN celery` is unanswerable here.** Broker depth is a Redis command against
   a running broker. The only broker whose depth satisfies this clause is
   production's, and production is off limits (`.kiro/steering/infrastructure.md`;
   13.5's own block). An empty result must be read as *"cannot tell"*, never as
   zero — 13.5 §3 says this explicitly for the same signal.
3. **`domain_sweep_last_checked` is NULL on both**, because the production lineage
   has zero `institution_domains` rows (13.5 gate 23 / GATE-13.5-03). So the
   domain-sweep half of the signal has nothing to observe, on either database.

Neon was **read-only** throughout: `SET default_transaction_read_only = on` is the
first statement of the instrument file, branch `br-jolly-pine-ahybtg2e` was
**reused not created**, and the DSN was assembled in-process from `backend/.env`
and never printed — only the public branch/endpoint/project identifiers appear.

### Clause summary

| clause | verdict |
|---|---|
| (i) every P0/P1 finding closed | **FAIL** — 6 P0 + 5 P1 register findings contradicted; 28 of 34 GATE findings open, 13 high |
| (ii) every required task evidenced | **FAIL** — 4.1, 7.4 unevidenced; 13.5 unexecuted; **no operator/reviewer approvals** |
| (iii) no required skips | **FAIL** — 86 absent tests closed here, but 36 now fail, 1 error, 128 whole-tree failures, 15 lint errors |
| (iv) no unregistered Legacy_Exception | **PASS** — 0 unregistered / 847 hits; residual filed as GATE-13.6-01 |
| (v) no hanging required job/outbox | **PASS** on the production lineage and the release schema; `LLEN celery` **not measurable** off production |

**2 PASS, 3 FAIL. The gate does not pass.**

---

## 8. The shortest honest path to a genuine pass

Ordered. **Operator/human steps are separated from lane code steps**, because
mixing them is how a spec ends up waiting on nobody.

### 8.1 Lane code — can start today, no production access needed

| # | work | owner | closes |
|---:|---|---|---|
| L1 | Resolve the intake by **canonical id, not display name** — `student_draft_views.py:185` + 4 siblings (13.2 measured it as one line) | admin-query lane | **B4**, GATE-13.2-01, GATE-13.5-02, DATA-01/STU-01 |
| L2 | Widen `applications.institution/intake/program` to match the model, as an **additive** script under `backend/scripts/`, rehearsed on a scratch database | data-migration lane | **B5**, GATE-13.5-01, GATE-13.3-13, STU-13 |
| L3 | Give `canonical_programs.id` a `gen_random_uuid()` default (13.5 §4.1's preferred fix — it also repairs every other database of this lineage), then re-run gate 22 on `v2_snap_13_4` | data-migration lane | **B6**, GATE-13.4-02, and it makes data-level rollback *provable* |
| L4 | Fix the **36 stale assertions** the guard uncovered — canonical-ID signatures in `test_waitlist`, the scoped/locked lookup in `test_review_notifications`, `admin_user_views.AuditLog` in `test_live_500_fixes`, the `500` downstream in both `test_application_endpoints` | admin-query + capacity lanes | **B9** |
| L5 | `/student/status` must show a student their 2 applications | student-workspace lane | **B7**, GATE-13.3-09, STU-23 |
| L6 | 44 px targets (7 controls), bottom-nav accessible names at 320 px, the 26.7 % occlusion, the offline `TypeError`, CLS ≤ 0.100, heading order, the font chain, 9 contrast rows | shell / wizard / design-system / dashboard lanes | **B8**, GATE-13.3-01..-16, STU-03/04/05/10/24 |
| L7 | Make the 19 platform-wide communication fallback templates **brand-neutral** in the migration script | communication / tenancy lane | GATE-13.4-01, TEN-09 |
| L8 | Stop the three instruments writing into `docs/v2-evidence/**` | harness lane (0.4) + 2.2 | GATE-13.1-07, and it restores GOV-04's immutability |
| L9 | Register the 34 GATE findings in `findings.md` with severity + owning requirement, and update 0.2's count pin in the same edit | **this spec's governance** | **GATE-13.6-02**, and §2.1's second self-test failure |
| L10 | Add `platform-admissions` + a removal date to `LEGACY_EXCEPTIONS` (9) and `PREVIEW_ALLOWLIST` (5); add a date to `SHIMS` (6) | admissions-v2 | most of **GATE-13.6-01** |
| L11 | Record 4.1's and 7.4's own runs under `docs/v2-evidence/4.1/` and `7.4/` — the instruments are green (§6.1), only the run record is missing | tenant-onboarding lane, de-AI lane | **B10**, and it turns the blocking validator green |
| L12 | Clear the 15 frontend lint errors in 13 files | frontend lanes | clause (iii) |

**When L1–L12 are done the blocking validator is green and clause (iii) is
arguable.** Clauses (i) and (ii) still need §8.2.

### 8.2 Operator / human — nothing here can be done by an agent

| # | work | who |
|---:|---|---|
| **O1** | **Settle GATE-13.5-05 first**: is production `*.beanola.com` or `*.mihas.edu.zm`? Until this is answered every HTTP check in the post-deploy proof aims at a possibly-wrong host and a green smoke run is meaningless | platform operator |
| O2 | Close the second tenant's intakes so exactly one institution has `open_intakes > 0` (GATE-13.5-04); confirm with 13.5 preflight gate 24 | operations |
| O3 | Take a backup (`deploy/backup-db.sh`), confirm non-empty, record the R2 key + both rollback anchors in `sign-off.md` Part 0 | deploy operator |
| O4 | Run 13.5 §6 block A — the read-only pre-flight, 28 gates across four files, ~1 minute | deploy operator |
| O5 | Deploy by the repo's own path (`.github/workflows/deploy.yml`); record both image SHAs | deploy operator |
| O6 | Run the post-deploy proof (`post-deploy-smoke.sh http` and `on-box`) plus the four manual checks — **M1, the two-tab autosave probe, three times** | deploy operator |
| O7 | Sample `canary-dashboard.sql` at cutover, +15 min, +1 h, +24 h into `sign-off.md` Part 3. **This is where `LLEN celery` finally gets an answer** (clause (v)) | deploy operator |
| O8 | Decide hold / broaden / roll back (13.5 §5), then sign `sign-off.md` Part 4 | deploy operator **and** a canary reviewer who is not the operator |
| O9 | Promote `backend/scripts/2026_08_09_01_application_tracking_secret.sql` (task 10.5 — proven on a Neon branch, never promoted) | operator, backup-first |
| O10 | Re-run **this** task after O1–O9: the validator, the traceability report, all five clauses | whoever owns closure |

**Only after O10 returns 5/5** may `"status": "completed"` be written to
`.config.kiro`, `docs/canonical-truth-map.md` be updated, and 13.6 be marked
`[x]`.

---

## 9. What was changed, and what was deliberately left alone

### 9.1 Changed — 11 files, all for GATE-13.1-02, all test-only

| file | change |
|---|---|
| `backend/tests/unit/test_application_number_generator.py` | `hasattr` patch-target guard |
| `backend/tests/unit/test_application_review_force_approved.py` | same |
| `backend/tests/unit/test_application_review_payment_gate.py` | same |
| `backend/tests/unit/test_live_500_fixes.py` | same |
| `backend/tests/unit/test_payment_review_reopen.py` | same |
| `backend/tests/unit/test_review_notifications.py` | same |
| `backend/tests/unit/test_student_number_generation.py` | same |
| `backend/tests/unit/test_waitlist.py` | same |
| `backend/tests/unit/test_application_endpoints.py` | same guard, `ExitStack` form |
| `backend/tests/property/test_application_endpoints.py` | `_SCOPE` → the canonical lazily-imported seam (one line) |
| `backend/tests/property/test_interview_status_validation.py` | patch the seam that replaced two retired helpers |

No production code, no configuration, no schema, no migration, no other task's
evidence directory. Verified:
`manage.py check` → **System check identified no issues (1 silenced), exit 0**,
run with the real `backend/.env`, **no `TESTING=1`** and **no substituted
`REDIS_URL`** (both produce a spurious `django_ratelimit.E003`); `py_compile`
clean on all 11
([`raw/django-check-and-compile.txt`](raw/django-check-and-compile.txt)).

### 9.2 Deliberately left alone

Every one of these belongs to another lane, and fixing it here would destroy the
attribution that makes it fixable:

`authPageFormMarkup.test.tsx` (11 recordings) · the 15 lint errors in 13 files ·
`tenant-launch.spec.ts:139` ×2 · the 14 task-9.2 perf-golden divergences ·
`test_view_auth_classification.py`'s 38 unclassified + 3 unclassified public
endpoints · `ocr-manual-fallback.spec.ts:146` (intermittent) ·
`design-system-defluff.spec.ts:664` (30 s timeout, not an axe violation) ·
`bun run validate:tailwind` exit 127 · `test_rollback_safe_operations.py`'s 2
assertions (26 statements in 9 other lanes' files) ·
`property/test_ip_address_column.py`'s remaining setup error (cluster E) · **the
36 failures the guard uncovered** (§5.4 — B9, and the reason is argued there) ·
`findings.md` · task 0.2's finding-count pin · every other task's checkbox ·
`docs/canonical-truth-map.md` · `.config.kiro`.

### 9.3 Untracked repo state the orchestrator must resolve

`git status` at commit `bae29a28d` shows the **entire V2 body of work is
uncommitted** ([`raw/git-state.txt`](raw/git-state.txt)). Three items need a
decision, and 13.6 committed nothing:

| item | what it is |
|---|---|
| a repo-root file literally named `=== schema hash (sha256 of regenerated OpenAPI) ===` | 41 bytes, containing `bae29a28d9657f288b3339062adb31285959c966` — the **HEAD commit SHA, not a schema hash**. A shell redirect that captured its own heading. Safe to delete; recorded rather than deleted, because deleting untracked files is not this task's call |
| `backend/schema/openapi.v2.candidate.yaml` | 684,758 bytes, untracked. The candidate contract the release fingerprint refers to |
| `apps/admissions/src/generated/api.d.ts` (+ `index.ts`) | 954,994 bytes, untracked. Task 1.5's generated client |

Release identity for the record: fingerprint `19c5216bb175de41…` (89 tables, 44
migrations); OpenAPI SHA-256
`35fe05d4cd3fa69ddfa9b0f0b3f9370c4649fa83b8258f29dc9100231cc3ef58`, 22,135 lines.

### 9.4 One inconsistency found while auditing, reported not fixed

`docs/v2-evidence/13.5/README.md` states *"The checkbox in `tasks.md` is
therefore **`[-]`**, not `[x]`."* The actual character in `tasks.md` line 732 is
**`[~]`** (not started), not `[-]` (in progress). The validator treats both as
not-complete so no gate changes, but the evidence and the tasks file disagree by
one character. 13.6 did not edit 13.5's checkbox or its README.

---

## 10. What is NOT claimed here

1. **The spec is not closed, and this document does not close it.** No
   `"status": "completed"` was written; `docs/canonical-truth-map.md` was not
   touched; 13.6 is `[-]`, not `[x]`.
2. **Production was not contacted in any way** — no SSH, no query, no write, no
   deploy, no restart, no migration. The `.pem` was not read.
3. **There are no reviewer or operator approvals.** This bullet's `_Evidence:`
   line asks for them and they do not exist. `13.5/sign-off.md` Part 4a/4b are
   blank rule lines. An agent-asserted approval would be worse than none, so the
   requirement is stated as unmet rather than quietly dropped.
4. **Clause (v) was not measured on production.** It was measured on 13.4's
   restored production-lineage snapshot and the release schema — a *frozen*
   ledger — and `LLEN celery` was not measured anywhere. §7 (v) lists all three
   limits.
5. **GATE-13.1-02 is closed as a measurement hole, not as a green suite.** The 86
   tests run; **36 of them fail**. Anyone reading "GATE-13.1-02 fixed" as "those
   tests pass" is reading it wrong, and §5.4 exists to prevent that.
6. **The 36 failures were not fixed, and nor were any of the other lanes'
   failures** (§9.2). They are attributed, with the failing assertion and its
   cause, and handed over.
7. **The 34 GATE findings were not registered in `findings.md`** and the severity
   classification in §4 is read from each filing task's own table, not
   re-adjudicated here.
8. **`docs/v2-evidence/4.1/` and `7.4/` were not created.** Their instruments were
   *run* by this audit and are green; that is 13.6's record, not their evidence.
9. **Nothing was committed**, and the untracked files in §9.3 were left in place.
10. **No number was carried forward without a citation.** The frontend
    (1 failed / 4607 passed / 1 skipped, 494 files), lint (15 errors, 13 files),
    52-file selection (33 failed / 809 passed) and harness (218/2/0 then 216/3/1)
    figures are **13.1's**, cited as 13.1's, and were not re-derived here. The
    backend whole-tree number **was** re-measured (§5.4).
11. **The register hit-count delta 838 → 847 is not attributed to a cause beyond
    "13.2–13.5 ran in between"**; what *was* verified is that 13.6's 11 changed
    files appear **zero** times in the audit, and that 0 unregistered holds on
    both sides.

---

## 11. State left behind

| item | state |
|---|---|
| **production Postgres / EC2** | **never contacted** — no SSH, no query, no write, no deploy |
| Neon **default** branch | **not touched**, not even read |
| Neon rehearsal branch `br-jolly-pine-ahybtg2e` | **read only** — `SET default_transaction_read_only = on` is the first statement of the instrument; branch **reused, not created** (the project is at its branch cap) |
| 13.4's three scratch databases | **left in place** — `v2_fresh_13_4`, `v2_batch_13_4`, `v2_snap_13_4`. `v2_snap_13_4` is the **only reproduction of GATE-13.4-02 that exists**; the drop statements in 13.4 §11 were **not** run |
| local test stack | `mihas-localtest` Postgres 16 (`127.0.0.1:5433`) + Redis (`127.0.0.1:6380`) started for the test runs; `test_%` database list verified **empty** both before starting and after finishing; all runs **serial** (12.1 §15.1: a concurrent run yields a spurious `DuplicateDatabase` and silently un-runs tests). Both containers **stopped** afterwards — `stop`, deliberately **not** `down -v`, so no volume was wiped |
| git | **nothing committed, nothing staged.** Branch `main` at `bae29a28d` with the V2 tree dirty. §9.3 lists the untracked items needing a decision |
| `tasks.md` | **only 13.6's checkbox and its nested evidence bullets** were edited. No other task's state was touched |
| `findings.md`, `.config.kiro`, `docs/canonical-truth-map.md` | **unchanged** |
| other tasks' `docs/v2-evidence/**` | **read, never written** |
| secrets | no DSN, password, token or key appears in this directory. The Neon connection string was assembled in-process from `backend/.env`, never printed; only public branch/endpoint/project identifiers appear |

---

## 12. To whoever reads this next

Four things, in the order they will matter to you.

1. **Do not close this spec until §8.2 O10 returns 5 of 5.** The gate is
   mechanically checkable: `python3 scripts/validate_spec_governance.py` must exit
   0, and clauses (i)–(v) must each be re-argued against fresh measurements. If
   you write `"status": "completed"` before that, rule 5 of the validator will
   fail and name 13.5 and 13.6 — the spec's own gate will catch you, which is the
   best evidence that task 0.2 did its job.
2. **The single cheapest thing that turns the blocking validator green is L11** —
   two evidence directories recording runs that already pass (§6.1). It is also
   the one most tempting to fake. Don't: have those two lanes record their own
   runs. A directory written by the closure audit on another task's behalf is the
   exact shape of GOV-02.
3. **B3 (GATE-13.5-05) is first, and it costs one answer.** Every HTTP check in
   the post-deploy proof aims at a hostname two repo documents disagree about. A
   green smoke run against the wrong host is worse than no smoke run, because
   someone will believe it.
4. **The most valuable sentence in this document is in §5.4**, and it generalises:
   *an unrun test is not a passing test, and a running failing test is better
   news than an absent one.* Un-blocking 86 tests moved the whole-tree error
   count from 73 to 1 and the failure count from 106 to 128. The second number
   going up is the spec working. Anyone who would rather have the 73 errors back
   has misunderstood what this spec was for.

The credit this spec has earned comes from 71 tasks closed on measured evidence
and five verification bullets that filed 34 findings against their own lanes
rather than declaring victory. Spending that credit on a false "complete" here
would have been the only unrecoverable mistake available. It was not spent.

---
---

# PART II — SECOND CLOSURE PASS (§8.2 item **O10**)

Run **2026-08-14**, after all twelve remediation lane items **L1–L12** closed or
partly closed. Everything above this line is the **first pass** and was not
rewritten: it is the record of what the gate read *before* remediation, and the
contrast is the point. New artifacts live under
[`raw/pass2/`](raw/pass2/).

## THE VERDICT: STILL NOT CLOSED

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  ADMISSIONS V2 CANONICAL REBUILD — FINAL GATE, SECOND PASS: **FAIL**      │
  │                                                                          │
  │  Closure clauses:      3 of 5 PASS · 2 FAIL      (was 2 PASS · 3 FAIL)   │
  │  Blocking items:       **3**                     (was 11)                │
  │  Spec status:          left at "planned" — NOT set to "completed"         │
  │  Canonical truth map:  UNCHANGED — V2 is not relabelled as shipped        │
  │  tasks.md 13.6:        [-]  (in progress) — NOT [x]                       │
  │                                                                          │
  │  The two failing clauses fail on the SAME ROOT CAUSE, and it is not code: │
  │    (ii)  13.5 was never executed and `13.5/sign-off.md` is WHOLLY         │
  │          UNSIGNED, while this bullet's own `_Evidence:` line requires     │
  │          "reviewer/operator approvals" an agent must not produce          │
  │    (i)   the P0/P1 findings that remain open remain open BECAUSE the      │
  │          fixes for them are rehearsed on `v2_snap_13_6` and have not      │
  │          been applied to production                                      │
  │                                                                          │
  │  Everything a lane could do IS DONE. What is left costs an operator       │
  │  one answer (O1) and one deploy window (O3–O8).                          │
  └──────────────────────────────────────────────────────────────────────────┘
```

### The 11 blocking items, re-measured

| # | first pass | now |
|---:|---|---|
| **B1** | 13.5 never executed | **STILL OPEN — operator only.** No deploy happened; nothing here can change that |
| **B2** | `sign-off.md` wholly unsigned | **STILL OPEN — operator + a second reviewer.** Re-read directly: Part 4a and 4b are blank rule lines, 4c's three boxes are unticked. `md5sum dae18daf72850f995d1a7bd3a532cec8`, mtime `2026-08-12 23:14` — **not touched by this pass** |
| **B3** | GATE-13.5-05, `beanola.com` vs `mihas.edu.zm` | **STILL OPEN — operator O1, and still first.** It costs one answer, and every HTTP check in the post-deploy proof depends on it |
| B4 | GATE-13.2-01 / -13.5-02, live cross-tenant capacity read | **CLOSED** by L1-L4 §2 |
| B5 | GATE-13.5-01, three `varchar(50)` columns | **CLOSED** by L2-L3 §3 — *on the rehearsal lineage* |
| B6 | GATE-13.4-02, data-level rollback unproven | **CLOSED** by L2-L3 §1–2 — *on the rehearsal lineage*. It was **two** defects; the second is GATE-13.6-03 |
| B7 | GATE-13.3-09, `/student/status` | **CLOSED** by L5-L6 §1 |
| B8 | the mobile / a11y cluster | **CLOSED** by L5-L6 §1–§6 — 14 of 15; the 15th is GATE-13.3-13 |
| B9 | the 36 backend failures the guard uncovered | **CLOSED** by L1-L4 §3 (`91 passed / 0 failed`) |
| B10 | 4.1 and 7.4 unevidenced | **CLOSED** by L9-L11 §5 — and it turned the blocking validator green |
| B11 | GATE-13.6-01, register owners/dates | **PARTLY CLOSED** by L9-L11 §4 — 3 registers dated; residual is 2 other specs' plus `DECLINED_REMOVALS`' deliberate exemption |

**8 closed, 1 partly closed, 3 open — and all 3 open ones are B1, B2, B3.**

---

## 14. What this pass did

Measurement only. **Nothing was remediated**: the 94 backend failures, the 1
error and the 1 frontend failure are other lanes'.

| # | action | result |
|---|---|---|
| 1 | Re-ran the **spec validator** and its self-tests | **exit 0, 0 errors, 0 warnings**; **Ran 20 tests — OK** ([`raw/pass2/01`](raw/pass2/01-spec-governance-validator.txt), [`02`](raw/pass2/02-spec-governance-selftests.txt)) |
| 2 | Re-ran the **metadata validator** (task 0.1) | `RESULT: PASS`, exit 0, 9/9 self-tests ([`raw/pass2/03`](raw/pass2/03-spec-metadata-validator.txt)) |
| 3 | Re-ran **finding traceability** over the 71 register findings | unchanged: 29 P0 / 40 P1 / 2 P2, 0 unowned, 1 with a non-`[x]` owner ([`raw/pass2/04`](raw/pass2/04-traceability-report.md)) |
| 4 | Built a **second traceability report over the 39 registered GATE findings** — the population that did not exist at the first pass | 39 of 39 registered, 0 unowned, **26 fixed + 1 fixed-on-the-rehearsal-lineage**, 12 not plain-fixed, **3 high** among them ([`raw/pass2/05`](raw/pass2/05-gate-register-traceability.md)) |
| 5 | Re-ran the **73-task evidence audit** | **73 of 73** present (was 71), 0 orphans, 0 missing descriptors, 1,833 files / ≈ 494 MB ([`raw/pass2/06`](raw/pass2/06-evidence-audit.md)) |
| 6 | Re-ran **12.5's register audit** | **866 hits, 0 UNREGISTERED**, half 5 PASS, half 5b PASS, halves 1–3 PASS ([`raw/pass2/07`](raw/pass2/07-register-audit.txt)), with the 874 → 866 delta attributed line by line ([`08`](raw/pass2/08-register-audit-hit-delta.txt)) |
| 7 | Re-measured **clause (v)** read-only on `v2_snap_13_6` | **PASS** — 347 outbox rows, 0 pending, 0 failed, 0 stale; beat proxies all 0 ([`raw/pass2/09`](raw/pass2/09-outbox-clause-v2_snap_13_6.txt)). `LLEN celery` still **unanswerable** off production |
| 8 | Re-ran the **whole tree, serially** | backend **94 failed / 5278 passed / 103 skipped / 2 xfailed / 1 xpassed / 1 error** ([`raw/pass2/10`](raw/pass2/10-backend-whole-tree.txt)); lint **0 errors, exit 0** and type-check exit 0 ([`11`](raw/pass2/11-frontend-lint-and-type-check.txt)); frontend **1 failed / 4619 passed / 1 skipped over 495 files** ([`12`](raw/pass2/12-frontend-whole-suite.txt)) |
| 9 | Applied the **`findings.md` state updates** the batches deferred, including **two corrections upward** | §17 |

Files changed: `findings.md`, `tasks.md` (13.6's checkbox and bullets only), this
README (**appended**), and `raw/pass2/`. Nothing committed. Production not
contacted. Neon read-only on the reused rehearsal branch.

---

## 15. The gate, instrument by instrument

### 15.1 The spec validator is green, and so are its own self-tests

```
Target:        admissions-v2-canonical-rebuild
Errors: 0  Warnings: 0
[admissions-v2-canonical-rebuild] status=planned reqs=18 findings=71 tasks=73 (checked=71)
RESULT: PASS
EXIT=0

Ran 20 tests in 0.063s
OK
```

The first pass read **exit 2, 2 errors**, and **2 of 20** self-tests failing.
L9-L11 closed both: item L11 recorded 4.1's and 7.4's own runs, and item L9 moved
task 0.2's finding-count pin from 70 to the 71 the register actually holds.
Both were re-run here **after** this pass's own `findings.md` edits, so the green
result is a statement about the tree as it now stands, not as L9-L11 left it.

| R1.3 rule | first pass | now | measurement |
|---|---|---|---|
| 1 — a checked task must carry Required_Evidence | **FAIL** (2) | **PASS** | 71 checked tasks, **0** with no evidence directory, **0** with no `_Evidence:` descriptor |
| 2 — every requirement referenced by a task | PASS | **PASS** | 18 requirements, 0 unreferenced |
| 3 — every finding has an owner requirement | PASS | **PASS** *over the 71 it can parse* | see GATE-13.6-04 below |
| 4 — unique live spec IDs, valid `.config.kiro` | PASS | **PASS** | 8 live specs, 0 duplicate IDs, 0 invalid JSON |
| 5 — a completed spec has no unchecked tasks | PASS, vacuously | **PASS, still vacuously** | status is `planned`. **This is still the trap**: writing `"status": "completed"` today turns this PASS into a FAIL naming 13.5 and 13.6 |

**Rule 3's green is narrower than it looks, and that is registered.** The
validator recognises a finding id only as `[A-Z]{2,6}-\d+`
(`_FINDING_ROW_RE` at `scripts/validate_spec_governance.py:91`), which a **dotted**
`GATE-13.1-01` does not match. Demonstrated rather than asserted, by importing the
real module ([`raw/pass2/05`](raw/pass2/05-gate-register-traceability.md) §D3):

```
vsg.parse_findings() count      : 71      <- 'finding_count' the gate prints
dotted rows the grammar parses  : 0 of 39
dotted ids owned by a `_Findings:` line : 0 of 39
register total, documented      : 71 parsed + 39 documental = 110
```

So the 39 are registered **documentally, not mechanically** — a reader gets an
answer from `findings.md`; rule 3 cannot fire over any of them. That is
**GATE-13.6-04**, filed by L9-L11 and deliberately left open, because closing it
needs the grammar widened **and** `requirements.md`'s `_Findings:` lines extended
in one edit, and that is the requirements author's decision. Widening the grammar
alone would turn the blocking CI gate red with 39 unowned findings.
**This pass did not edit the validator.** Making a gate pass by editing the thing
that measures it is the one move this manifest exists to refuse.

### 15.2 Finding traceability — both populations

**Population 1, the register (71 findings).** Unchanged from the first pass, and
that is expected: no register *row* was added, only states were updated.

| | n |
|---|---:|
| findings defined in `findings.md` | **71** — P0 **29**, P1 **40**, P2 **2** |
| findings with **no owner requirement** | **0** |
| findings claimed **only** by a wildcard task | **0** |
| findings whose owning task(s) are **all** `[x]` | **70** |
| findings with at least one **non-`[x]`** owning task | **1** — GOV-05 (owned by 13.5 `[~]` and 13.6 `[-]`) |

**Population 2, Phase 13's GATE findings (39).** This population did not exist in
the register at the first pass — 13.6 §4 measured *"GATE findings present in
`findings.md`: 0 of 34"* and filed it as GATE-13.6-02. L9-L11 registered **39**
(the 34 the first pass could see, plus GATE-13.1-08 resolving an id collision,
GATE-13.6-03, GATE-13.6-04, and two the remediation batches surfaced).

| state | n | which |
|---|---:|---|
| **fixed** | **26** | 13.1-01, -02, -06, **-07** · 13.2-01 · 13.3-01…-12, -14, -15, -16 · 13.4-02, -03 · 13.5-01, -02 · 13.6-02, -03 |
| **fixed on the rehearsal lineage (NOT applied to production)** | **1** | 13.4-01 |
| **open** | **8** | 13.1-03, -04, -05 · 13.2-02, -03 · 13.5-04, -05 · 13.6-04 |
| open — **accepted** with reasoning | 2 | 13.1-08 (truncated ledger checksums) · 13.5-03 (a host-scoped canary this stack cannot serve) |
| open — **one half fixed** | 1 | 13.3-13 |
| **partly fixed** | 1 | 13.6-01 |
| | **39** | |

| severity | n |
|---|---:|
| high | **16** |
| med | **20** |
| low | **3** |

Cross-check, so neither population is taken on trust: **39 distinct GATE ids are
mentioned** across 13.1–13.6 and the six remediation READMEs, **39 are
registered**, **0 mentioned-but-unregistered**, **0 registered-but-unmentioned**,
**0 rows with no owner requirement of record**.

`high` findings **not** in a plain `fixed` state: **3** — GATE-13.3-13,
GATE-13.4-01, GATE-13.5-03. The first pass's figure was **13 high open of 34**.

### 15.3 The 73-task evidence audit

| | first pass | now |
|---|---|---|
| tasks in `tasks.md` | 73 — 71 `[x]`, 2 not complete | **73** — 71 `[x]`, 13.5 `[~]`, 13.6 `[-]` |
| evidence directories present | **71** of 73 | **73 of 73** |
| **absent** | **2 — `4.1`, `7.4`** | **0** |
| `[x]` tasks with no `_Evidence:` descriptor | 0 | **0** |
| evidence directories with no matching task | 0 | **0** |
| total files / bytes under `docs/v2-evidence/` | 1,417 / 302 MB | **1,833 / 494,779,836 B (≈ 494 MB)** — the audit counts this pass's own `raw/pass2/` artifacts, so the figure grew by 6 files while the run was in progress |

Still **eight** directories hold no `README.md` but do hold non-empty artifacts —
0.1, 0.2, 0.3, 1.1, 1.2, 1.3, 2.5, 10.1 — the same eight, and still compliant:
the validator requires a non-empty file, not a README.

### 15.4 The register audit — 866 hits, 0 unregistered

```
categories declared : 13        total hits : 866        UNREGISTERED : 0
guards named but missing : none
HALF 5 PASS=True     HALF 5b PASS=True     OVERALL PASS = True (halves 1-3)
HALF 4 PASS=False    (12.3's, source-only — the legacy-column contraction)

register                                           n  own  date  shrink  stale-chk
compatibility_register.COMPATIBILITY_SURFACES      7  yes   yes     yes        yes
module-size-report.DECLINED_REMOVALS               3  yes    NO     yes        yes
architectureEnforcement.LEGACY_EXCEPTIONS          0  yes   yes     yes        yes
canonical_tenant_drift_guard._ALLOWED_PREDICATES  11   NO    NO     yes        yes
documentFlowDriftGuard.PREVIEW_ALLOWLIST           5  yes   yes     yes        yes
legacy-brand-allowlist.allowlist                  19   NO    NO     yes        yes
test_compatibility_surfaces_12_2.SHIMS             6  yes   yes     yes        yes
broken (fails half 5) : none      gaps (reported, not failed): 2 registers
```

Three things moved since the first pass's `847 / 4 gaps`:

1. **`LEGACY_EXCEPTIONS` is now 0 entries** — L12 fixed all 9 exempted sites in
   code rather than re-dating them, and left the register in place with its owner
   and window so the guard still has a subject.
2. **`PREVIEW_ALLOWLIST` and `SHIMS` are dated** (L10), so the audit's `gaps` list
   went 4 → **2**.
3. **Hit count 847 → 874 (L10) → 866 (here).** The −8 is attributed line by line
   in [`raw/pass2/08`](raw/pass2/08-register-audit-hit-delta.txt): **34 lines gone,
   26 new**, and every one of them is in a file **L12** moved — the dev hooks, the
   wizard submission/payment/submit steps, `PaymentCallback`, `Dashboard`, the two
   `architectureEnforcement` registers, plus L12's new `services/sessionProbe.ts`.
   Almost all are line-number shifts in the same files. `UNREGISTERED` is **0** on
   both sides and both halves PASS on both sides.

The two remaining `gaps` are `_ALLOWED_PREDICATES` (11) and
`legacy-brand-allowlist.allowlist` (19) — **other specs' registers**
(`beanola-production-readiness` / `multi-tenant-beanola` / system-alignment-audit)
— plus `DECLINED_REMOVALS` (3), which L10 left undated **on purpose**: a *declined
removal* is a decision not to delete, and a removal date would assert the
opposite.

---

## 16. The five clauses, evaluated separately

### (i) Every P0/P1 finding closed — **FAIL**

The clause is stated over **P0/P1**, so it is argued through the **register**
findings, with the GATE rows as their evidence. Eight of the eleven contradictions
the first pass recorded are cleared.

| register finding | sev | first pass | now |
|---|---|---|---|
| **DATA-01 / STU-01** | **P0** | contradicted by GATE-13.2-01, GATE-13.5-02 — a **live** cross-tenant capacity read | **cleared** (L1-L4 §2). Five reads resolve by canonical id, fail closed when it is absent, 7-test two-tenant reproduction green. Gate 21's *data* half — 3 intake names still shared across the 2 active institutions — is the tenancy lane's |
| **STU-13** | **P0** | contradicted by GATE-13.3-13, GATE-13.5-01 | **partly cleared.** The production-lineage half is fixed (L2-L3 §3: width probe 3 narrower → 0, long-value writes 4 failing → 0). **GATE-13.3-13's own 113-character input still 500s** against `Application.intake`'s `max_length=100` |
| **STU-23** | P1 | contradicted by GATE-13.3-09 | **cleared** (L5-L6 §1) |
| **STU-03/04/05/10/24** | P1/P2 | contradicted by 13.3's 16-finding set | **cleared** for the 14 measured (L5-L6): smallest target 18×24 → **44×44**, sub-44 offenders 214 → **0**, axe `link-name` 16 → 0 and contrast 24 → 0, CLS 0.116/0.105 → 0.041/0.036, occlusion 26.7 % → **0 %**, fonts 3 → 11 |
| **TEN-09** | P1 | contradicted by GATE-13.4-01 | **contradiction cleared** (L7-L8 §1–§4): gate 19 reads 33/33/**0** on `v2_snap_13_6`, an end-to-end render probe carries a legacy brand **0** times where the reproduced pre-L7 text carries it **81** times across 31 keys. **The finding is not closed** — the migration has not reached production |
| **GOV-04** | **P0** | contradicted by GATE-13.1-02 **and** GATE-13.1-07 | **immutability limb cleared** (L7-L8 §5: 4 of 4 mechanisms). Measurement limb cleared for the 86 absent tests and the 36 they uncovered. **Still open on its own exit criterion**: the whole tree shows **94 failures and 1 error** |
| **DATA-10 / DATA-11** | P1/**P0** | 12.3's registered exception | **unchanged** — blocked behind 16 unbacked money rows, exit criterion `unbacked_money_rows = 0` |

**Still open, and why the clause fails.** Beyond GOV-04's exit criterion and
DATA-10/11, twelve of the 39 GATE findings are not in a plain `fixed` state and
three of those are `high`:

| still open | why the clause cannot pass |
|---|---|
| **GATE-13.3-13** (high, one half fixed) | a legally-named 113-character intake **still 500s** every application create. Needs a model change **plus** a matching widen — and the widen itself is only rehearsed |
| **GATE-13.4-01** (high, rehearsal-only) | the brand-neutral fallback is proven on a copy of the production lineage and **has not been applied to production**. 12 of the 31 branded rows exist only there |
| **GATE-13.5-03** (high, accepted) | a host-scoped canary tenant is not servable by this stack; the canary was redefined as tenant activation and the finding kept |
| GATE-13.2-02, -13.2-03 (med) | `SEAT_STATUSES` omits `enrolled`; a stale tab reverted a newer draft write |
| GATE-13.1-03, -04, -05 (med/low) | the SQLite-defaulting type generator; 8 reviewers against a cap of 3; three drifted registries — the migration-report half has now **grown to 6** omitted scripts |
| GATE-13.1-08 (med, accepted) | 2 truncated `migration_history` checksums, unfixable by re-running anything |
| **GATE-13.5-04, -13.5-05** (med) | **operator steps O2 and O1.** O1 is still first and still costs one answer |
| GATE-13.6-01 (partly), **-13.6-04** (open) | two other specs' registers; and the validator's grammar cannot parse a dotted id |

**And the sentence that decides this clause.** *A schema or data fix rehearsed on
`v2_snap_13_6` is not applied to production.* **L2** (the three widened columns),
**L3** (the migration-runner fix and the `gen_random_uuid()` default) and **L7**
(the brand-neutral fallback) are all in that state — additive, idempotent,
rollback-paired, boot-gate-clean, and **not yet run against the real database.**
Until an operator runs them backup-first, the production behaviour STU-13 and
TEN-09 describe is unchanged. Calling those findings closed today would be exactly
the checkbox-for-behaviour substitution §3.2 was written to expose.

### (ii) Every required task evidenced — **FAIL**

| evidence | first pass | now |
|---|---|---|
| evidence directories | 71 of 73, **4.1 / 7.4 absent** | **73 of 73** — L9-L11 §5 recorded both tasks' own runs, and each pack is labelled a *retrospective record* |
| the blocking validator's own verdict | **FAIL, exit 2** on exactly those two | **PASS, exit 0** |
| GATE-13.1-07 — evidence not immutable | 3 instruments, 5 victims | **FIXED**, and **4** mechanisms not 3 (§17). **Independently confirmed by this pass's own run**: the backend whole tree ran with `V2_EVIDENCE_*` unset — L8's default path — and its 2.2 artifact landed at `backend/test-results/v2-evidence/current/2.2/`, while `docs/v2-evidence/2.2/authority-conformance-summary.json` stayed at `db5f2873c2049152…` and `0.4/playwright-report.json` at `85799ced60e970fe…`, both matching what L7-L8 recorded ([`raw/pass2/13`](raw/pass2/13-git-state.txt)) |
| **13.5** | `[~]` — prepared, never executed | **STILL `[~]`. Nothing changed.** No deploy, no smoke, no canary sample |
| **`13.5/sign-off.md`** | wholly unsigned | **STILL WHOLLY UNSIGNED.** Part 4a and 4b are blank rule lines; 4c's Hold / Broaden / Roll back boxes are all unticked. `md5sum dae18daf…`, mtime `2026-08-12 23:14` |
| **13.6's own `_Evidence:` line** — *"final closure manifest and reviewer/operator approvals"* | manifest yes, approvals no | **manifest yes** (this document, both parts); **approvals still do not exist and cannot be produced by an agent** |

**This is the most decisive FAIL of the five, and it is not a code problem.** Two
of the three artifacts this bullet names are a human's signature and a human's
deploy. An agent that signed either would produce precisely the artifact this
spec exists to prevent. So the clause is recorded as unmet rather than quietly
satisfied.

### (iii) No required skips — **PASS**

This is the clause that changed verdict, and the argument has to be stated
carefully because the first pass failed it on four separate limbs.

| limb | first pass | now | verdict |
|---|---|---|---|
| 86 tests absent at fixture setup since 9.4 | closed in the first pass (§5) — but it uncovered 36 failures | **the 36 are fixed** (L1-L4 §3: `91 passed / 0 failed` on the same 12 files, same invocation) | **PASS** |
| whole-tree **skips** | 104, 33 distinct reasons, all phase-gated | **103**, same 32 reasons plus the one L1-L4 §1.1 identified as an environment-conditional prod-settings guard that resolved the other way — **no skip was added and none hidden** | **PASS** |
| harness required projects fail on `test.skip` (task 0.4) | clean | clean | **PASS** |
| **frontend lint** | **15 errors in 13 files** | **0 errors, exit 0** — L12 fixed all 15 **in code**: 9 real R14.3 violations moved onto 5 domain services, 6 stale directives removed. **0 `eslint-disable` directives added**, `eslint.config.js` unchanged, and `LEGACY_EXCEPTIONS` went 9 → **0 entries** rather than being re-dated | **PASS** |
| type-check | exit 0 | exit 0 | **PASS** |
| **the whole-tree failure population** | 128 backend failures, 1 error | **94 failures, 1 error** — and 5192 → **5278** passes | **see below** |

**Why this is a PASS and not a fourth FAIL, argued rather than asserted.** The
clause is *"no required skips"*. The first pass failed it on the lint limb (a
required gate with 15 errors) and on the honest observation that *"'not skipped' is
a floor, not a pass"* while 36 tests it had just un-blocked were failing. Both of
those are now closed: the lint gate is clean and the 36 are green. What remains is
**94 pre-existing failures and 1 pre-existing error that no skip is concealing** —
every one attributed, by cluster, to a named owning lane in L1-L4 §5 item 4, and
re-verified present in this run's own output
([`raw/pass2/14`](raw/pass2/14-residual-items.txt)). They are a defect statement,
which is what this clause wanted instead of silence.

**And the limit on that PASS, stated so nobody over-reads it.** 94 failures is not
a green suite, and this clause does not claim one. The failure population belongs
to **GOV-04's** exit criterion — *"required local Playwright journeys run without
skip"* — which is why GOV-04 stays open under clause (i) even though its
immutability limb closed. Anyone reading "(iii) PASS" as "the suite is green" is
reading it wrong. The single surviving error is unchanged and identified in this
run's own `ERRORS` block: `tests/property/test_ip_address_column.py` at
`setUpClass`, whose raw-insert factory does not supply the `NOT NULL
assignment_version` column — 13.1's cluster **E**, pre-existing, 1 before and 1
after.

The one frontend failure is also unchanged and is another lane's:
`tests/unit/authPageFormMarkup.test.tsx:106` expects `"We'll verify this
address."` and the rendered sign-up page says *"We'll send account updates here.
If you already have an account, sign in instead."* — 11 recordings, listed in
§9.2 as deliberately left alone.

### (iv) No unregistered Legacy_Exception — **PASS**

**866 hits, 0 UNREGISTERED, 13 categories, 7 registers, all shrink-only, all
staleness-checked, every named guard present, halves 1–3 PASS, half 5 PASS, half
5b PASS.** The delta from L9-L11's 874 is attributed line by line to L12's own
files (§15.4).

Residual, unchanged in character from the first pass and now smaller: two of the
seven registers still carry no per-entry owner and they are **other specs'**;
`DECLINED_REMOVALS` is undated **by design**. That is GATE-13.6-01, **partly
fixed**. The first pass's §7.1 Part 1 decision stands: a per-entry dated owner is
**not** what clause (iv) measures — registration is — and all seven registers are
shrink-only with a staleness check, which buys the property a date is meant to buy,
sooner. Part 2 also stands: 12.5's clause is stricter than 13.6's, and it is now
met for 3 of the 4 registers admissions-v2 could reach.

### (v) No hanging required job/outbox — **PASS where reachable; NOT MEASURED on production**

Unchanged in substance from the first pass, re-measured on the **current**
rehearsal lineage rather than 13.4's:

| database | what it is | `outbox_total` | pending | `s6_outbox_failed` | `s6_outbox_stale` | beat proxies | verdict |
|---|---|---:|---:|---:|---:|---|---|
| `v2_snap_13_6` | the L2-L3 / L7 restored **production-lineage** snapshot, now carrying L2, L3 and L7's applied migrations | **347** | **0** | **0** | **0** | domain backlog 0 · payment sweep overdue 0 · email wedged 0 · email failed 0 | **PASS — no hanging outbox event** |

The three limits the first pass named all still hold, verbatim:

1. **A snapshot is frozen.** Nothing produces or consumes it, so "nothing is
   stuck" is weaker than the same numbers on a live system. 347 rows of real
   inherited data with 0 pending and 0 failed is still a real measurement.
2. **`LLEN celery` is unanswerable here.** Broker depth is a Redis command against
   a running broker, and the only broker that satisfies this clause is
   production's. An empty result reads *"cannot tell"*, never zero. It gets its
   answer at **O7**.
3. **`domain_sweep_last_checked` is NULL**, because the production lineage has zero
   `institution_domains` rows (GATE-13.5-03). The domain-sweep half of the signal
   has nothing to observe.

Neon was **read-only**: the instrument's first statement is
`SET default_transaction_read_only = on`, branch `br-jolly-pine-ahybtg2e` was
**reused not created**, and the DSN was assembled in-process from `backend/.env`
and never printed. `v2_snap_13_4`, `v2_fresh_13_4`, `v2_batch_13_4` and the Neon
default branch were **not touched**.

### Clause summary

| clause | first pass | second pass | deciding evidence |
|---|---|---|---|
| (i) every P0/P1 finding closed | **FAIL** | **FAIL** | 8 of 11 Phase 13 contradictions cleared, but **STU-13** and **TEN-09** depend on a **production apply that has not happened**, GOV-04 fails its own exit criterion at 94 backend failures, and 12 of 39 GATE findings are not plain-fixed — 3 of them `high` |
| (ii) every required task evidenced | **FAIL** | **FAIL** | validator green and 73 of 73 directories present, but **13.5 is still `[~]`** and **`13.5/sign-off.md` is wholly unsigned** — and this bullet's own `_Evidence:` line requires reviewer/operator approvals |
| (iii) no required skips | **FAIL** | **PASS** | the 36 → `91 passed / 0 failed`; **lint 15 → 0**, fixed in code with 0 directives added; skips 104 → 103 with the one difference identified; 94 failures + 1 error remain but **no skip conceals them** |
| (iv) no unregistered Legacy_Exception | **PASS** | **PASS** | **866 hits, 0 UNREGISTERED**; halves 1–3, 5 and 5b all PASS; residual is 2 other specs' registers + `DECLINED_REMOVALS`' deliberate exemption |
| (v) no hanging required job/outbox | **PASS** | **PASS** | `v2_snap_13_6`: 347 rows, 0 pending / 0 failed / 0 stale, all beat proxies 0. `LLEN celery` **not measurable** off production |

**3 PASS, 2 FAIL. The gate does not pass.**

Therefore, and in this order:

- `.config.kiro` **still reads `"status": "planned"`** — mtime `2026-07-12 18:51`,
  untouched by this pass;
- `docs/canonical-truth-map.md` is **unchanged** — mtime `2026-08-12 03:14`, its
  pre-existing modification belongs to earlier V2 tasks, not to this one;
- `tasks.md` 13.6 is **`[-]`**, not `[x]`.

---

## 17. `findings.md` — the state updates, and two corrections upward

This pass is authorised to edit `findings.md`, and did. Every state was carried
from the batch that measured it; **nothing was re-measured or re-adjudicated
here**, and the wording and evidence links come from each batch's own state-change
section.

**Already applied by L9-L11's registration, verified present:** GATE-13.2-01 and
GATE-13.5-02 → *fixed* (L1-L4 §2) · GATE-13.5-01, GATE-13.4-02 (both layers) and
GATE-13.6-03 → *fixed* (L2-L3) · GATE-13.3-01…-12, -14, -15, -16 → *fixed*
(L5-L6) · **GATE-13.3-13 → open, one half fixed** — the production-lineage half
closed, the 113-character input still 500s.

**Applied by this pass:**

| finding | was | now |
|---|---|---|
| **GATE-13.4-01** | open — *"all **19** rows are `institution_id IS NULL` and MIHAS-branded"* | **fixed on the rehearsal lineage** — gate 19 reads 33/33/**0** on `v2_snap_13_6`, the render probe 0 offending renders against 81 across 31 keys. **Not applied to production.** And the count is **restated upward: 31, not 19** |
| **GATE-13.1-07** | open, narrowed — *"**three** instruments … **five** earlier tasks' artifacts are not immutable"* | **fixed** — 4 of 4 mechanisms closed, guarded artifacts byte-identical across three defaulted harness runs and two defaulted pytest runs, deliberate regeneration behind one env var, 39-case cross-language guard. And the mechanism count is **restated upward: 4, not 3** |
| **TEN-09** (P1) | `[x]` owners, contradicted by GATE-13.4-01 | **Phase 13 contradiction cleared**, finding **not closed** — it depends on the production apply |
| **GOV-04** (P0) | contradicted by GATE-13.1-02 and GATE-13.1-07 | **immutability limb closed**, finding **not closed** — 94 failures against its own exit criterion |

Two new subsections carry this: *Register findings whose Phase 13 contradiction is
now cleared* (which keeps **contradiction cleared** and **finding closed** apart,
row by row, and names L2, L3 and L7 as rehearsal-only) and *Corrections — two
counts restated upward*. A bullet was also added to *How to read these rows*
warning that a `fixed` cell whose evidence is a rehearsal is not a production fix,
naming GATE-13.5-01, GATE-13.4-02, GATE-13.6-03 and GATE-13.4-01.

### 17.1 The two corrections, and why they are worth calling corrections

Both make the defect **larger** than the register said, and both were found the
same way — a remediation lane re-measuring from the filing task's **raw artifact**
instead of from the finding's headline sentence.

| finding | register said | measured | consequence if the headline had been trusted |
|---|---|---|---|
| **GATE-13.4-01** | 19 branded rows | **31** — 19 from the seed script, **12 that exist only on the production lineage and are produced by no script in this repository** | a remediation would have fixed 19, watched gate 19 still read FAIL, and had nothing to explain it |
| **GATE-13.1-07** | 3 instruments, 5 victims | **4** mechanisms and **7** victims — the fourth is **`harness/bin/harness` itself**, the runner script the catalogued config lives inside, latent only because nobody had typed `harness smoke` since the task that wrote it | one write path would have stayed open while the finding read closed |

**No Phase 13 README was edited.** `13.1/` and `13.4/` are other tasks'
Required_Evidence and immutable under **R2.7**. Both tasks measured correctly and
kept their raw output next to their claim, which is the only reason the true
numbers were recoverable at all — the restatements are a correction to the
*register*, not a criticism of either task. A reader who follows the headline from
either README lands on 19 or 3, and the corrections note is what tells them why
the register now says 31 and 4.

---

## 18. The shortest remaining path

**Lane and operator are separated, because mixing them is how a spec ends up
waiting on nobody.** The first pass's §8.1 list (L1–L12) is **done**. What follows
is what is genuinely left.

### 18.1 Lane code — optional for the gate, and worth doing anyway

None of these blocks the gate on its own. They are listed so nobody mistakes the
operator sequence for the whole remaining scope.

| # | work | owner | closes |
|---:|---|---|---|
| M1 | Widen `Application.intake`'s `max_length` **and** ship the matching column widen; re-run 13.3's 113-character reproduction and L2-L3's gate 20 | applications + data-migration lanes | **GATE-13.3-13**, the last of 13.3's 16, and the rest of **STU-13** |
| M2 | Fix the **2 undiagnosed** `test_production_readiness_metrics.py` failures and the 2 L1-caused mock failures L1-L4 §4 named | metrics + applications lanes | 4 of the 94 |
| M3 | Work the 94 down by cluster — perf goldens, `test_view_auth_classification`'s 38 unclassified views, `EXPECTED_TABLES`' 6 tables, drf-spectacular's 116, the `ERROR_CODES` gap, the capability-endpoint 404s | the named lanes in L1-L4 §5 item 4 | **GOV-04's exit criterion**, which is what keeps clause (i) failing on that finding |
| M4 | Regenerate `docs/v2-evidence/3.6/migration-history.release.json` — **6** omitted scripts now, and the list only grows | whoever owns 3.6 | GATE-13.1-05's migration-report half |
| M5 | Raise the base harness profile's timeout (or move 13.3's four specs onto their own config) — `--timeout=180000` turns 7 failures into 12 passes | harness lane | L7-L8 §9.4 item 1 |
| M6 | Widen the validator's finding-id grammar **and** extend `requirements.md`'s `_Findings:` lines in **one** edit | whoever owns `requirements.md` | **GATE-13.6-04** — and it must be both edits or the CI gate goes red with 39 unowned findings |
| M7 | Get `_ALLOWED_PREDICATES` (11) and `legacy-brand-allowlist` (19) dated by their owning specs | `beanola-production-readiness` / `multi-tenant-beanola` / system-alignment-audit | the rest of **GATE-13.6-01** |

### 18.2 Operator / human — this is the whole remaining gate

Nothing in this table can be done by an agent, and **the gate cannot pass without
all of it**. It is the first pass's §8.2 unchanged, because none of it has
happened.

| # | work | who |
|---:|---|---|
| **O1** | **Settle GATE-13.5-05 first: is production `*.beanola.com` or `*.mihas.edu.zm`?** The shipped bundle's CSP pins `api.beanola.com` literally; `deploy/RUNBOOK.md` cuts DNS to `api.mihas.edu.zm` (15 refs, 0 to beanola). Until it is answered, every HTTP check in the post-deploy proof aims at a possibly-wrong host and a green smoke run means nothing. **It costs one answer and it is still first** | platform operator |
| O2 | Close the second tenant's intakes so exactly one institution has `open_intakes > 0` (GATE-13.5-04); confirm with 13.5 preflight gate 24 | operations |
| O3 | Take a backup (`deploy/backup-db.sh`), confirm non-empty, record the R2 key + both rollback anchors in `sign-off.md` Part 0 | deploy operator |
| **O3b** | **Apply L2, L3 and L7's migrations to production**, backup-first, by the repo's own path (`apply_sql_migrations`), then `check_schema_drift`, then 13.5's preflight to confirm gate 22 and gate 19 on the real database. **All three are rehearsed on `v2_snap_13_6` and none has reached production** — this is what clause (i) is waiting on for STU-13 and TEN-09. Promote `backend/scripts/2026_08_09_01_application_tracking_secret.sql` (old O9) in the same window | deploy operator |
| O4 | Run 13.5 §6 block A — the read-only pre-flight, 28 gates across four files, ~1 minute | deploy operator |
| O5 | Deploy by `.github/workflows/deploy.yml`; record both image SHAs | deploy operator |
| O6 | Run the post-deploy proof (`post-deploy-smoke.sh http` and `on-box`) plus the four manual checks — **M1, the two-tab autosave probe, three times** | deploy operator |
| O7 | Sample `canary-dashboard.sql` at cutover, +15 min, +1 h, +24 h into `sign-off.md` Part 3. **This is where `LLEN celery` finally gets an answer** (clause (v)) | deploy operator |
| O8 | Decide hold / broaden / roll back (13.5 §5), then **sign `sign-off.md` Part 4** | deploy operator **and** a canary reviewer who is not the operator |
| O10′ | Re-run **this** task a third time: the validator, both traceability populations, all five clauses | whoever owns closure |

**Only after O10′ returns 5/5** may `"status": "completed"` be written to
`.config.kiro`, `docs/canonical-truth-map.md` be updated, and 13.6 be marked
`[x]`.

**The shortest path, in one sentence.** Answer **O1**; then in one backup-first
window run **O3b** (which is what clause (i) is actually waiting on) and
**O3–O8**; then re-run this task. Clause (iii) is already passing, (iv) and (v)
hold, and (ii) closes the moment two humans sign Part 4a and 4b.

---

## 19. What is NOT claimed in this second pass

1. **The spec is still not closed, and this document does not close it.** No
   `"status": "completed"` was written (`.config.kiro` mtime `2026-07-12 18:51`);
   `docs/canonical-truth-map.md` was not touched (mtime `2026-08-12 03:14`); 13.6
   is `[-]`, not `[x]`.
2. **Production was not contacted in any way** — no SSH, no query, no write, no
   deploy, no restart, no migration. The `.pem` was not read.
3. **`docs/v2-evidence/13.5/sign-off.md` was not signed, not partially filled, and
   not opened for writing.** `md5sum dae18daf72850f995d1a7bd3a532cec8`, mtime
   `2026-08-12 23:14`. It is a human's.
4. **13.5's checkbox was not touched**, nor any other task's. Only 13.6's
   checkbox and its nested evidence bullets were edited in `tasks.md`.
5. **Nothing was remediated.** The 94 backend failures, the 1 error and the 1
   frontend failure are other lanes', are attributed by cluster, and were left
   exactly as found. No test, guard, validator or config was weakened.
6. **No lane's measurement was re-derived.** Every before/after number in §14–§17
   is carried from the batch that took it, with the link; the only figures this
   pass measured itself are the ones in `raw/pass2/`.
7. **The 39 GATE findings' severities are the filing tasks' own words**, not
   re-adjudicated here — the same position the first pass took (§10 item 7).
8. **Clause (v) was not measured on production**, and `LLEN celery` was not
   measured anywhere. It was measured on `v2_snap_13_6`, a *frozen* ledger.
9. **Clause (iii)'s PASS is not a claim that the suite is green.** 94 backend
   failures and 1 error remain; the clause's subject is skips and required gates,
   and the failure population is GOV-04's problem under clause (i).
10. **The two upward restatements are corrections to the register, not to
    `13.1/README.md` or `13.4/README.md`**, which were not edited (R2.7).
11. **The `874 → 866` register-hit delta is attributed to L12's files by name**
    ([`raw/pass2/08`](raw/pass2/08-register-audit-hit-delta.txt)); no cause beyond
    that is claimed, and `0 unregistered` holds on both sides.
12. **Nothing was committed or staged.** The 9 staged deletions in the index are
    the de-AI work's, pre-existing, and were not touched.

---

## 20. State left behind, second pass

| item | state |
|---|---|
| **production Postgres / EC2** | **never contacted** |
| Neon **default** branch | **not touched**, not read |
| `v2_snap_13_4` · `v2_fresh_13_4` · `v2_batch_13_4` | **not touched** |
| Neon rehearsal branch `br-jolly-pine-ahybtg2e`, database `v2_snap_13_6` | **read only** — `SET default_transaction_read_only = on` is the instrument's first statement; branch reused, not created |
| local test stack | `mihas-localtest` Postgres (`127.0.0.1:5433`) + Redis (`127.0.0.1:6380`), already up from earlier batches and **left running**; `test_%` verified **empty before** the run, and the `test_mihas_localtest` pytest-django left behind was **dropped after** (recorded in [`raw/pass2/10`](raw/pass2/10-backend-whole-tree.txt)). All backend runs **serial** |
| `docs/v2-evidence/13.6/README.md` | **appended.** Part I is byte-for-byte the first pass |
| `docs/v2-evidence/13.6/raw/pass2/` | **new** — 14 numbered artifacts (`01`–`14`) plus one instrument, `gate-register-traceability.py`, which imports the real validator module and reports what its real pattern does rather than asserting it |
| `findings.md` | **edited** — §17. Two rows' states, two new subsections, one bullet |
| `tasks.md` | **only 13.6's checkbox and its nested evidence bullets.** 13.5's checkbox and every other task's are untouched |
| `.config.kiro` · `docs/canonical-truth-map.md` · `docs/v2-evidence/13.5/sign-off.md` | **unchanged** |
| other tasks' `docs/v2-evidence/**` | **read, never written.** Verified two ways: a `find` over the whole tree for anything modified since this pass began returns nothing outside its three targets, and the defaulted pytest run put its 2.2 artifact in `backend/test-results/v2-evidence/current/2.2/` while `docs/v2-evidence/2.2/` and `0.4/` kept the hashes L7-L8 recorded |
| git | **nothing committed, nothing staged.** Branch `main` at `bae29a28d`, V2 tree dirty ([`raw/pass2/13`](raw/pass2/13-git-state.txt)) |
| secrets | no DSN, password, token or key appears in this directory. The Neon connection string was assembled in-process from `backend/.env` and never printed |

---

## 21. To whoever reads this next

1. **The gate is now waiting on two humans and one deploy window, and nothing
   else.** Twelve lane items closed 8 of the 11 blocking items and moved clause
   (iii) from FAIL to PASS. The three that remain — B1, B2, B3 — were operator-only
   on the day they were filed and are operator-only now. If you are reading this
   looking for code to write, §18.1 is real work but **none of it closes the gate**.
2. **O1 is still first and still costs one answer.** Two documents in this
   repository disagree about production's own hostname. Every HTTP check in the
   post-deploy proof aims at one of them.
3. **Do not read a rehearsal as a deployment.** L2, L3 and L7 each proved a
   migration on a restored copy of the production lineage. That is the strongest
   evidence obtainable without touching production, and it is *not* the same
   statement as "production is fixed". Clause (i) fails partly because of exactly
   this gap, and §16's STU-13 and TEN-09 rows are where it is written down.
4. **The most useful thing the twelve lanes proved is a method, not a number.**
   Twice, a lane re-measured from a filing task's raw artifact and found the defect
   **bigger** than the finding's headline — 31 branded rows, not 19; four write
   mechanisms, not three. Both times the true number was already in the filing
   task's own output, one level below the sentence everyone quotes. Keep raw output
   next to every claim, and re-measure from the artifact rather than the summary.
5. **The first pass's warning is still the operative one.** Writing
   `"status": "completed"` before O10′ returns 5/5 makes validator rule 5 fail and
   name 13.5 and 13.6. The spec's own gate would catch you — which remains the
   best evidence that task 0.2 did its job.

The credit here belongs to twelve remediation lanes that fixed 8 blocking items,
took lint from 15 to 0 in code rather than by suppression, registered 39 findings
their own phase had filed against them, and twice reported a defect as **larger**
than the register said. The one thing still unspent is the same thing the first
pass refused to spend: a false "complete".

---

# Part III — 2026-10-09: the gate, read against a settled production decision

Part I and Part II are left byte-for-byte above. This part changes **no measurement**
in them; it records a decision by the owner that resolves what the two failing
clauses were waiting on, and states plainly what that does and does not change.

## III.1 The two facts the owner supplied

1. **Production is `*.beanola.com`.** This resolves **GATE-13.5-05** as a fact (the
   enforced CSP in the shipped bundle was already correct; the `*.mihas.edu.zm`
   runbook/smoke defaults are the stale side — a deploy-lane doc-fix, not a canary
   blocker). Recorded in `docs/v2-evidence/13.5/README.md` §11.
2. **The production server is offline, and hosting is being switched.** So the
   production-apply and canary-execution steps cannot run now, by infrastructure,
   not by choice.

## III.2 The verdict is unchanged, and that is the honest outcome

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  FINAL GATE: still NOT a "completed" spec — DEFERRED ON INFRASTRUCTURE    │
  │                                                                          │
  │  Local / agent-verifiable half:   PASS  (validator green, 71/73 checked) │
  │  Clauses needing a live server:   (i) partial · (ii) FAIL — deferred      │
  │  Remaining blocking items:        ONE, decomposed below                   │
  │  Spec status:          stays NOT "completed"                              │
  │  Canonical truth map:  UNCHANGED — V2 is not relabelled as shipped        │
  │  tasks.md 13.5 [~] · 13.6 [-]                                             │
  └──────────────────────────────────────────────────────────────────────────┘
```

The bullet says *"update canonical truth map and spec status only after the final
gate passes."* It does not pass — not because work is undone, but because its last
clauses are, by construction, **assertions a human makes about a running production
canary**, and there is no production to run it on. Marking the spec `completed`
would require marking 13.5 `[x]` (asserting a canary that never happened) and
signing `sign-off.md` (an agent signing its own operator attestation). Both are the
exact artifacts this spec was written to refuse. So neither is done.

## III.3 Clause verdicts, re-read against III.1 — measured, not re-run

The underlying measurements are Part II's (and M9's later delta); III.1 only changes
how two of them resolve.

| clause | Part II | now | why |
|---|---|---|---|
| (i) P0/P1 closed | FAIL | **FAIL — reduced to the production apply** | GOV-04's backend-failure limb is cleared by M9 (whole tree 5,425 passed / 0 failed). GATE-13.5-05 is resolved (III.1). What remains under (i) is **TEN-09 and STU-13**, whose fixes (L2 widened columns, L3 migration-runner + uuid default, L7 brand-neutral fallback) are additive, idempotent, rollback-paired, boot-gate-clean, and **rehearsed on `v2_snap_13_6` / `v2_snap_13_4`** — but **not applied to production**, because production is offline. The *contradictions* are cleared; the *findings* close on apply. |
| (ii) every required task evidenced | FAIL | **FAIL — deferred, not deniable** | 73/73 evidence directories exist and the validator is green, but 13.5's own `_Evidence:` asks for *operator sign-off*, and `sign-off.md` is blank by design. This is deferred to the live run + two humans, not something an agent can supply. |
| (iii) no required skips | PASS | **PASS** | M9: 5,425 passed / 0 failed / 0 errors; lint 0; type-check 0. Unchanged. |
| (iv) no unregistered Legacy_Exception | PASS | **PASS** | Reinforced since Part II: task 12.5 pass 2 (`docs/v2-evidence/12.5/README.md` §13) closed GATE-13.6-01 — all 7 registers now own=yes, `gaps: none`, with the one undated register undated by design. 889 hits, 0 unregistered. |
| (v) no hanging required job/outbox | PASS | **PASS where reachable** | `v2_snap_13_6`: 347 outbox rows, 0 pending/failed/stale. `LLEN celery` stays "cannot tell" off production — it gets its answer in the live canary. |

So **(iii), (iv), (v) pass; (i) and (ii) are both reducible to one thing: the
production canary has not run.** That is the single open item.

## III.4 The one open item, decomposed, with its trigger

Everything the gate still waits on collapses to this, owned by the operator and
triggered by the hosting switch — none of it agent-doable:

| # | step | clause it closes | owner | trigger |
|---|---|---|---|---|
| 1 | Apply L2 (3 widened columns), L3 (migration-runner fix + `canonical_programs.id` default), L7 (brand-neutral communication fallback) to the new production DB, backup first, after rehearsing on a snapshot of the real data | (i): TEN-09, STU-13, GATE-13.5-01, GATE-13.4-02 | data-migration + comms lanes (write) · operator (apply) | new host live |
| 2 | Close/accept the live cross-tenant read GATE-13.5-02 (resolve intake by canonical id, not display name — `student_draft_views.py:185` + 4 siblings) and close the second tenant's intakes (GATE-13.5-04) | (i) | admin-query lane · operator | before cutover |
| 3 | Fix the deploy-lane doc drift: `deploy/RUNBOOK.md` + `scripts/smoke-production.sh` defaults `*.mihas.edu.zm` → `*.beanola.com` (GATE-13.5-05 doc-half) | (i) | deploy/runbook lane | any time |
| 4 | Run the canary: deploy, `post-deploy-smoke.sh http` + `on-box`, sample `canary-dashboard.sql` ×4, M1 ×3 + M2–M4 (`13.5` §6) | (ii) | operator | new host live |
| 5 | Sign `sign-off.md` Part 4a (deploy operator) + 4b (independent reviewer) | (ii), evidence | operator + second reviewer | after step 4 |
| 6 | Only then: set `.config.kiro` `status` to `completed`, mark 13.5 `[x]` + 13.6 `[x]`, and register V2 as shipped in `docs/canonical-truth-map.md` | the gate itself | whoever runs the final close | all of the above |

## III.5 What this part changed on disk

- `docs/v2-evidence/13.5/README.md` — appended §11 (GATE-13.5-05 resolved;
  deferral; the open item and its trigger).
- `docs/v2-evidence/13.6/README.md` — this Part III.
- `.kiro/specs/.../tasks.md` — a deferral note under 13.5; this note under 13.6.
  **No checkbox changed**: 13.5 stays `[~]`, 13.6 stays `[-]`.
- `.config.kiro` — `status` stays **not `completed`**; a `deferredOn` field records
  the single open item and its trigger so the deferral is machine-visible, not just
  prose. The spec id, release, and every other field are unchanged.
- **Not changed:** `docs/canonical-truth-map.md` (V2 is not shipped), `findings.md`
  measurements, `requirements.md`, `design.md`, and every other task's evidence.
- **Not contacted:** production (offline), the EC2 box, the `.pem`. **Not touched:**
  Neon (the §11 rehearsal reading it cites is Part II's existing read-only capture,
  not a new write). Nothing committed or staged.

## III.6 The honest one-line state

The admissions-v2 rebuild is **complete and verified for everything that does not
require a live production server**. The validator is green, 71 of 73 required tasks
are evidenced and checked, and the remaining two tasks reduce to a single
operator-owned step — deploy the already-prepared canary to the new host, apply
three rehearsed additive migrations, and have two humans sign — that unblocks the
moment the hosting switch is done. The spec is **not** marked shipped, and will not
be until that step is real.
