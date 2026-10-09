# Task 13.6 remediation — L1 and L4

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · remediation items **L1** and
**L4** of [`docs/v2-evidence/13.6/README.md`](../../README.md) §8.1
Requirements: **R7.6, R10.6, R4.4, R14.3**
Findings: **DATA-01**, **STU-01** (both P0) via **GATE-13.2-01** / **GATE-13.5-02**;
blocking items **B4** and **B9**

---

## THE VERDICT: L1 CLOSED · L4 CLOSED

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  L1 — cross-tenant capacity/config read by display name    **CLOSED**    │
  │  L4 — the 36 stale assertions the 13.1-02 guard uncovered   **CLOSED**    │
  │                                                                          │
  │  GATE-13.2-01  closed        GATE-13.5-02  closed                        │
  │  B4            closed        B9            closed                        │
  │  DATA-01 / STU-01 (P0): the Phase 13 contradiction is cleared            │
  │                                                                          │
  │  Whole tree:   −32 failures · +40 passes · error count UNCHANGED (1)     │
  │  NOT closed:   B1 B2 B3 B5 B6 B7 B8 B10 B11 — untouched, by design       │
  └──────────────────────────────────────────────────────────────────────────┘
```

| | before | after |
|---|---|---|
| cross-tenant reproduction (7 tests) | **5 failed / 2 passed** | **7 passed** |
| 12-file corpus | **36 failed / 55 passed** | **91 passed / 0 failed** |
| whole backend tree | 128 failed / 5192 passed / 104 skipped / 1 error (13.6's baseline) | **96 failed / 5232 passed / 103 skipped / 1 error** |

Sources, in order:
[`raw/L1-cross-tenant-test-before.txt`](raw/L1-cross-tenant-test-before.txt) ·
[`raw/L1-cross-tenant-test-after.txt`](raw/L1-cross-tenant-test-after.txt) ·
[`raw/corpus-before.txt`](raw/corpus-before.txt) ·
[`raw/corpus-after.txt`](raw/corpus-after.txt) ·
[`raw/backend-whole-tree-after.txt`](raw/backend-whole-tree-after.txt) (524.12 s).
The 13.6 baseline column is `docs/v2-evidence/13.6/raw/backend-whole-tree-after.txt`
(270.69 s), cited as 13.6's and not re-derived here.

**The surviving error is not this batch's.** `tests/property/test_ip_address_column.py`
still fails at `setUpClass` because its raw-insert factory does not supply the
`NOT NULL assignment_version` column
(`raw/backend-whole-tree-after.txt:82`, `psycopg2.errors.NotNullViolation:
null value in column "assignment_version" of relation "applications"` at `:84`).
That is 13.1's cluster **E** — pre-existing, untouched, and the error count is
1 before and 1 after.

---

## 1. The whole-tree delta, reconciled

`−32 failures` is a net figure and the composition matters more than the total:

| component | failures | passes |
|---|---:|---:|
| the 36 corpus failures, fixed (§3) | **−36** | **+36** |
| `tests/unit/test_cross_tenant_capacity_canonical_id.py` — a **new** file, 7 tests (§2) | 0 | **+7** |
| one previously-skipped test now runs, and passes (§1.1) | 0 | **+1** |
| **4 failures that are new in this run** (§4) | **+4** | **−4** |
| | **−32** | **+40** |

5192 + 36 + 7 + 1 − 4 = **5232**. 128 − 36 + 4 = **96**. Summing each run's own
outcome lines plus its one errored case gives 5428 → **5435**, a difference of
exactly the 7 new tests. Nothing in the delta is unaccounted for, and §4 is where
the +4 is named rather than netted away.

### 1.1 Skips 104 → 103 — one test that used to skip now runs

Not hidden, and it is identifiable. Diffing the two runs' `-rs` skip blocks
yields exactly one removal:

```
- SKIPPED [1] tests/property/test_production_cors_pagination_fix_exploration.py:81:
              Cannot import prod settings without full env
```

That skip is a **runtime** `try: from config.settings.prod import AUTH_COOKIE_SAMESITE
/ except: pytest.skip(...)` guard
(`backend/tests/property/test_production_cors_pagination_fix_exploration.py:78-81`),
preceded by a block of `os.environ.setdefault(...)` calls. Whether it fires depends
on the process environment and import order, not on any code L1 or L4 touched. In
this run the prod-settings import succeeded, so the case ran — and passed (it is
absent from the failure output). The other 32 skip reasons are byte-identical
across the two runs.

So: **not a regression, and not a skip anyone added.** It is also not something
this batch caused; it is an environment-conditional guard that happened to
resolve the other way. Recorded because "104 → 103" read without explanation
looks like a test was quietly retired.

---

## 2. L1 — five reads that resolved a canonical row by display name

### 2.1 The defect in one line

```python
Intake.objects.filter(name=application.intake, is_active=True).first()   # WRONG
```

`docs/canonical-truth-map.md:1241-1249` is explicit: `applications.institution /
program / intake` are **display snapshots only** — "read-only mirrors, never the
authority for new business logic (R1.2, R1.3)" — and the canonical IDs
(`institution_id`, `program_id`, `program_offering_id`, `intake_id`) are the sole
authority for routing, scoping and tagging. A name-keyed lookup has **no
ordering**, so when two tenants share an intake name the row Postgres happens to
yield first wins, and a staff read publishes *that* tenant's number on *this*
tenant's application.

### 2.2 The five production call sites

| # | site | before | after |
|---|---|---|---|
| 1 | `backend/apps/applications/student_draft_views.py:195-197` — `ApplicationDetailView.get` (`GET /api/v1/applications/{id}/`), the primary site 13.2 measured as `student_draft_views.py:185` | `Intake.objects.filter(name=app.intake, is_active=True).first()` then two payload keys | `data.update(intake_capacity_fields(app))` |
| 2 | `backend/apps/applications/admin_review_views.py:947-949` — the review command's capacity echo | `Intake.objects.filter(name=intake_name, is_active=True)…` where `intake_name = getattr(app, "intake", None)` | `response_data.update(intake_capacity_fields(app))` |
| 3 | `backend/apps/applications/review_queue.py:53,61-63` — `ReviewQueueScorer._deadline_urgency` | `Intake.objects.filter(name=application.intake).first()` | `resolve_intake(application)` |
| 4 | `backend/apps/applications/enrollment_service.py:768,793-795` — `EnrollmentService.compute_deadline` | `Intake.objects.filter(name=application.intake, is_active=True).first()` | `resolve_intake(application, require_active=True)` |
| 5 | `backend/apps/applications/services.py:113-132,822` — the late-application fee gate | `Program.objects.filter(name=application.program, is_active=True).first()` | `_resolve_offering_for_fees(application)` → `resolve_offering(application, require_active=True)` |

All five now route through one new module,
`backend/apps/applications/canonical_reads.py` (149 lines):
`canonical_intake_id` (`:80`), `canonical_offering_id` (`:85`), `resolve_intake`
(`:90`), `resolve_offering` (`:113`), `intake_capacity_fields` (`:131`), over a
shared `_coerce_uuid` (`:65`) that mirrors the existing guards in
`services.py::_coerce_uuid` and `capacity_service.py::_coerce_uuid`.

### 2.3 The five failures, each with the test that proves it

[`raw/L1-cross-tenant-test-before.txt`](raw/L1-cross-tenant-test-before.txt) —
`5 failed, 2 passed, 4 warnings in 3.31s`. Every case lives in
`backend/tests/unit/test_cross_tenant_capacity_canonical_id.py` (293 lines, new),
which builds two tenant worlds sharing **one intake name** with deliberately
different capacities (`A_CAPACITY = 41`, `B_CAPACITY = 97`), deadlines, calendar
events and fees:

| # | test | leak, as the assertion stated it |
|---|---|---|
| 1 | `TestStaffApplicationReadCapacity::test_read_publishes_own_tenant_capacity_never_the_other` (`:148`) | tenant A's application reported tenant B's capacity — `AssertionError: assert 97 == 41` |
| 2 | `TestStaffApplicationReadCapacity::test_legacy_row_without_canonical_intake_publishes_no_capacity` (`:175`) | a row with `intake_ref=None` **must publish no capacity** instead of falling back to a name lookup — `assert 'intake_capacity' not in {…}` failed |
| 3 | `TestReviewQueueDeadlineUrgency::test_urgency_uses_own_intake_deadline` (`:222`) | A's own deadline is 60 days out, so urgency 50; it scored the other tenant's 5-day deadline — `assert 80 == 50` |
| 4 | `TestEnrollmentDeadlineCalendar::test_deadline_comes_from_own_tenant_calendar_event` (`:254`) | the enrollment deadline came from the other tenant's calendar event — `assert datetime.date(2026, 9, 12) == datetime.date(2027, 3, 1)` |
| 5 | `TestLateFeeOffering::test_late_fee_resolves_own_offering_fee` (`:286`) | failed on `ImportError: cannot import name '_resolve_offering_for_fees' from 'apps.applications.services'` — the seam did not exist and had to be introduced |

The two that passed on unfixed code are there on purpose, and one of them is a
caveat rather than a clean bill:

- `test_read_of_other_tenant_application_is_still_not_found` — the **pairing** that
  makes row 1 mean *scope* rather than mere absence: the same actor cannot read
  tenant B's application at all (masked 404, R4.4). Required by
  `.kiro/steering/enterprise-tenancy.md` ("Cross-tenant denial tests are
  required").
- `TestReviewCommandCapacity::test_review_response_echoes_own_tenant_capacity` —
  site 2 carried the identical defect, and its test passed before the fix because
  an **unordered** name lookup happened to return the right row in that recording.
  An unordered lookup returning the right answer once is not a guarantee, which
  is why the site was fixed anyway.

After: [`raw/L1-cross-tenant-test-after.txt`](raw/L1-cross-tenant-test-after.txt) —
`7 passed, 4 warnings in 1.52s`.

### 2.4 The fix shape, and the rule it encodes once

1. **Resolve through the canonical id the application already carries.** The
   helpers key only on `intake_ref_id` / `program_offering_id`
   (`canonical_reads.py:80-88`). There is no name to collide on, so the read
   cannot reach another tenant.
2. **Fail closed when the canonical id is absent.** A legacy pre-5.2 row gets
   `None` / `{}` — never a name lookup. `intake_capacity_fields` returns an
   **empty mapping** and callers `update()` it, so the keys are simply absent
   from the payload rather than present-but-wrong (`canonical_reads.py:131-149`).
   `_resolve_offering_for_fees` returning `None` means *no fee authority exists
   for this row*, so the late-fee gate does not run — "demanding an arbitrary
   same-name tenant's fee is worse than demanding none" (`services.py:113-132`),
   the same rule `FeeResolver` already states as "fails closed — never an
   invented default".
3. **Never fall back to the display snapshot.** That is the whole of
   `docs/canonical-truth-map.md:1241`'s "display snapshots only".
4. **These helpers are not an authorization seam and must not be used as one.**
   Every caller resolves the application through the existing tenant authority
   seam *first* — `resolve_scoped_application` or
   `AccessScopeService().filter_applications` — so by the time a helper runs the
   application is already proven in-scope for the actor. That is the
   scope-before-lookup rule of `.kiro/steering/enterprise-tenancy.md:101`
   ("Always scope a tenant-sensitive queryset through
   `visible_institution_queryset(user)` **before** any `.get()`"), and it is
   stated in the module docstring so a future caller cannot mistake the helpers
   for a check.

One deliberate non-change: `require_active` preserves each site's original
`is_active=True` predicate. On a canonical-id lookup the flag is no longer a
disambiguator (there is exactly one row) but a lifecycle filter, and dropping it
would be a behaviour change beyond this remediation — a deactivated intake keeps
yielding nothing, exactly as before.

Two sites also had their logging raised from `logger.debug` to
`logger.exception` (`student_draft_views.py:199-202`,
`admin_review_views.py:951-955`). The `debug` call is what hid this defect for as
long as it existed; a resolution failure is now visible in error monitoring while
the read still succeeds without the enrichment.

### 2.5 Why it mattered — this was live, not hypothetical

13.2 filed **GATE-13.2-01** having had to *manufacture* the collision: 13.2 §3.6
records that `harness_seed_tenants` deliberately gives its two tenants
distinguishable names, so the harness had to build the shared name by hand.

13.5 preflight gate 21, on the restored production-lineage snapshot, found the
condition already present (`docs/v2-evidence/13.5/README.md:524-533`):

```
gate21 name-collision exposure | colliding_intake_names 3 | colliding_offering_names 0
                               | active_institutions 2
      FAIL - GATE-13.2-01 is LIVE: a staff read can publish the other tenant's capacity
```

**3 intake names shared across the 2 active institutions.** The same gate is
PASS on `v2_fresh_13_4` — because a fresh build has no tenants at all, which is
13.5's own point that a gate only ever run on fresh databases would have reported
this finding as absent. That upgraded it to **GATE-13.5-02**: a live cross-tenant
read on real inherited data.

This batch closes **GATE-13.2-01** and **GATE-13.5-02**, and clears the Phase 13
contradiction that 13.6 §3.2 recorded against register findings **DATA-01** and
**STU-01** (both **P0**) — *"the staff application read still resolves an intake
by display name, and the production lineage already shares 3 intake names across
its 2 active tenants"*. The behaviour that sentence describes no longer exists.

---

## 3. L4 — the 36, by cause

[`raw/corpus-before.txt`](raw/corpus-before.txt) — the same 12 files, the same
serial invocation, `36 failed, 55 passed in 6.25s`, full tracebacks.
[`raw/corpus-after.txt`](raw/corpus-after.txt) — `91 passed in 7.04s`.
36 + 55 = 91, so **no test was added or removed**: every failure became a pass
and every pass stayed one.

| cause | tests | files |
|---|---:|---|
| task **5.3** canonical-ID signatures + filter/lock ordering | **9** | `tests/unit/test_waitlist.py` |
| task **9.4**'s scoped, locked review lookup | **4** | `tests/unit/test_review_notifications.py` |
| a retired module-level import — the GATE-13.1-02 class, second module | **2** | `tests/unit/test_live_500_fixes.py` |
| **mock-only tests whose post-9.4 paths now touch the DB** — a *third thing* | **21** | `tests/unit/test_application_endpoints.py` ×10, `tests/property/test_application_endpoints.py` ×11 |

### 3.1 `test_waitlist.py` — 9 stale signatures and a lock ordering

Two shapes, both retired by task 5.3 (R7.6–R7.7):

```
E   AssertionError: expected call not found.
E   Expected: reindex_positions('CS', 'Jan 2026')
E     Actual: reindex_positions('CS', 'Jan 2026', offering_id=None, intake_id=None)
```

```
E   Expected: promote_next('CS', 'Jan 2026')
E     Actual: promote_next(<MagicMock name='objects.all().select_for_update().get().program'>, …)
```

and the queryset construction order, which 5.3 inverted so the scoping filter is
built first and the peers are locked second:

```
E   assert <MagicMock name='objects.filter().select_for_update().order_by().first()'>
E       is <MagicMock name='objects.select_for_update().filter().order_by().first()'>
```

Fix: the mock chains now describe `objects.filter(...).select_for_update()...`
(`test_waitlist.py:112,127,142,173,195,211,226,252,271`), the reindex assertion
carries the canonical Intake_Offering identity it is actually forwarded
(`:233-235`), and `test_position_scoped_to_program_and_intake` reads
`filter.call_args_list[0]` / `[1]` because the scoping filter and the
`filter(id=…).update(...)` that writes the position are now two distinct calls
(`:149-155`). The `MagicMock` fixture's canonical FK ids are not real UUIDs, so
`CapacityService.offering_ids` yields `(None, None)` and the legacy
display-string branch is what these Requirement-3.1 cases pin — stated in the
class docstring (`:92-102`) rather than left implicit.

One case in this file, `test_non_owner_non_admin_404_mask` (`:383`), is **not**
this batch's: it does not appear among the 36 in `raw/corpus-before.txt`, so it
was already green under its current 404-mask form before L4 began. It is
mentioned only because a diff against `bae29a28d` shows it as changed, for the
reason §5 item 8 gives.

### 3.2 `test_review_notifications.py` — 4 × task 9.4's scoped locked lookup

```
E   Expected: send('application_rejected', <MagicMock name='objects.get()'>, {…})
E     Actual: send('application_rejected', <MagicMock name='objects.all().select_for_update().get()'>, {…})
```

Fix: one added line per case teaching the mock the post-9.4 chain —
`mock_app_qs.all.return_value.select_for_update.return_value.get.return_value = app`
(`test_review_notifications.py:150,188,227,281,316,350` — 6 cases, of which 4 were
failing; the shape was applied consistently rather than only where it was
strictly needed). The pre-9.4 line was **kept**, not replaced, so nothing that
still resolves the old way is un-neutralised.

### 3.3 `test_live_500_fixes.py` — 2 × the GATE-13.1-02 class, in a second module

```
E   AttributeError: <module 'apps.accounts.admin_user_views'> does not have the attribute 'AuditLog'
```

— raised at *setup*, in `mock.patch`'s `get_original`, exactly as GATE-13.1-02
did. Task **9.2** replaced the admin dashboard's direct `Application` / `Profile`
/ `AuditLog` queryset reads with `DashboardMetricsService`, and the module-level
name these tests patched no longer exists.

Fix: the three patches of retired names are gone; the **live** seam
`apps.accounts.dashboard_metrics.DashboardMetricsService.build` is stubbed with
the post-9.2 payload shape (`{"state", "value"}` per metric, `unknown`/`None` for
a metric that did not answer) via `_answering_metrics_payload`
(`test_live_500_fixes.py:111-158`). `AdminDashboardView._legacy_blocks` still runs
for real, so the cases now pin the actual 9.2 contract instead of a mock's
attribute.

### 3.4 The 21 `500`/`503`s were a third thing — and this is the finding worth stating loudest

The 21 failures in `test_application_endpoints.py` (unit ×10) and
`tests/property/test_application_endpoints.py` (×11) look like stale contracts —
`assert 500 == 200`, `assert 500 == 403`, `assert 503 == 202` — and they are not.
**Every traceback bottoms out in the same line:**

```
RuntimeError: Database access not allowed, use the "django_db" mark, or the
              "db" or "transactional_db" fixtures to enable it.
```

88 occurrences in `raw/corpus-before.txt`, raised from four seams these
mock-only tests never used to reach:

| seam | frame | reached from |
|---|---|---|
| `document_evidence.record_verification_decision` — a transactional ledger write (task 7.3) | `apps/documents/document_evidence.py:884` | `apps/applications/document_views.py:232` |
| `official_document_jobs.request_generation` — a **committed** durable job (task 10.4) | `apps/applications/official_document_jobs.py:399` | the acceptance-letter / finance-receipt POSTs |
| `tenant_authorization.resolve_scoped_application` — a scoped SQL lookup (task 9.4) | `apps/common/tenant_authorization.py:143` (`scoped.get(id=…)`) | `document_views.py:47`, called at `:179` / `:330` / `:435` |
| `catalog.services.filters_for_user` — the membership read behind the scope | `apps/catalog/services.py:807`, via `filter_applications` at `:825` | `tenant_authorization.py:137` |

So these are **not a stale contract and not a production bug. They are a
test-harness defect**: nine mock-only modules were written when these endpoints
touched no database, and tasks 7.3, 9.4 and 10.4 gave them a ledger write, a
scoped lookup and a committed job. pytest-django blocked the connection, the view
raised, and `envelope_exception_handler` answered `500`. The `500` was the
harness's own refusal, echoed back through the API.

**The `503` is the platform being right.** On the official-document path the view
does not 500 — it answers `503 GENERATION_UNAVAILABLE`, which is task 10.4's
contract verbatim: *"'Queued' now means a committed durable record exists… commits
the job row **before** answering 202, dispatches after commit, and answers
`503 GENERATION_UNAVAILABLE` when the record cannot be committed. Pre-10.4 this
module swallowed every dispatch failure and reported `queued` anyway, so with the
broker down a student polled work nothing had recorded"*
(`backend/apps/applications/official_document_views.py:29-40`, `:795-811`). A
test asserting `202` against a view that cannot commit is asserting **phantom
queued work**. The `503` was the correct answer to a wrong question.

**How they were actually fixed — the new seams were not mocked away.** Both files
give these cases a **real database and real tenant rows**:

- an opt-out marker, `@pytest.mark.real_tenant_scope`, makes the autouse
  `AccessScopeService` pass-through step aside for exactly these cases
  (`test_application_endpoints.py:38-79`, the opt-out branch at `:65`), so the
  scope service, the evidence ledger and the committed job all run for real;
- authority is **derived, not asserted**: `staff_world` grants
  `["review", "verify_documents", "verify_payments"]` on the membership so
  `tenant.application.review` / `tenant.document.verify` /
  `tenant.payment.verify` resolve through `AdminCapabilityService` exactly as in
  production, never from a role string (`:186-204`);
- **only the broker dispatch is stubbed** — `_enqueue_generation`, the single
  symbol `official_document_views` documents for this purpose — because there is
  no Celery broker in a unit run and dispatch is best-effort *after* the commit
  by design (`:206-212`, and `tests/property/test_application_endpoints.py:196`);
- the assertions got **stronger**, not weaker: `document.save.assert_called_once()`
  became `document.refresh_from_db(); assert document.verification_status ==
  "verified"; assert document.lifecycle_state == "verified"; assert
  str(document.verified_by_id) == str(staff_world.staff.id)`, and a mock's
  `create.call_args_list` filter became a query against the persisted
  `audit_logs` row (`_legacy_audit_rows`, scoped by `entity_id` because
  Hypothesis shares one transaction across examples). The property version reads
  the decision back from the database, so the property is that the platform
  *stored* the decision, not that a setter ran.

For the property file, `_SCOPE` also moved from the removed
`apps.applications.document_views.AccessScopeService` to the canonical
`apps.catalog.services.AccessScopeService` — the seam
`resolve_scoped_application` imports lazily, which is the real target and not a
weaker one (`tests/property/test_application_endpoints.py:57-65`). Hypothesis runs
these at `max_examples=5` with `HealthCheck.function_scoped_fixture` suppressed,
because the `db` fixture wraps the test *function*, and every example builds its
own tenant world inside that transaction (`:161-165`).

**Three tests named `…_returns_403` now assert `404`.** That is deliberate and it
discloses strictly less. Post-9.4 authority for these endpoints is the derived
capability resolved by `resolve_scoped_application`, so a caller with no scope
over the application is refused with the **indistinguishable 404** the disclosure
policy requires (R4.4 / AUTH-07) — a `403` would confirm the application exists.
The property's claim ("a non-admin is refused, and nothing changes") is unchanged;
only the disclosure contract got stricter, so `_REFUSED_STATUS = 404` pins one
code rather than accepting either
(`tests/property/test_application_endpoints.py:222-233`). Each case also asserts
the document was **not** mutated (`verification_status == "pending"`).

---

## 4. Four failures that are new in this run — two of them L1's

The `−32` in §1 is `−36 + 4`. Comparing the failure headers of the two whole-tree
artifacts, four cases fail here that passed in 13.6's run:

| new failure | file | cause |
|---|---|---|
| `TestEnrollmentDeadlineComputation::test_deadline_from_calendar_event` — `assert datetime(2025, 6, 15, 0, 0) == datetime(2025, 7, 15, 23, 59, 59)` (`raw/backend-whole-tree-after.txt:1485-1489`) | `tests/unit/test_enrollment.py:119` | **L1, site 4.** The case patches `apps.catalog.models.Intake.objects` and feeds `filter().first()` a mock intake (`:109-114`). Post-L1 the read never reaches that patch: the application is a `MagicMock`, so `_coerce_uuid(app.intake_ref_id)` is `None` and `resolve_intake` fails closed (`canonical_reads.py:65-78`) — `compute_deadline` correctly returns `decision_date + 14 days` = `2025-06-15`. The fail-closed guard behaving as documented, against a mock that encodes the retired lookup. Same class as §3 — **not fixed** |
| `TestLateFeeRequirement::test_late_fee_required_error` — `assert 'ALREADY_SUBMITTED' == 'LATE_FEE_REQUIRED'` (`:1504-1516`) | `tests/unit/test_late_applications.py:186` | **L1, site 5.** Same shape: the case patches `apps.catalog.models.Program` and sets `objects.filter().first()` (`:165,178`), but `_resolve_offering_for_fees` returns `None` for a `MagicMock` offering id, so the late-fee gate does not run and submission proceeds far enough to raise `ALREADY_SUBMITTED` at `apps/applications/services.py:861` — **not fixed** |
| `TestMetricsMiddlewareStructuredLogs::test_emits_complete_structured_log` (`:1274-1277`) | `tests/property/test_production_readiness_metrics.py:120,129` | **cause not determined.** No L1/L4 code is in either traceback |
| `TestMetricsMiddlewareDurationPositive::test_duration_is_non_negative` — `AssertionError: 0 != 1`, falsifying example `method='GET', path='/0/', status_code=200` (`:1286-1298`) | `tests/property/test_production_readiness_metrics.py:194,203` | **cause not determined.** Same file; neither file appears in 13.6's failure output |

**Stated plainly: L1 caused two test failures outside the 12-file corpus and they
are still failing.** They are the exact defect L4 fixed — a mock encoding a
retired lookup — in two files nobody thought to include in the corpus, which is
itself the lesson: the corpus was chosen from GATE-13.1-02's blast radius, not
from L1's. Fixing them is the same one-shape change as §3.1 and it belongs to the
next pass, named here rather than absorbed into a net figure.

**One further honesty item about the artifact's own currency.**
`raw/backend-whole-tree-after.txt` was recorded at `2026-08-13T21:04:25Z` and ran
524.12 s, finishing ≈ `21:13Z`. `backend/tests/unit/test_enrollment.py` was last
modified ≈ `21:20Z` — about seven minutes **after** the run ended. So the whole-tree
artifact does not reflect the current content of that one file. The later edit
converted `test_non_owner_403` → `test_non_owner_404_mask` (AUTH-07) and moved a
condition-set mock from two `.exists()` calls to the row shape task 10.3 reads; it
does **not** touch `test_deadline_from_calendar_event`, so the failure above stands
in the current tree. Every other changed file predates its measuring run:
production code `20:00–20:03Z` before the L1 run at `20:04:54Z`; the five L4 test
files `20:26–20:52Z` before the corpus run at `20:54:02Z`.

---

## 5. What is NOT claimed

1. **Production was not contacted in any way** — no SSH, no query, no write, no
   deploy, no restart, no migration. The `.pem` was not read.
2. **Neon was not touched at all.** This batch needed no database work: L1 is a
   read-path change over columns that already exist and L4 is test code. No
   branch was created, read, or reset.
3. **13.4's three scratch databases are untouched** — `v2_fresh_13_4`,
   `v2_batch_13_4`, `v2_snap_13_4`. `v2_snap_13_4` is still the only reproduction
   of GATE-13.4-02 that exists.
4. **The 96 remaining whole-tree failures were not fixed.** They belong to other
   lanes and were deliberately left. The visible clusters, attributed from
   `raw/backend-whole-tree-after.txt`:

   | cluster | evidence |
   |---|---|
   | task-9.2 perf goldens + divergence | `test_perf_golden_snapshots.py`, `test_perf_divergence_regression.py`, `test_perf_output_equivalence.py`, `test_perf_capability_invalidation.py`; e.g. `admin_dashboard vs pre-feature golden: … extra=['activity_state','freshness','health','metrics','scope','sources','windows']` (`:672`) |
   | `test_view_auth_classification.py` — **38** unclassified `APIView` subclasses | `:1906` and the enumeration that follows |
   | `test_public_endpoint_policy.py` — unclassified `AllowAny` views | `:1865-1873` (`Left contains 23 more items, first extra item: 'GET /api/v2/admin/change-requests/'`) |
   | `test_rollback_safe_operations.py` | 2 headers, first frame `:344` |
   | drf-spectacular | `AssertionError: 116 != 0 : Expected zero drf-spectacular errors` (`:1521`) and `3 != 0 : Expected zero drf-spectacular warnings` (`:1698`) |
   | `EXPECTED_TABLES` drift — **6** unmanaged models absent from `verify_schema_static.py` | `admin_saved_filters`, `document_upload_stages`, `document_verification_events`, `tenant_onboarding`, `tenant_change_requests`, `tenant_staff_invitations` (`:1219-1240`) |
   | migration-report freshness — **3** omitted scripts | `2026_08_06_01_admin_saved_filters.sql`, `2026_08_09_01_application_tracking_secret.sql`, `2026_08_12_01_tenant_new_table_fk_validate.sql` (`:1850-1862`, two tests naming the same three) |
   | `ERROR_CODES` catalogue gap — **10** codes used in views, absent from the catalogue | `DOCUMENT_NOT_READY`, `EXPORT_TOO_LARGE`, `NO_RECIPIENT`, `RECIPIENT_NOT_PERMITTED`, `SAVED_FILTER_LIMIT`, `TRACKING_LINK_UNAVAILABLE`, `TRACKING_SECRET_REQUIRED`, `UNREGISTERED_QUERY_PARAMETER`, `UNSUPPORTED_FIELD`, `VERSION_CONFLICT` (`:1493-1503`) |
   | capability-endpoint 404s | `GET /api/v1/admin/capabilities/` → `404 NOT_FOUND` in `test_capability_endpoint_shape.py` (`:484`), `test_capability_gated_writes.py` (`:499-510`), `test_admin_scope_endpoint.py` (`:648`) |

   None of these was fixed, and no attempt was made on any of them.
5. **The two L1-caused failures in §4 were not fixed**, and the two
   `test_production_readiness_metrics.py` failures were not diagnosed beyond
   "absent from 13.6's run, present here".
6. **GATE-13.1-02 is still closed only as a measurement hole**, per 13.6 §5.4.
   This batch closes the 36 failures it exposed; it does not revisit that claim.
7. **No number was carried forward without a citation.** The 13.6 baseline column
   (128 / 5192 / 104 / 1 error) is 13.6's own whole-tree artifact, cited as such
   and not re-derived. The frontend, lint, harness and 52-file-selection figures
   are not restated here at all.
8. **`git diff --stat` line counts are not this batch's line counts.** The entire
   V2 body of work is uncommitted (13.6 §9.3), so a per-file diff against
   `bae29a28d` mixes this batch's hunks with every earlier V2 task's edits to the
   same file. §6 therefore attributes files, and quotes hunks, rather than
   publishing per-file line totals as if they were L1's or L4's.

---

## 6. State left behind

### 6.1 Changed files — 13, of which 2 are new

Production code (6):

| file | change |
|---|---|
| `backend/apps/applications/canonical_reads.py` | **new, untracked** — 149 lines. The one place the canonical-id read and the fail-closed rule are written |
| `backend/apps/applications/student_draft_views.py` | site 1, `:195-197` (+ `debug` → `exception`) |
| `backend/apps/applications/admin_review_views.py` | site 2, `:947-949` (+ `debug` → `exception`) |
| `backend/apps/applications/review_queue.py` | site 3, `:61-63` |
| `backend/apps/applications/enrollment_service.py` | site 4, `:793-795` |
| `backend/apps/applications/services.py` | site 5 — `_resolve_offering_for_fees` introduced at `:113-132`, called at `:822` |

Tests (7):

| file | change |
|---|---|
| `backend/tests/unit/test_cross_tenant_capacity_canonical_id.py` | **new, untracked** — 293 lines, the 7-test reproduction |
| `backend/tests/unit/test_waitlist.py` | 9 — canonical-ID signatures + filter/lock ordering |
| `backend/tests/unit/test_review_notifications.py` | 4 — the post-9.4 scoped locked lookup |
| `backend/tests/unit/test_live_500_fixes.py` | 2 — stub the live `DashboardMetricsService.build` seam |
| `backend/tests/unit/test_application_endpoints.py` | 10 — real DB + real tenant rows, dispatch-only stub |
| `backend/tests/property/test_application_endpoints.py` | 11 — same, plus `_SCOPE` → the canonical seam |
| `backend/tests/unit/test_enrollment.py` | AUTH-07 404 mask + task-10.3 condition-row mock shape. Edited **after** the whole-tree run (§4) and it does **not** address the failure L1 caused in this file |

`git status --porcelain` for exactly these 13:

```
 M backend/apps/applications/admin_review_views.py
 M backend/apps/applications/enrollment_service.py
 M backend/apps/applications/review_queue.py
 M backend/apps/applications/services.py
 M backend/apps/applications/student_draft_views.py
 M backend/tests/property/test_application_endpoints.py
 M backend/tests/unit/test_application_endpoints.py
 M backend/tests/unit/test_enrollment.py
 M backend/tests/unit/test_live_500_fixes.py
 M backend/tests/unit/test_review_notifications.py
 M backend/tests/unit/test_waitlist.py
?? backend/apps/applications/canonical_reads.py
?? backend/tests/unit/test_cross_tenant_capacity_canonical_id.py
```

No schema, no migration, no SQL script, no settings, no frontend, no CI workflow,
no dependency.

### 6.2 Git

**Nothing committed. Nothing staged by this batch.** Branch `main` at
`bae29a28d` with the V2 tree dirty, exactly as 13.6 §11 left it. The index does
carry **9 pre-existing staged deletions** —
`backend/apps/common/ai_{cache,circuit_breaker,prompt_redactor,service}.py` and
five `tests/unit/test_ai_*.py` — which belong to the de-AI work (task 7.4 / 12.4),
were staged before this batch began, and were not touched here. The two new files
above remain **untracked**; `git add` was not run.

### 6.3 Untouched

| item | state |
|---|---|
| `.kiro/specs/admissions-v2-canonical-rebuild/tasks.md` | **unchanged** — no checkbox moved, including 13.6's |
| `.kiro/specs/admissions-v2-canonical-rebuild/findings.md` | **unchanged** — the 34 GATE findings are still unregistered (13.6's GATE-13.6-02, item L9) |
| `.kiro/specs/admissions-v2-canonical-rebuild/.config.kiro` | **unchanged** — spec status is still `planned`, not `completed` |
| `docs/canonical-truth-map.md` | **unchanged**. L1 *conforms* to `:1241`'s existing rule; it introduces no new domain concept, so there is nothing to register |
| other tasks' `docs/v2-evidence/**` | **read, never written**. The only file this batch writes under `docs/` is this one |
| `docs/v2-evidence/13.6/README.md` | **unchanged** — §8.1's L1/L4 rows are not ticked off here; that is the next pass's call |
| production Postgres / EC2 · Neon (any branch) | **never contacted** |
| secrets | no DSN, password, token or key appears in this directory |

---

## 7. For 13.6's next pass

**Closed outright:**

| item | why |
|---|---|
| **B4** — GATE-13.5-02 / GATE-13.2-01, the live cross-tenant capacity read | §2. Five sites resolve by canonical id, fail closed when it is absent, and the 7-test reproduction is green. DATA-01 / STU-01's Phase 13 contradiction is cleared |
| **B9** — the 36 backend tests the 13.1-02 guard uncovered | §3. `91 passed / 0 failed` on the same 12 files, same invocation |

**Not touched, and not claimed:** **B1** (13.5 never executed — operator),
**B2** (`sign-off.md` unsigned — operator + second reviewer), **B3**
(GATE-13.5-05, the `beanola.com` / `mihas.edu.zm` hostname question),
**B5** (GATE-13.5-01, the `varchar(50)` columns), **B6** (GATE-13.4-02, data-level
rollback), **B7** (GATE-13.3-09, `/student/status`), **B8** (the mobile/a11y
cluster), **B10** (4.1 and 7.4 evidence directories), **B11** (GATE-13.6-01,
register owners/dates).

**Two things this batch hands forward rather than finishing:**

1. **§4's two L1-caused failures** — `test_enrollment.py::test_deadline_from_calendar_event`
   and `test_late_applications.py::TestLateFeeRequirement::test_late_fee_required_error`.
   Both need the same kind of change §3 made: give the case a canonical id the
   guard accepts, or a real row. Until they are done the whole-tree figure carries
   two failures this batch created.
2. **A re-measurement.** The whole-tree artifact predates the last edit to
   `test_enrollment.py` by seven minutes (§4). The next run should be recorded
   after those two fixes, so the tree number is clean of this batch's own
   residue.

The generalisation 13.6 §12 offered holds here too. The 12-file corpus was
selected from GATE-13.1-02's blast radius, and L1 promptly broke two mock-based
tests just outside it. A corpus is a guess about where a change reaches; the whole
tree is the answer. Both were run, and the four-failure difference between them is
the only reason those two are named at all.
