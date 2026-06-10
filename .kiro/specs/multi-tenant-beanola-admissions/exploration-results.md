# Exploration Results — Multi-Tenant Beanola Admissions (Phase 0)

This document records the pass/fail baseline of the 19 correctness properties
(P1–P19) against the **current** implementation, plus any minimised
counter-examples. Each failing property is triaged to the phase task that will
fix it. Task 1.12 owns the completion of this document across all properties;
entries are added by the exploration sub-tasks (1.3–1.11) as they run.

## Consolidated Phase 0 baseline (all 19 properties)

Single at-a-glance register of every correctness property. **Phase 0 baseline**
is the outcome recorded against the code *as explored* (1.3–1.11); **Current
result** reflects the state after the divergence fixes already applied in this
worktree (see "Divergence resolution" below). Every non-pass maps to the
downstream phase task that closes it.

| # | Property | Phase 0 baseline | Current result | Triage → fixing phase-task |
|---|----------|------------------|----------------|----------------------------|
| P1  | Assignment determinism | PASS | **PASS** | — |
| P2  | Priority ordering (program-intake → offering → code → id) | FAIL (2× strict-xfail) | **PASS** (fixed) | Phase 2 · task 6.2 (done) |
| P3  | Residency / country / nationality block | PASS | **PASS** | — |
| P4  | Archived offering readable, never newly assigned | PASS | **PASS** | — |
| P5  | Capacity exhaustion excludes candidate | PASS | **PASS** | — |
| P6  | Cross-tenant scope isolation | PASS | **PASS** | — |
| P7  | Grant expiry drops scope at the boundary | PASS | **PASS** | — |
| P8  | Application/offering grant does not widen | PASS | **PASS** | — |
| P9  | Out-of-scope == not-found (app detail / receipt / doc info) | FAIL (3× strict-xfail) | **PASS** (fixed) | Phase 3 · task 12.2 (done) |
| P10 | Host resolution (case/port-insensitive; inactive + collision fail-safe) | FAIL (1× strict-xfail, collision) | **PASS** (fixed) | Phase 4 · task 15.1 (done) |
| P11 | Duplicate keyed on canonical program + intake | FAIL (1× strict-xfail, legacy-string OR) | **PASS** (fixed) | Phase 2 · task 8.1 (done) |
| P12 | All four canonical IDs persisted on create; legacy null-ID rows readable | PASS | **PASS** | — |
| P13 | Document token allowlist + injection escaping + missing-template fallback | PARTIAL — escape/fallback PASS; allowlist/2nd-order injection FAIL (1× strict-xfail) | **PASS** (fixed) | Phase 4 · tasks 16.1 + 15.3 (16.1 done) |
| P14 | Asset MIME/magic-byte validation per allowed type | PASS | **PASS** | — |
| P15 | Settlement metadata on every initiation path; "Unassigned" bucket safe | PASS | **PASS** | — |
| P16 | Migration idempotency + backfill correctness | DEFERRED (skipped — needs real Postgres) | **DEFERRED** | Phase 1 · task 3.5 (run with `TENANT_MIGRATION_NEON_BRANCH=1`) |
| P17 | Payment unreachable before assigned-school checkpoint | FAIL (durable `it.fails`) | **FAIL — deferred** | Phase 5 · tasks 21.1 + 21.3 |
| P18 | White-label host filters offerings + brands from runtime context | PASS | **PASS** | — |
| P19 | No-scope staff → "No school access assigned", never global zeros | FAIL (durable `it.fails`) | **FAIL — deferred** | Phase 5 · tasks 23.3 + 23.4 |

**Tally (current):** 16 PASS · 1 DEFERRED (P16, real-Postgres) · 2 FAIL-deferred
(P17, P19 — the Phase 5 frontend surfaces that do not exist yet). All seven
Phase 0 backend divergences (P2 ×2, P9 ×3, P10, P11, P13-allowlist) have been
fixed and their strict-xfail markers removed, so they are now hard passes.

**Failure / deferral → downstream task mapping (verified against `tasks.md`):**

- **P16** → **task 3.5** ("Migration idempotency + backfill tests (real DB)") —
  the six authored assertions execute on a Neon branch under
  `TENANT_MIGRATION_NEON_BRANCH=1`.
- **P17** → **tasks 21.1 + 21.3** — 21.1 inserts the assigned-school checkpoint
  step and gates payment on resolved assignment+fee; 21.3 owns the green wizard
  property. Removing the `it.fails` marker is part of 21.3.
- **P19** → **tasks 23.3 + 23.4** — 23.3 renders the no-scope `EmptyState`
  instead of the global-zeros widget; 23.4 repoints the test at the scope-aware
  surface and removes the `it.fails` marker.
- **P13 allowlist clause** → **tasks 16.1 + 15.3** — 16.1 (renderer
  allowlist + brace neutralisation) is done; 15.3 still owns the
  `TEMPLATE_TOKEN_REJECTED` rejection-at-configuration-time API path.

> The per-property detail (counter-examples, generators, how-run) lives in the
> task-by-task sections below. This table is the canonical Phase 0 baseline
> roll-up; the sections are its evidence.

## How tests were run

The local default `DATABASE_URL` points at the production Neon branch, so
exploration tests are **not** run against it. Following the approach task 1.1
used, backend property tests that do not require Postgres-only features are run
against an in-memory SQLite database with the unmanaged tenant tables created
by the `unmanaged_schema` session fixture in `backend/tests/conftest.py`:

```bash
cd backend
DATABASE_URL="sqlite://:memory:" TESTING=1 \
  .venv/bin/python -m pytest tests/property/test_assignment_properties.py \
  -k "determinism or priority or Priority or Determinism" \
  --hypothesis-seed=0 -v
```

Each property test runs ≥100 examples (`max_examples=100`) with the seed pinned
via `--hypothesis-seed=0`, and suppresses the `function_scoped_fixture` health
check (see `HYPOTHESIS_SETTINGS` in the test file).

> Note: Properties whose generators or invariants depend on real Postgres
> behaviour (e.g. P16 migration idempotency) are deferred to Phase 1 against a
> Neon branch and are marked accordingly by their own sub-tasks.

## Property baseline

### P1 — Assignment determinism — **PASS**

File: `backend/tests/property/test_assignment_properties.py`
(`TestAssignmentDeterminism`)

Same `(canonical program, intake, residency, white-label)` inputs always yield
the same single offering.

- `test_assign_is_deterministic_for_single_offering` — PASS
- `test_assign_is_deterministic_over_many_candidates` (property, ≥100 ex.) — PASS
- `test_assignment_independent_of_insertion_order` (property, ≥100 ex.) — PASS

The current `OfferingAssignmentService.assign(...)` is a deterministic function
of its inputs: repeated calls return the same offering, and the winner does not
depend on row insertion / DB iteration order (verified by building the same
candidate set forward and reversed and asserting the same minimum-priority
candidate wins).

### P2 — Priority ordering — **FAIL (2 divergences, recorded as `xfail`)**

File: `backend/tests/property/test_assignment_properties.py`
(`TestPriorityOrdering`)

Passing sub-properties:

- `test_program_intake_priority_dominates_offering_priority` — PASS
  (program-intake priority dominates offering priority)
- `test_tie_break_by_code_when_all_priorities_equal` — PASS
  (deterministic tie-break by offering `code` when all priorities are equal)

**Divergence (root cause).** The design (`design.md`, `OfferingAssignmentService`
algorithm step 5) mandates a lexicographic sort key:

```
(program_intake.assignment_priority, offering.assignment_priority, offering.code, offering.id)
```

The current service instead collapses priority into a single coalesced primary
key and never uses `offering.assignment_priority` as the secondary key:

```python
priority = (
    program_intake.assignment_priority
    if program_intake.assignment_priority is not None
    else offering.assignment_priority
)
# sorted by (priority, offering.code, str(offering.id))
```

Two property tests expose this, recorded as `@pytest.mark.xfail(strict=True)` so
the counter-examples are durable and the marker auto-alerts (strict XPASS →
failure) once Phase 2 fixes the service:

1. `test_offering_priority_breaks_tie_when_program_intake_priority_equal` — XFAIL
   - Candidates with equal program-intake priority (both `20`):
     - A: `offering_priority=5`, code `OFFER-LOWOFF`
     - B: `offering_priority=900`, code `OFFER-HIGHOFF`
   - Design: A wins (offering_priority `5 < 900`).
   - Current code: ties on the coalesced primary (`20 == 20`), falls through to
     the `code` tie-break, and returns **B (`OFFER-HIGHOFF`)**.

2. `test_assigned_offering_minimises_design_sort_key` (property, ≥100 ex.) — XFAIL
   - Minimised counter-example: `priorities=[(1, 0), (0, None)]`
     - Candidate 0: `offering_priority=1`, `program_intake_priority=0`
       → current coalesced primary = `0`
     - Candidate 1: `offering_priority=0`, `program_intake_priority=None`
       → current coalesced primary = `0` (falls back to offering priority)
   - Design key: cand 0 = `(0, 1, code0)`, cand 1 = `(0, 0, code1)` →
     **candidate 1 should win** (offering_priority `0 < 1`).
   - Current code: both coalesce to primary `0`, tie-break by `code`, returns
     **candidate 0**.

**Triage → Phase 2, task 6.2** ("Make assignment deterministic and rule-correct"):
update `backend/apps/catalog/services.py:OfferingAssignmentService` to sort by
the full design tuple `(program_intake.assignment_priority,
offering.assignment_priority, offering.code, offering.id)` with legacy-null
program-intake priority falling back only for the *primary* slot, keeping
`offering.assignment_priority` as the distinct secondary key. When fixed, remove
the two `xfail` markers so the properties become hard passes.

## Reusable test infrastructure added in task 1.3

`backend/tests/tenant_fixtures.py` gained a multi-offering scenario builder so
later assignment tasks (1.4, 6.1) can reuse it:

- `CandidateSpec` — declarative spec for one candidate offering
  (offering/program-intake priorities, rules, status, capacity, optional code).
- `AssignmentCandidate` / `AssignmentScenario` — result containers exposing the
  shared canonical-program/intake ids and the candidate offerings.
- `build_assignment_scenario(specs, ...)` — builds N candidate offerings (each
  with its own `program_intakes` row) competing for one shared canonical
  program + intake.

## Property baseline (task 1.4)

Task 1.4 extended `backend/tests/property/test_assignment_properties.py` with
real generators and invariants for P3 (residency/country/nationality block),
P4 (archived offering readable but not assigned), and P5 (capacity exhaustion).
No production code was changed — this is exploration against the current
`OfferingAssignmentService`.

### How these tests were run

Same sqlite-in-memory + `.venv` approach as task 1.3 (the default
`DATABASE_URL` points at the production Neon branch, so it is **not** used):

```bash
cd backend
DATABASE_URL="sqlite://:memory:" TESTING=1 \
  .venv/bin/python -m pytest tests/property/test_assignment_properties.py \
  -k "Residency or Archived or Capacity or residency or archived or capacity" \
  --hypothesis-seed=0 -v
```

Result: **8 passed, 7 deselected** (the deselected are the P1/P2 tests).
Running the whole file (`--hypothesis-seed=0`) yields **13 passed, 2 xfailed**
— the 2 xfails are the pre-existing P2 divergences recorded by task 1.3; P3/P4/P5
add no new failures. Each property test runs ≥100 examples
(`max_examples=100`) with the seed pinned via `--hypothesis-seed=0`.

### Generators written

- **`RESIDENCY_CANDIDATES`** (P3) — a list (1–4) of candidate descriptors, each
  with `blocked: bool`, a `slot` of `offering` (→ `assignment_rules`) or
  `intake` (→ `residency_rules`), and a concrete blocking/allowing rule drawn
  from `_BLOCKING_RULES` / `_ALLOWING_RULES`. The blocking set covers
  `exclude_countries`, `exclude_nationalities`, allow-list exclusion
  (`countries`/`nationalities` omitting the applicant), and a lowercase variant
  that pins the service's case-insensitive matching. The applicant is fixed at
  `country="Zambia"`, `nationality="Zambian"`, so the test oracle (which codes
  are blocked vs allowed) is known by construction. Exercising both the
  offering and the program-intake rule slots proves R2.3's "apply BOTH" clause.
- **`ARCHIVED_FLAGS`** (P4) — a list (1–4) of booleans; `True` builds an offering
  with `offering_status='archived'`, `False` an `active` one.
- **`CAPACITY_CANDIDATES`** (P5) — a list (1–4) of `{capacity 1..30, fill 0..40}`
  dicts. A candidate is exhausted when `fill >= capacity` (mirrors
  `_has_capacity`'s `current < capacity`); the `fill` band straddles `capacity`
  so the boundary (`fill == capacity`) and headroom (`fill < capacity`) are both
  generated. Built with a large shared intake capacity (`intake_max_capacity=10000`)
  so the program-intake capacity is the binding constraint.

All three reuse `CandidateSpec` + `build_assignment_scenario` from
`backend/tests/tenant_fixtures.py`; each generated example mints a fresh
per-example code token (`_fresh_token()`) so offerings get distinct
`programs.code` values within the shared per-test transaction.

### P3 — Residency / country / nationality block — **PASS**

File: `TestResidencyBlock`.

- `test_blocked_country_raises_no_eligible_offering` — PASS (single offering
  with `residency_rules={"exclude_countries": ["Zambia"]}` → `NO_ELIGIBLE_OFFERING`).
- `test_offering_assignment_rules_block_independently` — PASS (offering
  `assignment_rules={"exclude_nationalities": ["Zambian"]}` blocks even with open
  `residency_rules`, proving the offering rule slot is honoured independently).
- `test_blocked_candidates_never_assigned` (property, ≥100 ex.) — PASS. The
  assigned offering is always an allowed candidate, never a blocked one, and the
  service raises `NO_ELIGIBLE_OFFERING` exactly when every candidate is blocked.

Current `OfferingAssignmentService._rules_match` correctly applies both the
offering's `assignment_rules` and the program-intake's `residency_rules` using
the keys `countries` / `exclude_countries` / `nationalities` /
`exclude_nationalities`, case-insensitively. No divergence from the design.

### P4 — Archived offering readable but never newly assigned — **PASS**

File: `TestArchivedOfferingExcluded`.

- `test_archived_offering_not_assigned_but_readable` — PASS. An archived offering
  (`offering_status='archived'`) is excluded from assignment
  (`NO_ELIGIBLE_OFFERING`) **and** remains queryable:
  `Program.objects.filter(id=...).exists()` is `True` and the re-read row still
  has `offering_status == "archived"`.
- `test_archived_excluded_active_assigned` (property, ≥100 ex.) — PASS. With a
  mix of archived/active offerings the winner is always active; archived ones are
  never chosen; assignment fails only when every candidate is archived; and
  **every** candidate row (archived or active) stays readable via the ORM. The
  set of archived codes still present in the DB equals exactly the generated
  archived set — confirming exclusion is assignment-only, never a delete/hide.

Current candidate query filters `offering_status='active'` (design.md step 2),
so archived offerings are excluded from assignment; the default manager keeps
them fully readable. No divergence from the design.

### P5 — Capacity exhaustion — **PASS**

File: `TestCapacityExhaustion`.

- `test_full_capacity_excludes_candidate` — PASS (`current_enrollment == max_capacity`
  → `NO_ELIGIBLE_OFFERING`).
- `test_one_seat_of_headroom_is_assignable` — PASS (boundary: `current == capacity - 1`
  leaves one seat → assignable).
- `test_capacity_exhausted_candidates_excluded` (property, ≥100 ex.) — PASS. A
  full program-intake (`fill >= capacity`) is never assigned; the winner always
  has headroom; assignment fails only when every candidate is full.

Current `_has_capacity` (`current < effective_capacity`, program-intake capacity
falling back to intake capacity) matches the design. No divergence.

### Summary

| Property | Result | Counter-example | Triage |
|----------|--------|-----------------|--------|
| P3 — residency/country/nationality block | **PASS** | — | None — current service matches design |
| P4 — archived readable, not assigned | **PASS** | — | None — current service matches design |
| P5 — capacity exhaustion excludes | **PASS** | — | None — current service matches design |

No new divergences. P3/P4/P5 confirm the current `OfferingAssignmentService`
eligibility filtering (rules, archived status, capacity) already satisfies
Requirements R2.1, R2.3, R2.4. Phase 2 task 6.1/6.2 will formalise these
alongside the P2 priority-ordering fix; no P3/P4/P5 behaviour needs changing.

## Property baseline (task 1.5)

Task 1.5 replaced the task-1.1 placeholders in
`backend/tests/property/test_access_scope_properties.py` with real hypothesis
generators and invariants for P6 (cross-tenant scope isolation), P7 (grant
expiry drops scope at the boundary), and P8 (application/offering grant scope
does not widen). No production code was changed — this is exploration against
the current `AccessScopeService` (`scope_for`/`filters_for_user`,
`filter_applications`, `filter_payments`, `filter_documents`).

### How these tests were run

Same sqlite-in-memory + `.venv` approach as tasks 1.3/1.4 (the default
`DATABASE_URL` points at the production Neon branch, so it is **not** used):

```bash
cd backend
DATABASE_URL="sqlite://:memory:" TESTING=1 \
  .venv/bin/python -m pytest tests/property/test_access_scope_properties.py \
  --hypothesis-seed=0 -v
```

Result: **8 passed** (`--hypothesis-seed=0`). Each of the four property tests
ran **100 passing examples** (`--hypothesis-show-statistics` confirms
"Stopped because settings.max_examples=100"); the remaining four are concrete
example/boundary checks. Running both exploration property files together
(`test_assignment_properties.py` + `test_access_scope_properties.py`) yields
**21 passed, 2 xfailed** — the 2 xfails are the pre-existing P2 divergences
recorded by task 1.3; P6/P7/P8 add no new failures.

### Reusable test infrastructure added in task 1.5

`backend/tests/tenant_fixtures.py` gained access-scope helpers so Phase 3
(task 12.5) can reuse them:

- `build_payment(application=..., ...)` — persists a `payments` row (P6 payment
  isolation surface).
- `build_document(application=..., ...)` — persists an `application_documents`
  row (P6 document isolation surface).
- `build_offering_with_application(institution=..., canonical_program=...,
  intake=..., student=..., ...)` — adds one extra offering + program-intake +
  application inside an existing institution (P8 sibling offerings).
- `attach_scope(staff, world, kind, *, expires_at=None)` — attaches exactly one
  scope of `kind` (`membership` / `institution_grant` / `offering_grant` /
  `application_grant`) to a staff actor targeting a `TenantWorld`.
- `build_tenant_worlds(count, *, share_canonical=True, ...)` — builds N
  independent tenant worlds (distinct institutions; one shared canonical
  program by default) for membership/grant mixes across ≥2 institutions.

### Generators written

- **`PER_WORLD_SCOPE`** (P6) — a list (2..5) of `none`/`membership`/
  `institution_grant` draws, one per institution. The length drives how many
  distinct institutions are built (always ≥2) and the draw decides whether (and
  how) the single staff actor is scoped to each — a genuine *mixed*
  membership/grant scope across schools. All-`none` is the degenerate
  no-scope case (also pins R4.6's "no global leakage").
- **`EXPIRY`** + **`GRANT_SCOPE_KIND`** (P7) — `EXPIRY` is `None` (never
  expires) or `(is_future, seconds)` with a ≥60s magnitude (so clock drift
  between building the grant and the service's `timezone.now()` can never flip
  the result); `_resolve_expiry` maps it to `(expires_at, is_expired)`.
  `GRANT_SCOPE_KIND` sweeps institution / offering / application grants so the
  expiry invariant is proven for every scope kind. The exact equality boundary
  (`expires_at == now`) is pinned by a separate deterministic unit test.
- **`SIBLING_STATUSES`** + **`GRANTED_INDEX`** (P8) — `SIBLING_STATUSES` is a
  list (2..6) of application statuses; its length is the sibling-offering count
  (≥2 so at least one sibling is "unrelated") and the status mix proves scope
  fidelity is status-independent. `GRANTED_INDEX` (mod sibling count) varies
  which sibling receives the grant.

### P6 — Cross-tenant scope isolation — **PASS**

File: `TestScopeIsolation`.

- `test_staff_application_scope_excludes_other_school` — PASS (school-A staff
  see school A's application, never school B's).
- `test_staff_payment_and_document_scope_excludes_other_school` — PASS
  (`filter_payments` / `filter_documents` isolate payments and documents too).
- `test_scope_never_intersects_out_of_scope_schools` (property, 100 ex.) — PASS.
  With ≥2 schools and a staff actor scoped to an arbitrary mix of them, the
  actor's filtered application / payment / document querysets contain **every**
  in-scope school's rows and **never** an out-of-scope school's rows. The
  all-`none` draws confirm a no-scope actor sees nothing on any surface.

Current `AccessScopeService.filter_applications/payments/documents` builds a `Q`
over `pk`/`application_id`, `institution_ref_id`/`application__institution_ref_id`,
and `program_offering_id`/`application__program_offering_id` from the computed
`ScopeFilters`, so an actor's queryset is bounded to exactly their
membership/grant institutions. No divergence from the design.

### P7 — Grant expiry drops scope at the boundary — **PASS**

File: `TestGrantExpiry`.

- `test_expired_grant_excluded_from_scope` — PASS (an actor whose only signal is
  an expired institution grant has no institution scope).
- `test_grant_expiry_boundary_is_exclusive` — PASS. `expires_at` 1µs in the past
  is excluded (the filter is `expires_at > now`, so an at/just-before-now expiry
  drops); a clearly-future expiry is included.
- `test_expired_grant_confers_no_scope` (property, 100 ex.) — PASS. Across every
  grant scope kind, an expired grant contributes nothing to the computed scope
  (and leaves the filtered queryset empty of its target), while a future-dated
  or never-expiring grant contributes its target.

Current `filters_for_user` filters `AccessGrant` on
`Q(expires_at__isnull=True) | Q(expires_at__gt=now)`, so expired grants drop at
the boundary. No divergence from the design.

### P8 — Grant scope fidelity (no widening) — **PASS**

File: `TestGrantScopeFidelity`.

- `test_offering_grant_does_not_widen_to_institution` (property, 100 ex.) — PASS.
  An offering-scoped grant yields `offering_ids == {granted}`,
  `institution_ids` without the institution, and an empty `application_ids`; the
  filtered queryset returns the granted offering's application and **never** a
  sibling offering's application — regardless of which sibling is granted or the
  siblings' statuses.
- `test_application_grant_does_not_widen_to_institution` (property, 100 ex.) —
  PASS. An application-scoped grant yields `application_ids == {granted}` with
  empty `institution_ids`/`offering_ids`; the filtered queryset returns only the
  granted application, never a sibling.

Current `filters_for_user` only adds `institution_id` to `institution_ids` for
institution-typed grants/memberships; offering grants populate `offering_ids`
and application grants populate `application_ids` exclusively. An offering or
application grant therefore never widens to institution scope. No divergence
from the design.

### Summary (task 1.5)

| Property | Result | Counter-example | Triage |
|----------|--------|-----------------|--------|
| P6 — cross-tenant scope isolation | **PASS** | — | None — current service matches design |
| P7 — grant expiry drops at boundary | **PASS** | — | None — current service matches design |
| P8 — application/offering grant does not widen | **PASS** | — | None — current service matches design |

No divergences. P6/P7/P8 confirm the current `AccessScopeService` already
satisfies Requirements R4.2, R4.7, R4.8 (and R4.3/R4.6 on the exercised
surfaces). Phase 3 task 12.5 will extend these invariants to the HTTP surfaces
(list/review/export/download/verify/receipt/configure) and the out-of-scope ==
not-found masking (P9, task 1.6) — the service-layer scope computation itself
needs no change for P6/P7/P8.

## Property baseline (task 1.6)

Task 1.6 replaced the task-1.1 skipped placeholder in
`backend/tests/unit/test_cross_tenant_isolation.py` with **endpoint-level**
(HTTP) exploration of P9 — out-of-scope record lookups must be indistinguishable
from a true not-found. No production code was changed; this is exploration
against the current detail endpoints.

### How these tests were run

Same sqlite-in-memory + `.venv` approach as tasks 1.3–1.5 (the default
`DATABASE_URL` points at the production Neon branch, so it is **not** used):

```bash
cd backend
DATABASE_URL="sqlite://:memory:" TESTING=1 \
  .venv/bin/python -m pytest tests/unit/test_cross_tenant_isolation.py \
  --hypothesis-seed=0 -v
```

Result: **2 passed, 3 xfailed** (`--hypothesis-seed=0`). The 3 xfails are the
P9 divergences below, recorded as `@pytest.mark.xfail(strict=True)` so the
counter-examples are durable and the markers auto-alert (strict XPASS →
failure) once Phase 3 task 12.2 fixes the endpoints.

### Detail endpoints tested + routes used

| Surface | Route | Resolved view |
|---------|-------|---------------|
| Application detail | `GET /api/v1/applications/{id}/` | `ApplicationDetailView` (`student_draft_views.py`) |
| Payment receipt | `GET /api/v1/payments/{id}/receipt/` | `PaymentReceiptView` (`payment_query_views.py`) |
| Document info | `GET /api/v1/documents/{id}/info/` | `DocumentInfoView` (`document_storage_views.py`) |

### How staff were authenticated

DRF `APIClient.force_authenticate` with a `JWTUser` built from the world's
`staff` Profile (`{user_id, email, role, first_name, last_name}`) — the same
shape used by `test_application_student_flow_views.py` and
`test_payment_rate_limiting.py`. The staff actor is built by
`build_tenant_world` with an **active membership + institution-scoped grant to
their own institution only**, so `AccessScopeService` scopes them to a single
school. Under the `config.settings.dev` test module the legacy-admin all-access
compatibility branch is inactive (`_test_settings_active()` is False), so this
is a genuine single-school staff actor (the production scope model).

### Comparison method

For each endpoint, two requests are made as the **same** school-A staff user:
(a) a fixed non-existent UUID (`00000000-0000-4000-8000-000000000000`) → the
true not-found baseline; (b) school-B's real record id → the out-of-scope
lookup. The test asserts the two `(status_code, parsed_json_body)` tuples are
equal. A passing routing/baseline test first pins that a missing id on all
three endpoints returns the `{"success": false, … "code": "NOT_FOUND"}`
envelope at status 404.

### P9 — Out-of-scope == not-found — **FAIL (3 divergences, recorded as `xfail`)**

File: `backend/tests/unit/test_cross_tenant_isolation.py`
(`TestOutOfScopeIsNotFound`).

Passing checks:

- `test_other_school_application_not_in_scoped_queryset` — PASS (service layer:
  school-A staff's scoped application queryset excludes school-B's application;
  kept from the task 1.1 scaffold).
- `test_missing_record_returns_envelope_not_found` — PASS (all three routes
  resolve and return the 404 NOT_FOUND envelope for a random UUID).

**Divergence 1 — application detail leaks the whole record (status + field
leakage).** `test_out_of_scope_application_detail_matches_true_not_found` —
XFAIL. `ApplicationDetailView` is gated by `IsOwnerOrAdmin` **only** and never
consults `AccessScopeService`, so any `admin`-role actor passes the object
permission for *any* application regardless of institution. Minimised
counter-example:

- out-of-scope (school-A admin reads school-B's application):
  `(200, {"success": True, "data": { …full application… }})` — leaks
  `full_name`, `nrc_number`, `date_of_birth`, `phone`, `email`,
  `institution_id`, `program_id`, etc. of the other school's applicant.
- missing: `(404, {"success": False, "error": "Application not found",
  "code": "NOT_FOUND"})`.

This is the most severe case: not just an existence oracle but a full
cross-tenant PII read. (`ApplicationDetailsView` at `/<id>/details/` subclasses
`ApplicationDetailView`, so it shares the defect.)

**Divergence 2 — payment receipt is an existence oracle (status + message).**
`test_out_of_scope_payment_receipt_matches_true_not_found` — XFAIL.
`PaymentReceiptView` *does* call `AccessScopeService().filter_payments(...)` for
`admin` actors, but returns **403** when the scope check fails, distinct from
the **404** for a missing payment. Minimised counter-example:

- out-of-scope: `(403, {"success": False, "error": "Not authorized",
  "code": "INSUFFICIENT_PERMISSIONS"})`.
- missing: `(404, {"success": False, "error": "Payment not found",
  "code": "NOT_FOUND"})`.

The distinct status + message lets a school-A admin infer that a payment id
exists at another school.

**Divergence 3 — document info is an existence oracle (status + message).**
`test_out_of_scope_document_info_matches_true_not_found` — XFAIL. The shared
`_get_authorized_document` helper applies `AccessScopeService().filter_documents`
for `admin` actors but returns **403** on the scope miss, distinct from the
**404** for a missing document. Minimised counter-example:

- out-of-scope: `(403, {"success": False, "error": "Permission denied",
  "code": "INSUFFICIENT_PERMISSIONS"})`.
- missing: `(404, {"success": False, "error": "Document not found",
  "code": "NOT_FOUND"})`.

Same existence-oracle channel as the payment receipt. (`DocumentSignedUrlView`,
`DocumentDownloadView`, and `DocumentDeleteView` share `_get_authorized_document`,
so they exhibit the same 403-vs-404 divergence and should be fixed together.)

**Triage → Phase 3, task 12.2** ("Out-of-scope == not-found across detail
endpoints"): make these surfaces return an identical 404 NOT_FOUND envelope for
out-of-scope lookups so existence cannot be inferred and no other-school data
leaks. Specifically:

1. `ApplicationDetailView._get_application` must scope admin reads through
   `AccessScopeService().filter_applications(...)` (not just `IsOwnerOrAdmin`)
   and return the 404 NOT_FOUND envelope — not 200 — when out of scope. This
   closes both the status divergence **and** the field-leak.
2. `PaymentReceiptView` (and `PaymentVerifyView`, which shares the 403 scope
   branch) must mask the out-of-scope scope miss as the 404 NOT_FOUND envelope
   instead of 403 INSUFFICIENT_PERMISSIONS.
3. `_get_authorized_document` (shared by document info/signed-url/download/delete)
   must mask the admin scope miss as the 404 NOT_FOUND envelope instead of 403.

When fixed, remove the three `xfail` markers so the properties become hard
passes. Phase 3 task 12.5 then extends this to the remaining
read/count/export/download/verify/receipt/configure surfaces.

### Summary (task 1.6)

| Property | Result | Counter-example | Triage |
|----------|--------|-----------------|--------|
| P9 — application detail out-of-scope == not-found | **FAIL (xfail)** | out=`(200, full record incl. NRC/DOB/phone)` vs missing=`(404, NOT_FOUND)` | Phase 3 task 12.2 — scope admin reads + return 404 |
| P9 — payment receipt out-of-scope == not-found | **FAIL (xfail)** | out=`(403, INSUFFICIENT_PERMISSIONS)` vs missing=`(404, NOT_FOUND)` | Phase 3 task 12.2 — mask 403→404 |
| P9 — document info out-of-scope == not-found | **FAIL (xfail)** | out=`(403, INSUFFICIENT_PERMISSIONS)` vs missing=`(404, NOT_FOUND)` | Phase 3 task 12.2 — mask 403→404 |

P9 is the first exploration property to fail at the **HTTP boundary** even
though the underlying `AccessScopeService` scope computation is correct
(P6/P7/P8 all passed in task 1.5). The gap is entirely in how the detail views
translate a scope miss into a response: one view skips scoping altogether
(application detail) and the other two surface a distinguishable 403. All three
are exactly the kind of divergence Phase 3 exists to fix.

## Property baseline (task 1.7)

Task 1.7 replaced the task-1.1 scaffold in
`backend/tests/unit/test_institution_context.py` with the real P10 host-resolution
edge cases: uppercase host, host-with-port, combined uppercase+port, inactive
domain, inactive institution, and duplicate active hostname. No production code
was changed in the exploration task — this is exploration against the current
`InstitutionContextService.resolve`.

### How these tests were run

Same sqlite-in-memory + `.venv` approach as tasks 1.3–1.6 (the default
`DATABASE_URL` points at the production Neon branch, so it is **not** used):

```bash
cd backend
DATABASE_URL="sqlite://:memory:" TESTING=1 \
  .venv/bin/python -m pytest tests/unit/test_institution_context.py \
  --hypothesis-seed=0 -v
```

Phase 0 baseline outcome (as explored): **8 passed, 1 xfailed** — the single
xfail is the duplicate-hostname-collision divergence below, recorded as
`@pytest.mark.xfail(strict=True)`.

### P10 — Host resolution (case/port-insensitive; inactive + collision fail-safe) — **FAIL (1 divergence, recorded as `xfail`)**

File: `backend/tests/unit/test_institution_context.py`.

Passing checks (current resolver already correct):

- `test_unknown_host_falls_back_to_shared_beanola` — PASS (unrecognised host →
  shared Beanola portal, `institution is None`).
- `test_empty_host_falls_back_to_shared_beanola` — PASS (`None`/`""`/`"   "`/
  `":8443"` all degrade to shared, never raise).
- `test_exact_lowercase_host_matches_active_domain` — PASS (verbatim active
  hostname → white-label).
- `test_uppercase_host_matches_active_domain` — PASS (R3.4: case-insensitive).
- `test_host_with_port_matches_active_domain` — PASS (R3.4: port stripped).
- `test_case_and_port_insensitive_match` — PASS (uppercase **and** port; brand
  derives from the institution, not the Beanola default).
- `test_inactive_domain_falls_back_to_shared` — PASS (R3.3: inactive domain →
  shared; no school data in the brand).
- `test_inactive_institution_falls_back_without_exposing_school` — PASS (R3.3:
  active domain whose institution is inactive → shared; the inactive school's
  brand/name never surface).

**Divergence (root cause).** R3.5 requires a duplicate active hostname to **fail
safe** (resolve to the shared portal and surface the collision), never silently
pick one school. The current `InstitutionContextService.resolve` used a
`.first()` on the case-insensitive (`iexact`) domain lookup, so two active
institutions whose hostnames are case variants (distinct rows under the
case-sensitive `hostname UNIQUE` index, both matching the lowercased lookup)
resolved to whichever row sorted first. Recorded as
`@pytest.mark.xfail(strict=True)`:

- `test_duplicate_active_hostname_fails_safe` — XFAIL.
  - Minimised counter-example: institution A with domain `apply.collision.example`
    and institution B with domain `APPLY.collision.example`, both `is_active=True`.
    Resolving `apply.collision.example` should yield
    `portal_type="shared"`, `institution is None`; the current code instead
    returned institution A's white-label context (silent pick).

**Triage → Phase 4, task 15.1** ("Collision validation + scope on tenant
management endpoints"). The resolver-side fail-safe fix is the runtime
complement to the configuration-time collision rejection task 15.1 owns.

### Summary (task 1.7)

| Property | Result | Counter-example | Triage |
|----------|--------|-----------------|--------|
| P10 — case/port-insensitive match | **PASS** | — | None — current resolver matches design |
| P10 — inactive domain / institution fail-safe | **PASS** | — | None — current resolver matches design |
| P10 — duplicate active hostname fails safe | **FAIL (xfail)** | A=`apply.collision.example`, B=`APPLY.collision.example` (both active) → current code returns A's white-label context instead of shared | Phase 4 task 15.1 — resolver fail-safe + collision surfacing |

P10's case/port-insensitivity and inactive fall-back halves already satisfy
R3.3/R3.4; only the collision clause of R3.5 diverged, recorded as a durable
strict-xfail. (Fixed in the divergence-resolution pass below: `resolve` now
fetches all matching active domains and fails safe to shared + a
`domain.collision` log/sentry when >1 distinct institution matches.)

## Property baseline (task 1.8)

Task 1.8 replaced the task-1.1 scaffolds in
`backend/tests/unit/test_duplicate_canonical.py` (P11) and
`backend/tests/unit/test_application_canonical_ids.py` (P12) with real
assertions. No production code was changed in the exploration task — this is
exploration against the current `DuplicateChecker` and the program-first
`POST /api/v1/applications/` create path.

### How these tests were run

Same sqlite-in-memory + `.venv` approach as tasks 1.3–1.7 (the default
`DATABASE_URL` points at the production Neon branch, so it is **not** used):

```bash
cd backend
DATABASE_URL="sqlite://:memory:" TESTING=1 \
  .venv/bin/python -m pytest \
  tests/unit/test_duplicate_canonical.py \
  tests/unit/test_application_canonical_ids.py \
  --hypothesis-seed=0 -v
```

Phase 0 baseline outcome (as explored): P12 all PASS; P11 PASS except the one
canonical-keying divergence below, recorded as `@pytest.mark.xfail(strict=True)`.

### P11 — Duplicate keyed on canonical program + intake — **FAIL (1 divergence, recorded as `xfail`)**

File: `backend/tests/unit/test_duplicate_canonical.py`.

Passing checks (current checker already correct):

- `test_existing_canonical_application_blocks_new_one` — PASS (non-terminal app
  for the same canonical program + intake + identity blocks a new create).
- `test_terminal_status_does_not_block` — PASS (R8.4: a `withdrawn` terminal app
  does not block).
- `test_two_schools_same_canonical_is_one_slot` — PASS (R8.1/R8.2: two schools
  offering the *same* canonical program for the *same* intake = one duplicate
  slot; institution/offering ignored).
- `test_duplicate_detected_when_legacy_strings_differ_but_canonical_matches` —
  PASS (canonical IDs carry the match even when legacy display strings differ).
- `test_different_identity_may_proceed` — PASS (R8.3: a different NRC/passport
  identity is not blocked).
- `test_check_at_submit_keys_on_canonical` — PASS (R8.6: the submit-time check
  keys on canonical too).
- `test_legacy_null_ids_preserve_string_keyword_shape` — PASS (R8.5: legacy
  null-ID create path falls back to the `(program, intake)` string filter and
  still detects overlap).
- `test_legacy_different_intake_string_does_not_block` — PASS (R8.5: the legacy
  string branch keys on the pair; a different intake string is a different slot).

**Divergence (root cause).** R8.1 requires uniqueness to key on canonical
program + intake when canonical IDs are present. The current `DuplicateChecker`
`check_at_create`/`check_at_submit` **OR-ed** the legacy `program`/`intake`
display strings together with the canonical IDs, so two **distinct** canonical
programs that happen to share a display name were treated as one slot. Recorded
as `@pytest.mark.xfail(strict=True)`:

- `test_distinct_canonical_with_shared_legacy_name_should_not_block` — XFAIL.
  - Minimised counter-example: an existing app for canonical program `P1`
    (display name "Nursing"), intake `I`; a new attempt for a **distinct**
    canonical program `P2` that *also* displays "Nursing", same intake `I`,
    same identity, with `program_id=P2`. Design: distinct canonical program ⇒
    not a duplicate. Current code: the legacy-string `OR` matched on "Nursing"
    and flagged a (false) duplicate.

**Triage → Phase 2, task 8.1** ("Canonical duplicate keying with legacy
fallback"). When canonical IDs are present the checker must key canonical-only
(`Q(canonical_program_id=...)`, `Q(intake_ref_id=...)`); the legacy string
fallback applies only when an id is absent. (Fixed in the divergence-resolution
pass below; the strict-xfail marker is removed and the property is a hard pass.)

### P12 — All four canonical IDs persisted on create; legacy null-ID rows readable — **PASS**

File: `backend/tests/unit/test_application_canonical_ids.py`.

`TestCanonicalIdsPersisted`:

- `test_all_four_canonical_ids_round_trip` — PASS (a built application
  round-trips `institution_ref_id`, `canonical_program_id`,
  `program_offering_id`, `intake_ref_id`).
- `test_create_endpoint_persists_all_four_canonical_ids` — PASS. R1.1: the
  program-first `POST /api/v1/applications/` (with `program_id` + `intake_id`)
  runs `OfferingAssignmentService`, resolves the single eligible offering, and
  writes all four canonical IDs **plus** the legacy display snapshots
  (`program`/`intake`/`institution` from the assigned school) in the same
  create transaction; the response envelope echoes the four IDs.
- `test_create_endpoint_assigns_correct_institution` — PASS. The persisted
  `institution_id` is the assigned school's id (derived from the offering), not
  a client-supplied value; `assigned_school` is echoed in the response.

`TestLegacyRowsRemainReadable`:

- `test_legacy_null_id_row_is_readable` — PASS (R1.4: a null-canonical-ID legacy
  row is readable; its legacy `program`/`intake`/`institution` snapshots remain
  populated).
- `test_legacy_row_serializes_without_error` — PASS (R1.4: the read serializer
  emits null canonical IDs with intact legacy strings, no error).

Current create path satisfies R1.1/R1.4/R8.1 for canonical-ID persistence and
legacy readability. No divergence.

### Summary (task 1.8)

| Property | Result | Counter-example | Triage |
|----------|--------|-----------------|--------|
| P11 — duplicate keyed on canonical program + intake | **FAIL (xfail)** | distinct canonical `P2` sharing display name "Nursing" with existing `P1`, same intake/identity → current code flags a false duplicate via the legacy-string OR | Phase 2 task 8.1 — canonical-only keying when IDs present |
| P12 — all four canonical IDs persisted on create | **PASS** | — | None — create path writes all four IDs + legacy snapshots |
| P12 — legacy null-ID rows remain readable | **PASS** | — | None — null-ID rows read + serialize cleanly |

P12 holds in full. P11's terminal/identity/two-school/legacy-fallback clauses
all pass; only the canonical-vs-legacy keying clause of R8.1 diverged, recorded
as a durable strict-xfail and fixed in the divergence-resolution pass below.

## Property baseline (task 1.10)

Task 1.10 extended `backend/tests/unit/test_tenant_migration.py` (the task-1.1
scaffold) with the real P16 assertions: re-applying
`0001_multi_tenant_beanola_admissions.sql` is a no-op, the backfill is
idempotent, and unmatched legacy null-ID applications stay readable.

### How these tests were run

P16 is the one exploration property whose invariants genuinely depend on
**real Postgres** (applying the migration script, comparing schema
fingerprints, exercising `ON CONFLICT`/`COALESCE` backfill). It cannot be run
against the in-memory SQLite database used by P1–P9, and it must **never** be
run against the production Neon branch that the local `DATABASE_URL` points at.

The suite therefore gates the live assertions behind an explicit opt-in
environment variable, `TENANT_MIGRATION_NEON_BRANCH`. The whole module carries
a `pytestmark` skip so that, when the opt-in is absent, the file produces a
clean **skip** (never a fixture-setup error), and is deferred to **Phase 1
(task 3.5)** which applies the migration on a dedicated Neon branch after a
backup + dry-run.

```bash
cd backend
# Default checkout (no opt-in): all six tests skip cleanly with a clear reason.
.venv/bin/python -m pytest tests/unit/test_tenant_migration.py -rs

# Collection only:
.venv/bin/python -m pytest tests/unit/test_tenant_migration.py --collect-only -q
```

### P16 — Migration idempotency + backfill correctness — **DEFERRED (skipped, Phase 1 / task 3.5)**

File: `backend/tests/unit/test_tenant_migration.py`

Tests authored (run on a real Neon branch with `TENANT_MIGRATION_NEON_BRANCH=1`):

- `TestTenantMigrationFilePresent::test_migration_file_exists` — migration script present.
- `TestTenantMigrationFilePresent::test_migration_is_additive_only` — no `DROP TABLE`/`DROP COLUMN`/`TRUNCATE`/`DELETE FROM` (R9.1 additive guard; pure filesystem check).
- `TestTenantTablesReachable::test_canonical_programs_table_queryable` — tenant tables reachable post-migration.
- `TestTenantMigrationIdempotency::test_reapplying_migration_is_noop` — schema fingerprint (columns + indexes + constraints) identical after a second application.
- `TestTenantMigrationIdempotency::test_backfill_is_idempotent` — a legacy null-ID application is linked to all four canonical IDs on the first pass, unchanged on the second pass (`COALESCE` guards), and `canonical_programs` is never duplicated (`ON CONFLICT (code) DO UPDATE`).
- `TestTenantMigrationIdempotency::test_legacy_null_id_application_remains_readable` — an unmatched legacy row keeps null canonical IDs yet stays readable via its legacy string snapshots (R9.5 / R14.7).

Outcome in this checkout: **6 skipped, 0 errors, 0 failures** — no counter-examples (the live assertions did not execute). The static additive-only guard reflects the migration script as written (additive `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `NOT VALID` FKs only).

### Summary (task 1.10)

| Property | Result | Counter-example | Triage |
|----------|--------|-----------------|--------|
| P16 — migration re-apply no-op + backfill idempotency | **DEFERRED (skipped)** | none (live assertions deferred) | Phase 1 task 3.5 — run with `TENANT_MIGRATION_NEON_BRANCH=1` on a Neon branch |

This is the expected and acceptable outcome for the exploration task: a real
Postgres branch is not available in this checkout, so P16 is recorded as
deferred with the assertions fully written and ready to execute in Phase 1.

## Divergence resolution (Phases 2–4 fixes applied)

All seven exploration-recorded strict-xfail divergences (P2, P9 ×3, P10, P11,
P13) have been fixed and their markers removed; every previously-failing backend
property is now a hard pass. The two remaining failures (P17, P19) are frontend
`it.fails` markers deferred to Phase 5, and P16 stays deferred to Phase 1
(real Postgres) — see the consolidated table at the top.

| Property | Was | Fix | File |
|----------|-----|-----|------|
| P2 — priority ordering | xfail (coalesced sort key) | Sort by full design tuple `(program_intake.assignment_priority, offering.assignment_priority, code, id)`; offering priority is now a distinct secondary key | `backend/apps/catalog/services.py` (`OfferingAssignmentService.assign`) |
| P9 — application detail | xfail (200 + full PII leak) | `_get_application` scopes admin reads via `AccessScopeService.filter_applications`; out-of-scope → `None` → 404 NOT_FOUND | `backend/apps/applications/student_draft_views.py` |
| P9 — payment receipt/verify | xfail (403 oracle) | `PaymentReceiptView` + `PaymentVerifyView` mask admin scope miss as the identical 404 NOT_FOUND envelope | `backend/apps/documents/payment_query_views.py` |
| P9 — document info/url/download/delete | xfail (403 oracle) | `_get_authorized_document` returns `_document_not_found_response()` (404) on admin scope miss | `backend/apps/documents/document_storage_views.py` |
| P11 — duplicate canonicality | xfail (legacy-string OR) | `check_at_create`/`check_at_submit` use canonical-only keying when canonical IDs present (`Q(canonical_program_id=...)`, `Q(intake_ref_id=...)`); legacy string fallback only when an id is absent | `backend/apps/applications/duplicate_checker.py` |
| P10 — hostname collision | xfail (`.first()` silent pick) | `InstitutionContextService.resolve` fetches all matching active domains; >1 distinct institution → fail safe to shared + `domain.collision` log/sentry | `backend/apps/catalog/services.py` |
| P13 — token second-order injection | xfail (sequential `str.replace`, allowlist ignored) | `DocumentTemplateService.render` now does a single non-recursive regex pass substituting only allow-listed `{{token}}` placeholders (escaped); substituted output is never re-scanned, so a value containing `{{token}}` cannot be re-expanded, and non-allow-listed tokens stay inert | `backend/apps/catalog/services.py` |

### Pre-existing foundation bug fixed in passing

`DRAFT_SAFE_FIELDS` in `backend/apps/applications/serializers.py` listed the
four backend-controlled canonical IDs (`program_id`, `intake_id`,
`institution_id`, `program_offering_id`) as client-writable, but the serializer
declares them `read_only=True`. This failed two pre-existing property tests
(`TestPatchFieldGuardAdmin`, `TestPatchFieldGuardStudentDraft` in
`test_admissions_canonicalization.py`) independently of the divergence fixes
(reproduced with the divergence changes stashed). Removed the four canonical IDs
from the set — behaviour-neutral since they were already read-only, and aligned
with the canonical-only design (R1: canonical IDs are backend-controlled, never
client-writable).

### Verification

- `test_assignment_properties.py` + `test_cross_tenant_isolation.py` +
  `test_duplicate_canonical.py` + `test_institution_context.py` +
  `test_access_scope_properties.py` → **46 passed, 0 xfail/xpass**
  (`config.settings.dev`, `--hypothesis-seed=0`).
- `test_admissions_canonicalization.py` + `test_duplicate_checker_semantics.py`
  → **62 passed** (`config.settings.test`).
- Broader `tests/unit -k "application or payment or document or duplicate or
  scope or tenant or isolation or canonical"` → **577 passed, 0 failed**
  (the 2 xfailed / 1 xpassed are unrelated pre-existing payment
  webhook/structured-logging markers).
- `manage.py check` reports only the environmental `django_ratelimit.E003`
  (LocMemCache vs shared cache) present under both test and dev settings — not
  a regression from these changes (no changed file touches cache/ratelimit
  config).

> Phases 1, 6 (real-Postgres migration apply/backfill, production rollout) and
> the audit-event emission for assignment decisions (R2.8 — no test anchor in
> the suite) remain gated on a Neon staging branch / infrastructure and are out
> of scope for this code-only pass.

## Property baseline (task 1.9)

Task 1.9 replaced the task-1.1 skipped placeholders in
`backend/tests/unit/test_official_documents.py` and
`backend/tests/unit/test_payment_settlement_tenant.py` with real assertions for
the official-document safety properties (P13 token allowlist + injection
escaping + missing-template fallback; P14 asset MIME/magic-byte validation per
allowed type) and the payment settlement-metadata property (P15 collector
marker + tenant snapshot on every initiation path; tenant-scoped settlement;
"Unassigned" bucket safe). No production code was changed — this is exploration
against the current `DocumentTemplateService`, `validate_asset_magic_bytes`,
`PaymentService` initiation paths, and `PaymentSettlementSummaryView`.

### How these tests were run

Same sqlite-in-memory + `.venv` approach as tasks 1.3–1.6 (the default
`DATABASE_URL` points at the production Neon branch, so it is **not** used):

```bash
cd backend
DATABASE_URL="sqlite://:memory:" TESTING=1 \
  .venv/bin/python -m pytest \
  tests/unit/test_official_documents.py \
  tests/unit/test_payment_settlement_tenant.py \
  --hypothesis-seed=0 -v
```

Result: **24 passed, 1 xfailed** (`--hypothesis-seed=0`). The single xfail is
the P13 token-injection divergence below, recorded as
`@pytest.mark.xfail(strict=True)` so the counter-example is durable and the
marker auto-alerts (strict XPASS → failure) once Phase 4 fixes the renderer.
The property-based tests run ≥100 examples (`max_examples=100`) where the input
domain is open; the finite-domain generators (5 document types; 3×3 cross-type
spoof matrix) exhaust their small space early ("Stopped because nothing left to
do"), which is correct and intended.

### Contract confirmed against the implementation

- **Collector marker (P15).** The task-1.1 scaffold guessed the marker key was
  `beanola_collector`. The real contract — confirmed in
  `apps/documents/payment_helpers.py::_build_tenant_payment_metadata` — is the
  `collector` key with value `"beanola"`. The test module pins this as
  `COLLECTOR_KEY="collector"` / `COLLECTOR_VALUE="beanola"`. All three
  initiation paths merge `**_build_tenant_payment_metadata(application)` into
  `payments.metadata`, so the marker and the four canonical IDs
  (`institution_id`, `program_id`, `program_offering_id`, `intake_id`) are
  written on each.

### P13 — Token allowlist + injection escaping; missing-template fallback — **PARTIAL (escape + fallback PASS; allowlist/injection FAIL → xfail)**

File: `backend/tests/unit/test_official_documents.py`
(`TestOfficialDocumentSafety`).

Passing checks:

- `test_missing_template_falls_back_safely` — PASS. With no template
  configured, `DocumentTemplateService.render` returns
  `{"template_id": None, "template_version": None, "sections": {}}` rather than
  raising (R6.5).
- `test_missing_template_fallback_is_safe_for_every_document_type` (property) —
  PASS. The safe empty-body fallback holds for every official document type
  (`application_slip`, `acceptance_letter`, `conditional_offer`,
  `finance_receipt`, `payment_receipt`).
- `test_token_values_are_html_escaped` — PASS. An injected
  `<script>alert(1)</script>` token value is HTML-escaped (R6.4 clause a).
- `test_arbitrary_token_values_never_emit_raw_angle_brackets` (property, ≥100
  ex.) — PASS. For any token value, the rendered section carries no raw `<`/`>`,
  and equals `f"Dear {html.escape(payload)}, welcome."` exactly.

**Divergence (root cause).** The design (`design.md`, "DocumentTemplateService +
pdf_generation") mandates: *"Token rendering uses an allowlist + `html.escape`;
unknown/injected tokens are rejected or safely ignored."* The current
`_render_value` does neither half of that clause:

```python
rendered = value
for key, raw in context.items():
    rendered = rendered.replace("{{" + key + "}}", html.escape(str(raw or "")))
```

1. It ignores the template's `tokens` allowlist entirely — every key in the
   caller-supplied `context` is substituted, whether or not the template
   declared it.
2. `html.escape` does **not** escape `{` / `}`, so a token *value* that contains
   another `{{token}}` reference survives escaping intact and is then expanded
   by a later iteration of the sequential substitution loop (second-order /
   nested-token injection).

Recorded as `@pytest.mark.xfail(strict=True)`:

- `test_injected_token_in_value_is_not_re_expanded` — XFAIL.
  - Minimised counter-example: template `sections={"greeting": "Dear {{full_name}},"}`,
    allowlist `tokens=["full_name"]`, context
    `{"full_name": "{{receipt_number}}", "receipt_number": "RX-SENSITIVE-0001"}`.
  - Design: `receipt_number` is not allow-listed → ignored; even if present, the
    escaped `full_name` value `"{{receipt_number}}"` must not be re-expanded.
  - Current code: `full_name` is substituted first (insertion order) yielding
    `"Dear {{receipt_number}},"`, then a later loop iteration replaces
    `{{receipt_number}}` with `"RX-SENSITIVE-0001"`, leaking the
    non-allow-listed value into the greeting.

**Triage → Phase 4, tasks 16.1 + 15.3.** Task 16.1 ("Provenance snapshot + token
escaping + fallback + SVG safety") owns the renderer fix: restrict substitution
to the template's declared `tokens` allowlist and neutralise residual `{{ }}`
delimiters after escaping (e.g. single-pass substitution, or escaping the braces
in token values) so a value can never reintroduce a token reference. Task 15.3
("Template safety") owns the `TEMPLATE_TOKEN_REJECTED` path on the create/update
API so disallowed tokens are rejected at configuration time. When fixed, remove
the `xfail` marker so the property becomes a hard pass.

### P14 — Asset MIME/magic-byte validation per allowed type — **PASS**

File: `backend/tests/unit/test_official_documents.py`
(`TestAssetMimeMagicByteValidation`). Exercises the pure
`apps/documents/validators.py::validate_asset_magic_bytes` used by
`AdminTenantAssetUploadView`.

- `test_allowed_set_is_exactly_png_jpeg_webp_svg` — PASS. The asset allowlist is
  exactly `{image/jpeg, image/png, image/webp, image/svg+xml}`.
- `test_honest_binary_asset_is_accepted` (property, ≥100 ex.) — PASS. PNG/JPEG/
  WebP files whose magic bytes match the declared MIME are accepted and the
  detected type is returned.
- `test_honest_svg_asset_is_accepted` (property, ≥100 ex.) — PASS. SVG (with or
  without an `<?xml?>` prolog) declared `image/svg+xml` is accepted.
- `test_cross_type_binary_spoof_is_rejected` (property) — PASS. Content of one
  binary type declared as a different binary type is rejected; honest matches
  accepted.
- `test_png_content_declared_jpeg_is_rejected` — PASS.
- `test_disallowed_declared_type_is_rejected[application/pdf | image/gif | text/html | image/bmp]` — PASS.
  Declared types outside the allowlist are rejected up front.
- `test_empty_file_is_rejected` — PASS.
- `test_html_content_declared_svg_is_rejected` — PASS (HTML masquerading as SVG
  is rejected; the validator requires a leading `<svg`/`<?xml…<svg`).
- `test_riff_non_webp_declared_webp_is_rejected` — PASS (a RIFF/WAVE container
  declared WebP is rejected; the `WEBP` four-CC at offset 8 is required).

Current `validate_asset_magic_bytes` matches the design for all four allowed
asset types and the spoof/empty/disallowed cases. No divergence. (Note: SVG
*content sanitisation* — neutralising `<script>` inside an otherwise-valid SVG —
is R6.7's renderer concern, owned by Phase 4 task 16.1, not this MIME/magic-byte
validator; P14 only asserts type/magic-byte validation here.)

### P15 — Settlement metadata present on every initiation path; "Unassigned" bucket safe — **PASS**

File: `backend/tests/unit/test_payment_settlement_tenant.py`.

`TestSettlementMetadataTagging` (collector marker + snapshot per path):

- `test_tenant_world_provides_settlement_inputs` — PASS.
- `test_card_initiate_writes_collector_marker_and_snapshot` — PASS.
  `PaymentService.initiate_payment` writes `collector="beanola"` plus all four
  canonical IDs matching the world's `institution/canonical/offering/intake`.
- `test_defer_writes_collector_marker_and_snapshot` — PASS. `defer_payment`
  produces a `deferred` payment carrying the same marker + snapshot.
- `test_mobile_money_writes_collector_marker_and_snapshot` — PASS.
  `initiate_mobile_money` (credentials absent under test → payment stays
  `pending`, degrades gracefully) still writes the marker + snapshot on row
  creation.
- `test_no_raw_phone_persisted_on_mobile_money_metadata` — PASS. The raw MSISDN
  (`+260970000000` and its national form) never appears in `payments.metadata`
  (R7.7).

`TestSettlementSummaryScoping` (tenant scoping + Unassigned bucket):

- `test_settlement_summary_excludes_other_school` — PASS. School-A staff's
  settlement summary includes school A's institution and **never** school B's
  id or name anywhere in the response body.
- `test_missing_metadata_buckets_as_unassigned` — PASS. A payment whose
  application has no canonical linkage and whose metadata lacks the snapshot is
  grouped under `institution_id=None` / `institution_name="Unassigned"` without
  failing (R7.4/R7.5).
- `test_no_scope_staff_settlement_summary_is_empty` — PASS. A no-scope `admin`
  actor sees neither world's payments — no global total leaks.

Current `_build_tenant_payment_metadata` + `PaymentSettlementSummaryView`
(scoped through `AccessScopeService.filter_payments` for non-super-admins,
labels derived from the metadata snapshot with `"Unassigned"` fallbacks) already
satisfy R7.1, R7.4, R7.7, and R14.6 on the exercised surfaces. No divergence.
Phase 4 task 17.1/17.2 will formalise these (and the rename-durability /
receipt-stability clauses R7.2/R7.3) on top of this proven base.

### Summary (task 1.9)

| Property | Result | Counter-example | Triage |
|----------|--------|-----------------|--------|
| P13 — HTML-escape token values | **PASS** | — | None — current renderer escapes values |
| P13 — missing-template → safe default | **PASS** | — | None — current renderer falls back safely |
| P13 — token allowlist + no injected/nested-token re-expansion | **FAIL (xfail)** | `full_name="{{receipt_number}}"` + `receipt_number="RX-SENSITIVE-0001"` → greeting leaks `RX-SENSITIVE-0001` | Phase 4 tasks 16.1 (renderer allowlist + brace neutralisation) + 15.3 (`TEMPLATE_TOKEN_REJECTED`) |
| P14 — asset MIME/magic-byte per allowed type (PNG/JPEG/WebP/SVG) | **PASS** | — | None — current validator matches design |
| P15 — collector marker + snapshot on every initiation path | **PASS** | — | None — `collector="beanola"` + four IDs on card/mobile-money/defer |
| P15 — tenant-scoped settlement + "Unassigned" bucket safe | **PASS** | — | None — scoped grouping + safe Unassigned bucket, no leakage |

P14 and P15 confirm the current asset validator and settlement-tagging already
satisfy their requirements (R6.1, R7.1, R7.4, R7.7, R14.5, R14.6 on the
exercised surfaces). P13's escape + fallback halves pass; only the
allowlist/injection clause of R6.4 diverges, recorded as a durable strict-xfail
for Phase 4.

## Property baseline (task 1.11)

Task 1.11 replaced the task-1.2 placeholders in the three **frontend** test
files with real assertions for the UI correctness properties P17 (program-first
→ assigned-school checkpoint before payment), P18 (white-label host filters
offerings + brands from runtime context), and P19 (no-scope staff →
"No school access assigned", never global zeros). No production code was
changed — this is exploration against the current wizard config, catalog
context service, and admin dashboard surfaces.

### How these tests were run

Per `tech.md` steering, the admissions Vitest suite runs under Bun:

```bash
cd apps/admissions
bun run test -- --run \
  tests/property/programFirstWizard \
  tests/unit/whiteLabelContext \
  tests/unit/noScopeEmptyState
```

Result: **17 passed, 0 failed** (3 files). The property-based test
(`programFirstWizard`) uses `fc.assert(prop, { numRuns: 100, seed: 0 })` per the
design; the two unit files are example-based (consistent with the design's
`tests/unit/` placement for P18/P19).

### Durable-failure convention for the frontend

The backend exploration tasks (1.3–1.9) record genuine divergences as
`@pytest.mark.xfail(strict=True)` so the counter-example is durable and the
marker auto-alerts (strict XPASS → failure) once the fix lands. The faithful
Vitest mirror is **`it.fails(...)`**: the test *passes* while its body throws
(divergence present) and the test itself *fails* (auto-alerts) the moment the
body starts passing — i.e. once the implementing Phase 5 task fixes the
behaviour and the durable marker must be removed. So in the run above, the two
divergence tests are green **because** their bodies still throw against current
code; each is paired with a plain characterisation/baseline test that proves the
divergence is real (not a false-throw).

### P17 — program-first → assigned-school checkpoint before payment — **FAIL (divergence, recorded as `it.fails`)**

File: `apps/admissions/tests/property/programFirstWizard.property.test.ts`.

Passing baseline checks (current wizard ordering):

- `exposes a stable, non-empty ordered step list` — PASS (ids 1-based, strictly
  increasing).
- `orders the payment step strictly after the personal-details (program+intake) step` — PASS.
- `orders submit/review as the final step, strictly after payment` — PASS.
- `property: payment is never the first step for any generated current index`
  (property, 100 ex., seed 0) — PASS.

**Divergence (root cause).** The design (`design.md`, Property 12; requirements
R10.1/R10.3) mandates the wizard order **(1) program+intake → (2) assigned
school review → (3) personal → (4) education/docs → (5) payment → (6)
review/submit**, with payment unreachable until assignment + fee resolve at the
assigned-school checkpoint. The current `wizardSteps` (steps/config.ts) is:

```
basicKyc (1) → education (2) → payment (3) → submit (4)
```

There is **no** assigned-school review step — the payment step is reached with
no prior assignment/fee checkpoint. Recorded as `it.fails`:

- `payment is unreachable before the assigned-school checkpoint across generated flows`
  — durable expected-failure.
  - Minimised counter-example (fast-check, seed 0): `currentIndex = 0`.
    `wizardSteps.findIndex(isAssignedSchoolCheckpoint) === -1`
    (no step's key/title matches `assigned|school|offering` without being the
    payment step), so `expect(checkpointIndex).toBeGreaterThanOrEqual(0)` throws
    on the first generated example.

The detector is naming-agnostic (matches `assigned`/`school`/`offering` in the
step key, progress title, or title and never the payment step) so the property
flips to a hard pass under whatever reasonable key Phase 5 gives the new step.

**Triage → Phase 5, task 21.1 + 21.3.** Task 21.1 ("Step ordering +
assigned-school checkpoint before payment") inserts the assigned-school review
step and gates the payment step on resolved assignment+fee; task 21.3
("Wizard property + checkpoint tests") owns the green property. When the
checkpoint step lands, the `it.fails` body passes and the marker auto-alerts —
remove it so the property becomes a hard pass.

### P18 — white-label host filters offerings + brands from runtime context — **PASS**

File: `apps/admissions/tests/unit/whiteLabelContext.test.tsx`.

Half 1 — brand resolution (`catalogService.getContext`):

- `returns white_label context with the institution brand from runtime payload` — PASS.
- `returns shared Beanola context when the host is not a white-label domain` — PASS.
- `falls back to the shared Beanola brand (never a leaked school) on context failure` — PASS.
- `does not hard-code a school name: the brand is whatever the runtime payload carries` — PASS
  (an unknown future school brands purely from runtime context).

Half 2 — offering filtering (the `catalogData.useProgramsForIntake` query-fn
call sequence: `getContext()` → `getCanonicalPrograms({ intake, institution })`):

- `forwards the white-label institution into the canonical-programs request` — PASS
  (endpoint contains `institution=inst-mihas` + `intake=...`).
- `forwards NO institution on the shared Beanola portal (no school favouritism)` — PASS
  (endpoint has no `institution=` param).
- `uses the runtime institution even when the frontend has never seen that school` — PASS.

Current `catalogService.getContext` normalises `portal_type`/`institution_id`/
`brand` and fails safe to the shared Beanola brand; `useProgramsForIntake`
resolves the runtime context and forwards `institution` into the canonical
offerings request only on a white-label host. Both halves of R3/R10.6 hold on
the exercised service surface. No divergence.

> Note: the full **component-level** render (wizard/portal renders the runtime
> brand and the rendered offering *list* is visibly filtered) is wired in
> Phase 5 (task 22.1) with component tests in task 23.4. The service-level call
> contract proven here is the substrate those component tests sit on.

### P19 — no-scope staff → "No school access assigned", never global zeros — **FAIL (divergence, recorded as `it.fails`)**

File: `apps/admissions/tests/unit/noScopeEmptyState.test.tsx`.

Passing baseline checks (the no-scope state is expressible via `EmptyState`):

- `renders an explicit "No school access assigned" heading` — PASS.
- `offers a support path action rather than dead-ending the user` — PASS.
- `shows no numeric/zero counts that could imply platform-wide totals` — PASS
  (rendered text has no standalone digits).

Passing characterisation check (proves the divergence is real):

- `renders zero-valued global aggregates (the leak a no-scope user sees today)`
  — PASS. `RealtimeMetricsDisplay` with all-zero stats renders
  "Total Applications" + a standalone "0".

**Divergence (root cause).** The design (`design.md`, Property 12; requirement
R11.6) mandates: *"WHEN a user has no school scope, THE dashboard SHALL render
an explicit 'No school access assigned' state with a support path and SHALL NOT
show global zero counts."* Current reality:

1. The frontend `User` type (`src/types/auth.ts`) has **no** membership/grant/
   scope field, so the dashboard cannot distinguish a no-scope user.
2. `shouldLoadAdminDashboard(user)` (`pages/admin/lib/dashboardBootstrap.ts`)
   returns `true` for any `user.id` and routes every authenticated admin into
   the global metrics dashboard.
3. That dashboard renders `RealtimeMetricsDisplay`, which shows platform-wide
   zero aggregates and never the no-scope copy.
4. Grep confirms the only "no schools" copy in admin code is the Tenants
   "No schools have been onboarded yet." message — there is no
   "No school access assigned" state anywhere in the app.

Recorded as `it.fails`:

- `the no-scope admin surface shows the no-access state and never global zero counts`
  — durable expected-failure.
  - Minimised counter-example: render the surface a no-scope admin lands on
    today (`RealtimeMetricsDisplay` with all-zero stats). Its text contains
    "Total Applications" + standalone "0" (global zeros) and lacks the
    "No school access assigned" heading, so
    `expect(text).toContain('No school access assigned')` throws.

**Triage → Phase 5, task 23.3 + 23.4.** Task 23.3 ("Scoped vs global dashboards
+ no-scope empty state") renders the `EmptyState` no-scope state for a no-scope
user instead of the global-zeros widget; task 23.4 ("Frontend tenant + no-scope
tests") repoints this test at the real scope-aware surface. When that lands, the
`it.fails` body passes and the marker auto-alerts — remove it so the property
becomes a hard pass.

### Summary (task 1.11)

| Property | Result | Counter-example | Triage |
|----------|--------|-----------------|--------|
| P17 — payment unreachable before assigned-school checkpoint | **FAIL (`it.fails`)** | no assigned-school step exists in `wizardSteps` (`basicKyc → education → payment → submit`); checkpoint index `-1` at `currentIndex=0` | Phase 5 task 21.1 (insert checkpoint + gate payment) / 21.3 (green property) |
| P18 — white-label host filters offerings + brands from runtime context | **PASS** | — | None — `getContext` + `useProgramsForIntake` forward institution on white-label, omit it on shared; brand from runtime, no hard-coded school |
| P19 — no-scope staff → "No school access assigned", never global zeros | **FAIL (`it.fails`)** | no-scope admin surface = `RealtimeMetricsDisplay` zero aggregates ("Total Applications" + "0"); no no-scope state, no scope field on `User`, `shouldLoadAdminDashboard` ignores scope | Phase 5 task 23.3 (render no-scope `EmptyState`) / 23.4 (repoint test) |

P18 confirms the current catalog context service + offering-filter call
contract already satisfy R3/R10.6 on the exercised surface. P17 and P19 are the
two frontend properties that fail against current code — both because the
Phase-5 UI surfaces (the assigned-school checkpoint step; the scope-aware
dashboard / no-scope empty state) do not exist yet. Each is recorded as a
durable `it.fails` divergence paired with a passing baseline/characterisation
test, mirroring the backend strict-xfail approach, and triaged to the Phase 5
task that will fix it.
