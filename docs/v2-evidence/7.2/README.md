# Task 7.2 Evidence — Render and persist dynamic required documents

_Requirements: R11.6-R11.8_
_Findings: STU-13, STU-19_
_Design: design.md §9.3 (Required Documents — "Requirements are versioned and
snapshotted to the application assignment. The wizard renders each server
requirement, including custom tenant types."); §9.2 ("upload -> malware/type/size
check"); §13.3 (accessible errors, focus management, 44px targets)_
_Steering: `product.md` (uploads are high risk; never lose a student's work;
mobile-first on weak networks); `enterprise-tenancy.md` (scope before lookup,
non-revealing 404, no hardcoded tenant assumptions); `structure.md` (app-local
service modules, no raw client in pages/components)._

_Required_Evidence (tasks.md): **"custom tenant requirement and interrupted
upload E2E"** — both are exercised end to end on the server in
`backend/tests/integration/test_required_documents_contract_7_2.py` (33 cases,
including a real storage failure injected mid-upload) and on the client in
`apps/admissions/tests/integration/requiredDocumentsUploadFlow.test.tsx`
(6 cases, including an interrupted upload that recovers). Nothing is skipped or
credential-gated._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of that commit (the whole admissions-v2
  spec is in-flight/uncommitted; the orchestrator owns the commit). File list:
  `raw/change-set.txt`.
- Captured: 2026-07-26 (UTC).
- **Schema hash** (`backend/schema/openapi.v2.candidate.yaml`, regenerated):
  `3b8643d7defd2ee68dce91b9417a52e2455cf8e60089bd4be3154bfa5513e436`
  (was `b33c044c…` at 7.1 — the diff is the one new path
  `/api/v1/applications/{application_id}/required-documents/` plus its
  `ApplicationRequiredDocumentsResponse` schema). Log:
  `raw/openapi-regeneration.txt`, hash: `raw/schema-hash.txt`.
- **Database: no DDL, no data migration.** The contract is derived from rows that
  already exist (`institution_required_documents`, the `requirements_snapshot`
  task 5.2 stamps on `applications`, and `application_documents`). Nothing was
  applied to Neon or production because there is nothing to apply.
- PBT: task 7.2 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` has no `7.2` entry in `pbtResults`), so there is no
  `update_pbt_status` call to make. The one property test this task touches is
  the pre-existing consolidation property (see "What 7.2 found", item 3).

## The finding, restated precisely

STU-13: *"Tenant-configured required documents can be returned by assignment but
the wizard only uploads two hardcoded document types. Requirement lookup errors
fail open."*

Before 7.2 the two halves of that sentence had no shared authority:

- The **server** could resolve a tenant requirement such as
  `nursing_council_letter`, and task 6.5's readiness/submission gate would
  **block** on it (`REQUIRED_DOCUMENT_MISSING`).
- The **client** rendered exactly two fields (`result_slip`, `extra_kyc`) and the
  **upload command** hardcoded an eight-value `document_type` `ChoiceField`.

So a tenant could configure a requirement that made submission impossible: no
control existed to satisfy it, and the API would have refused the upload anyway
with a generic validation error. That is the defect — not "the UI is missing a
field", but "the platform advertises a configuration it cannot honour".

## What shipped

### 1. One server authority for both questions (`required_documents.py`)

`backend/apps/applications/required_documents.py` answers the only two questions
that matter, from the same data:

| Question | Function | Consumer |
|----------|----------|----------|
| What must this application upload? | `build_contract` | `GET /api/v1/applications/{id}/required-documents/` |
| May *this* upload be accepted? | `resolve_upload_target` + `validate_upload` | `POST /api/v1/documents/upload/` |

Because both sides read the same resolution, **a control the client rendered is
always uploadable, and a type nobody asked for never is**
(`DOCUMENT_TYPE_NOT_REQUIRED`).

The module resolves through `readiness_service.required_documents` — the *same*
fail-closed resolver the readiness query and the submission gate use — so the
rendered controls and the submission gate cannot disagree. It is framework-neutral
(no DRF import) and depends on `readiness_service`, never the reverse, so there is
one requirement authority and no import cycle.

Requirement rows carry what a client needs to render one accessible control:
`label`, `required`, `description`, `accepted_mime_types`,
`accepted_extensions`, `max_size_bytes`, `state`, and the current `document`
identity (so a replace targets a real server record — STU-19, not local UI
state).

### 2. Tenant rules narrow the platform policy; they never widen it

`resolve_constraints` clamps every configured rule into the platform ceiling
(`PLATFORM_ACCEPTED_MIME_TYPES`, `PLATFORM_MAX_UPLOAD_BYTES`) and publishes the
provenance (`constraints_source`, `constraints_narrowed`) so an operator can see
when a rule was narrowed, clamped, or ignored instead of guessing. A rule that
configures no platform-supported MIME type falls back to the platform default and
logs — refusing a student's real result slip because of an operator typo is the
worse failure.

The advertised MIME set is deliberately a **subset** of the magic-byte table:
`tests/unit/test_required_documents_contract.py` asserts every advertised type
survives `validate_file_magic_bytes`, so the contract can never promise something
the upload command then refuses (a GIF, for instance, passes magic bytes but is
not advertised — and the client refuses it too).

### 3. The platform baseline stays in force

`PLATFORM_BASELINE_REQUIREMENTS` publishes the two requirements the platform
itself enforces regardless of tenant configuration: `result_slip`, and
`extra_kyc` accepting any of `IDENTITY_DOCUMENT_TYPES` (`nrc`/`passport`/
`extra_kyc`) so an identity document already on file satisfies it. A tenant row
for either type supersedes the baseline entry, so the tenant's own label and
rules win. A tenant that has configured nothing behaves exactly as before.

### 4. The upload command is contract-driven and screens content

`DocumentUploadSerializer.document_type` became a shape-only `RegexField`
(`^[a-z][a-z0-9_]{0,79}$`); **authorisation** of which type is acceptable moved to
`resolve_upload_target`, so a custom tenant type is uploadable while an arbitrary
string is still refused with a stable code. Order of checks in the view:

```
platform ceiling -> empty-file -> ownership/state -> requirement resolution
  -> per-requirement size/type -> magic bytes -> active-content screen -> object write
```

`documents/validators.py::scan_document_for_active_content` is new: a
deterministic, dependency-free screen that refuses a genuine PDF carrying
`/JavaScript`, `/Launch`, or `/RichMedia`, and an image carrying an HTML/PHP
script tail, **before** anything reaches object storage. It is explicitly *not*
an anti-virus engine — every pattern is ≥ 7 bytes precisely so a large legitimate
PDF's compressed streams cannot trip it by chance, and signature scanning plus
the `uploaded -> scanning -> ready_for_review` lifecycle belong to task **7.3**.

### 5. The client renders the contract and holds no document list

| Surface | Source |
|---------|--------|
| Upload controls | `RequiredDocumentsPanel` ← contract |
| Upload state machine (`idle/replacing/uploading/uploaded/failed`), one silent retry, manual retry, replace | `useRequiredDocuments` |
| Network | `services/requiredDocuments.ts` (the only module that touches the client) |
| Contract parse + policy clamp + per-requirement validation | `lib/requiredDocuments.ts` |
| Step checklist, error summary, Continue gate, review rows, readiness rail | `requiredDocumentSurfaces.ts` (5 pure helpers over one contract) |

Every upload re-reads the contract afterwards, so what the student sees is the
**persisted** state, not an optimistic local flag. A 503
`CONFIGURATION_UNAVAILABLE` renders a retry affordance and **no controls** —
never a guessed "nothing is required", which is precisely the fail-open half of
STU-13.

`EducationStep` lost 261 lines of hardcoded two-field markup (status pills,
previews, per-field reject state) and gained one contract-driven panel.

## What 7.2 found (defects, not wiring)

Three real defects surfaced while completing the task, each fixed with a test
written first.

### 1. The progress bar was frozen at 0% for every upload

`FileUpload` implements a careful indeterminate branch (pulsing bar,
`aria-valuetext="Uploading"`, no `aria-valuenow`) — and then defeated it with a
default parameter, `progress = 0`. Because destructuring defaults apply to
`undefined`, **every** caller that cannot measure transfer progress (which is all
of them: the unified fetch-based `ApiClient` from task 1.4 cannot observe
request-body progress) rendered a determinate bar stuck at "0%".

On a weak connection — the normal case per `product.md` — a student reads a
frozen 0% as a dead form, reloads, and risks losing work. Fixed by removing the
default so an unmeasured upload stays indeterminate, and by removing the hook's
fabricated `progress: 0` for large files. The `progress` field remains in the
state shape for a transport that can measure it; it is never invented.

Test: `requiredDocumentsPanel.test.tsx` → "announces an in-flight upload without
claiming a percentage it cannot measure" (asserted failing first: `expected '0'
to be null`) plus its determinate counterpart.

**No determinate percentage is published, and the evidence says so rather than
claiming progress the platform cannot measure.** Adding one would mean an
XHR-based second network path, re-forking the request/refresh/CSRF pipeline task
1.4 just unified — a worse trade than an honest indeterminate indicator.

### 2. A duplicate `formatFileSize` broke the single-canonical-source property

`lib/requiredDocuments.ts` exported a second `formatFileSize`, whose canonical
home is `lib/utils.ts`. `tests/property/consolidation-canonical-source.test.ts`
(Property 1) caught it: `Counterexample: [{"canonicalFile":"lib/utils.ts",
"symbol":"formatFileSize"}]`.

The compact wording (`2MB`, `500KB`) is *intentional* — it must read identically
to the backend's own rejection copy from `required_documents._format_size`, where
the canonical formatter renders `2 MB`. Showing "up to 2MB" on the control and
"must be 2 MB or smaller" in the error is two different-looking limits to a
student. So the duplication was resolved by naming the concept honestly:
`formatConstraintSize`, documented as deliberately distinct from the canonical
general-purpose formatter. Property 1 passes.

### 3. The readiness rail was the last surface still naming the legacy pair

After the panel, checklist, blockers, Continue gate, and review rows all moved to
the contract, `wizardReadiness.ts` still hardcoded
`createItem('education', 'result_slip', …)` and `extra_kyc`. A tenant requiring
only `nursing_council_letter` would have seen the rail demand a result slip
nobody asked for — STU-13's exact symptom, surviving in the one surface nobody
had converted. Fixed by extending the pure helper module
(`documentReadinessItems`) and passing it in, so **all five** document surfaces
derive from one contract and cannot drift.

Test: `wizard/requiredDocumentSurfaces.test.ts` → "wizard readiness rail —
contract driven" (4 cases, asserted failing first with
`documentReadinessItems is not a function`).

## Fail-closed and tenant isolation

| Behaviour | Where |
|-----------|-------|
| Unevaluable configuration → retryable `CONFIGURATION_UNAVAILABLE` (503) on the **read** | `ApplicationRequiredDocumentsView` |
| Unevaluable configuration → 503 on the **upload** (never accepted unverified) | `DocumentUploadView` |
| Client renders **no** controls on a contract error | `RequiredDocumentsPanel` |
| Another student's contract → non-revealing **404** | integration test `TestContractAuthority` |
| Out-of-scope admin (other tenant) → **404**, no tenant identifier disclosed | same; scope via `AccessScopeService` only |
| Contract rows ↔ submission blockers agree | integration test `TestContractMatchesSubmissionGate` |

## Verification

Backend runs use the local throwaway Postgres
(`DATABASE_URL=postgres://beanola:beanola@127.0.0.1:5432/beanola`) — never Neon,
never production (`infrastructure.md`).

| Gate | Command | Result | Log |
|------|---------|--------|-----|
| Django system checks | `python manage.py check` | **no issues (1 silenced)** | `raw/django-check.txt` |
| 7.2 unit contract | `pytest tests/unit/test_required_documents_contract.py -q` | **39 passed** | `raw/backend-7.2-and-gates.txt` |
| 7.2 integration (Required_Evidence) | `pytest tests/integration/test_required_documents_contract_7_2.py -q` | **33 passed** | same |
| Authority/scope/migration gates | `pytest tests/unit/test_authority_matrix_v2.py tests/unit/test_scope_drift_guard.py tests/unit/test_unscoped_endpoint_guard.py tests/unit/test_migration_drift_guard.py -q` | **113 passed, 1 failed — pre-existing (task 11.2 GAP-6/GAP-7)** | same |
| Targeted regression (documents, storage, submission gates, readiness, journey, assignment failure, document properties) | 14 files, see `raw/backend-regression-7.2.txt` | **148 passed, 1 failed — pre-existing** | `raw/backend-regression-7.2.txt` |
| Final combined run | 9 suites incl. authority properties | **141 passed** | `raw/final-combined-run.txt` |
| Full backend (`tests/unit` + `tests/integration` + `tests/contract`) | `pytest tests/unit tests/integration tests/contract -q` | **2900 passed**, 43 failed + 79 errors — **all pre-existing** | `raw/backend-unit-integration-contract.txt`, diff in `raw/pre-existing-failures-diff.txt` |
| OpenAPI regeneration + generated types | `./scripts/generate-api-types.sh` | new path present, **types compile cleanly** | `raw/openapi-regeneration.txt` |
| Frontend type-check | `bun run type-check` | **clean** | `raw/frontend-type-check.txt` |
| 7.2 frontend set + guards (contract, drift, panel, education step, surfaces, upload flow, architecture, consolidation properties, submission-gate + document-flow drift) | `bun x vitest run <12 files>` | **84 passed** | `raw/frontend-tests-7.2.txt` |
| Frontend suite | `bun x vitest run` | **3721 passed**, 1 failed + 9 uncollectable Playwright files — **all pre-existing** (7.1 baseline: 3648) | `raw/frontend-suite.txt` |
| Drift-guard fixture reproducibility | `python scripts/dump_required_documents_policy.py \| diff` | **byte-identical, no drift** | `raw/mirror-fixture-reproducible.txt` |
| Lint (changed files) | `eslint <12 files>` | 2 errors + 3 warnings, **all pre-existing** (see below) | `raw/frontend-lint-changed-files.txt` |
| Spec governance validator | `python3 scripts/validate_spec_governance.py` | 1 error — **pre-existing and unrelated**: task **4.1** is checked with no `docs/v2-evidence/4.1`. Nothing is reported against 7.2 | `raw/spec-governance.txt` |

**Pre-existing failure accounting** (`raw/pre-existing-failures-diff.txt`): the
7.2 backend run introduces **zero** new failures versus the 7.1 baseline. The
only entries absent from that baseline are the 6
`tests/contract/test_v2_endpoint_contract.py` cases, which 7.1 never ran and
which task 5.4 already documented as reproducing on base commit `bae29a28d`
(a v2 demo-harness envelope issue). The frontend set is identical to 7.1's.

**Lint**: the two `no-restricted-imports` errors are the pre-existing
`@/services/client` imports in `useWizardController.ts` and `SubmitStep.tsx` —
both are explicit, documented entries on the shrinking pending-migration
allowlist in `tests/unit/architectureEnforcement.test.ts` (owned by later phase
tasks), and that gate **passes**. 7.2's own new modules are architecture-clean:
the panel and hook never import the client; only
`src/services/requiredDocuments.ts` does.

### Fixture regeneration (referenced by the drift test)

```bash
cd backend && python scripts/dump_required_documents_policy.py \
  > ../apps/admissions/tests/unit/__fixtures__/requiredDocumentsBackendMirror.ts
```

Never hand-edit the generated mirror to make
`apps/admissions/tests/unit/requiredDocumentsDrift.test.ts` pass.

## Canonical truth map

Registered under **"Required-document upload contract (Admissions V2 task 7.2,
R11.6-R11.8)"**: the contract authority, the upload-authorisation seam, the
platform policy ceiling, the baseline requirements, the active-content screen,
the client mirror, the wizard surface helpers, and the invariants clients may
rely on. The stable rejection codes are registered under **"Document upload
rejection codes (Admissions V2 task 7.2)"** with their frontend mirror, and the
drift guard is listed in the Drift Guard Inventory.

The endpoint was already registered in `scripts/authority_matrix_registry.py`
(`owner`, composed `tenant.document.read`, `not_found_mask`, finding STU-13);
`test_authority_matrix_v2.py` passes.

## Verified vs. deferred

- **Verified:** a custom tenant document type is published, rendered, validated
  against its own narrowed constraints, uploaded, and reported as persisted; the
  platform baseline survives a tenant with no configuration; a tenant cannot
  widen the MIME set or the size ceiling; content that lies about its type and
  content carrying active/script payloads are refused before the object write; an
  interrupted upload leaves **no** half-written evidence and retries cleanly;
  replace targets the server record and preserves prior evidence; both the read
  and the upload fail closed on unevaluable configuration; cross-tenant and
  cross-student reads are masked as 404; contract rows and submission blockers
  agree; all five wizard document surfaces derive from one contract.
- **Deferred to task 7.3** (design §9.3, finding STU-19): immutable version rows
  with checksums, the partial unique index enforcing one *current* version per
  application/requirement, staged-object writes with compensation, the
  reconciliation sweeper, and the
  `uploaded -> scanning -> ready_for_review -> verified` lifecycle. 7.2's
  active-content screen is the synchronous floor beneath that work; today
  "replace" supersedes via the existing document rows.
- **Deferred to task 13.2** (spec E2E architecture, design §16): the Playwright
  browser journey for the custom-tenant-requirement upload and the interrupted
  upload. Both behaviours are proven end to end here at the API and component
  level, with a real mid-flight storage failure injected — nothing is skipped or
  credential-gated.
- **Follow-up not taken in 7.2 (out of scope, named so it is not lost):**
  `apps/applications/document_intelligence.py::DocumentIntelligence.REQUIRED_DOC_TYPES`
  still hardcodes `{"nrc", "passport", "result_slip"}` for an **admin-side
  advisory completeness ratio**. It gates nothing and is not part of the student
  upload contract; converting it belongs with the structured admin review
  readiness that replaces the AI panel (task 7.4 / Phase 11).
