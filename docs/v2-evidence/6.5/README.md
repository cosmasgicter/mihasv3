# Task 6.5 Evidence — Add authoritative server readiness and locked submission

_Requirements: R10.6, R11.2-R11.6, R12.3_
_Findings: DATA-03, DATA-04, STU-11, STU-13_
_Design: design.md §8.3 (Readiness — "`GET /api/v2/student/applications/{id}/readiness/`
is authoritative and returns: assignment/configuration version; profile and
identity blockers; persisted canonical grade count and eligibility results;
versioned required-document states; fee quote/payment/defer state;
capacity/duplicate/late checks; declarations; allowed next actions and
recoverability codes. Client validation provides immediate field UX but never
declares the application submittable on its own. Submission reruns readiness
under locks."), §7.3 (Capacity And Waitlist — fixed lock order; the authoritative
seat decision under the capacity row lock), §8.1 (state machine), §9.2/§9.3
(deterministic grades + versioned required documents), §14.1/§14.2 (envelope,
idempotency, optimistic version)._
_Steering: `product.md` (deterministic admissions, no fabricated data, mobile/weak
network safety); `enterprise-tenancy.md` → Tenant Isolation Invariants (scope
before lookup, non-revealing 404) and No-Legacy-Hardcoding (canonical IDs are the
sole authority)._

_Required_Evidence (tasks.md): **"direct API negative matrix and
lost-submit-response browser recovery"** —
`raw/backend-negative-matrix-6.5.txt` is the direct API negative matrix
(31 cases, all green: readiness authority/isolation, report completeness, the
0/1/4/unresolved-subject grade matrix, eligibility, profile, declaration,
version conflict, required-document, fail-closed configuration, and the
idempotent-submit/lost-response recovery pair). The lost-submit-response contract
is proven at the transport level there (same `Idempotency-Key` replays the cached
response byte-for-byte and exactly one state transition exists; a fresh key on an
already-submitted application still returns success) plus the client half in
`apps/admissions/tests/unit/submitIdempotency.test.ts`. The Playwright browser
journey is owned by task **13.2** per the spec's E2E/evidence architecture
(design §16), exactly as task 6.4 recorded._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of the base commit (the whole
  admissions-v2 spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-26 (UTC).
- **Schema hash** (`backend/schema/openapi.v2.candidate.yaml`, regenerated):
  `16c7408c87f369d1cdb5befaa164cfc01c15e3ed67e6c634aa74cbe5e1ff988d`
- **Database schema: no change.** 6.5 adds one read-only endpoint and reads
  columns tasks 5.2/5.3 already added (`configuration_version`,
  `requirements_snapshot`, `eligibility_snapshot`, `assignment_version`,
  `version`) plus the existing `application_grades` / `subjects` /
  `application_documents` / `payments` tables. No new `backend/scripts/*.sql`,
  nothing to apply on Neon or production.
- API surface changed → OpenAPI schema + generated TypeScript client regenerated
  (`raw/openapi-regeneration.txt`).
- PBT: task 6.5 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → no `6.5` entry in `pbtResults`). Nothing to record via
  `update_pbt_status`. The 0/1/4/5-grade and unresolved-subject matrix is covered
  as parametrised integration cases instead.

## What was already on disk, and what 6.5 finished

A previous dispatch of this task left `backend/apps/applications/readiness_service.py`
(1,395 lines) and a docstring/helper stub in `services.py` — but **nothing called
it**: no submit-time re-evaluation, no endpoint, no route, no tests, no evidence.
This run kept that evaluator and completed the task around it:

| Layer | File | Role |
|---|---|---|
| Evaluator (already on disk) | `backend/apps/applications/readiness_service.py` | Framework-neutral deterministic gates + stable blocker codes + next actions + student summary. 6.5 added the delegation knobs (`skip_evidence_gates`, `evaluate_contended`, `include_provider_detail`) and made the reported `blockers` consistent with `can_submit`. |
| **Locked submission** | `backend/apps/applications/services.py` | `submit_application` now re-evaluates the full student-responsibility gate set **on the locked row** through `readiness_service.submission_blockers(...)`, translated by `_raise_first_submission_blocker` (which the prior dispatch left unused). |
| **Authoritative query** | `backend/apps/applications/readiness_v2_views.py` (new) | `GET /api/v2/student/applications/{id}/readiness/` — V2 envelope, owner-or-in-scope-staff read, 404 mask, fail-closed 503. |
| Route | `backend/apps/applications/readiness_v2_urls.py` (new) + `backend/apps/common/v2/urls.py` | Mounts `student/applications/` in the V2 namespace. |
| Declaration + version | `backend/apps/applications/student_submission_views.py` | Passes `declarations_accepted` (so the declaration is re-checked under the lock, not only at the transport) and an optional `version` for the optimistic guard. |
| Authority matrix | `scripts/authority_matrix_registry.py` | Readiness route registered as `owner` with `not_found_mask`; the zero-unclassified gate stays green (`raw/authority-matrix-gate.txt`). |
| Lost-response recovery | `apps/admissions/src/lib/submitIdempotency.ts` (new) + `useWizardController.ts` | Deterministic `submit-<applicationId>` key so a retry after a lost response replays the cached success instead of erroring. |
| Test fixtures | `backend/tests/tenant_fixtures.py` | `build_subject`, `build_grades`, `build_course_requirement` — a "submittable" world must now seed real canonical grades. |

## The findings closed

**STU-11** (P0) — *"the education UI can add selectable `fallback-*` subject IDs,
client readiness counts them, persistence drops them, and submission has no
authoritative five-grade gate at all."* **Closed on the server side, both halves:**

1. **Readiness counts only persisted canonical grades.** `evaluate_grades`
   counts unique `ApplicationGrade` rows whose `subject_id` resolves to an
   **active** canonical `Subject`; anything else is reported as
   `unresolved_subject_count` and never contributes.
   `test_unresolved_subject_ids_never_count_as_complete` proves
   `persisted_count == 5` while `unique_canonical_count == 4` still blocks.
2. **Submission now has the gate.** `MINIMUM_GRADES_REQUIRED` is raised from
   inside the submission lock (`test_submission_is_refused_below_the_minimum`,
   `test_submit_endpoint_returns_the_stable_grade_blocker`), and the application
   stays `draft`. The minimum is policy-floored at 5: a `minimum_persisted_grades`
   setting can only raise it.

**STU-13** / **DATA-04** (P0) — required-document state is read from the
application's versioned `requirements_snapshot` (task 5.2) rather than a
hardcoded type list, and a configuration that *cannot be evaluated* fails closed
with the stable retryable `CONFIGURATION_UNAVAILABLE` (503) instead of degrading
to "no requirements". Proven on **both** surfaces:
`test_readiness_returns_retryable_503_when_configuration_unevaluable` and
`test_missing_required_document_blocks_readiness_and_submission`, plus the
pre-existing task-5.2 suite still green (`tests/integration/test_assignment_config_failure.py`).

**DATA-03** (P0) — capacity is reported from the canonical Intake_Offering
identity (`CapacityService.offering_ids` / `live_seat_count`), never a display
string, and the **authoritative** last-seat decision stays inside the submission
lock (`CapacityService.take_seat_for_submission` under the `ProgramIntake` row
lock). The readiness pass deliberately does **not** re-derive the contended
checks (`evaluate_contended=False`) because `submit_application` already
re-checks the intake window and the duplicate gate in the same lock — the
concurrency proof stays with tasks 5.3's suites
(`tests/unit/test_capacity_concurrency_5_3.py`,
`tests/integration/test_capacity_waitlist_canonical_5_3.py`, both green).

**R11.2** — the student summary is a deterministic projection
(`test_student_summary_is_deterministic_and_has_no_generated_prose`: byte-equal
across two calls) with no generative-AI call anywhere in the readiness path
(`raw/grep-loop-review.txt` §5).

**R11.3** — the reviewer readiness query is the *same* endpoint and the *same*
deterministic services: staff read it when the application is in their
`AccessScopeService` scope, otherwise the response is a non-revealing 404.

**R12.3** — payment state is reported as `paid` / `deferred` / `processing` /
`action_required` with the canonical fee quote attached, and `deferred` satisfies
the pre-submission gate (`test_deferred_payment_satisfies_the_payment_gate`).

## A real bug the negative matrix caught

`test_readiness_of_a_legacy_row_reports_the_additive_skip` failed with **503
`CONFIGURATION_UNAVAILABLE`** on a pre-canonical row: `required_documents()`
live-resolved with null canonical IDs, found no `Program`/`CanonicalProgram`
rows, and raised `AssignmentConfigurationError`. That inverted the intended
policy — a legacy row has *nothing to evaluate* (the additive skip), which is not
a configuration outage. `required_documents()` now returns `[]` for a
non-canonical application before attempting live resolution, mirroring
`services._missing_assigned_required_documents`, while a **canonical** row whose
referenced configuration rows are unreadable still fails closed
(`test_readiness_returns_retryable_503_when_configuration_unevaluable` and the
task-5.2 dependency-failure suite both stay green).

## Design decisions worth reviewing

1. **One evaluator, two consumers.** The V2 query and the in-lock submission gate
   run the *same* functions, so the answer the student reads and the decision the
   server makes cannot disagree. `raw/grep-loop-review.txt` §1 proves there is no
   second implementation.
2. **`can_submit == (status == "draft" and blockers == [])`.** The un-ticked
   declaration is *not* reported as a blocker — it is the submit action itself.
   Its real state stays in the `declarations` section, and
   `submit_application` still re-checks it under the lock
   (`test_declaration_is_re_checked_under_the_lock` → `CONFIRM_SUBMISSION_REQUIRED`,
   application unchanged).
3. **The pre-lock gates were kept as a fast fail.** Payment / identity /
   required-document checks still run before the lock so their stable codes and
   relative precedence are unchanged for every existing client; the in-lock pass
   is authoritative and adds the gates that never existed (profile, canonical
   grades, eligibility, declaration).
4. **`admin_force` semantics preserved.** `skip_evidence_gates=admin_force` keeps
   the operator's offline/paper force-submit bypassing exactly the gates it
   bypassed before (payment, identity, required documents — and now also
   canonical grades and eligibility, which a paper application cannot satisfy).
   `test_admin_force_submit_still_bypasses_the_student_evidence_gates`.
5. **Additive for legacy rows.** An application without the canonical
   offering + program IDs skips every canonical-only gate and submits exactly as
   before (`test_legacy_row_without_canonical_ids_still_submits`).
6. **The in-lock pass adds no query for payment/identity.** The submission
   service passes the values it already computed, and
   `include_provider_detail=False` skips the informational latest-provider-status
   lookup inside the transaction.

## Verification run for this task

| Gate | Command | Result | Artefact |
|---|---|---|---|
| Direct API negative matrix | `pytest tests/integration/test_submission_readiness_6_5.py -v` | **31 passed** | `raw/backend-negative-matrix-6.5.txt` |
| Targeted regression (submission, capacity, revalidation, required docs, journey, properties) | `pytest tests/unit/test_submission_gates.py tests/unit/test_submission_revalidation.py tests/unit/test_late_applications.py tests/unit/test_assignment_required_docs_legacy_metric.py tests/unit/test_capacity_concurrency_5_3.py tests/unit/test_application_student_flow_views.py tests/integration/test_assignment_config_failure.py tests/integration/test_capacity_waitlist_canonical_5_3.py tests/integration/test_student_journey_e2e.py tests/property/test_admissions_canonicalization.py tests/property/test_application_properties.py tests/property/test_application_hardening.py -q` | **158 passed, 4 failed — all 4 confirmed pre-existing** | `raw/backend-regression-6.5.txt`, `raw/pre-existing-failures.txt` |
| Full backend unit surface | `pytest tests/unit/ -q` | 2503 passed; 33 failed + 79 errors, **zero new** vs the 6.5-removed baseline | `raw/backend-unit-suite.txt`, `raw/pre-existing-failures.txt` |
| Authority-matrix gate | `pytest tests/unit/test_authority_matrix_v2.py tests/property/test_authority_matrix_properties.py -q` | **21 passed** (zero-unclassified route gate green with the new route) | `raw/authority-matrix-gate.txt` |
| Django checks | `python manage.py check` | **no issues (1 silenced)** | `raw/django-check.txt` |
| OpenAPI + TS client | `bash scripts/generate-api-types.sh` | schema + `api.d.ts` regenerated, types compile cleanly | `raw/openapi-regeneration.txt` |
| Frontend type-check | `bun run type-check` | **clean (exit 0)** | `raw/frontend-type-check.txt` |
| Frontend tests (submit/idempotency/draft) | `vitest run tests/unit/submitIdempotency.test.ts tests/unit/applicationSubmitIdempotencyHeaders.test.ts tests/unit/wizardDraftMachine.test.ts tests/unit/selectionChange.test.ts tests/unit/changeSelectionService.test.ts tests/unit/multiDraftService.test.ts tests/unit/useMultiDraft.test.tsx` | **62 passed** | `raw/frontend-tests-6.5.txt` |
| Lint (changed files) | `eslint src/lib/submitIdempotency.ts src/pages/.../useWizardController.ts tests/unit/submitIdempotency.test.ts` | new files clean; 1 **pre-existing** `no-restricted-imports` error on `useWizardController.ts:19` (`@/services/client`, untouched by 6.5, owned by the R14.3 architecture-enforcement task) | `raw/frontend-lint-changed-files.txt` |
| Final combined run (6.5 matrix + authority gate + every submission/capacity suite) | `pytest tests/integration/test_submission_readiness_6_5.py tests/unit/test_authority_matrix_v2.py tests/property/test_authority_matrix_properties.py tests/unit/test_submission_gates.py tests/unit/test_submission_revalidation.py tests/unit/test_assignment_required_docs_legacy_metric.py tests/unit/test_late_applications.py tests/unit/test_capacity_concurrency_5_3.py tests/integration/test_assignment_config_failure.py tests/integration/test_capacity_waitlist_canonical_5_3.py tests/integration/test_student_journey_e2e.py -q` | **102 passed** | `raw/final-combined-run.txt` |
| Grep-loop canonical review | see file | one evaluator, one grade threshold, snapshot-driven documents, no AI, canonical capacity keys | `raw/grep-loop-review.txt` |

Backend suites were run against a local ephemeral Postgres
(`DATABASE_URL="postgresql:///beanola"` → pytest-django creates/drops
`test_beanola`). Neon and production were never touched.

## Not in this task

- The **browser** (Playwright) readiness/lost-response journey — task **13.2**
  (design §16 journey matrix).
- Wiring the wizard UI to *consume* `GET /api/v2/student/applications/{id}/readiness/`
  instead of its local `buildWizardReadiness` advisory check — the student
  workspace/wizard recomposition tasks **10.6 / 11.2**. Design §8.3 only requires
  that client validation never *declares* submittability on its own, which is now
  true because the server owns the decision.
- The `fallback-*` subject-ID removal in the education selector and the canonical
  subject-catalogue seeding — task **7.1** (the server-side half of STU-11 is
  closed here; 7.1 owns the client selector and the catalog).
