# Task 9.4 — Build one deterministic admin review workspace

Evidence index for task **9.4** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 9.4 Build one deterministic admin review workspace
  - Replace multi-call/AI detail composition with one structured detail/readiness
    query and separate versioned commands.
  - Complete reviewer/admin document, payment, amendment, interview, decision,
    bulk, and export paths under the authority matrix.
  - _Requirements: R8.2-R8.5, R8.7, R11.3_
  - _Findings: AUTH-01, AUTH-02, AUTH-03, API-02, MAINT-01_
  - _Evidence: Reviewer and Tenant_Admin desktop/mobile journeys_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-08 (UTC).
- **Reuses tasks 2.2, 6.5, 7.4, 9.1 and 9.3 rather than inventing a sixth
  pattern.** 2.2's `resolve_scoped_application` is the scope-before-lookup seam and
  stays the only authorization path; 6.5's `evaluate_readiness` is the readiness
  evaluator and is *not* re-implemented for reviewers; 7.4 deleted the generative
  admissions surface, so this task had to compose the reviewer's summary
  deterministically or not at all; 9.1's `ApplicationQueryService` owns the roster
  and now publishes the version a bulk decision must carry; 9.3's "one service, one
  published contract, definitions travel with the numbers" is applied to a **detail**
  surface. What is new here is the **version guard** — the platform had no answer
  for two reviewers deciding the same application.
- PBT: task 9.4 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`.
- Schema: **no migration.** No table, column, index, or capability was added. One
  route was added (`GET /api/v1/admin/applications/{application_id}/`) and it reads
  existing tables; `Application.version` already existed (task 6.5). The capability
  catalogue stays at 17 `platform.*` + 17 `tenant.*`. Neon and production were not
  touched; the only databases used were the throwaway `mihas_localtest` Postgres and
  the task-0.4 harness.

## The Required_Evidence claim

The `_Evidence:` line names **two actors, two viewports** — and each half of it
names a different defect.

**Reviewer journeys — the frontend was denying work the backend granted.**

| Where | What it proves |
|---|---|
| journeys 4 and 5 (below) | a scoped Reviewer navigates to the roster, opens their assigned application, and records a decision; and is answered **404** for an application they are not assigned to — the same 404 an unknown id gets, `request_id` aside. Their roster contains the assigned application and not the other one |
| [`test_review_workspace_9_4.py::TestAuthorityIsCapabilityDerived`](../../../backend/tests/unit/test_review_workspace_9_4.py) | the endpoint's half: a reviewer opens only assigned work, a read-only tenant admin reads but cannot decide or assign, a student and an anonymous caller are denied, and **no role string is compared anywhere on the surface** |
| [`reviewerReachesTheWorkspace.test.tsx`](../../../apps/admissions/tests/unit/reviewerReachesTheWorkspace.test.tsx) | the guard's half: `AdminRoute` admits an actor the backend grants capabilities to, and still redirects one whose capabilities resolve to nothing (§4) |

**Tenant_Admin journeys — one read, a deterministic checklist, and a version.**

| Where | What it proves |
|---|---|
| journeys 1–3 and 6 | opening an application issues **one** request for it and **none of the six** it used to issue; the readiness tab publishes all seven R11.3 facts with a state each and no generative call; a decision carries the version it read and a replay of that version is refused with the application left where the first decision put it; and a read-only Tenant_Admin reads every fact, is offered no command, and is refused the command by the endpoint |
| `test_review_workspace_9_4.py` (49 cases, §13) | the same claims at the endpoint, plus cross-tenant isolation, the export path, and the per-section contract |
| [`reviewWorkspaceServerOwned.test.tsx`](../../../apps/admissions/tests/unit/reviewWorkspaceServerOwned.test.tsx) (24 cases) | the wiring: exactly one read, none of the seven retired fragments, every command carrying a version, controls gated on the server's capability matrix, and a conflict **refetching** instead of only reporting |

Why the browser is required for both: **AUTH-01 was invisible to the backend.** Every
review route already answered a Reviewer correctly; the defect was that a Reviewer
never arrived, because the frontend route guard read a role string and sent them to
the student dashboard. No endpoint test can fail on that. Two further defects in
this run were found *only* by running the browser, one of them at the mobile
breakpoint only (§11).

### The 6 required journeys

[`admin-review-workspace.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/admin-review-workspace.spec.ts)
— **6 journeys × 2 viewports = 12, all passing on a freshly wiped harness with zero
skips** ([`raw/harness-review-workspace-journeys.txt`](raw/harness-review-workspace-journeys.txt)):

| Journey | The claim it settles |
|---|---|
| **one read** | every retired call is named individually and counted on the wire: `GET /api/v1/admin/applications/{id}/` **once**, the six retired fragments **zero** times, and visiting all seven tabs adds no request. The one other per-application read (`/official-documents/`, a different resource with its own issuance policy) is asserted explicitly rather than allowed by a loose matcher |
| **deterministic readiness** | no tab matches `AI`; the readiness panel publishes `payment_gate`, `required_documents`, `identity_verification`, `grades`, `eligibility`, `duplicates`, `intake_window`, each with a `data-state`; the blocked count is **> 0**, so it is a real checklist and not an all-green screen; and zero requests reach `admin-summary` or `preview-summary` |
| **versioned decision** | the version on screen is sent with the decision, the response carries a **higher** version and its `allowed_transitions`; the same version replayed as a *different* decision is **409**; and the application is left in the state the first decision produced |
| **Reviewer, allowed work** | the one journey AUTH-01 made impossible: a scoped Reviewer reaches the workspace through the roster and decides their assigned application. The read-only banner is absent because the backend granted `tenant.application.review` |
| **Reviewer, denied work** | an unassigned application is **404** and byte-identical to an unknown id's 404 (`request_id` stripped); and the roster itself contains only assigned work. The refusals are declared to the request gate — R18.4's asserted error path |
| **read-only Tenant_Admin** | the facts render, `review-read-only` is visible, the assign and waiver controls are **absent**, and issuing the decision directly is **403**. Frontend hiding is convenience; the endpoint is the boundary |

## What this task establishes

1. **One read, and the application row appears once.** The workspace composed
   itself from six requests and merged two copies of the application with
   `{ ...application, ...summary.application }`, so which value a reviewer saw
   depended on response order. There is one request, eleven named sections, and no
   merge (§1).
2. **The reviewer's summary is the submission evaluator's own output.** Task 7.4
   deleted the generative admin summary; the tab that called it was still in the
   tree. Readiness is now `readiness_service.reviewer_summary` over the same
   `evaluate_readiness` that `submit_application` re-runs under its locks — one
   evaluator, two audiences (§2).
3. **Unavailable readiness is `null`, not a green checklist.** A configuration that
   cannot be evaluated renders `readiness-unavailable`. R8.6's "missing data shall
   not become a healthy zero", applied to a decision surface (§2.2).
4. **Authority is a capability, per command, published on the read.** Ten commands
   across seven view modules moved off `IsAdmin`/`IsSuperAdmin` role classes onto
   `AdminCapabilityService` capabilities resolved for *that application's*
   institution. The read publishes the answer so the UI gates on the server, and
   every endpoint re-derives it (§3).
5. **A Reviewer can reach the workspace.** `AdminRoute` admitted a role string; it
   now admits an actor the backend grants capabilities to. This is the frontend
   route-tier alignment [9.3 §16](../9.3/README.md) named and deferred (§4).
6. **Reviewer assignment sends a real candidate id.** AUTH-03's empty UUID is gone:
   the picker is filled from a tenant-scoped candidate endpoint and the command is
   transactionally validated against membership (§5).
7. **Every command carries the version it read.** `expected_version` (or the
   `If-Match` the read's ETag published) on ten commands; a stale version is
   `VERSION_CONFLICT` (409) with `current_version` on the envelope, and mutates
   nothing. Opt-in, so no existing integration breaks — but a version that cannot be
   parsed is treated as **stale**, not absent (§6).
8. **The roster publishes the version a bulk decision must carry, and it is not an
   export column.** Otherwise `expected_versions` could only be filled by guessing
   (§7).
9. **Cross-tenant isolation holds on the detail surface, and the one cross-tenant
   fact is never computed.** `other_tenant_application_count` is not filtered out of
   an answer for a tenant actor — the query does not run (§8).
10. **A 409's stable code reaches the wire.** `ReviewVersionConflict` declared
    `VERSION_CONFLICT` and callers received `INTERNAL_ERROR`, because the envelope
    handler's status map had no 409 entry. The code it advertises is now the code it
    sends (§6.4).
11. **Sections declare their own truncation, and each ships a definition.** A
    workspace is a screen, not an export: 100 rows per section, reported (§10).

## Files

```
docs/v2-evidence/9.4/
├── README.md                                     ← this index
└── raw/
    ├── review-workspace-suites.txt                   (56 failed / 1898 passed / 70 skipped / 39 errors)
    ├── review-workspace-suites-baseline.txt          (the SAME 194 suite files, 9.4's implementation removed: 63 / 1842 / 70 / 39)
    ├── frontend-test.txt                             (whole suite: 1 pre-existing failure / 4044 passed / 1 skipped; middle of the log elided)
    ├── frontend-lint.txt                             (18 errors)
    ├── frontend-lint-files.txt                       (the 15 files those errors are in — none of them this task's)
    ├── frontend-build.txt                            (exit 0, incl. tsc + CSP gate)
    ├── django-check.txt                              (no issues)
    ├── spectacular.txt                               (3 warnings / 116 errors — unchanged)
    └── harness-review-workspace-journeys.txt         (12 passed — 6 journeys × desktop + mobile, freshly wiped harness)
```

Source of the change:

| Path | What it is |
|---|---|
| `backend/apps/applications/review_workspace_service.py` | **new** — `ApplicationReviewWorkspaceService`: `WORKSPACE_SECTIONS` (11), the eleven section projections, `SECTION_DEFINITIONS`, `SECTION_ROW_LIMIT = 100`, `COMMAND_CAPABILITIES` (the authority matrix as data), `PLATFORM_ONLY_COMMANDS`/`PLATFORM_COMMAND_CAPABILITIES`, `PLATFORM_ONLY_DETAIL_FIELDS`, `command_authority`, `allowed_transitions`, and the version guard (`read_expected_version`, `assert_version`, `bump_version`, `commit_command`, `ReviewVersionConflict`) |
| `backend/apps/applications/admin_review_workspace_views.py` | **new** — `AdminApplicationReviewWorkspaceView` (`GET /api/v1/admin/applications/{application_id}/`) + the response serializer for the schema. Holds no domain logic: resolve the actor's access, ask the service, publish the version as a weak `ETag` |
| `backend/apps/applications/admin_review_views.py` | the decision + payment-review command re-gated on capabilities through `resolve_scoped_application`, version-guarded, and returning the new version with its allowed next actions |
| `backend/apps/applications/admin_amendment_views.py` | amendment list + review moved off the fetch-then-check `_staff_can_access_application` shape onto `resolve_scoped_application`, version-guarded, and audited via `TenantAuditService.record_amendment_review` |
| `backend/apps/applications/admin_assignment_views.py` | `IsSuperAdmin` → capability; **`GET /applications/{id}/assignment-candidates/?search=`** added (tenant-scoped, membership-eligible, searchable) so the picker cannot send an empty id (AUTH-03); assignment validated transactionally against membership; auto-assign kept platform-only |
| `backend/apps/applications/admin_bulk_views.py` | `expected_versions` per application id, scope applied before lookup and composed with the reviewer-assignment scope, the **applied** set reported back, audited via `record_bulk_review_decision` |
| `backend/apps/applications/admin_export_views.py` | `IsAdmin` → `HasTenantCapability` (`tenant.application.export`), page-independent, audited via `record_export` |
| `backend/apps/applications/document_views.py` | five document views re-gated on `tenant.document.verify` / `tenant.document.read` through the scoped resolver; verification version-guarded |
| `backend/apps/applications/interview_views.py` | schedule / reschedule / cancel re-gated on `tenant.application.review`, each version-guarded; the `IsAdmin().has_permission(...)` branches removed |
| `backend/apps/applications/query_service.py` | `rows_for` emits `version` per roster row, deliberately **outside** `ROW_COLUMNS` so it is not an export column |
| `backend/apps/catalog/tenant_audit_service.py` | `record_amendment_review`, `record_condition_verification`, `record_bulk_review_decision`, `record_export` + their action constants — the review commands' audit trail, using the shared redactor |
| `backend/apps/common/exceptions.py` | `409: "CONFLICT"` in the code map, the exception's own stable code preferred, and `current_version` lifted onto the envelope |
| `backend/apps/applications/admin_urls.py` | the workspace route and the reviewer-candidates route registered |
| `scripts/authority_matrix_registry.py` | the workspace route and the re-gated commands re-registered with their capabilities, tenant object paths, idempotency, audit events, and `not_found_mask_then_non_revealing_403` |
| `backend/tests/unit/test_review_workspace_9_4.py` | **new** — 49 cases (§13) |
| `backend/tests/unit/test_reviewer_assignment.py` | rewritten onto the capability model; the two `TestReviewerAssignmentScope` cases are the AUTH-01/AUTH-02 defect reproduction (§14.1) |
| `backend/tests/unit/test_unscoped_endpoint_guard.py` | the GAP register re-pinned: the four `tenant_authorization` scope seams added as scope tokens, and GAP-5 (the deleted generative summary view) retired rather than left pointing at a class that cannot exist |
| `backend/tests/unit/{test_view_auth_classification,test_scoped_access_matrix,test_admin_export_hardening}.py` | the new/​re-gated view classes classified and the export authority assertions moved onto the capability |
| `apps/admissions/src/services/admin/reviewWorkspace.ts` | **new** — the one read, the typed payload (no `unknown`, no shape union), and one function per command, each taking a `VersionedCommand`; `VersionConflictError`/`isVersionConflict` |
| `apps/admissions/src/hooks/admin/useReviewWorkspace.ts` | **new** — `useReviewWorkspace` (the read), `useReviewCommand` (reads the version out of the cache at issue time, so a component cannot send a version it held three interactions ago), `useRefreshReviewWorkspace`. A conflict **refetches** |
| `apps/admissions/src/components/admin/applications/workspaceAdapters.ts` | **new** — pure projections from the one payload to the existing panel props, so the panels did not have to be rewritten to consume named sections |
| `apps/admissions/src/components/admin/applications/ReviewReadinessPanel.tsx` | **new** — the deterministic checklist, `readiness-unavailable` when the server said `null`, a state (not a colour) per row |
| `apps/admissions/src/components/admin/applications/ApplicationDetailModal.tsx` | rewritten onto the one read: the six loaders and the merge deleted, every control gated on `data.capabilities`, every write a versioned command, the read-only explanation instead of a dead action bar, and `data-workspace-version` as the honest "payload is in hand" signal |
| `apps/admissions/src/components/admin/applications/AISummaryPanel.tsx` | **deleted** — it called a route task 7.4 removed (R11.1) |
| `apps/admissions/src/components/admin/applications/{ApplicationDetailDocuments,ApplicationDetailInterview,ApplicationDetailPayment,ApplicationApprovalActions}.tsx` | panel-owned fetches removed; each takes its section and reports its command upward |
| `apps/admissions/src/components/AdminRoute.tsx` | the guard's third state is now the backend's answer, not a role string (AUTH-01) |
| `apps/admissions/src/pages/admin/Applications.tsx` | the bulk command sends `expected_versions` built from the roster rows' own versions (the panel `idPrefix` / `data-roster-filters` seam this task's journeys use is task 9.1's) |
| `apps/admissions/src/hooks/admin/useApplicationsData.ts` | `rowVersions` surfaced from the roster answer |
| `apps/admissions/src/services/applications.ts` | `bulkStatus` takes `expectedVersions`; `ReviewerCandidate` added |
| `apps/admissions/tests/unit/reviewWorkspaceServerOwned.test.tsx` | **new** — 24 cases; parses the backend service so the capability keys and the version contract cannot drift |
| `apps/admissions/tests/unit/reviewerReachesTheWorkspace.test.tsx` | **new** — 7 cases on the guard and the capability provider (AUTH-01) |
| `apps/admissions/tests/harness-e2e/required/admin-review-workspace.spec.ts` | **new** — the 6 required browser journeys, desktop and mobile |
| `docs/canonical-truth-map.md` | "Admin review workspace contract" — the query authority, the payload shape, named sections, the deterministic readiness rule, the per-command capability matrix, the platform-composed command, the version guard, the roster row version, bulk versions, the platform-only field, the section cap, the definitions, disclosure, and the drift guards |

---

## 1. One read, and the application row appears once (R8.5, API-02)

### 1.1 What the browser used to do

```ts
// services/applications.ts, before — five requests, then a merge
const [detailsResponse, documents, grades, summary, interviews] = await Promise.all([
  apiClient.request(`/applications/${encodedId}/details/`),
  shouldLoadDocuments ? apiClient.request(`/applications/${encodedId}/documents/`) : null,
  shouldLoadGrades    ? apiClient.request(`/applications/${encodedId}/grades/`)    : null,
  shouldLoadStatusHistory ? apiClient.request(`/applications/${encodedId}/summary/`) : null,
  apiClient.request(`/applications/${encodedId}/interviews/`),
])
const mergedApplication = summary?.application
  ? { ...application, ...summary.application, interview: latestInterview }
  : { ...application, interview: latestInterview }
```

…plus a sixth from the modal (`/payments/?application_id=`) and a seventh behind the
`'ai'` tab (`/admin-summary/`, deleted from the backend by task 7.4).

Two of those were worse than redundant:

- **`/summary/` returned a second copy of the application** and the spread put it
  last, so every field it carried **overwrote** the one from `/details/`. Which value
  a reviewer read depended on which payload the merge saw — the exact "accepts many
  incompatible shapes and thereby hides backend drift" of **API-02**.
- **The `ai` tab called a route that no longer existed.** A tab in a decision surface
  whose only outcome was an error.

### 1.2 What runs now

One request, eleven named sections, no merge, no `??` chain across two payloads:

```
GET /api/v1/admin/applications/{id}/   →  data: {
  application_id, version, status,
  identity, answers, assignment, evidence, payment, interview,
  conditions, amendments, communication, history, readiness,
  allowed_next_actions, allowed_transitions, capabilities,
  redaction, definitions, row_limit }
```

The journey does not assert "few requests" — it names the six and counts them:

```ts
const RETIRED_DETAIL_CALLS = ['/details/','/documents/','/grades/','/summary/','/interviews/','/admin-summary/']
…
expect(detailReads).toEqual([`GET ${WORKSPACE_API}${id}/`])   // exactly one
expect(retiredReads).toEqual([])                               // none of the six
expect(otherApplicationReads).toEqual(['GET /api/v1/applications/{id}/official-documents/'])
```

The third assertion is deliberate. `AdminOfficialDocumentsPanel` lists *issued
official artefacts* — a different resource with its own canonical route and issuance
policy (task 10.4), fetched only when the Documents tab is opened. An allowance that
is written down is a decision; one hidden inside a loose matcher is not.

Visiting all seven tabs adds no request: the sections are already in hand.

## 2. The readiness checklist is the submission evaluator's own output (R11.3)

### 2.1 One evaluator, two audiences

`readiness` is `readiness_service.reviewer_summary` over `evaluate_readiness` — the
**same** function `submit_application` re-runs under its row locks (task 6.5). Not a
second evaluator with the same shape: a reviewer and the submission gate cannot
disagree about whether an application is ready, because they are reading one answer.

It publishes the seven facts R11.3 names — `payment_gate`, `required_documents`,
`identity_verification`, `grades`, `eligibility`, `duplicates`, `intake_window` — each
with a state, and each state rendered with a label rather than a colour alone.

**No model is involved.** The journey watches the wire for `admin-summary` and
`preview-summary` and asserts zero, and `test_no_generative_call_is_made` patches the
AI seam and asserts it is never entered.

### 2.2 `null`, never a zeroed checklist

If the canonical requirements cannot be evaluated, `readiness` is `null` and the panel
renders `readiness-unavailable`. The alternative — an empty checklist — reads as
"nothing outstanding", which is R8.6's healthy zero on the surface where it would do
the most damage. `test_readiness_is_null_rather_than_a_healthy_zero` pins the endpoint
half; `says readiness is unavailable rather than showing an empty checklist` pins the
render.

## 3. Authority is a capability, per command (R8.3, AUTH-02)

**AUTH-02** was a role tier standing in for authority: `IsAdmin` on the status,
document, payment, interview, amendment, bulk and export commands, and `IsSuperAdmin`
on assignment. Two symmetrical failures fell out of it — a **read-only tenant admin
could mutate** (they are `admin`), and a **legitimate Reviewer was denied** (they are
not).

The matrix is now data:

```python
COMMAND_CAPABILITIES = {
  "review_decision":   "tenant.application.review",
  "verify_document":   "tenant.document.verify",
  "verify_payment":    "tenant.payment.verify",
  "review_amendment":  "tenant.application.review",
  "verify_condition":  "tenant.application.review",
  "manage_interview":  "tenant.application.review",
  "assign_reviewer":   "tenant.application.review",
  "grant_fee_waiver":  "tenant.payment.verify",     # + platform.settings.manage
  "bulk_review":       "tenant.application.review",
  "export":            "tenant.application.export",
}
```

Three properties of that table are load-bearing:

- **It is resolved for the application's own institution**, not for the actor's
  scope in general — through `AdminCapabilityService.get_institution_capabilities`.
- **It is published on the read** (`data.capabilities`), so the UI gates on the
  server's answer. `NO_WORKSPACE_CAPABILITIES` is the fail-closed default, and every
  endpoint re-derives the same capability. The frontend union is drift-guarded against
  these keys, so a control cannot be gated on a key the server never sends.
- **No capability was invented.** `test_the_command_capability_matrix_uses_only_canonical_capabilities`
  asserts every value is in `AdminCapabilityService.TENANT_CAPABILITIES`, so the
  17 + 17 catalogue cannot grow by accident.

`grant_fee_waiver` is published as the tenant capability **and**
`platform.settings.manage`, because a waiver forgives money a tenant is owed and its
endpoint requires the platform capability. Publishing the tenant half alone would
promise a control the backend refuses. Auto-assignment is deliberately **absent** from
the matrix: it sweeps every unassigned application the platform holds, so it is not a
command about *this* application.

`test_no_role_string_is_compared_in_the_workspace_surface` parses the service and the
views for role-string comparisons and finds none.

## 4. A Reviewer can reach the workspace (AUTH-01, R8.7)

Every review route answered a Reviewer correctly before this task. The reason no
Reviewer had ever used one is that `AdminRoute` never let them arrive:

```tsx
// before
if (!isAdmin) return <Navigate to={pathFor('student.dashboard')} replace />
```

`isAdmin` is a role-string tier. A scoped Reviewer — the platform's own fourth
authority role, whose entire purpose is reviewing applications — was sent to the
**student** workspace. So the frontend *denied* work the backend granted, which
inverts the platform's security model: frontend hiding is never the boundary, and it
must not be the denial either.

The guard now has four states: loading, unauthenticated, **authorized by the
backend**, everyone else. The role tier is kept as a fast path so an `admin` renders
without waiting on a network answer; a Reviewer is admitted once
`useCapabilities().noAccess` resolves false. An actor whose capabilities resolve to
nothing still lands on the student dashboard, and the backend re-enforces every check
either way.

This is the alignment [9.3 §16](../9.3/README.md) named and left to the navigation
lane — closed here because the reviewer journey R8.7 requires is impossible without
it.

## 5. Reviewer assignment sends a real candidate id (AUTH-03)

AUTH-03 was two defects in one flow: the modal sent an **empty UUID** for a manual
assignment, and auto-assignment could select a reviewer with no membership in the
tenant.

- `GET /api/v1/applications/{id}/assignment-candidates/?search=<q>` returns the
  reviewers eligible for *that application's* institution — searchable members, per
  R8.2 — so the picker is filled from the server rather than from whatever the modal
  had. An application with no resolvable tenant returns an **empty** candidate set,
  which fails closed rather than offering the platform's whole staff list.
- The assignment command validates the chosen id against active membership inside the
  transaction, and is version-guarded like every other command.
- `test_a_tenant_admin_can_staff_their_own_review_queue` and
  `test_a_read_only_tenant_admin_cannot_assign` fix the authority: assignment is
  `tenant.application.review` for the application's institution, not `IsSuperAdmin`.

## 6. Every command carries the version it read (R8.4)

### 6.1 The hazard

Two reviewers open the same application. One decides. The other's screen now
describes a state that no longer exists — and before this task, their decision simply
won.

### 6.2 The guard

`read_expected_version` accepts `expected_version` / `expectedVersion` in the body, or
the `If-Match` header quoting the ETag the read published. `assert_version` compares;
`bump_version` advances with an `F()` expression, so two concurrent commands cannot
both read 3 and write 4. A refusal is `ReviewVersionConflict` → **409
`VERSION_CONFLICT`** carrying `current_version`, and it mutates nothing.

Every command *about one application* enforces it — `/review/` (both the decision and
the payment review), `/verify-document/`, `/interviews/` (POST, PATCH/PUT, DELETE),
`/amendments/{id}/review/`, `/conditions/{id}/verify/`, `/assign/` and
`/fee-waiver/` — and `/bulk-status/` enforces it **per id** (§7).

`/auto-assign/` deliberately does not. It sweeps every unassigned application the
platform holds, so there is no single version for a caller to claim — the same reason
it is absent from `COMMAND_CAPABILITIES` (§3).
`test_every_workspace_command_enforces_the_version` moves the counter once and then
issues five stale commands, asserting **409 on each** and that the document,
condition, amendment, status and interview are all exactly where they were.

**One counter covers the whole workspace, deliberately.** A decision recorded against
evidence that has since been re-verified, an interview that has moved, or an amendment
that has been approved is the same stale-write hazard — so any command that changes
what the workspace shows advances the version every other command is checked against.

### 6.3 Opt-in, but a malformed version is stale

`assert_version(app, None)` passes. A caller that supplies nothing has not *claimed* to
be current, so refusing it would break every existing integration to protect against a
race it may not be in — the same choice `submit_application(expected_version=…)` made
in task 6.5. But `expected_version: "not-a-number"` is a **conflict**, not a silent
pass: a client that cannot state its version has not proven it is current.

### 6.4 The stable code was unreachable

`ReviewVersionConflict` declared `VERSION_CONFLICT`, and the v1 envelope handler's
`error_code_map` had no `409` entry — so `code` fell through to `INTERNAL_ERROR` and
the advertised code could not be branched on. `exceptions.py` now maps
`409: "CONFLICT"`, prefers the exception's own `get_codes()` when it has one, and lifts
`current_version` onto the envelope — so a client reloads at the version the server
names instead of issuing a second read to find out.

It is the only DRF `APIException` on the **v1** surface that carries a 409: the other
409s under `/api/v1/` (`ApplicationSubmissionError`, `FeeQuoteInvalid`,
`FeeAmbiguous`) are plain domain exceptions their own views translate, so they never
reached `get_codes()`. `/api/v2/` has its own handler (`v2_exception_handler`) and its
own registered code catalogue, and is untouched.

### 6.5 The frontend never holds its own copy

`useReviewCommand` reads the version out of the cached workspace **at the moment the
command is issued**, so a component cannot send a version it captured three
interactions ago. On a conflict it **refetches**: someone else decided first, and the
reviewer needs to see that decision, not an error toast.

## 7. The roster publishes the version, and it is not an export column (R8.4)

A bulk decision from the roster needs a version per application, and the roster is
where those rows were read. `query_service.rows_for` therefore emits `version` per
row — otherwise `expected_versions` could only be filled by guessing.

It is deliberately **outside `ROW_COLUMNS`**, so it never reaches a CSV: an export is
a document about applicants, and an optimistic-lock counter is not a fact about an
applicant. `test_the_version_is_not_an_export_column` pins that, and
`test_the_version_the_roster_published_is_the_one_the_workspace_reports` pins the two
surfaces agreeing.

`expected_versions` on `/bulk-status/` is an object of id → version, **per-id and
opt-in**, because a bulk command is a set of decisions rather than one. Any id whose
version moved fails the batch, and the existing all-or-nothing contract refuses the
whole batch rather than overwriting one row silently. The response reports the
**applied** set.

## 8. Cross-tenant isolation, and the fact that is never computed (R3, R8.3)

`TestCrossTenantIsolation` (6 cases) proves another tenant's application is masked
identically to an unknown id, that no command reaches it, that a bulk command cannot
carry its id, that an assignment-scoped Reviewer cannot bulk-decide unassigned work,
and that a masked probe is audited without disclosing what was probed.

The detail-specific half is `PLATFORM_ONLY_DETAIL_FIELDS`:

```python
PLATFORM_ONLY_DETAIL_FIELDS = ("other_tenant_application_count",)
```

`other_tenant_application_count` answers "has this person applied elsewhere on the
platform" — a fact about *another school's* applicant pool. For a tenant actor the
field is not filtered out of a computed answer: **the query is never run** (R3.2), and
`data.redaction.withheld_fields` says so.

## 9. The export is one path (R8.3)

`TestExportIsOnePath` (5 cases): the export is page-independent, the two routes are
byte-identical, it requires the explicit `tenant.application.export` capability rather
than being implied by read access, it is audited with counts and filters and **not the
rows**, and it is tenant-scoped. This is 9.3 §10's contract applied to applications;
`admin_export_views.py` moved off `IsAdmin` onto `HasTenantCapability`.

## 10. Sections declare their limits and their meaning (R8.5, R8.6)

`SECTION_ROW_LIMIT = 100`, per section, **reported** (`documents_truncated`,
`history.truncated`) and published as `data.row_limit`. A workspace is a decision
surface for one application, so an unbounded history is a latent denial-of-service on
the reviewer's own browser — but a silently truncated one is worse than a slow one,
because the reviewer cannot tell.

`SECTION_DEFINITIONS` ships a sentence per section, keyed by `WORKSPACE_SECTIONS` so a
new section cannot ship undefined. 9.1/9.2's "a definition travels with every number"
applied to a detail surface: a reviewer reading `current_document_count` should not
have to guess whether superseded evidence is included (it is not).

`allowed_transitions` is read from `services.py:ALLOWED_TRANSITIONS` — the state
machine's one source. A terminal status returns `[]`, which is a fact, not an
omission.

## 11. Two defects only the browser found

One is a product defect that only exists at the mobile breakpoint; the other is a
harness defect that only broke desktop. Neither is reachable from an endpoint test.

The seam that lets one journey run at both breakpoints is **task 9.1's**, not this
task's: 9.1 found that the roster's two `FiltersPanel` instances emitted the same DOM
ids and fixed it with an `idPrefix` prop plus `data-roster-filters="mobile" | "desktop"`
on the two containers. This task's `rosterSearch` consumes that seam rather than
asserting a layout.

### 11.1 Every workspace tab was anonymous on mobile

The mobile journey could open the workspace and read the headings, then timed out
looking for the Documents tab. The page snapshot said why:

```yaml
- tablist "Application details":
  - tab [selected]:
    - img          # ← and nothing else
  - tab:
    - img
```

The label is `hidden sm:inline` and the icon is `aria-hidden`, so **under `sm` each of
the seven tabs exposed no accessible name at all** — a screen-reader user on a phone
hears seven unlabelled tabs (WCAG 4.1.2). The name now comes from the control's own
`aria-label`, which no breakpoint can hide, and it is the same string the label renders
so "Label in Name" (2.5.3) holds where the text is visible.
`names every tab independently of the breakpoint that hides the label` pins it.

This is a defect no endpoint test and no desktop run could have produced, and it is
exactly what the "desktop/mobile" in the Required_Evidence line is for.

### 11.2 A helper that probed instead of waiting

`rosterSearch` first resolved the visible panel with an instantaneous `isVisible()`
probe, and `openWorkspace` navigates with `domcontentloaded` — so on a cold SPA load
the probe read "no desktop rail" as "this is mobile" and then waited for a mobile-only
toggle that a desktop viewport never shows. It broke the **desktop** run while the
mobile run went green. The helper now waits for whichever of the two the viewport shows
(`desktop.or(toggle)`) before branching. Recorded because it cost a run, and because
the failure mode — a race that only surfaces against a freshly built SPA — is the kind
that returns.

## 12. Contract strengthenings, and what they cost

### 12.1 The commands moved from a role tier to tenant capabilities

Ten commands that previously accepted any `admin` now require a specific `tenant.*`
capability for the application's own institution. The three `IsSuperAdmin` routes moved
onto capabilities without loosening: `/assign/` became a tenant command
(`tenant.application.review` for that school), while `/auto-assign/` and
`/fee-waiver/` stayed platform authority — `platform.user.manage_all` and
`platform.settings.manage` — resolved through `AdminCapabilityService` instead of a
role class. Consequences, all intended:

- an `admin` with a **view-only** grant loses the ability to decide, verify, assign,
  bulk-decide, or export — which is the AUTH-02 defect, not a regression;
- a **Reviewer** with a review grant gains all of the per-application commands for
  assigned work;
- a **Tenant_Admin** gains assignment for their own queue, which previously required a
  Beanola operator.

### 12.2 The export requires the export capability explicitly

Consistent with 8.4 and 9.3: read access no longer implies bulk extraction.

### 12.3 A v1 409 now carries `CONFLICT` rather than `INTERNAL_ERROR`

The `error_code_map` entry is generic, so **any** v1 409 that reaches the envelope
handler now reports `CONFLICT` instead of `INTERNAL_ERROR` — not only this task's. That
is a strict improvement (a 409 is not an internal error), and the change is safe
because the v1 409s that predate this task are domain exceptions their own views
translate before the handler sees them (§6.4). `/api/v2/` uses a different handler and
is unaffected.

### 12.4 Test files that pinned the retired shapes

`test_reviewer_assignment.py` was rewritten (it asserted `IsSuperAdmin` behaviour),
`test_admin_export_hardening.py` and `test_scoped_access_matrix.py` moved their
authority assertions onto capabilities, and the GAP register in
`test_unscoped_endpoint_guard.py` was re-pinned — including **retiring GAP-5**, which
pointed at the generative `ApplicationAdminSummaryView` that task 7.4 deleted. Leaving
a pin on a class that cannot exist is a guard that can only fail.

## 13. The task's own backend suite

`tests/unit/test_review_workspace_9_4.py` — **49 passed**, every case under the
`production_scope` fixture so what is measured is the real membership/grant-derived
capability model and never a test-settings shortcut:

| Class | Cases | What it settles |
|---|---|---|
| `TestOneDetailQueryReplacesSixReads` | 7 | every section the six calls supplied arrives in one response; the readiness block is the deterministic one; **no generative call is made**; readiness is `null` rather than a healthy zero; the response publishes its own contract (definitions, row limit, redaction); transitions come from the one state machine; the capability matrix is published |
| `TestVersionedCommands` | 9 | a stale decision is refused **and mutates nothing**; a command without a version still works; `If-Match` is accepted; an unreadable version is a conflict, not a silent pass; **every** workspace command enforces it; a command returns the new version and the next actions; a payment review advances the same counter; the bulk command honours a version per application and reports the applied set |
| `TestAuthorityIsCapabilityDerived` | 8 | a scoped reviewer opens only assigned work; a read-only tenant admin reads but cannot decide or assign; a student and an anonymous caller are denied; a tenant admin can staff their own queue; auto-assign and fee waiver stay platform authority; **no role string is compared** on the surface; the matrix uses only canonical capabilities |
| `TestCrossTenantIsolation` | 6 | §8 |
| `TestExportIsOnePath` | 5 | §9 |
| `TestTheServiceIsTheOneAuthority` | 4 | the view delegates and holds no domain logic; the readiness section is the shared evaluator; a section declares its own truncation; **the payment section carries no raw phone number** |
| `TestTheRosterPublishesTheVersion` | 4 | §7 |
| `TestEvidencePaymentAndInterviewAuthority` | 6 | document verification needs the document capability and is versioned; payment verification needs the payment capability; interview management needs the review capability; a stale interview command is refused; all three capabilities are published |

## 14. Verification (verbatim)

### 14.1 Backend application / review / authority suites, against a measured baseline

`cd backend && DATABASE_URL=<localtest 5433> TESTING=1 python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "applicat|account|catalog|auth|capabilit|permission|tenant|scope|admin|review|interview|amendment|condition|document|payment|export|bulk") -q --tb=no -rfE -p no:randomly`
— **194 suite files**, against the isolated `mihas-localtest` Postgres. Neon and
production were not touched.

| Run | Result |
|---|---|
| **baseline** — the same command over the same selection with **9.4's implementation removed**: the two new backend modules moved aside, the re-gated view modules reverted, and the workspace route unregistered. The task's own suite is **absent** from the run (`test_review_workspace_9_4` appears 0 times in the log), while the assertions 9.4 added to **existing** suites are present — which is what makes those assertions measure the defect | **63 failed, 1842 passed**, 70 skipped, 39 errors |
| **9.4** | **56 failed, 1898 passed**, 70 skipped, 39 errors |

[`review-workspace-suites.txt`](raw/review-workspace-suites.txt) /
[`…-baseline.txt`](raw/review-workspace-suites-baseline.txt). A *measured* baseline: the
failing + erroring sets were diffed by name (95 vs 102 unique entries). The baseline
composition above is stated from what the two logs contain — the same header command,
the same 194-file selection, `test_review_workspace_9_4` present once in the candidate
and never in the baseline — rather than from a procedure asserted without evidence.

- **New failures: 0.** `comm -23` over the two sorted sets is empty.
- **+56 passing**: the task's own 49-case suite plus 7 assertions that pass on 9.4 and
  fail without it.
- **Gone from the failing set: 7**, and they are worth splitting because they are two
  different kinds of claim:

  | Entry | Kind |
  |---|---|
  | `test_reviewer_assignment.py::TestReviewerAssignmentScope::test_reviewer_can_review_assigned_application` · `::test_tenant_admin_can_review_unassigned_application` | **defect reproduction.** Assertions this task added to an existing suite. They fail on pre-9.4 code because the reviewer was denied and the tenant admin needed a super-admin — AUTH-01/AUTH-02 stated as tests |
  | `test_unscoped_endpoint_guard.py::test_gap_register_endpoints_are_scoped` · `::test_gap_register_endpoints_exist_on_disk` | **drift guards re-pinned.** The register now names the `tenant_authorization` scope seams and no longer pins the deleted generative view, so it fails against pre-9.4 code by construction |
  | `test_admin_override.py::TestAdminPaymentStatusOverride::test_override_updates_status_and_records_audit_trail` · `::test_override_without_notes_still_updates_status` · `test_application_properties.py::TestUnverifiedPaymentApprovalGuard::test_approval_with_force_proceeds_when_payment_unverified` | **genuinely resolved.** Neither of those two suites was edited by this task (`test_admin_override.py`'s only working-tree change is task 8.2's, dated 30 July; `test_application_properties.py` is unmodified against `HEAD`), so the rewritten review command is what makes them pass |

The remaining 56 failures and 39 errors are the pre-existing clusters catalogued in
[9.1 §8.1–8.3](../9.1/README.md), [9.2 §11.1–11.2](../9.2/README.md) and
[9.3 §15.1](../9.3/README.md). Two deserve naming because this task's own suites sit
next to them:

- `test_application_properties.py::TestUnverifiedPaymentApprovalGuard::test_non_approval_status_skips_payment_check`
  fails in **both** runs. It patches `Application.objects` with a `MagicMock`, so the
  application's `status` is a mock rather than a status and `ALLOWED_TRANSITIONS`
  refuses the transition — `400 != 200`. Its sibling in the same class passes; the
  failure is the mock, not the guard.
- `test_view_auth_classification.py::test_all_api_views_are_classified` fails in both
  runs. All of this task's view classes are classified; the unclassified remainder
  belongs to other lanes and is deliberately **not** registered here, because
  registering another task's view would hide that it was omitted.

A targeted re-run confirms the candidate numbers are current:
`test_review_workspace_9_4.py` + `test_reviewer_assignment.py` +
`test_admin_override.py` + `test_application_properties.py` +
`test_unscoped_endpoint_guard.py` → **106 passed, 1 failed** (the `MagicMock` case
above).

### 14.2 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 4044 passed / 1 skipped** (470 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **18 errors, 0 warnings** across **15 files** — two *fewer* than 9.3's 20 across 17. **None of the 18 is in a file this task touched** | [`frontend-lint.txt`](raw/frontend-lint.txt), [`frontend-lint-files.txt`](raw/frontend-lint-files.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |

The pre-9.4 frontend baseline is [9.3 §15.2](../9.3/README.md): **1 failed / 4013
passed / 1 skipped** across 468 files. So: **+31 passing, +2 test files, and the same
single pre-existing failure** — and the +31 is exactly this task's two new suites
(`reviewWorkspaceServerOwned` 24 + `reviewerReachesTheWorkspace` 7). The pre-existing
failure is
[`authPageFormMarkup.test.tsx`](../../../apps/admissions/tests/unit/authPageFormMarkup.test.tsx),
the SignUp helper-copy conflict catalogued in [8.1 §4.1](../8.1/slice-2-frontend.md),
[8.3 §7.1](../8.3/README.md), [8.4 §7.3](../8.4/README.md),
[9.1 §8.4](../9.1/README.md), [9.2 §11.3](../9.2/README.md) and
[9.3 §15.2](../9.3/README.md). Unrelated to the workspace.

### 14.3 Django system checks

`cd backend && python3 manage.py check`

```
LENCO_API_SECRET_KEY is not set — payment processing will be unavailable.
System check identified no issues (1 silenced).
CHECK_EXIT=0
```

[`django-check.txt`](raw/django-check.txt). The LENCO line is the expected local-dev
notice — this machine holds no provider credential. (The run also emits the
`SECRET_KEY not set` dev warning, because it uses the repo venv without a `.env`
export; it is not a check failure.)

> **`manage.py check` must run with the repo's own environment.** Exporting a
> `TESTING=1` or a substitute `REDIS_URL` first flips `CACHES` to `LocMemCache`
> (`base.py` `_is_testing`) and the check then reports
> `django_ratelimit.E003 — not a shared cache`. That is the override talking, not the
> platform (recorded by 8.3 §7.7, 8.4 §7.5, 9.1 §8.5, 9.2 §11.4 and 9.3 §15.3;
> re-confirmed here).

### 14.4 OpenAPI schema

`cd backend && python3 manage.py spectacular --file /tmp/schema-94.yaml`

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt) — **identical counts** to 8.2, 8.3, 8.4, 9.1,
9.2 and 9.3. This task adds one operation and no new schema error:
`admin_application_review_workspace` is present at
`/api/v1/admin/applications/{application_id}/` with its documented response, and it
does not appear in the error list. The three warnings are the pre-existing
`operationId` collisions on `/api/v1/admin/intakes/`,
`/api/v2/admin/change-requests/` and `/api/v2/admin/onboarding/`.

### 14.5 Browser journeys

`cd apps/admissions && HARNESS_PW_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:8090 bunx playwright test -c playwright.harness.config.ts --project=chromium-required --project=mobile-required tests/harness-e2e/required/admin-review-workspace.spec.ts`

```
Running 12 tests using 1 worker
  … 12 passed (2.7m)
PW_EXIT=0
```

[`harness-review-workspace-journeys.txt`](raw/harness-review-workspace-journeys.txt).
Run against the task-0.4 isolated harness brought up **fresh**
(`harness/bin/harness up` wipes volumes and rebuilds both the backend image and the
SPA), with the strict `harness-fixtures.ts` gates active: zero skips, no console
errors, no unasserted failed requests. The drain gate reported
`broker_queue_depth: 0` and `unsettled_payment_collections: 0`.

`HARNESS_PW_CHANNEL=chrome` is the config's documented escape hatch: Playwright's
bundled Chromium has no build for this machine, so the required projects run against
the system Chrome. It changes the browser binary, not the assertions.

Four harness details worth recording, the first because it cost a run here and the
rest because they shaped how the journeys are written:

- **the harness serves the built SPA** (`apps/admissions/dist`) and runs the backend
  from a **built image**, so a source change needs `bun run build` (and a backend
  change needs `harness up`) before it is under test. The §11.1 accessible-name fix was
  invisible to the harness until the SPA was rebuilt, for exactly this reason.
- **the whole journey suite is seeded through platform commands.** The two
  applications are created and moved to `submitted` through the review command
  itself, because `ALLOWED_TRANSITIONS` has no `draft → under_review` edge — a draft
  is the student's, and a reviewer has nothing to decide about it. The reviewer is
  assigned through `/assign/`. No row was hand-edited.
- **the seed is serial on purpose.** `applications.application_number` falls back to
  "count then attempt" when the SQL helper is absent, which two concurrent creates
  lose (task 9.1 §9.3). The seed declines to race the uniqueness constraint.
- **the refusal journeys declare their errors** with
  `gate.allowRequest(...)`; the declaration **is** R18.4's asserted error path.

### 14.6 Failures introduced by this task

**Zero**, against measured baselines rather than assertion:

| Scope | Evidence |
|---|---|
| Backend application/review/authority suites | baseline 63 failed / 1842 passed → 56 / **1898**; the new-failure diff is empty and 3 pre-existing failures are resolved (§14.1) |
| Frontend | the same single pre-existing failure; **18** lint errors across **15** files vs 9.3's 20 across 17, none in this task's files (§14.2) |
| Build / check / schema | exit 0, no issues, unchanged counts, one new operation with no new error (§14.2–14.4) |
| Browser | 12/12 on a freshly wiped harness, zero skips (§14.5) |

## 15. Not claimed here

- **The multi-call composition still exists for student surfaces.**
  `applicationService.getById` — the five-request `Promise.all` and the `/summary/`
  merge in §1.1 — is still called by `ApplicationStatus`, `ApplicationDetail`, the
  wizard's multi-draft resume, and a dev preview. This task removed the **admin
  workspace's** use of it and did not touch the student read path, which belongs to
  the student lanes (tasks 7.x/10.x). The `/summary/` field-shadowing hazard therefore
  still exists on those surfaces and is named rather than fixed.
- **`grades` has no workspace command.** The evidence section reads persisted
  canonical grades; a reviewer cannot edit a grade, and R11.4 says a student enters
  them. No grade-mutation command was added, so none is version-guarded.
- **Conditions are read and verified, not authored.** `verify_condition` is in the
  matrix; assigning a new condition to an offer is the conditional-admission lane's
  command and keeps its existing authority.
- **The amendment *recipient* scope is task 9.5** (finding AUTH-06). This task moved
  the amendment **review** command onto the capability model and audits it via
  `TenantAuditService`, but who gets notified — and the tenant audit **UI** binding
  (ADM-05) — is 9.5's.
- **No rate limit was added.** The section caps (`SECTION_ROW_LIMIT = 100`) and the
  export ceiling are enforced; per-user throttling on admin surfaces is the throttling
  lane's centralised concern (`apps/common/throttling.py`, currently payment- and
  AI-scoped). A fourth ad-hoc scope here would be a parallel implementation.
- **A performance budget for the workspace read.** It is one query per section plus
  the readiness evaluation; the query count is stated, not measured against a target.
  The perf lane owns budgets.
- **`MAINT-01` is not closed by line count, and `ApplicationDetailModal.tsx` did not
  shrink.** It went from 846 to 1365 lines. What moved out is the *orchestration*:
  fetching and merging (`reviewWorkspace.ts`, 533), cache/version handling
  (`useReviewWorkspace.ts`, 106), payload-to-prop projection
  (`workspaceAdapters.ts`, 178) and the readiness surface
  (`ReviewReadinessPanel.tsx`, 204) are now separate modules, and the six loaders plus
  the merge are gone. What stayed — and grew — is rendering: seven tabs' worth of
  sections, per-command capability gating, and the read-only explanation. The
  finding's "split by bounded workflow" is therefore **partially** addressed for this
  file and not claimed as done; the wizard, catalog service/view files, and tenant
  onboarding files the finding also names belong to other tasks.
- **The version is not exposed to students.** `Application.version` advances on staff
  commands and is published on admin surfaces only; the student's own reads and the
  submission gate keep the task 6.5 contract unchanged.
