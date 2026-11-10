# Task 6.4 Evidence — Add transactional application selection change

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

_Requirements: R7.2, R10.5_
_Findings: STU-01, DATA-01_
_Design: design.md §7.2 (Application Assignment — "Generic PATCH never accepts
assignment identifiers or their display snapshots. Before any payment exists,
`ChangeSelectionCommand` may atomically reassign the draft, update every
canonical ID/snapshot/requirement/eligibility/fee reference, clear invalid
dependent answers, bump the optimistic version, and return a change summary.
Payment activity makes assignment immutable."), §8.1/§8.2 (application + draft
lifecycle), §14.1/§14.2 (stable error envelope; idempotency + optimistic version
conflict)._
_Steering: `enterprise-tenancy.md` → No-Legacy-Hardcoding ("Canonical IDs are the
sole authority for routing/scoping/tagging; the legacy
`applications.institution/program/intake` strings are display snapshots only"),
Tenant Isolation Invariants (scope before lookup; non-revealing 404), fail-closed
tenant domains (a trusted tenant host wins); `product.md` (auto-save must not be
weakened)._

_Required_Evidence (tasks.md): **"reroute success/rollback/payment-block/
cross-tenant tests"** — one integration class per case, all four green
(`raw/backend-integration-6.4.txt`). The browser (Playwright) reroute journey is
owned by task **13.2** per the spec's E2E/evidence architecture (design §16); the
full frontend build/lint gate over the whole in-flight tree is owned by task
**13.1**._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of the base commit (the whole
  admissions-v2 spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-25 (UTC).
- PBT: task 6.4 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults: {}` with no `6.4` entry). Nothing to record
  via `update_pbt_status`. Classification/recovery coverage is provided as
  ordinary parametrised unit tests instead.
- **Schema: no change.** 6.4 writes the columns task **5.2** already added
  (`configuration_version`, `requirements_snapshot`, `eligibility_snapshot`,
  `assignment_version` — `backend/scripts/2026_07_23_01_application_assignment_snapshot.sql`).
  No new `backend/scripts/*.sql`; schema hash unchanged from 5.2. Nothing to
  apply on Neon or production for this task.
- API changed → OpenAPI + generated TypeScript client regenerated
  (`raw/openapi-regeneration.txt`).

## The findings closed

**STU-01** (P0) — *"Draft assignment display fields can be updated while
canonical institution, offering, program, and intake IDs remain read-only,
creating a split identity."* Required outcome: *"Assignment is immutable after
create, or changed only by one transactional reroute command that updates all IDs
and snapshots and blocks after payment."* **Closed, both halves:**

1. **Removal.** `program` / `intake` / `institution` are gone from
   `DRAFT_SAFE_FIELDS` **and** declared in `ApplicationSerializer.Meta.read_only_fields`,
   so the generic `PATCH /api/v1/applications/{id}/` and
   `PATCH /api/v1/applications/drafts/{id}/` accept no assignment field for any
   role, any status, with or without a request in context. The canonical IDs were
   already read-only. The one call site that reproduced the finding — the wizard's
   personal-step advance — no longer sends them.
2. **Replacement.** `POST /api/v1/applications/drafts/{id}/change-selection/`
   moves the assignment transactionally, or refuses.

**DATA-01** (P0, write-side half) — the reroute accepts **canonical IDs only**
(`program_id` = `CanonicalProgram.id`, `intake_id` = `Intake.id`); a display
string is a 400 `VALIDATION_ERROR`. It resolves through task 5.2's
`resolve_assignment_snapshot` (no `IdentifierResolver`, no name/code fallback —
`raw/grep-loop-review.txt` §7) and derives institution + offering + snapshots
server-side.

## What 6.4 delivers

| Layer | File | Role |
|---|---|---|
| **The command** | `backend/apps/applications/change_selection_service.py` (new) | `change_application_selection()` — scope-before-lookup + `select_for_update` on the owner's draft, optimistic `assignment_version` guard, tenant-host binding, canonical fail-closed resolution (5.2), payment gate, target revalidation (intake open + duplicate excluding self), then ONE atomic write of every canonical ID + display snapshot + `configuration_version` + `requirements_snapshot` + `eligibility_snapshot` + re-resolved `application_fee` + cleared `DEPENDENT_ANSWER_FIELDS` + bumped `assignment_version`/`version`, plus an in-transaction audit row and a change summary. `SelectionChangeError` carries a stable `code`/`status_code`/`retryable`/`recovery`. |
| Classification | same file — `classify_selection_change()` | Pure gate: `unchanged` (idempotent no-op) / `canonicalization` (same student selection, stale or absent canonical identity → repair, no payment block, no answer clearing) / `reassignment` (real move → payment gate + revalidation + dependent-answer clearing). |
| Payment lock | same file — `has_payment_activity()` | **Any** `Payment` row (pending, deferred, failed, expired, successful, force_approved) makes a reassignment immutable (R10.5). |
| Endpoint | `backend/apps/applications/student_draft_views.py` — `ApplicationDraftChangeSelectionView` + `DraftChangeSelectionSerializer` | `POST /api/v1/applications/drafts/{id}/change-selection/`, `IsAuthenticated` + owner scope, `@idempotent`, canonical-envelope error mapping. |
| Route | `backend/apps/applications/urls.py` | `drafts/<uuid:application_id>/change-selection/`. |
| PATCH lock | `backend/apps/applications/serializers.py` | `ASSIGNMENT_FIELDS` frozenset; the three display snapshots removed from `DRAFT_SAFE_FIELDS` and added to `Meta.read_only_fields`. |
| Canonical reuse | `backend/apps/applications/duplicate_checker.py` (`check_at_create(..., exclude_id=)`), `backend/apps/applications/intake_enforcer.py` (`check_draft_creation(..., intake_id=)`) | The reroute reuses the canonical duplicate + intake gates instead of forking parallel logic; both additions are optional and backward-compatible (and the intake gate now reads the exact canonical intake, not a same-name one). |
| Authority | `scripts/authority_matrix_registry.py` | Route registered as `owner` (ownership `Application(draft).user_id == actor.id`, `not_found_mask`, `state_precondition` "status == draft AND no payment activity for a reassignment", `audit_event` `application.change_selection`, finding STU-01). |
| Frontend transport | `apps/admissions/src/services/applications.ts` — `changeSelection` | POSTs canonical IDs + optional `assignment_version` with an `Idempotency-Key` and `retries: 0`. |
| Frontend decision + recovery | `apps/admissions/src/pages/student/applicationWizard/lib/selectionChange.ts` (new) | `resolveSelectionChangeIntent` (send the command only when the selection actually moved — so a paid draft is never wedged by a page advance) and `resolveSelectionChangeRecovery` (every stable code → a titled, never-empty recovery path; prefers the server's own `recovery.actions`). |
| Wizard wiring | `…/applicationWizard/hooks/useWizardController.ts` | Personal-step advance PATCHes draft-safe personal fields only, then calls `applyDraftSelectionChange`; a rejected reroute blocks the step advance and surfaces the recovery message instead of advancing onto a selection the server refused. |
| Legacy spread guard | `apps/admissions/src/lib/applicationSession.ts` | The legacy session autosave strips `program`/`intake`/`institution` from its spread form payload (they would be ignored server-side; this keeps the wire honest). |
| Canonical truth map | `docs/canonical-truth-map.md` → Application Lifecycle | New row **"Application assignment (reroute)"** naming the service as the sole writer of the assignment columns, the command endpoint, the PATCH lock, and the frontend consumers. |

### The transactional contract (what "together" means)

One `transaction.atomic` block performs, in order: lock → version check →
canonical resolve (fail-closed) → classify → payment gate → intake + duplicate
revalidation → write `{institution_id, program_id, program_offering_id,
intake_id, institution, program, intake, configuration_version,
requirements_snapshot, eligibility_snapshot, application_fee,
eligibility_status, eligibility_score, eligibility_notes, waitlist_position,
is_late_submission, assignment_version, version, updated_at}` → document delta
summary → audit row. Any failure at any step aborts the whole thing
(`TestRerouteRollback`).

**Dependent answers cleared on a reassignment** (`DEPENDENT_ANSWER_FIELDS`):
`eligibility_status`, `eligibility_score`, `eligibility_notes` (computed against
the previous offering's rules), `waitlist_position`, `is_late_submission` (both
keyed to the previous intake). The fee snapshot is *re-resolved* from the new
offering through the canonical `FeeResolver` (NULL when not configured — payment
time still fails closed with `FEE_NOT_CONFIGURED`, task 5.4). A
`canonicalization`/repair clears nothing, because the student's answers were not
made against a different offering.

**Uploaded documents are never destroyed.** The summary reports
`documents_no_longer_required` and `documents_missing_for_new_selection` so the
client can guide the student; immutable document versions and real replace/delete
commands are task **7.3**'s scope, and silently deleting a student's evidence
during a reroute would be a data-loss bug.

## Steering constraints honoured

- **Canonical IDs are the sole routing authority; display strings are snapshots.**
  The reroute takes canonical IDs, derives the snapshots, and is the only writer
  of either (`raw/grep-loop-review.txt` §1–2).
- **Scope before lookup / non-revealing 404.** The draft is fetched with
  `filter(id=…, user_id=actor, status='draft')` before anything is disclosed;
  another student's draft id returns `404 NOT_FOUND` carrying no tenant or
  programme detail (asserted).
- **Fail-closed tenant domains (TEN-10).** The institution resolved from the
  trusted host wins; a mismatching explicit `institution_id` is
  `403 INSTITUTION_OVERRIDE_NOT_PERMITTED` with no mutation. Two tenants offering
  the same canonical program on the same intake resolve only to the host's tenant.
- **Authority via the canonical service.** No raw role comparison: the command is
  owner-scoped, and the route is registered in the authority matrix (gate green,
  216 routes, 0 unresolved).
- **Audit without PII.** An `ApplicationStatusHistory` row records
  `application.change_selection` with redacted before/after canonical identity
  (IDs + configuration/assignment versions + cleared field names only). Audit
  failure is swallowed — it never breaks the command.
- **`{"success": true, "data": …}` envelope, cookie auth + CSRF, stable codes.**
  Preserved; every rejection uses a registered stable code.
- **Auto-save untouched.** No autosave transport was removed or weakened; the
  personal-step PATCH still saves every draft-safe field in the same call.

## Required_Evidence

### 1. Reroute success — `raw/backend-integration-6.4.txt` (`TestRerouteSuccess`, 7 tests)
- every canonical ID **and** display snapshot moves together; `configuration_version`,
  `requirements_snapshot` (tenant-B doc in, tenant-A doc out), `eligibility_snapshot`
  re-derived; dependent answers cleared; `application_fee` re-resolved to the new
  offering's canonical fee (250.00); `assignment_version` 1 → 2; change summary
  reports `previous`/`current`/`cleared_fields`/`requirements_added`/`requirements_removed`;
- stale uploads reported, evidence **not** deleted;
- an `application.change_selection` audit row with before/after canonical identity;
- replaying the same selection is an idempotent no-op (`changed: false`, no version bump);
- a stale `assignment_version` → `409 VERSION_CONFLICT`, nothing mutated;
- a display-string body → `400 VALIDATION_ERROR` (canonical IDs only);
- **the generic draft PATCH can no longer move the assignment** while the
  draft-safe field in the same payload still applies.

### 2. Rollback — `raw/backend-integration-6.4.txt` (`TestRerouteRollback`, 4 tests)
- a failure injected **after** the assignment write → `500 INTERNAL_ERROR` and
  every field (IDs, snapshots, config version, fee, dependent answers, both
  versions) equals its pre-command value;
- a configuration dependency failure → `503 CONFIGURATION_UNAVAILABLE`
  `retryable: true`, requirement snapshot untouched (never an empty-requirements
  success — DATA-04);
- a duplicate target → `409 DUPLICATE_APPLICATION` (+ `existing_id`), no mutation;
- a target with no eligible offering → `400 NO_ELIGIBLE_OFFERING`, no mutation.

### 3. Payment block — `raw/backend-integration-6.4.txt` (`TestReroutePaymentBlock`, 8 tests)
- **all six** payment statuses (`pending`, `deferred`, `successful`,
  `force_approved`, `failed`, `expired`) reject the reroute with
  `409 ASSIGNMENT_LOCKED_BY_PAYMENT` and leave the assignment intact;
- the rejection carries a non-empty structured `recovery` path
  (`continue-current`, `start-new-application`, `contact-admissions`) with a label
  and href on every action;
- a paid application can still replay its **own** selection (never wedged): the
  first replay is at most a configuration repair that clears nothing, the next is
  a pure `unchanged` no-op.

### 4. Cross-tenant — `raw/backend-integration-6.4.txt` (`TestRerouteCrossTenant`, 3 tests)
- another student's draft id → `404 NOT_FOUND` disclosing no programme or tenant
  name, nothing mutated;
- trusted tenant host beats a cross-tenant `institution_id` →
  `403 INSTITUTION_OVERRIDE_NOT_PERMITTED`, nothing mutated;
- same canonical program + same intake offered by two tenants → the reroute
  resolves only the host tenant's offering and snapshots only its requirements.

**Total: 22 passed.**

### 5. Service/serializer unit tests — `raw/backend-unit-6.4.txt` (24 passed)
`classify_selection_change` across identical / different-program / different-intake /
same-name-other-tenant / stale-display / drifted-config-version / legacy-no-IDs /
partially-canonical / case-and-padding inputs; the `DEPENDENT_ANSWER_FIELDS`
pin; and the PATCH lock (assignment fields read-only with no request context and
for `student`/`admin`/`super_admin` on PATCH, `Meta.read_only_fields` membership,
personal draft-safe fields still writable).

### 6. Backend regression — `raw/backend-regression-6.4.txt` (202 passed)
Draft start/list/rename (6.2), assignment snapshot isolation + config failure +
resolution (5.2), institution-resolution regressions, application serializers,
canonical IDs, draft-delete payment protection, admissions canonicalization
properties (incl. the PATCH-field-guard properties 4/5/6), duplicate-checker
semantics + canonical duplicates, capacity concurrency (5.3), assignment
properties, canonical-assignment remediation, backward-compat (legacy NULL
canonical IDs still readable), model-serializer alignment, multi-intake,
submission gates + revalidation.

Two pre-existing in-flight failures were observed in the wider sweep and are
**not** 6.4 regressions — both exercise files 6.4 does not touch:
`tests/property/test_application_properties.py::TestUnverifiedPaymentApprovalGuard::test_non_approval_status_skips_payment_check`
(the review path in `admin_review_views.py` + `services.py`, reworked by task 2.2)
and `tests/unit/test_application_student_flow_views.py::TestApplicationInterviewListView::test_admin_list_without_mine_is_scope_narrowed`
(`interview_views.py` now branches on `AdminCapabilityService` before the mocked
`AccessScopeService`, task 2.2). Neither file appears in `raw/change-set.txt`, and
neither test imports any 6.4 module. They are excluded from the recorded
regression command and left to their owning tasks (13.1 owns the full gate).

### 7. Authority-matrix gate — `raw/authority-matrix-gate.txt`
`scripts/authority_matrix_v2.py --strict`: **ZERO-UNCLASSIFIED GATE: PASS**
(216 routes, 0 unresolved / 0 weak / 0 stale) with the new route resolving to the
`owner` class; `tests/unit/test_authority_matrix_v2.py`: **16 passed** (registry ↔
live-route drift guard green).

### 8. OpenAPI + generated client — `raw/openapi-regeneration.txt`
`./scripts/generate-api-types.sh` regenerated
`backend/schema/openapi.v2.candidate.yaml` (175 paths) and
`apps/admissions/src/generated/api.d.ts`; both contain
`/api/v1/applications/drafts/{application_id}/change-selection/`. Spectacular
reports 3 warnings / 116 errors (26 unique) — **zero** of them mention the new
view or serializer (the count is other in-flight V2 `APIView` serializer-guess
fallbacks; the CI zero-error gate is task 13.1's).

### 9. Frontend tests — `raw/frontend-tests-6.4.txt` (28 passed)
- `tests/unit/changeSelectionService.test.ts` (5) — canonical-IDs-only body,
  endpoint, `Idempotency-Key`, `retries: 0`, optional `assignment_version`,
  id encoding, rejection propagation.
- `tests/unit/selectionChange.test.ts` (18) — the intent gate (no-op vs change,
  legacy display comparison, optimistic version forwarding, incomplete target)
  and recovery guidance (non-empty actions for **every** stable code and for an
  unknown failure, server-supplied payment recovery preferred, duplicate offers
  the existing application, only the configuration failure is retryable).
- `tests/unit/wizardAssignmentPatchLock.test.ts` (5) — source contract: neither
  the existing-draft update payload nor the autosave payload contains any
  assignment field, the legacy session spread strips them, the reroute command is
  wired, and a rejected reroute blocks the step advance.

### 10. Frontend regression / type-check / lint
- `raw/frontend-regression-6.4.txt` — draft service + hook, autosave payload
  builder, wizard controller contract, draft intent, draft state machine +
  property tests, local cache + property test, application session drafts,
  service encoding, draft resume, intake identity, payment gate: **81 passed**.
- `raw/frontend-type-check.txt` — `bun run type-check`
  (`tsc -p tsconfig.build.json --noEmit`): **clean, exit 0**.
- `raw/frontend-lint.txt` — `eslint --max-warnings 0` on the 6.4 new/edited
  source + test files: **clean, exit 0**. (Linting `useWizardController.ts` in
  isolation still reports its two **pre-existing** baseline findings — the
  `@/services/client` `no-restricted-imports` error on line 19 and the unused
  `eligibilityEngine` disable on line 14 — both present unchanged at the base
  commit and owned by task 13.1. 6.4 introduces zero new lint findings.)
- `raw/frontend-build.txt` — `bun run build` (production Vite build + CSP HTML
  check): **exit 0**.
- `raw/spec-governance-validator.txt` — the V2 spec validator plus
  `manage.py check` (no issues). The validator's single error is pre-existing and
  belongs to task 4.1; 6.4's evidence directory is present.

### 11. Grep-loop review — `raw/grep-loop-review.txt`
One writer of the assignment display snapshots and one writer of the canonical FK
columns on an existing row (both the reroute service); the first write remains
5.2's `snapshot_columns()`; `DRAFT_SAFE_FIELDS` carries no assignment field and
`ASSIGNMENT_FIELDS` is explicit; **zero** assignment fields in any frontend
application-update payload; the reroute is the only frontend transport; the
payment gate is literal ("any `Payment` row"); no `IdentifierResolver` in the new
service; the trusted host wins.

### 12. Change set — `raw/change-set.txt`
Base commit, the 6.4 file list (new / edited / regenerated), and the explicit
"no schema change" statement.

## Verified vs. deferred

- **Verified (this task):** the four Required_Evidence cases (reroute success,
  rollback, payment-block, cross-tenant) as 22 integration tests; 24 service +
  PATCH-lock unit tests; 202-test backend regression; authority gate green;
  OpenAPI + generated client regenerated with zero new schema errors; 28
  frontend tests; 81-test frontend regression; type-check clean; changed-file
  lint clean; grep-loop review with a single canonical writer.
- **Deferred to task 13.2 (E2E):** the Playwright reroute journey — change the
  programme mid-wizard, verify the requirement list and fee change, then attempt
  a reroute after paying and land on the recovery path — plus the two-tenant
  same-name adversarial matrix (design §16).
- **Owned by task 6.5 (readiness):** surfacing `configuration_version` drift and
  the post-reroute missing-document blockers in the authoritative readiness
  response; 6.4 already returns them in the change summary.
- **Owned by task 7.3 (documents):** turning
  `documents_no_longer_required` into real replace/delete version commands. 6.4
  deliberately reports rather than deletes student evidence.
- **Owned by task 13.1:** the full backend/frontend build-lint-typecheck gate
  over the whole in-flight tree, including the two pre-existing failures and the
  lint baseline noted in §6 and §10.
- **Not applicable:** any Neon/production migration step — 6.4 adds no schema
  change.

## Canonical truth map

`docs/canonical-truth-map.md` → Application Lifecycle gains the **"Application
assignment (reroute)"** row: `change_application_selection` is registered as the
sole writer of `applications.{institution_id, program_id, program_offering_id,
intake_id}` and their display snapshots on an existing row, with the command
endpoint, the payment-immutability rule, the generic-PATCH lock
(`ASSIGNMENT_FIELDS` / `read_only_fields`), and the frontend consumers
(`changeSelection`, `selectionChange.ts`, `applyDraftSelectionChange`).
