# Task 2.5 — Repair reviewer membership, queue, assignment, and workload rules

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Spec: `admissions-v2-canonical-rebuild`
Requirements: **R3, R8.2-R8.4** · Findings: **AUTH-01, AUTH-03**
Design: §5.2 (Reviewer = named membership PLUS application assignment), §5.3
(assignment requires active membership + eligible reviewer policy;
auto-assignment selects only from that set and locks workload counters).

## Candidate identity

- Base commit (working tree): `bae29a28d9657f288b3339062adb31285959c966`
  (task changes are staged in the working tree, layered on the in-flight V2
  branch; not yet committed).
- Regenerated OpenAPI product version: `2.0.0`
- OpenAPI schema SHA-256 (`/tmp/schema_2_5.yaml`):
  `b8ace5e9d0b22a81a7b0a1d09ff030fb45054bf1331dc6a6145cd142e94ab485`
- New route present in schema: `GET /api/v1/applications/{application_id}/assignment-candidates/`

## What changed

### Backend

- **`backend/apps/applications/reviewer_assignment_service.py` (new)** —
  `ReviewerAssignmentService`: the single authority for reviewer eligibility
  and locked assignment.
  - `is_eligible_reviewer` / `eligible_reviewers_queryset`: a candidate is an
    **active** profile with a reviewer-capable role (`reviewer`/`admin`/
    `super_admin`) **and** an active `UserInstitutionMembership` in the
    application's tenant. Role alone never grants eligibility (design §5.3).
  - `assign_reviewer` (manual): locks the **application then the reviewer
    `Profile`** (fixed order), validates eligibility for the application's
    tenant, assigns, and writes an audit history row — all in one transaction.
    Fails closed with `APPLICATION_TENANT_UNRESOLVED` when the application has
    no canonical institution.
  - `auto_assign`: locks the unassigned application batch (`skip_locked`) then
    the eligible reviewer `Profile` rows (the **workload-counter lock**),
    selects only reviewers with an active membership in **each application's**
    tenant, and never exceeds `max_reviewer_workload`.
- **`backend/apps/applications/admin_assignment_views.py`** — `ApplicationAssignView`
  now validates the payload via `ApplicationAssignRequestSerializer` (rejects the
  empty/blank `reviewer_id` the old client posted — AUTH-03) and delegates to the
  service; `ApplicationAutoAssignView` delegates to the service; new
  `AssignmentCandidatesView` (`GET .../assignment-candidates/`) returns
  tenant-scoped, searchable candidates (R8.2). Session revocation + notifications
  preserved.
- **`backend/apps/common/tenant_authorization.py`** — added the **reviewer
  assignment-scope policy** composed with the capability service (R3.1):
  `require_reviewer_assignment` (404-masks an application a Reviewer is not
  assigned to) and `apply_reviewer_assignment_scope` (narrows a Reviewer's
  queue). `resolve_scoped_application` enforces it by default; Tenant_Admins and
  platform admins are unaffected.
- **`backend/apps/applications/admin_review_views.py`** — the staff application
  queue applies `apply_reviewer_assignment_scope` so a Reviewer's queue contains
  only tenant-authorized **and** assigned work (R8.2).
- **`backend/apps/applications/urls.py`**, **`scripts/authority_matrix_registry.py`**
  — registered `.../assignment-candidates/` (platform authority,
  `platform.user.manage_all`); the zero-unclassified authority gate stays green.

### Frontend

- **`apps/admissions/src/services/applications.ts`** — added
  `getAssignmentCandidates(id, search)` + `ReviewerCandidate` type.
- **`apps/admissions/src/components/admin/applications/ApplicationDetailModal.tsx`**
  — replaced `AssignReviewerButton` (which posted an **empty** `reviewer_id` —
  the AUTH-03 defect) with `AssignReviewerControl`, a tenant-scoped, searchable,
  accessible reviewer picker that always posts a real candidate id.

## Tests run + results

### Backend (PostgreSQL — isolated local-test DB, never Neon/production)

`DATABASE_URL=postgresql://postgres:postgres@localhost:5433/mihas_localtest`
`DJANGO_SETTINGS_MODULE=config.settings.dev`

- `tests/unit/test_reviewer_assignment.py` + `test_reviewer_assignment_concurrency.py`
  → **29 passed** (raw: `raw/reviewer-tests-postgres.txt`), including:
  - eligibility policy (membership + role; cross-tenant / inactive / student rejected);
  - manual assignment (eligible succeeds; non-member / cross-tenant rejected with
    `REVIEWER_NOT_ELIGIBLE` and **no mutation**; empty/missing `reviewer_id` →
    `VALIDATION_ERROR`; unknown app → 404; student/regular-admin → 403);
  - candidate search endpoint (tenant-scoped, searchable, super-admin only);
  - auto-assign (only tenant-eligible reviewers; `NO_REVIEWERS` when none);
  - **reviewer assignment scope** — reviewer can review an **assigned** app (200)
    but gets a **404 mask** on an unassigned in-tenant app; Tenant_Admin is not
    assignment-scoped; reviewer **queue lists only assigned work**;
  - **concurrent auto-assignment** (`@pytest.mark.django_db(transaction=True)`,
    4 threads) — reviewer filled to **exactly** `max_workload`, never exceeded;
    a non-member is never assigned under concurrency.

- SQLite fast suite (`config.settings.test`): **27 passed, 2 skipped** — the two
  concurrency tests skip on SQLite (row locking requires PostgreSQL), matching
  the repo's existing `skipif(connection.vendor != 'postgresql')` convention.
  The V2/CI profile runs the backend suite on PostgreSQL, so they run there with
  no environment/credential gating.

### Concurrency test has teeth (verified)

With **both** locks removed from `auto_assign` (`skip_locked` on the app batch
and `select_for_update` on the reviewer rows), the concurrency test
`test_concurrent_auto_assign_never_exceeds_max_workload` **failed 3/3**
(over-assignment beyond `max_workload`). Locks restored → passes; re-run 5× with
no flakiness.

### Regression checks (no new failures from this task)

- `test_authority_matrix_v2.py` (16), `test_access_scope_properties.py`,
  `test_application_triage_filters.py`, `test_rbac_properties.py` → **45 passed**.
- `test_interview_scheduling.py`, `test_tenant_admin_endpoints.py` → **70 passed**
  (paths that resolve applications via `resolve_scoped_application`).
- **Full `tests/unit/` delta (SQLite):** this task changed the suite total from
  `22 failed / 2183 passed / 79 errors` to `21 failed / 2184 passed / 79 errors`.
  The single net change is the **one governance test this task must update**
  (`test_view_auth_classification.py::test_all_api_views_are_classified` — the new
  `AssignmentCandidatesView` is now registered in the `_PROTECTED` list, so it
  passes). Errors are unchanged (79, all the pre-existing
  `document_views.AccessScopeService` stale-patch setup error from the task-2.2
  refactor, on modules this task never edits).
- The remaining 21 failures are pre-existing and unrelated to this task (verified
  identical on SQLite and Postgres, part of the task-0.5 in-flight V2 baseline):
  `test_admissions_v2_authority_policies.py` (3 — envelope `request_id` equality +
  settlements/tenant-directory), `test_scoped_access_matrix.py` /
  `test_no_scope_empty.py` (envelope `request_id` equality + dashboard 404),
  `test_launch_verification_spectacular.py` / `test_public_endpoint_policy.py` /
  `test_schema_tags.py` (V2 `demo_views` schema/AllowAny — 20 pre-existing schema
  errors noted in the baseline), `test_unscoped_endpoint_guard.py` (GAP-register
  on `interview_views`/`student_withdrawal_views` — not edited by this task),
  `test_perf_capability_invalidation.py`, `test_cross_tenant_isolation.py`,
  `test_brand_drift_guard.py`, `test_admin_scope_endpoint.py`. None reference the
  reviewer-assignment code paths this task changed.

### Frontend (`apps/admissions`)

- `bun run type-check` → **pass** (whole project).
- `bun x vitest run tests/unit/applicationServiceEncoding.test.ts tests/unit/architectureEnforcement.test.ts`
  → **7 passed** (incl. the pages/components-must-not-import-raw-client gate).
- Lint of the two changed files: only one **pre-existing** `no-restricted-imports`
  error (`ApplicationDetailModal.tsx` already imported `@/services/client` for
  payment/fee-waiver reads before this task — part of the baseline's 24 R14.3
  errors). No new lint errors from this task's code.

## Not run in this environment (stated explicitly, not relabeled)

- **Reviewer browser E2E (Playwright).** The full reviewer journey requires the
  local V2 harness (Postgres + Redis + object storage + console email + worker +
  frontend preview). It was not executed here. The reviewer authorization
  behaviour it would assert (assignment-scoped review commands, cross-tenant
  assignment rejection, candidate picker posting a real id) is covered at the API
  and service level by the 29 backend tests above. The Playwright reviewer
  journey remains to be run in the V2 harness/CI.
