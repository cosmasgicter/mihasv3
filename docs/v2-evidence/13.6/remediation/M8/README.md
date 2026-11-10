# Task 13.6 remediation — M8

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · remediation item **M8**, the
three behavioural clusters M3 §9 left in `O-scope`, `P-other` and `N-mock`
Requirements: **R3.1–R3.2** (capability-derived authority, scope before lookup),
**R2.1 / R2.4** (the disclosure contract), plus, per failure, **R5.6 / R7.5**
(offering fee resolution and its fail-closed readiness blocker), **R8.3**
(one export path), **R11.7–R11.8** (the document-evidence lifecycle),
**R13.4 / R13.12 / R14** (the tracking contract), **R7.6–R7.7** (canonical ids)
Findings: **GOV-04** (P0 — its exit criterion is the backend failure population),
**AUTH-01 / AUTH-02** (capability-derived authority), **STU-19** (document
evidence), **STU-22** (the tracking contract), **AUTH-03** (reviewer assignment),
**ADM-06** (server-owned money surfaces)

---

## THE VERDICT: 20 OF 24 CLOSED · ZERO PRODUCTION LINES CHANGED · ALL FOUR RESIDUALS ARE SOMEBODY ELSE'S DECISION

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  backend, whole tree, SERIAL, same invocation as every prior batch        │
  │                                                                          │
  │     42 failed / 5374 passed / 102 skipped / 2 xf / 1 xp / 0 errors        │
  │  -> 22 failed / 5394 passed / 102 skipped / 2 xf / 1 xp / 0 errors        │
  │                                                                          │
  │     -20 failures   +20 passes   0 skips added   0 errors both sides       │
  │     ZERO new failures (diffed header by header, not netted)               │
  │                                                                          │
  │  THE POPULATION IS 24, NOT 25. The brief's `P-other 9` inherits an        │
  │  arithmetic slip in M3 §9's README table, which sums to 45 against a 44   │
  │  population. M3's own raw artifact reads `P-other (8)` and puts           │
  │  `api_quality.sh` in `E-spectacular` -- where the brief also lists it.    │
  │                                                                          │
  │  20 OF THE 24 WERE THE TEST BEING WRONG, AND ALL FOUR THAT WERE THE CODE  │
  │  BEING WRONG ARE OUT OF A REMEDIATION BATCH'S AUTHORITY. So M8 changed    │
  │  **17 test files and no production file at all** -- and the OpenAPI SHA   │
  │  is byte-identical to M3's, which is the measurement that proves it.      │
  │                                                                          │
  │  ONE ROOT CAUSE SITS UNDER THREE OF THE FOUR RESIDUALS, and it is a LIVE  │
  │  DEFECT: an offering- or application-scoped `AccessGrant` puts its target │
  │  in `AccessScopeService` scope but derives ZERO capabilities, so every    │
  │  capability-gated endpoint refuses the actor the grant exists to          │
  │  authorize. NOT FIXED: at the capability layer the fix is                │
  │  institution-WIDE, and every aggregate surface checks the capability      │
  │  without a row filter -- an offering grant would leak the whole school.   │
  │                                                                          │
  │  ONE RESIDUAL IS ALREADY IN TASK 2.2's OWN EVIDENCE as a reported         │
  │  non-conformance -- 1 of 135 -- and the shipped tenant console depends on │
  │  the behaviour the test refuses. ONE IS TWO SPECS PINNING TWO DIFFERENT   │
  │  REGISTERED ERROR CODES for the same refusal.                            │
  │                                                                          │
  │  frontend 0 failed / 4620 passed / 1 skipped over 495 files               │
  │  lint 0 errors · type-check exit 0 · manage.py check exit 0               │
  │  OpenAPI SHA-256 686d53d4... UNCHANGED · validator exit 0, 24/24          │
  │                                                                          │
  │  M-v2mock, E-spectacular, B-cap-cache, C-viewauth, D-allowany, I-rollback │
  │  and M7/B1/B2/B3 -- untouched, by design.                                 │
  └──────────────────────────────────────────────────────────────────────────┘
```

| | before | after |
|---|---|---|
| backend whole tree, serial | **42** failed / 5374 passed / 102 skipped / 2 xf / 1 xp / **0 errors** | **22** / **5394** / **102** / 2 / 1 / **0** |
| unique failure headers | 42 | **22** — 20 closed, **0 new** |
| in-scope population (`O-scope` + `P-other` + `N-mock`) | **24** | **4** |
| `O-scope` | **13** | **2** |
| `P-other` | **8** | **2** |
| `N-mock` | **3** | **0** |
| skips | 102, 31 distinct reasons | **102**, **the same 31 reason strings, diffed identical** |
| xfail / xpass | 2 / 1 | **2 / 1** |
| setup errors | 0 | **0** |
| production files changed | — | **0** |
| OpenAPI schema SHA-256 | `686d53d4…` (M3's) | **`686d53d4…` — unchanged** |
| `bun run test` | 0 failed / 4620 passed / 1 skipped / 495 files | **0 / 4620 / 1 / 495** |
| `bun run lint` · `type-check` | 0 errors · exit 0 | **0 errors · exit 0** |
| `manage.py check` (real `.env`) | exit 0 | **exit 0**, byte-identical warnings |
| spec validator + self-tests | exit 0, 24/24 | **exit 0, 24/24** |

Sources, in order:
[`raw/00-docs-fingerprint-before.txt`](raw/00-docs-fingerprint-before.txt) ·
[`raw/01-baseline-backend-whole-tree.txt`](raw/01-baseline-backend-whole-tree.txt) ·
[`raw/02-baseline-clusters.txt`](raw/02-baseline-clusters.txt) ·
[`raw/03-baseline-attribution.txt`](raw/03-baseline-attribution.txt) ·
[`raw/04-scope-selection-before.txt`](raw/04-scope-selection-before.txt) ·
[`raw/05-scope-selection-after.txt`](raw/05-scope-selection-after.txt) ·
[`raw/06-diagnosis-per-failure.md`](raw/06-diagnosis-per-failure.md) ·
[`raw/10-request-id-discrimination.txt`](raw/10-request-id-discrimination.txt) ·
[`raw/20-after-backend-whole-tree.txt`](raw/20-after-backend-whole-tree.txt) ·
[`raw/21-after-clusters.txt`](raw/21-after-clusters.txt) ·
[`raw/22-whole-tree-delta.txt`](raw/22-whole-tree-delta.txt) ·
[`raw/23-skips-and-suppression.txt`](raw/23-skips-and-suppression.txt) ·
[`raw/24-suppression-audit.txt`](raw/24-suppression-audit.txt) ·
[`raw/30-django-check.txt`](raw/30-django-check.txt) ·
[`raw/31-openapi-schema-sha.txt`](raw/31-openapi-schema-sha.txt) ·
[`raw/32-frontend-gates.txt`](raw/32-frontend-gates.txt) ·
[`raw/33-spec-validator.txt`](raw/33-spec-validator.txt) ·
[`raw/34-compile-and-git.txt`](raw/34-compile-and-git.txt) ·
[`raw/40-evidence-isolation.txt`](raw/40-evidence-isolation.txt) ·
[`raw/41-docs-fingerprint-after.txt`](raw/41-docs-fingerprint-after.txt) ·
[`raw/42-docs-isolation.txt`](raw/42-docs-isolation.txt) ·
[`raw/43-localdb-after.txt`](raw/43-localdb-after.txt) ·
plus two instruments — [`raw/cluster.py`](raw/cluster.py) (**M3's, reused byte-for-byte** so the two cluster tables are comparable) and [`raw/discriminate-request-id.sh`](raw/discriminate-request-id.sh) (new).

Both the before and the after column are **M8's own serial runs of its own tree**.

---

## 1. Measure before you fix

### 1.1 The baseline is M8's own, and it disagrees with the carried one by exactly one test

M4-M5-M6 left the tree at **41 failed / 5374 passed / 103 skipped**. M8 re-ran the
same invocation, serially, on the same isolated stack and measured **42 failed /
5374 passed / 102 skipped** ([`raw/01`](raw/01-baseline-backend-whole-tree.txt)).

The difference is one test and it is fully attributed
([`raw/03`](raw/03-baseline-attribution.txt)) — the header-by-header diff of the
two artifacts returns `ONLY IN M8 BASELINE (1)` and `ONLY IN M4-M5-M6 (0)`:

```
tests/unit/test_api_quality_script.py::test_api_quality_script_passes_against_baseline
  M4-M5-M6   SKIPPED  "Python at /usr/bin/python3 lacks backend deps"
  M8         FAILED   "api_quality.sh failed (exit 1)"
```

This is **M4-M5-M6 §0's own mechanism running the other way.** The test's
`_find_venv_python()` prefers `/tmp/mihas_audit_venv/bin/python`, then
`/opt/venv/bin/python`, then `PATH`. Neither of the first two exists; M4-M5-M6's
`PATH` python lacked the backend deps so its pre-existing environment guard
skipped the test, and M8 runs with `backend/.venv` active so the guard does not
fire, the test runs, and it fails. Same test, same guard, opposite side.

Two consequences, stated rather than netted away:

1. **The skip count moved 103 → 102 in the baseline, before M8 touched anything**,
   and 102 → 102 across M8's own work (§6.2).
2. The test is clustered **`E-spectacular`** by the instrument (its rule names
   `test_api_quality_script`), and `E-spectacular` is explicitly out of M8's
   scope — as is the brief's own description of it ("…and the `api_quality.sh`
   baseline"). So it is not one of M8's 24 in either reading.

### 1.2 The population is 24, not 25

| cluster | brief | [`raw/02`](raw/02-baseline-clusters.txt) |
|---|--:|--:|
| `O-scope` | 13 | **13** |
| `P-other` | **9** | **8** |
| `N-mock` | 3 | **3** |
| | **25** | **24** |

M3 §9's README table lists `O-scope 13 · P-other 9 · M-v2mock 6 · B-cap-cache 4 ·
E-spectacular 4 · N-mock 3 · I-rollback 2 · J-migreport 2 · C-viewauth 1 ·
D-allowany 1` — which sums to **45** against the 44 M3 measured. M3's own raw
artifact ([`../M3/raw/94-after-clusters.txt`](../M3/raw/94-after-clusters.txt))
reads `P-other (8)` and `E-spectacular (4)`, and the `api_quality.sh` row is
inside `E-spectacular`. So `api_quality.sh` is counted twice in M3 §9's prose and
`P-other` is 8. The brief inherited the 9.

This is the same lesson M3 §11 drew and 13.6 §21 item 4 drew before it —
**re-derive from the artifact, not from the summary that quotes it** — arrived at
here on a batch's own scope statement.

### 1.3 The cluster table, published before the fixes

Derived from the artifact by M3's instrument, reused unchanged.

| cluster | n | in M8's scope? |
|---|--:|:--:|
| `O-scope` | **13** | **yes** |
| `P-other` | **8** | **yes** |
| `M-v2mock` | 6 | no — V2 API lane |
| `B-cap-cache` | 4 | no — R5.1, M3 §2.7 reports it **false, not fixed**, deliberately |
| `E-spectacular` | 4 | no — API-schema lane |
| `N-mock` | **3** | **yes** |
| `I-rollback` | 2 | no — the genuine R9.2 gap |
| `C-viewauth` | 1 | no — the 38 unclassified `APIView` subclasses |
| `D-allowany` | 1 | no — unclassified `AllowAny` views |
| | **42** | 24 in scope |

---

## 2. The one thing that generalises: five cause classes, one shape

Every one of the 24 is an individual behavioural question, as M3 said. But
diagnosing all 24 before fixing any of them made a pattern visible that no single
failure shows, and it is the most useful thing in this document:

> **Twenty of the twenty-four are a claim about X, measured through an actor or a
> mock whose *authority* stopped being a constant.** Tasks 2.2 and 9.4 moved
> authority from a raw-role permission class to a capability derivation plus
> scope-before-lookup. Every test whose subject was something else — a batch
> guard, an audit trail, a rollback, a URL projection, a payment gate — had
> authority as an ambient variable, and it changed under them.

M3 §2.6 fixed one instance of exactly this and named it precisely: *"The
property's subject is authentication; authorization was an ambient variable."*
These are nineteen more, in five recognisable shapes. Full per-failure diagnosis
with citations: [`raw/06`](raw/06-diagnosis-per-failure.md).

| class | n | verdict | what changed under the test |
|---|--:|---|---|
| **A** — a per-request correlation id inside an indistinguishability comparison | 4 | code right, expectation too strong | 9.4 put the masked 404 on one raised `NotFound` rendered by the canonical handler, which stamps `request_id` |
| **B** — a mock actor with no canonical role | 3 | code right, mock incomplete | 2.2 made `role` the *input* of the capability derivation; an unset `MagicMock` attribute is not a role |
| **C** — a read-only fixture actor issuing a command or an export | 4 | code right, fixture read-only | "read by default, mutate only when granted" — 8.4 made the export capability explicit |
| **D** — a mock patching a seam a later task replaced | 5 | code right, patch target retired | 9.4's `resolve_scoped_application` / version methods; 7.3's evidence lifecycle and its replay lookups |
| **E** — a global sweep measured against a local expectation | 1 | code right, assertion mis-scoped | nothing; the assertion was always mis-scoped and only leaked rows expose it |
| **F** — a drill skipping a step the platform now requires | 1 | code right, drill incomplete | 5.4 made the fee resolution fail closed and name the readiness blocker |
| **G** — not M8's to decide | 4 | §4 | — |

**And the corollary, which is the honest headline.** If 20 of 24 are the test
being wrong, then M8 should have changed no production code — and it did not.
**Seventeen test files, zero production files.** The OpenAPI SHA-256 is
byte-identical to M3's `686d53d4…` ([`raw/31`](raw/31-openapi-schema-sha.txt)),
which is the measurement rather than the claim: a batch that had touched a
serializer, a view or a URL could not produce that number.

---

## 3. Cluster by cluster — the closes

### 3.1 Class A — the correlation id, and why excluding it is a strengthening (4 closed)

Four failures, one shape. Both bodies are `404 NOT_FOUND "Application not found"`;
the **only** difference is `request_id`:

```
At index 1 diff: {'success': False, 'error': 'Application not found', 'code': 'NOT_FOUND',
                  'request_id': 'bc72ad1b-d71d-4e58-af63-12b59790b2c1'}
              != {'success': False, 'error': 'Application not found', 'code': 'NOT_FOUND',
                  'request_id': '5838008c-0742-4763-a349-dc4995c2dc5f'}
```

**Why only one endpoint falsifies it, which is the whole diagnosis.** Property 26
drives six application GET endpoints; only `interviews-crud (GAP-6)` fails. That
endpoint is the one of the six whose masked 404 is **raised** — through
`resolve_owner_or_scoped_application` → `NotFound` → `envelope_exception_handler`,
which stamps the correlation id (`middleware.py:111`,
`exceptions.py:92,113`). The other five hand-build their 404 body. So the field
arrived with task 9.4's consolidation onto one disclosure decision, and the
property's whole-body equality predates it.

**The platform has already decided this question, three times, and M8 propagated
the decision rather than inventing one:**

| where | what it says |
|---|---|
| `docs/canonical-truth-map.md:462` | an out-of-scope, an unknown and a malformed id are one indistinguishable 404 — *"byte-identical, `request_id` **aside**"* |
| `docs/v2-evidence/9.4/README.md` (§4 row, and the "Reviewer, denied work" row) | *"the same 404 an unknown id gets, `request_id` aside"* · *"byte-identical to an unknown id's 404 (`request_id` **stripped**)"* |
| `tests/unit/test_review_workspace_9_4.py:822-828` | the guard: `_without_request_id`, with the reason in a comment |
| **`tests/unit/test_scoped_access_matrix.py::_capture`** | the **sibling HTTP matrix in the same spec and the same task family** already drops it, and its comment already names 9.4 as the cause |

So `test_production_scope_masking_properties` (task 11.4) is the one file of the
pair that never got the fix its sibling (task 11.2) has carried all along. M8 gave
it the same `_capture`, quoting the sibling.

**And the exclusion is measured, not asserted.** Dropping a field from an
indistinguishability comparison is only sound if the field cannot carry the
answer, so `_assert_correlation_id_is_per_request` now asserts, over the *same*
responses the property compares, that (a) every body carrying a `request_id`
carries a non-empty one — so a later change cannot silently drop it from the
envelope — and (b) the two ids **differ**, which is what "per request" means: a
value that varies between two identical probes cannot encode a property of the
target. `_read` returns a `tuple` subclass that keeps `.response`, so the raw id
stays reachable instead of becoming invisible.

**Discrimination, both directions** ([`raw/10`](raw/10-request-id-discrimination.txt)):

```
step 1  shipped state                                     7 passed
step 2  exclusion REMOVED in both files, nothing else      4 failed, 3 passed   <- exactly the 4
step 3  restored                                           7 passed
step 4  correlation id forced CONSTANT                     3 failed, 3 passed   <- the new assertion fires
step 5  restored, md5 byte-identical to the pre-probe file  7 passed
```

Step 4 is the one that matters: it proves the new assertion is not decoration. A
constant id — the only shape in which the field *could* carry information — fails
the property.

### 3.2 Class B — the mock actor's role (3 closed)

`test_application_hardening` ×2 and `test_bulk_status_atomic` ×1 drive a view with
a `MagicMock()` request whose `user.id` is set and whose `user.role` is not. After
task 2.2, `AdminCapabilityService.get_capabilities` reads `role` as the **input**
of the derivation and R1.1 gives *"any actor whose role is not one of the four
canonical roles"* zero capabilities — and an auto-created `MagicMock` attribute is
not one of the four. So the actor was refused (`PermissionDenied` at
`services.py:1229`; `NotFound` at `tenant_authorization.py:273`) before the
force-bypass audit trail or the mid-batch rollback was ever exercised.

Naming the role is what the **sibling property in the same suite already does** —
`test_application_properties.py::_make_mock_user(role="admin")`, which passes. It
composes with the `AccessScopeService` patch those tests have always carried:
scope is mocked, authority is then derived from it *for real*. No force-bypass or
rollback assertion changed; `test_bulk_status_atomic` additionally gained the
scope patch it lacked, at the same seam its siblings use.

### 3.3 Class C — a read-only fixture actor issuing a command (4 closed)

`build_tenant_world` creates its staff with `permissions: []`, which is the
platform's **read-default** bundle: `_DEFAULT_TENANT_READ_CAPABILITIES` for every
in-scope institution, and a mutation capability layered on **only** when the
membership/grant `permissions` names it. That is the model, and it is right.

| test | refused with | the capability its subject requires | citation |
|---|---|---|---|
| `test_scoped_access_matrix::test_bulk_status_out_of_scope_reported_not_found` | 403 | `tenant.application.review` | `admin_bulk_views.py`: `authorize_tenant_surface(capability="tenant.application.review")` (2.2) |
| `test_cross_tenant_isolation::test_export_excludes_other_school_application_number` | 403 | `tenant.application.export` | `docs/v2-evidence/8.4/README.md`: *"an export requires the explicit `tenant.application.export` capability rather than being implied by read access"* |
| `test_cross_tenant_invisibility::test_no_tenant_b_token_on_any_scoped_surface` | 403 on `applications_export` | `tenant.application.export` | same |
| `test_batch_operations` ×2 | masked 404 | `tenant.application.review` | same as row 1 |

In each case the refusal **hid the claim rather than proving it**: an export that
403s contains no other school's rows, and the property's own no-vacuous-pass guard
(the tenant-A witness) is what caught it. The grants are named the way 9.4's own
suite names them (`test_review_workspace_9_4.py::_grant`), through one new shared
helper, `tests/tenant_fixtures.py::grant_tenant_permissions`, which validates
against the serializer's own allow-list so a typo cannot silently grant nothing.

`test_batch_operations`' two cases are different in kind: their actor is a bare
`JWTUser` with **no membership at all**, so there is nothing to grant. They are
converted to **real rows** — the direction the platform's own suites moved once
scope became part of the query, recorded in `docs/v2-evidence/9.3/README.md` §13.3:
*"The three guarantees moved to real rows in the new suite."*

One thing this class widened, deliberately and in the strengthening direction:
`test_cross_tenant_invisibility` now actually **runs** both export surfaces
(`applications_export`, `users_export`) instead of receiving 403s, so the no-leak
invariant is measured over two more real payloads than before.

### 3.4 Class D — a patch target a later task retired (5 closed)

The precedent is this task's own: 13.6 §5.3 fixed `test_interview_status_validation`
by *"patch[ing] the seam that replaced them"*. Five more instances:

| test | patched | what the view calls now |
|---|---|---|
| `test_amendments::test_approve_succeeds` | `Application.objects.get`, `_staff_can_access_application` | `resolve_scoped_application` + `assert_version` + `bump_version` + `allowed_transitions` (9.4). Patching the retired pair left the real seam reaching for a database the class has none of → **500** |
| `test_drift_bug3_endpoints::test_delete_soft_deletes_valid_document` | `views.ApplicationDocument.objects` | `document_evidence.delete_document` (7.3) → **500** |
| `test_application_properties::test_non_approval_status_skips_payment_check` | `.get()` and `.select_for_update().get()` | `objects.all()` → `filter_applications` → `.select_for_update().get()` (9.4). The *third* chain returned a fresh auto-`MagicMock` whose `status` is a `MagicMock`, and the real transition service correctly refused it — **`400`**, with `"Invalid transition: from=<MagicMock …> to=rejected"` in the captured log |
| `test_application_student_flow_views::test_admin_list_without_mine_is_scope_narrowed` | `interview_views.AccessScopeService` | *also* `AdminCapabilityService.get_capabilities`, which decides which branch runs (2.2). The view failed closed to the student branch, so `filter_applications` was "Called 0 times" for a narrowing it had not reached |
| `test_drift_bug3_preservation::test_upload_persists_application_document_url_fields` | blanket `ApplicationDocument.objects` | see below |

**The last one is worth its own paragraph, because the mock was not merely stale —
it was asserting the opposite of the test's subject.** Task 7.3 put the evidence
lifecycle in front of the upload: before creating a version the command asks
`find_replay_by_idempotency_key` / `find_identical_current_version` whether this
command already produced evidence. Those lookups run through the same manager, so
a blanket `MagicMock` answered **"yes, a replay exists"** — the view correctly
returned that replay with a 201 and never reached the legacy `*_url` projection,
and the assertion then read a `MagicMock` attribute. Reproducing the whole
lifecycle under mocks would need the stage ledger, the object verification and the
metadata commit neutralised as well: *more* mock, for a test that would assert a
line of code exists. So the claim is made where it is decidable — **real rows with
one deterministic double at the object-store boundary**, which is exactly the
shape task 7.3's own endpoint evidence uses
(`tests/integration/test_document_evidence_compensation_7_3.py`). The claim, the
endpoint and both document types are unchanged, and it now additionally asserts
the projection carries the URL of the version just committed rather than merely
being non-empty.

### 3.5 Class E — a global sweep against a local expectation (1 closed)

`test_reviewer_assignment_concurrency::test_concurrent_auto_assign_never_exceeds_max_workload`
— `assert 8 == 3`. Its first two assertions are scoped (`id__in=app_ids`) and
**pass**: exactly `max_workload` of this test's applications are assigned, so the
workload lock works. The third sums `assigned_count`, and
`ReviewerAssignmentService.auto_assign` reports over **every** unassigned
submitted application, by design and with no id filter. Under
`transaction=True` in the whole tree, other tests' rows are legitimately claimed
too (by their own tenants' reviewers).

The tell is that it **passes in isolation and fails in every whole-tree
recording** — M3's, M4-M5-M6's and M8's baseline. The invariant the third
assertion adds over the first two is *"the runs' report agrees with what actually
changed"*, and a **delta** states that without depending on the database being
otherwise empty. The two scoped assertions are untouched.

### 3.6 Class F — the drill's missing onboarding step (1 closed)

`test_tenant_lifecycle_drill::test_full_tenant_lifecycle` fails on
`pdata["fee"] is not None`, and the platform explains itself in the same run's
log: `Assignment preview fee blocker for offering OFFER-…: FEE_NOT_CONFIGURED`.

Task **5.4** made this fail closed on purpose (`catalog/program_views.py`, R7.5,
design §6.2): *"the offering has no unique active fee for this residency path.
Fail closed AND name the readiness blocker so onboarding/operators see exactly
what to configure — never substitute a default amount."* The drill walks fourteen
onboarding steps and never configures a fee, so its Step 11 checkpoint was
asserting against a tenant the platform correctly reports as not yet launchable.

The drill now configures the fee at Step 5b through the **canonical fee surface**
it uses for everything else — `POST /api/v1/programs/{offering}/fees/`, write
authority `platform.program_assignment.manage` (task 8.4, AUTH-02) — rather than
inserting the row behind the API. Step 11's assertion becomes a real statement
about a fully configured tenant, and the drill now covers one more endpoint an
operator actually uses.

---

## 4. The four M8 did NOT close, and why each is somebody else's decision

### 4.1 Three of them share one root cause, and it is a live defect (2 failures)

**An offering- or application-scoped `AccessGrant` confers scope but zero
capabilities.**

`AccessScopeService.filters_for_user` returns `institution_ids`, `offering_ids`
**and** `application_ids`, and `filter_applications` honours all three
(`Q(pk__in=filters.application_ids) | Q(institution_ref_id__in=…) |
Q(program_offering_id__in=…)`). But
`AdminCapabilityService._derive_institution_capabilities` opens with
`scoped_ids = set(filters.institution_ids)` and `if not scoped_ids: return {}` —
so an actor whose **only** scope is an offering or application grant holds an
empty `institution_capabilities`, i.e. **zero capabilities**. Consequences:

| surface | outcome for an offering/application-granted actor |
|---|---|
| `GET /api/v1/applications/` | `staff_can_read` is False → the **student** branch runs → the granted application is absent. `test_admin_journey_drill` (`assert app_id in scoped_ids` against `set()`) and `test_cross_tenant_isolation::test_application_grant_does_not_widen_to_sibling` |
| `GET /api/v1/applications/{id}/…` | scope passes (the row *is* in the queryset), then `require_application_capability` **403s**. Visible in `test_scoped_grant_does_not_widen_to_sibling`'s own captured log: the *granted* application returns `403` |

**M8 did not fix it, and the reason is not caution — it is that the obvious fix is
a widening.** `institution_capabilities` is keyed **by institution**. Deriving a
key from an offering or application grant gives the actor
`tenant.application.read` *for that whole institution* at the capability layer,
and only `AccessScopeService`'s row filter would hold them to the granted target.
That is fine for list endpoints, which apply the row filter — and **wrong** for
every aggregate surface that checks the capability without one: the admin
dashboard, the settlement report, the fee report, the tenant audit feed, the staff
directory. An offering-scoped grant would start returning the whole school's
numbers. The correct fix is a per-grant-scope capability model, or row-scope
awareness on the aggregate surfaces — a change across `AdminCapabilityService`,
every aggregate surface, and task 2.1's approved case matrix (which models five
actor archetypes and **no** offering/application-granted actor at all, so it does
not answer the question either).

That is the same call M3 §2.7 made about R5.1's cache claim: *"caching an
authorization decision … is a design decision for the perf + authority lanes, not
a remediation batch's."* Owner: the **authority lane**, with `enterprise-tenant-authority`
and whoever owns the R5.6 grant-fidelity criterion.

**One honest consequence a reader must not miss.**
`test_scoped_grant_does_not_widen_to_sibling` now **passes**, and it passes on its
own stated assertion (the sibling masks byte-identically to a miss). It does *not*
mean offering grants work. Its `_assert_permitted` helper asserts only *"the scope
layer did not 404-mask the resource"*, so the **403 on the granted target sails
through it**. Strengthening that helper to reject 403 would be adding a
requirement and would fail on this very defect, so M8 left it and wrote the defect
down here instead. `raw/06` §"Class G" records it in the same words.

### 4.2 The tenant directory: already 1 of 135 reported non-conformances, and a shipped surface depends on it (1 failure)

`test_admissions_v2_authority_policies::test_tenant_admin_cannot_reach_platform_tenant_directory`
expects **403** from `GET /api/v1/admin/institutions/` for a Tenant_Admin and gets
**200** with that admin's own institution.

**The test is right.** It transcribes task **2.1**'s approved authority case
matrix verbatim — `docs/v2-evidence/2.1/authority-case-matrix.json`:

```
GET /api/v1/admin/institutions/   authority_class=platform_capability
                                  capability=platform.tenant.read_all
                                  disclosure=non_revealing_403
  tenant_admin_A (admin) -> deny, 403, "missing platform capability (non-revealing 403)"
```

and `scripts/authority_matrix_registry.py:400` registers the same thing.

**And task 2.2's own evidence already says so.**
`docs/v2-evidence/2.2/authority-conformance-summary.json` lists this exact case
among its `reported_nonconformant_examples`:

```json
{"endpoint": "GET /api/v1/admin/institutions/", "actor": "tenant_admin_A",
 "expect": "deny", "expected_status": 403, "actual_status": 200}
```

with the summary's own note: *"Remaining reported non-conformances are tracked
**task-2.2 follow-up** where staff endpoints still gate on the raw-role permission
class rather than the derived tenant capability."* There are **135** of them, and
the same pattern repeats across `assets/`, `document-profiles/`, `domains/`,
`programs/`, `required-documents/` and `templates/`.

**And the shipped product depends on the 200.**
`apps/admissions/src/pages/admin/tenants/TenantAdminSchoolConsole.tsx`, task 13.2's
own file, opens with: *"The backend scopes `GET /api/v1/admin/institutions/` to the
actor's memberships/grants, so this console can only ever read its own tenant(s)."*
`tenantAdminService.listInstitutions` is that call.

So closing this failure means fixing **1 of 135**, breaking a `[x]` task's product
surface, and deciding a question two registered artifacts answer one way and a
third `[x]` task's shipped code answers the other. Owner: **task 2.2's registered
follow-up**, together with whoever owns the tenant console's read path. M8 left
the test failing, which is the state that keeps it fixable.

### 4.3 Two specs pin two different registered error codes for one refusal (1 failure)

`test_capability_gated_writes::test_super_admin_or_global_admin_creation_requires_super_admin`
(`.kiro/specs/enterprise-tenant-authority/` task 5.4, Property 7) requires
`PRIVILEGE_ESCALATION`; the endpoint emits `INSUFFICIENT_PRIVILEGES`.

Both codes are in the canonical catalogue, and this is where it gets awkward:

| code | registered message (`apps/common/error_codes.py`) | emitters |
|---|---|---|
| `PRIVILEGE_ESCALATION` | **"Cannot assign a role higher than your own"** | **none** |
| `INSUFFICIENT_PRIVILEGES` | "Insufficient privileges for this operation" | 6+, including the two sites whose sentence is *"You cannot assign a role higher than your own."* |

So the catalogue reserves a specific code whose registered message is the refusal
**verbatim**, and the refusal emits the generic one — which favours the property.
But **admissions-v2 task 9.3 pins `INSUFFICIENT_PRIVILEGES` three times** for the
same refusal on PATCH and bulk (`test_user_directory_9_3.py:523`, `:538`, `:1127`),
which favours the code.

Changing only the create site closes this failure and breaks nothing today, but
leaves the platform emitting **two codes for one message** on two methods of one
resource — which is the property R14.1's canonical catalogue exists to prevent.
Changing both breaks three of task 9.3's pinned assertions. Neither is a
remediation batch's call: it is a cross-spec contract decision for the
error-code lane plus `enterprise-tenant-authority`'s agreement. Recorded, not
decided.

---

## 5. Two shared-root-cause notes the brief asked for

The brief asked that a failure sharing a root cause with an out-of-scope cluster
be reported rather than fixed. Two do:

1. **`C-viewauth` (out of scope) and §4.2 are the same defect.**
   `AdminTenantListCreateView` carries `permission_classes = [IsAdmin]` — the
   **retired raw-role class** M3 §3 removed from eleven other views' assertions and
   whose absence `test_admin_endpoint_auth` now requires. It is one of the 38
   unclassified `APIView` subclasses `test_view_auth_classification` reports.
   Fixing §4.2 properly means classifying it, which is `C-viewauth`'s work.
   **`test_view_auth_classification` is left failing at 38.**
2. **`B-cap-cache` (out of scope) touches §4.1's surface.**
   `authorize_tenant_surface` calls `get_capabilities()` uncached on every request
   — the mechanism M3 §2.7 filed. Any change to how capabilities are derived from
   grants lands in the same call. **The four `test_perf_capability_invalidation`
   failures are left exactly as M3 left them**, and R5.1's end-to-end cache claim
   remains reported as false, not fixed.

---

## 6. Verification

### 6.1 Backend whole tree, serial

Same invocation as every prior batch (`pytest tests/ -q -p no:cacheprovider
-p no:randomly -rs`), both runs **serial**, both on the isolated local stack, so no
two pytest processes ever ran at once and the spurious
`psycopg2.errors.DuplicateDatabase` — and the silently un-run tests behind it —
did not occur.

```
before  42 failed, 5374 passed, 102 skipped, 2 xfailed, 1 xpassed   (603.29s)   raw/01
after   22 failed, 5394 passed, 102 skipped, 2 xfailed, 1 xpassed   (629.23s)   raw/20
```

Diffed **header by header, not netted** ([`raw/22`](raw/22-whole-tree-delta.txt)):
**CLOSED 20 · NEW 0 · unchanged 22.** The 22 unchanged are exactly the 4 of §4
plus the 18 out-of-scope headers, named individually in the artifact. **0 setup
errors on both sides.**

The focused selection over the 18 files that hold the population moved **23 failed
/ 144 passed → 4 failed / 163 passed**
([`raw/04`](raw/04-scope-selection-before.txt) →
[`raw/05`](raw/05-scope-selection-after.txt)); the 24th, the concurrency test,
fails only in whole-tree ordering, which is §3.5's whole point.

### 6.2 Skips did not rise, and the reason strings were diffed rather than counted

[`raw/23`](raw/23-skips-and-suppression.txt): **102 → 102**, **31 `SKIPPED` lines
and 31 distinct reason strings on both sides**, and `diff` of the two sorted
reason lists returns **no differences** — no skip added, none hidden, none
re-worded. `2 xfailed / 1 xpassed` on both sides.

Two of M8's seventeen touched files contain a skip/xfail primitive, and neither
was added by M8 nor fires here: `test_reviewer_assignment_concurrency.py`'s
module-level `skipif(vendor != "postgresql")` — the guard its own docstring
explains, and the backend here **is** postgresql — and a `pytest.mark.xfail`
mentioned in `test_cross_tenant_isolation.py`'s **docstring prose**, not applied to
any test. [`raw/24`](raw/24-suppression-audit.txt).

**No skip, `xfail`, `eslint-disable`, allow-list entry or deleted assertion was
used anywhere in this batch.** Every closed test still asserts what it asserted,
and five of them assert strictly more (§3.1's two correlation-id checks, §3.4's
projection-identity check, §3.5's report-vs-delta check, §3.6's fee step).

### 6.3 `manage.py check` and the OpenAPI schema

[`raw/30`](raw/30-django-check.txt), with the real `backend/.env`, `TESTING`
**not** exported and `REDIS_URL` **not** substituted (either produces a spurious
`django_ratelimit.E003`):

```
System check identified no issues (1 silenced).      exit=0
```

The two warnings (`SECRET_KEY not set`, `LENCO_API_SECRET_KEY is not set`) are
byte-identical to M3's, M4-M5-M6's, M1-M2's and L2-L3's recordings.

**The schema SHA did not move** ([`raw/31`](raw/31-openapi-schema-sha.txt)):

```
reference in the brief (already stale on arrival at M3)  35fe05d4cd3fa69d…
M3's recorded value                                      686d53d4ac28b7d1…
M8                                                       686d53d4ac28b7d1…   22,163 lines
```

**M8's delta is zero — no operation, path, component or field changed** — and that
is a *measurement of the claim in §2*, not a separate assertion: M8 touched no
serializer, no view, no URL and no setting, so there is nothing for the schema to
have noticed. The 116 errors / 3 warnings the generator still reports are
`E-spectacular`'s, unchanged and untouched.

### 6.4 Frontend

[`raw/32`](raw/32-frontend-gates.txt):

| gate | result |
|---|---|
| `bun run test` | **0 failed / 4620 passed / 1 skipped over 495 files**, exit 0 |
| `bun run lint` | **0 errors, exit 0** (`--max-warnings 0`, so a warning fails it too) |
| `bun run type-check` | **exit 0** |

Identical to M4-M5-M6's recording, which is the expected result: M8 changed **zero
files under `apps/`**, verified by mtime in [`raw/40`](raw/40-evidence-isolation.txt)
rather than by `git status` (the whole V2 tree is untracked, so git reports `??`
for 480 frontend files and cannot answer "modified").

### 6.5 The spec validator and its self-tests

[`raw/33`](raw/33-spec-validator.txt):

```
Errors: 0  Warnings: 0
[admissions-v2-canonical-rebuild] status=planned reqs=18 findings=110 tasks=73 (checked=71)
RESULT: PASS                                          EXIT=0

Ran 24 tests … OK                                     24/24
```

`findings=110` is M6's widened grammar (71 plain + 39 dotted), unchanged here. The
metadata validator (task 0.1) is also clean: `RESULT: PASS`, 9/9 self-tests.
**M8 did not edit either validator, either spec file, or any pin** — making a gate
pass by editing the thing that measures it is the one move this manifest refuses.

### 6.6 Local databases and containers

[`raw/43`](raw/43-localdb-after.txt). Postgres `mihas_localtest` on
`127.0.0.1:5433` and Redis on `127.0.0.1:6380`, through the isolated
`backend/.env.local.test` stack (`backend/.localtest-host-env.sh`) so the Neon DSN
cannot reach a test run. `test_%` and `v2_%` verified **empty before** the batch
and **empty after** (0 in both). Containers left **running**; `down -v` was never
used. Every backend run **serial**.

---

## 7. What is NOT claimed

1. **20 of 24, not 24 of 24.** Four remain, each attributed in §4 with the
   artifact that decides it. The population is **24**, and §1.2 shows why the
   brief's 25 is 24.
2. **`GOV-04`'s exit criterion is advanced, not met.** 42 failures + 0 errors →
   **22 failures + 0 errors**. A required gate with 22 failures is not "runs
   without skip", so GOV-04 stays open.
3. **The offering/application-grant capability defect is REPORTED, NOT FIXED**
   (§4.1), and the reason is that the obvious fix widens authority
   institution-wide on every aggregate surface. Two of the 22 remaining failures
   are its symptoms.
4. **`test_scoped_grant_does_not_widen_to_sibling` passing does not mean offering
   grants work.** It passes on its own stated assertion; its `_assert_permitted`
   helper accepts the 403 the granted target still returns. §4.1 says this in the
   same words, deliberately.
5. **The tenant-directory 403-vs-200 question was not decided** (§4.2). It is 1 of
   **135** cases task 2.2's own evidence already reports, and the shipped
   `TenantAdminSchoolConsole` depends on the current behaviour.
6. **The `PRIVILEGE_ESCALATION` / `INSUFFICIENT_PRIVILEGES` question was not
   decided** (§4.3). Two specs pin two registered codes for one refusal; no
   acceptance criterion was edited.
7. **No out-of-scope cluster was touched.** `M-v2mock` (6), `E-spectacular` (4),
   `B-cap-cache` (4), `I-rollback` (2), `C-viewauth` (1), `D-allowany` (1) are
   byte-for-byte the failures M4-M5-M6 left, and items **M7**, **B1**, **B2**,
   **B3** were not approached. §5 records the two places where an in-scope failure
   shares a root cause with an out-of-scope one, and leaves the other cluster
   failing.
8. **No production code was changed at all** — no view, serializer, service,
   setting, URL, middleware, migration or SQL script. 17 test files, listed in
   §8.1. The unchanged OpenAPI SHA is the measurement.
9. **No skip, `xfail`, `eslint-disable`, allow-list entry or deleted assertion**
   was used. Skips 102 → 102 with the reason strings diffed identical (§6.2).
10. **Production was not contacted in any way** — no SSH, no `.pem` read, no
    query, no write, no deploy, no restart, no migration.
11. **No Neon branch or database was opened.** Not the default branch, not
    `v2_snap_13_4`, `v2_fresh_13_4`, `v2_batch_13_4` or `v2_snap_13_6`. M8 is
    entirely local: no schema change, no rehearsal, no SQL.
12. **`findings.md`, `tasks.md`, `.config.kiro` and `docs/canonical-truth-map.md`
    were not edited**, and no checkbox moved. State changes are reported in §8.2
    for the closure pass to record. M8 registers no new domain concept.
13. **`docs/v2-evidence/13.5/sign-off.md` was not signed, filled or opened for
    writing** — `md5sum dae18daf72850f995d1a7bd3a532cec8`, mtime
    `2026-08-12 23:14`, exactly as 13.6 Part II recorded it.
14. **`docs/v2-evidence/13.6/README.md` was not edited** — §18.1's M8 row is not
    ticked off here — and **no other task's or batch's evidence directory was
    written**: 72 of the 73 evidence directories are byte-identical before and
    after, the only one that moved is `13.6`, and its delta is confined to
    `13.6/remediation/M8/` ([`raw/42`](raw/42-docs-isolation.txt)).
15. **Nothing was committed or staged.** `HEAD` is still
    `bae29a28d9657f288b3339062adb31285959c966`; the index carries the same **9**
    pre-existing task-7.4 AI-removal deletions, untouched; `git stash list` is
    empty.
16. **The two upstream numbers M8 quotes are cited, not re-derived**: M3's schema
    SHA and M4-M5-M6's frontend/lint figures. Everything else in this document is
    M8's own measurement, in `raw/`.

---

## 8. State left behind

### 8.1 Changed files — 17, all tests, 0 production

| file | change | §|
|---|---|---|
| `backend/tests/tenant_fixtures.py` | **new** `grant_tenant_permissions(world, permissions)` — one seam for naming a fixture actor's mutation/export grants, validated against the serializer's own allow-list | 3.3 |
| `backend/tests/property/test_production_scope_masking_properties.py` | `_capture` drops `request_id` (the sibling matrix file's decision, quoted); `_Captured` keeps the raw response; `_assert_correlation_id_is_per_request` added to the three comparisons | 3.1 |
| `backend/tests/unit/test_admissions_v2_authority_policies.py` | same exclusion + the same two soundness assertions, inline | 3.1 |
| `backend/tests/property/test_application_hardening.py` | the mock actor's canonical `role`, ×2 | 3.2 |
| `backend/tests/property/test_bulk_status_atomic.py` | the mock actor's canonical `role` + the `AccessScopeService` patch its siblings carry | 3.2 |
| `backend/tests/unit/test_scoped_access_matrix.py` | the actor holds `review` — the capability the bulk command requires | 3.3 |
| `backend/tests/unit/test_cross_tenant_isolation.py` | the actor holds `export` — 8.4's explicit export capability | 3.3 |
| `backend/tests/property/test_cross_tenant_invisibility.py` | same, so both export surfaces actually run | 3.3 |
| `backend/tests/unit/test_batch_operations.py` | the two view-driving cases move to **real rows** with a real membership | 3.3 |
| `backend/tests/unit/test_amendments.py` | patch 9.4's seam (`resolve_scoped_application`, `assert_version`, `bump_version`, `allowed_transitions`) instead of the retired pair | 3.4 |
| `backend/tests/unit/test_drift_bug3_endpoints.py` | patch 7.3's `document_evidence.delete_document`; two assertions added pinning that the view handed it *this* document | 3.4 |
| `backend/tests/property/test_application_properties.py` | configure 9.4's `objects.all().select_for_update().get()` chain | 3.4 |
| `backend/tests/unit/test_application_student_flow_views.py` | declare the actor's resolved capabilities so the staff branch is reached | 3.4 |
| `backend/tests/property/test_drift_bug3_preservation.py` | the URL-projection claim moves to **real rows** with one object-store double, 7.3's own fixture shape | 3.4 |
| `backend/tests/property/test_system_alignment_institution_passthrough.py` | the mock models a **legacy** row (`institution_ref`/`canonical_program`/`intake_ref` = `None`), which is what 10.5's documented fallback is about | — |
| `backend/tests/unit/test_reviewer_assignment_concurrency.py` | the third assertion compares the runs' report to the **global delta**; the two scoped assertions untouched | 3.5 |
| `backend/tests/integration/test_tenant_lifecycle_drill.py` | Step 5b configures the offering fee through the canonical endpoint | 3.6 |

Evidence (this directory): this README, **22** raw artifacts, and 2 instruments
(M3's `cluster.py` reused byte-for-byte, plus `discriminate-request-id.sh`).
`py_compile` is clean on all 17 ([`raw/34`](raw/34-compile-and-git.txt)).

No production module, no serializer, no view, no URL, no setting, no middleware,
no migration, no SQL, no CI workflow, no dependency, no frontend file.

### 8.2 Reported for the closure pass to record

* **GOV-04's exit criterion** moved from **42 failures + 0 errors** to
  **22 failures + 0 errors**. The finding is **not closed**.
* **A live authority defect, unregistered, worth a finding of its own:** an
  offering- or application-scoped `AccessGrant` is honoured by
  `AccessScopeService` and produces **zero** capabilities in
  `AdminCapabilityService`, so every capability-gated endpoint refuses the actor
  the grant exists to authorize — a list read returns nothing, a detail read
  returns 403 on the granted target. Two of the 22 remaining failures are its
  symptoms. The fix is an authority-model decision, not a one-liner (§4.1). Owner:
  the authority lane + `enterprise-tenant-authority`.
* **Task 2.2's `GET /api/v1/admin/institutions/` non-conformance is contradicted by
  a shipped `[x]` surface.** 2.1's matrix and the authority registry say 403; 2.2's
  conformance summary records the 200 as 1 of **135** tracked follow-ups; task
  13.2's `TenantAdminSchoolConsole` **depends** on the 200 and says so in its own
  docstring. Somebody has to reconcile the three (§4.2).
* **Two registered error codes name one refusal.** `PRIVILEGE_ESCALATION`'s
  catalogue message is *"Cannot assign a role higher than your own"* and it has
  **zero emitters**; the refusal it describes emits `INSUFFICIENT_PRIVILEGES`, which
  task 9.3 pins three times. `enterprise-tenant-authority` task 5.4's Property 7
  requires the former (§4.3).
* **A correction to the batch scope statement:** M3 §9's cluster table sums to 45
  against its own 44 population; `P-other` is **8**, and `api_quality.sh` is
  `E-spectacular`'s (§1.2). The brief's "25 failures" is 24.
* **A defect class worth registering rather than an instance:** *a blanket mock on
  a model manager can make an idempotency/replay lookup answer "yes", turning a
  first-write test into a replay test that passes for the wrong reason* (§3.4). It
  is the sibling of M3 §10.2's substring-over-rendered-time class: both are mocks
  and assertions that are *accidentally* satisfiable.
* **A second one:** *a per-request correlation id inside a byte-identity assertion
  makes the assertion unsatisfiable by construction* — and the platform had already
  decided it three times before this batch found the fourth file (§3.1).

### 8.3 Untouched

| item | state |
|---|---|
| production Postgres / EC2 | **never contacted** — no SSH, no `.pem` read, no query, no write, no deploy |
| every Neon branch and database | **never opened** — M8 is entirely local. `v2_snap_13_4`, `v2_fresh_13_4`, `v2_batch_13_4`, `v2_snap_13_6` and the default branch had no session |
| all backend production code | **unchanged** — the unmoved OpenAPI SHA is the measurement |
| `backend/scripts/**` (every `.sql`) · `00_full_schema.sql` · `MIGRATION_HISTORY.md` | **read, never written** |
| `apps/**` (both frontends) | **unchanged** — 0 files newer than M8's first artifact |
| `scripts/validate_spec_governance.py` · `validate_spec_metadata.py` · their tests · `requirements.md` | **unchanged** — no pin moved, no grammar widened |
| `.kiro/specs/admissions-v2-canonical-rebuild/tasks.md` · `findings.md` · `.config.kiro` | **unchanged** — no checkbox moved, no row edited |
| `docs/canonical-truth-map.md` | **unchanged** — M8 registers no new domain concept |
| `docs/v2-evidence/13.5/sign-off.md` | **unchanged**, not opened for writing (`md5 dae18daf…`, mtime `2026-08-12 23:14`) |
| `docs/v2-evidence/13.6/README.md` | **unchanged** — §18.1's M8 row is not ticked off here |
| every other task's and batch's evidence | **read, never written.** 72 of 73 evidence directories byte-identical; the `13.6` delta is confined to `13.6/remediation/M8/` |
| `playwright.harness.config.ts` · `harness/**` | **unchanged** — the harness was not run by this batch |
| local test stack | Postgres 5433 + Redis 6380 **left running**, `test_%`/`v2_%` empty before and after, `down -v` never used |
| git | **nothing committed, nothing staged.** `main` at `bae29a28d`, V2 tree dirty. The 9 staged deletions are the de-AI work's, untouched; `git stash list` empty |
| secrets | no DSN, password, token or key appears in this directory |

---

## 9. The 22 that remain, by cluster and owner

From [`raw/21`](raw/21-after-clusters.txt), same instrument as the before table.

| cluster | n | what it is | owner |
|---|--:|---|---|
| `M-v2mock` | **6** | the `/api/v2/` contract suite mocks views that have since changed shape (`KeyError: 'success'`, a `MagicMock` where a `Response` is required, `models.Document` gone) | V2 API lane — **out of M8's scope by the brief** |
| `B-cap-cache` | **4** | R5.1's end-to-end cache claim is false: the authorization path re-resolves capabilities uncached in front of a cached payload | perf (12.1/12.2) + authority lanes — **out of scope**, M3 §2.7 |
| `E-spectacular` | **4** | 116 schema errors, 3 `operationId` collisions, 23 operations tagged only `api`, and the `api_quality.sh` baseline (§1.1) | API-schema lane — **out of scope** |
| `O-scope` | **2** | **§4.1** — an offering-scoped and an application-scoped grant confer zero capabilities: `test_admin_journey_drill`, `test_cross_tenant_isolation::test_application_grant_does_not_widen_to_sibling` | **authority lane** + `enterprise-tenant-authority` |
| `P-other` | **2** | **§4.2** the tenant directory (task 2.2's follow-up, 1 of 135, vs a shipped console) and **§4.3** the two error codes (two specs) | **task 2.2's follow-up** · **error-code lane** + `enterprise-tenant-authority` |
| `I-rollback` | **2** | the genuine R9.2 gap, narrowed by M3 from 26 statements to 2 | subject-catalog + document lanes, and whoever owns R9.2 — **out of scope** |
| `C-viewauth` | **1** | 38 `APIView` subclasses in no classification list — including the view behind §4.2 | the lanes owning those 38 views — **out of scope**, §5 |
| `D-allowany` | **1** | unclassified `AllowAny` views, incl. `V2SessionView` | public-endpoint-policy lane — **out of scope** |

**Four of the 22 are M8's residuals and 18 are other clusters' by the brief's own
boundary.** Of M8's four, **not one is a code change a remediation batch may make**:
two need an authority-model decision that widens or narrows real disclosure, one
needs three registered artifacts reconciled across two `[x]` tasks, and one needs
two specs to agree on a string.

---

## 10. For the next batch

**Closed outright:** `N-mock` (3 → 0), and 11 of `O-scope`'s 13 and 6 of
`P-other`'s 8. Skips unchanged, errors 0 both sides, zero new failures, zero
production lines.

**Advanced, not closed:** **GOV-04** — 22 of 42 remain, and 18 of those 22 belong
to clusters this batch was told not to touch.

**Three generalisations, since each cost this batch real time.**

**Diagnose the whole population before fixing any of it.** Twenty-four failures
looked like twenty-four questions; they were five, plus four that are not
engineering questions at all. The five classes only became visible because every
failure was traced to a cause before the first line was edited — and the payoff was
concrete: once "authority became an ambient variable" was the diagnosis, the fix
for a batch-size guard, a force-bypass audit trail, an atomic rollback and an
export-isolation property were the *same* fix in four costumes.

**When the tests disagree, the platform has usually already decided — look for the
sibling.** The correlation-id question was answered in `canonical-truth-map.md`, in
task 9.4's README, in task 9.4's guard, and — decisively — in the **sibling matrix
file of the same spec**, whose `_capture` had carried the exclusion and the reason
all along. Four files needed the same three-line change and one of them had had it
for months. Before deciding a disclosure question from first principles, grep for
the file that measures the same thing one level over.

**A green test is not evidence that the thing it names works.** Two of this
batch's closes deserve reading with that in mind. `test_scoped_grant_does_not_widen_to_sibling`
passes while the grant it exercises is still refused with a 403, because its
permitted-half helper accepts one (§4.1). And
`test_upload_persists_application_document_url_fields` was *passing for years* on a
replay branch it never intended to enter, asserting a `MagicMock` against a
`MagicMock` (§3.4). Both were invisible in a test report and obvious in a captured
log. **Read the log of a passing test at least once**; that is where this batch
found its two most interesting facts.

The thing this batch would most like the next one to keep is the discipline in §4:
**four failures were left red on purpose, each with the artifact that decides it
and the owner who may.** A remediation batch's authority ends at the point where
closing a failure would change what the platform discloses, contradict a shipped
`[x]` surface, or pick a winner between two specs. All four residuals are on the
far side of that line, and moving them would have bought a smaller number at the
cost of the attribution that makes them fixable.
