# Admissions V2 Canonical Rebuild: Source Audit

## Purpose

This register records the source-grounded failures that the V2 implementation
must resolve. It distinguishes observed behavior from the target design in
`design.md`. A task is not complete merely because a unit test passes; its
linked finding must be closed with the evidence named in `tasks.md`.

This audit used the repository steering files, the source-context and agentic
workflow skills, the Neon/Postgres guidance, the Impeccable design audit, the
UI/UX Pro Max mobile heuristics, focused source inspection, existing tests, and
parallel admin, student, tenant, database, AI, and API audits. Existing specs
remain historical inputs. They are not treated as proof that runtime behavior
works.

## Severity

- **P0:** security, tenant isolation, data integrity, money, or a core journey is
  unusable.
- **P1:** a major workflow is incomplete, misleading, or has no reliable
  production proof.
- **P2:** usability, maintainability, performance, or governance debt that can
  cause recurring defects.

## Governance And Proof

| ID | Severity | Observed issue | Source evidence | Required outcome |
|---|---|---|---|---|
| GOV-01 | P0 | The canonical truth map names `.kiro/specs/canonical-multi-tenant-alignment/` as active, but that spec is archived. | `docs/canonical-truth-map.md`; `.kiro/specs/_archived/` | Register this V2 spec as the active admissions authority and retain older specs as history. |
| GOV-02 | P0 | `full-platform-remediation-2026-07` is marked completed while required tasks remain unchecked. Several other active specs show the same parent/subtask drift. | `.kiro/specs/full-platform-remediation-2026-07/.config.kiro`; its `tasks.md`; active admin and mobile specs | A spec can be completed only when every required task has linked executable evidence. |
| GOV-03 | P1 | Admin dashboard and communications specs reuse the same spec UUID. | Their `.config.kiro` files | Give every live spec a unique ID and add a metadata validator. |
| GOV-04 | P0 | Browser journey suites are environment-gated, substantially skipped, or explicitly descriptive. Passing unit and request-level journey tests therefore does not prove the UI works end to end. | `apps/admissions/tests/e2e/adminJourney.spec.ts`; `studentJourney.spec.ts`; tenant, mobile, and white-label specs | Required local Playwright journeys run without skip against isolated services and seeded tenants. |
| GOV-05 | P1 | Contract and launch evidence can remain stale while source versions or routes change. | `backend/schema/openapi.v1.baseline.yaml`; `docs/launch-evidence/08-contract/openapi.yaml`; OpenAPI drift tests | Generate evidence from the candidate build, record its commit and schema checksum, and fail stale evidence. |

## Authority, Admin, And Reviewer Workflows

| ID | Severity | Observed issue | Source evidence | Required outcome |
|---|---|---|---|---|
| AUTH-01 | P0 | Reviewers are excluded by frontend admin guards and treated as students by backend lists, while review mutations require `IsAdmin`. | `types/roles.ts`; `routes/routeRegistry.ts`; `admin_review_views.py` | Assignment-scoped reviewers can list and complete only their authorized work. |
| AUTH-02 | P0 | Status, payment, document, interview, amendment, bulk, export, fee, and settlement endpoints use raw roles instead of the canonical capability service. Read-only tenant admins can mutate and legitimate reviewers are denied. | application admin views; document/payment views; catalog services | Every endpoint and route uses one tested platform, tenant, or assignment authority matrix. |
| AUTH-03 | P0 | Manual reviewer assignment sends an empty UUID. Auto-assignment can select a reviewer without tenant membership. | `ApplicationDetailModal.tsx`; `services/applications.ts`; `admin_assignment_views.py` | Reviewer selection is server-backed, tenant-scoped, and transactionally validated. |
| AUTH-04 | P0 | The permissions screen advertises invented colon-delimited permissions and unsupported roles, then maps arbitrary selections back to a role and can default the user to `student`. | `services/admin/users.ts`; `UserPermissions.tsx`; backend role choices and capability service | Remove the fake permission editor. Manage platform role, tenant membership, and access grants through their canonical APIs; show effective capabilities read-only. |
| AUTH-05 | P1 | Route and navigation guards incompletely declare capability requirements, so unauthorized screens are visible and authorized reviewer screens are hidden. | `routeRegistry.ts`; `AdminRoute`; tenant navigation | Route, navigation, and API authorization are derived from the same authority contract; the API remains the security boundary. |
| ADM-01 | P1 | Application totals, filters, and select options are derived from the currently loaded page. A dashboard link emits a filter the parser ignores. | `Applications.tsx`; `applicationsOverview.ts`; `Dashboard.tsx`; `useApplicationFilters.ts` | Server-side search, sort, filters, facets, pagination, and aggregates share one query contract. |
| ADM-02 | P1 | Missing dashboard metrics are synthesized as healthy zeros, scoped polling can lose institution scope, and enabled accounts are labeled online users. | admin dashboard service and polling hook; dashboard backend view | Metrics have precise definitions, authoritative server aggregates, scope, freshness, and explicit error/unknown states. |
| ADM-03 | P1 | User management fetches only the first server page and then filters, sorts, paginates, and exports locally. Update fields are silently ignored by the backend. | `pages/admin/Users.tsx`; user serializers | User CRUD, search, filters, pagination, mutation, and audited export are server-owned and contract-tested beyond page one. |
| ADM-04 | P1 | Batch import accepts unsupported roles and creates profiles without tenant memberships; bulk role changes can fail on partial records. | `accounts/batch_views.py`; import template; admin users UI | Imports are previewed, validated, tenant-bound, atomic, idempotent, audited, and return row-level errors. |
| ADM-05 | P1 | Tenant audit UI calls a generic endpoint without the selected tenant. The correct endpoint lacks a direct `tenant.audit.read` check. | `tenants/AuditPanel.tsx`; catalog admin audit view | One tenant-scoped, capability-protected audit API drives list and export. |
| ADM-06 | P1 | Settlement rows are fetched broadly and filtered client-side; fee and settlement authority is role-based. | `SettlementPanel.tsx`; `payment_query_views.py` | Settlement and fee queries are server-scoped, capability-gated, paginated, aggregated, and audited. |
| AUTH-06 | P0 | Amendment notifications are broadcast to all admins instead of tenant-authorized recipients, and review lacks locking. | `applications/amendment_service.py` | Resolve recipients through tenant scope, dispatch via the tenant outbox, and lock amendment review transitions. |
| AUTH-07 | P1 | Owner-scoped write endpoints disclose object existence: payment initiate/mobile-money/defer and application withdraw/confirm-enrollment/amendment return a distinguishable `403` (`NOT_OWNER`/`INSUFFICIENT_PERMISSIONS`) for a valid but non-owned application id, inconsistent with the canonical `404` not-found mask used by official-documents and `GET /api/v2/applications/{id}/` (which explicitly returns 404 "to avoid leaking existence"). Surfaced by the task 2.1 authority-matrix per-class disclosure policy. | `documents/payment_widget_views.py`; `applications/student_withdrawal_views.py`; `applications/student_amendment_views.py` vs `applications/official_document_views.py`; `common/v2/demo_views.py` | Owner-object endpoints return an indistinguishable `404` for non-owned/cross-tenant ids per the design §5.2 owner disclosure policy; task 2.2 aligns them using the generated allow/deny case matrix. |

## Tenant Lifecycle And Catalog

| ID | Severity | Observed issue | Source evidence | Required outcome |
|---|---|---|---|---|
| TEN-01 | P0 | Tenant onboarding creates a global admin without an institution, misreads the response shape, can stop before membership creation, and stores the initial password in `localStorage`. | `TenantOnboardingWizard.tsx` | A resumable backend onboarding workflow creates an invitation and membership without exposing or persisting a password; compensation leaves no orphan authority. |
| TEN-02 | P0 | Program and intake onboarding steps are explanatory text, not mutations. The wizard cannot create all launch-readiness records, yet institutions start active. | tenant onboarding UI; readiness service | A tenant remains draft until branding, domain policy, document profile, offering, intake, fee, administrator, and routing checks pass; activation is an audited command. |
| TEN-03 | P0 | Admin program management still writes legacy tenant programs without a canonical program link; the ProgramIntake create API has no frontend consumer. | `pages/admin/Programs.tsx`; catalog legacy views; `admin_program_intake_views.py` | The only write path is canonical program -> tenant offering -> intake offering -> fee/requirements. |
| TEN-04 | P1 | Domain creation does not enqueue verification, no implementation completes pending review to verified, and declared disable/reactivate transitions differ from the API/UI. | catalog admin views; `DomainStatusMachine`; domain task | Domain state transitions, retries, approval, activation, disable, and reactivation have one executable state machine and job path. |
| TEN-05 | P1 | Staff, access-grant, program, intake, and application scope forms require users to paste raw UUIDs. | `TenantStaffPanel.tsx`; `TenantAccessGrantsPanel.tsx`; onboarding panels | Use tenant-scoped, server-backed searchable selectors with accessible labels and no cross-tenant result leakage. |
| TEN-06 | P1 | Profile, program, and domain request-change capabilities render explanatory text but have no durable workflow. | tenant admin console panels | Change requests have create, review, approve/reject, application, notification, and audit states. |
| TEN-07 | P1 | New-tenant smoke uses pre-existing linked catalog data, so it does not prove a clean tenant can launch. | active remediation task and onboarding smoke scripts | The smoke creates two new tenants and all their configuration from an empty fixture. |
| TEN-08 | P1 | Tenant communication template versioning conflicts with a global `template_key UNIQUE` constraint that tenant migrations leave intact. | `common/models.py`; `00_full_schema.sql`; tenant communication migration | Null-safe tenant/key/version uniqueness and one-active-version policy are enforced by SQL and service transactions. |
| TEN-09 | P1 | Product identity documents still describe MIHAS as the platform although steering makes Beanola the owner and schools tenants. | root `PRODUCT.md`; `shared/PLATFORM_CONTRACT.md` | Platform copy, defaults, metadata, and docs say Beanola; school identity appears only from tenant context or explicit fixtures. |
| TEN-10 | P0 | An explicit `?institution=` query can override a resolved white-label host tenant. | `catalog/services.py` institution context resolution; catalog views | A trusted tenant host wins. Mismatched explicit filters are masked or rejected; only the neutral shared portal may select a tenant explicitly. |

## Student Journey, Mobile, And De-AI

| ID | Severity | Observed issue | Source evidence | Required outcome |
|---|---|---|---|---|
| STU-01 | P0 | Draft assignment display fields can be updated while canonical institution, offering, program, and intake IDs remain read-only, creating a split identity. | `applications/serializers.py` draft fields and update | Assignment is immutable after create, or changed only by one transactional reroute command that updates all IDs and snapshots and blocks after payment. |
| STU-02 | P1 | Draft state is coordinated by several overlapping autosave and persistence owners with local/server timestamp arbitration. | `useAutoSave.ts`; `useSmartAutoSave.ts`; `useWizardDraftPersistence.ts`; `applicationSession.ts`; wizard controller | One tested draft state machine owns explicit new/resume intent, versioned autosave, offline outbox, conflict recovery, delete, and submit. |
| STU-03 | P1 | The wizard is extremely coupled and long, and mobile loses the desktop checklist/context. A floating draft manager and wizard footer compete with global bottom navigation. | wizard `index.tsx`; `useWizardController.ts`; progress and draft components; `AppLayout.tsx` | Decompose around the state machine and render one compact mobile flow with one bottom action surface and context available on every viewport. |
| STU-04 | P1 | Student dashboard metrics and repeated card/action systems obscure the next required action. Quick actions duplicate bottom navigation and destructive draft clearing appears beside normal actions. | student dashboard; `QuickActions`; status overview; application list | Dashboard orders actionable blockers first, removes duplicate navigation and risky shortcuts, and uses one restrained surface hierarchy. |
| STU-05 | P1 | Application document actions become a tall stack of equally prominent buttons on mobile. | `ApplicationListItem`; `DocumentButtons`; `ApplicationSlipActions` | Present status first, one primary action, and an accessible overflow/menu for secondary document commands. |
| STU-06 | P0 | Student preview and admin review make generative AI calls; document processing uses AI vision with OCR fallback and stores AI analysis in verification notes. | `student_submission_views.py`; `admin_amendment_views.py`; `documents/tasks.py`; `AISummaryPanel.tsx`; `SubmitStep.tsx` | Admissions decisions and summaries are deterministic. Uploaded documents are evidence, extracted values are suggestions requiring confirmation, and provenance is structured. |
| STU-07 | P1 | Frontend Tesseract packages and an OCR asset preparation step add build/runtime weight without a frontend runtime import. | admissions `package.json`; OCR preparation script; source import search | Remove unused browser OCR assets. Keep deterministic server extraction only if evidence shows it helps; manual entry always works. |
| STU-08 | P0 | Payment UI hardcodes a 1 percent transaction fee and an empty-state K150/USD20 fee. Backend fee resolution can fall back to K150 and display-name matching. | wizard `PaymentStep.tsx`; student `Payment.tsx`; `fee_resolver.py`; payment helpers | The backend returns an expiring fee quote from the canonical offering and residency. No client arithmetic, display-name lookup, or invented default is allowed. |
| STU-09 | P1 | Payment ownership is contradictory: the payment page is described as read-only while submitted/deferred/failed applications require a recovery path. Pending provider state is not clearly separated from user action. | steering; payment page; wizard payment step | Wizard owns pre-submission pay/defer; `/student/payment` owns post-submission recovery and history with explicit actionable, processing, paid, and terminal states. |
| STU-10 | P2 | Native `window.confirm` is used for draft deletion, leaving the wizard, tenant onboarding, and settings. Some support links and dark-mode utility classes are hardcoded. | student settings, wizard, draft manager, onboarding, payment UI | Use accessible product dialogs, tenant-context support data, light-only approved tokens, and 44 by 44 pixel targets. |
| STU-11 | P0 | The education UI adds selectable `fallback-*` subject IDs. Readiness counts them, persistence drops them because the backend requires UUIDs, and submission has no authoritative five-grade gate. | `educationCatalog.ts`; `useWizardGrades.ts`; `wizardReadiness.ts`; grade serializer and submission service | Seed canonical subjects, remove fake selectable IDs, and require at least five unique persisted canonical grades plus program eligibility in server readiness/submission. |
| STU-12 | P0 | Multi-draft create sends an empty payload despite required fields, rename sends an unsupported field, errors are suppressed, and several single-draft events call `clearAllDraftData`, erasing every draft/payment recovery cache. | `useMultiDraft.ts`; `DraftManager.tsx`; `draftManager.ts`; draft loader/controller/dashboard | Add a valid start-draft contract, choose a real draft name contract or remove rename, surface errors, and clear only the addressed application cache. |
| STU-13 | P0 | Tenant-configured required documents can be returned by assignment but the wizard only uploads two hardcoded document types. Requirement lookup errors fail open. | catalog assignment service/view; `EducationStep.tsx`; `useApplicationFileUploads.ts`; submission service | Snapshot/version dynamic requirements, render upload controls from the server contract, and fail with retryable 503 when requirements cannot be evaluated. |
| STU-14 | P1 | Notification settings fetch preferences but render static "Always on/Coming soon" tiles; frontend fields do not match the backend and communications are missing from mobile navigation. | `NotificationSettings.tsx`; notification services/types/model; route registry and layout | Define one preference schema, build persisted controls, reject unknown fields, and consolidate notification inbox/communication history in mobile navigation. |
| STU-15 | P1 | Enrollment deadline is absent from serializers; UI only offers confirmation for approved status although the backend can allow conditionally approved applications, and conditions are not rechecked under the enrollment lock. | application serializers/list item/status UI; `enrollment_service.py` | Return server enrollment readiness/deadline, show a countdown, and recheck every condition while holding the enrollment transaction lock. |
| STU-16 | P1 | Conditional offers are read-only for students: there is no condition-specific evidence, comment, replacement, rejection, or reminder workflow. | `ConditionsTimeline.tsx`; student/admin application views | Add condition evidence submission and review with per-condition state, replacement, rejection reason, reminders, and history. |
| STU-17 | P1 | Students can submit amendments but cannot list or track them, and duplicate pending field changes are not prevented. | `student_amendment_views.py`; frontend application service | Add owner-scoped amendment history/status and prevent concurrent pending changes for the same field. |
| STU-18 | P0 | Official-document task enqueue failures can still return 202 queued, leaving permanent polling. Existing documents are hidden after terminal status, generic email is missing, and student errors expose tenant setup instructions. | `official_document_views.py`; `useOfficialDocument.ts`; official document service/gates | Persist a durable job before 202 or return 503; separate issuance from reading historic artifacts; support email; show neutral student recovery and staff alerts. |
| STU-19 | P0 | Document storage and database updates are not compensated atomically, current/superseded versions are not enforced, and "Replace" may clear only local UI state. | document storage views/models; `useApplicationFileUploads.ts` | Use immutable versions, one constrained current row per application/type, storage compensation, and real replace/delete commands. |
| STU-20 | P1 | Profile settings use manual submit and `beforeunload` confirmation despite mandatory autosave; static metrics and duplicate notification tiles add noise. | `pages/student/Settings.tsx` | Use versioned per-section autosave/outbox/conflict behavior and remove misleading metrics/duplicate settings. |
| STU-21 | P1 | Password and duplicate-registration email links are hardcoded, one points to a nonexistent route, and accounts are created unverified without an implemented verification/resend flow despite verification copy. | password/auth views; accounts URLs; frontend route registry | Centralize tenant-aware URL generation and implement verification/resend/expiry or remove the untrue verification contract in a migration. |
| STU-22 | P0 | Public tracking can use guessable application numbers as credentials, is not reliably host-bound, and frontend share/fields do not match the backend response. | `public_views.py`; application-number helper; tracker hook/page/serializer | Require a random tracking secret or second factor, bind tenant hosts, rate-limit, align the contract, and share a URL that contains only the non-PII tracking token. |
| STU-23 | P1 | `ApplicationDetail` and `ApplicationStatus` are overlapping workspaces with different actions and duplicate payment, document, interview, and timeline logic. | the two student pages | Choose one canonical application workspace and redirect the other; compose it from one detail/readiness query. |
| STU-24 | P1 | Student pages and tracker bypass tenant context with hardcoded Beanola SEO, contact, and help values. | Payment, Interview, History, Notifications, Dashboard, tracker components | Resolve tenant-visible branding/support from trusted host context with neutral platform fallback. |

## Canonical Data, Concurrency, And Database

| ID | Severity | Observed issue | Source evidence | Required outcome |
|---|---|---|---|---|
| DATA-01 | P0 | A legacy application create path accepts institution/program/intake strings even though production evidence reports canonical IDs populated. | `admin_review_views.py`; canonical truth map evidence | New writes require canonical program and intake IDs; institution/offering and snapshots are derived server-side. |
| DATA-02 | P0 | Intake enforcement and waitlist ordering query by program/intake display strings, fail open on resolution failure, and can mix same-named tenants. | `intake_enforcer.py`; `waitlist_manager.py` | Key capacity and waitlist operations by offering and intake reference under tenant scope; fail closed for canonical rows. |
| DATA-03 | P0 | Submission locks the application but not the last-seat ProgramIntake counter, so concurrent submits can exceed capacity. | `applications/services.py` submission transaction | Lock the capacity row, check and increment atomically, constrain non-negative counters, and prove last-seat behavior concurrently. |
| DATA-04 | P0 | Required-document and offering validation catch configuration failures and permit submission. | `applications/services.py` validation helpers | Canonical configuration failures return stable recoverable codes and block submission; only optional integrations degrade. |
| DATA-05 | P0 | Fee lookup uses display names/codes and an invented default. | document fee resolver and payment helpers | Enforce one active fee per offering/type/residency and return `FEE_NOT_CONFIGURED`. |
| DATA-06 | P1 | ProgramIntake, access grant, document profile version, and waitlist invariants rely on check-then-insert code without complete DB constraints. | catalog admin views/serializers; schema | Add null-safe unique/check constraints and translate `IntegrityError` to deterministic 409 responses. |
| DATA-07 | P1 | Tenant foreign keys were added `NOT VALID` and no validation migration is present. | June 2026 tenant SQL scripts | Run orphan preflight/remediation and online `VALIDATE CONSTRAINT`; unvalidated tenant FKs block release. |
| DATA-08 | P0 | Static/live schema verifiers inventory old hand-maintained subsets and treat missing indexes as informational, while `00_full_schema.sql` lacks canonical columns. | `verify_schema_static.py`; `verify_migration.py`; `00_full_schema.sql` | Introspect and compare tables, columns, types, nullability, defaults, FKs, checks, indexes, and validation state; all unexpected drift fails. |
| DATA-09 | P1 | Migration history stops before June tenant migrations and progress docs contain conflicting completion claims. | `MIGRATION_HISTORY.md`; multi-tenant progress doc | Generate one migration/evidence record from each real database with checksums and application timestamps. |
| DATA-10 | P1 | Legacy ORM fields and reads/writes remain while a future column-deprecation runbook plans their removal. | `docs/runbooks/legacy-column-deprecation.md`; legacy helper fallbacks | Use expand/backfill/verify/contract with a legacy exception ledger; contract only after runtime reference and mismatch counts are zero. |
| DATA-11 | P0 | Payment truth remains split across deprecated application payment columns/statuses and nullable `Payment.application`, allowing orphan or contradictory records. | application and document payment models | Backfill/quarantine orphans, make canonical payment linkage mandatory, derive application payment summary from Payment, and remove legacy columns after observation gates. |

## API, Maintainability, And Release

| ID | Severity | Observed issue | Source evidence | Required outcome |
|---|---|---|---|---|
| API-01 | P1 | Error responses alternate between `error: string` and nested error objects; frontend parsing assumes a string and can display `[object Object]`. | API versioning doc; payment/application views; `services/client.ts` | One response/error serializer, one frontend parser, stable codes, request IDs, and contract tests for every endpoint family. |
| API-02 | P1 | Frontend services accept many incompatible list shapes and `unknown` payloads, hiding backend drift. The OpenAPI guard checks only a manual path subset. | `services/applications.ts`; payment normalizers; OpenAPI guard | Generate strict TypeScript contracts from current OpenAPI and remove compatibility normalizers after coordinated cutover. |
| API-03 | P0 | GET requests use a separate client branch that throws before the common 401 refresh and error pipeline. | `services/client.ts` | All methods share one refresh, timeout, retry, envelope, and error path; unsafe methods are never blindly retried. |
| API-04 | P1 | Frontend and backend expose duplicate legacy and official document paths. | `services/applications.ts`; `officialDocuments.ts`; application URLs | Official documents own generation, email, status, and download. Legacy endpoints are measured, deprecated, and removed after zero use. |
| MAINT-01 | P1 | Core frontend and backend files exceed 800 to 1,800 lines and mix orchestration, validation, persistence, and rendering. | wizard, applications, tenant onboarding, catalog service/view files | Add characterization tests, then split by bounded workflow without changing behavior or inventing generic abstractions. |
| MAINT-02 | P2 | Explanatory cards, marketing-style copy, decorative metrics, AI labels, and redundant feature descriptions add operational noise. | admin users/applications, student dashboard/wizard, AI panels | Keep task labels, status, decisions, errors, and legally necessary guidance; remove promotional and implementation narration. |
| REL-01 | P1 | Product version and API major can be conflated. Removing AI or legacy endpoints is breaking even when the URL remains `/api/v1/`. | package metadata; API versioning policy | Release product `2.0.0`; retain `/api/v1/` only through a documented compatibility window or introduce `/api/v2/` before breaking removal. |
| REL-02 | P1 | The backend declares a setuptools project, but editable/project builds fail because multiple top-level packages are discovered without explicit package configuration. | `backend/pyproject.toml`; `uv run` build output | Either configure the intended `apps`/`config` package discovery and exclude non-packages, or explicitly make the backend a non-installable application; the chosen release command must work reproducibly. |

## Audit Boundary

These are all issues found in the current source audit, not a claim that unknown
defects cannot exist. Task 1 keeps this register open until route inventory,
schema introspection, two-tenant test generation, visual QA, and production
read-only evidence have completed. Any new reproducible defect receives an ID,
severity, owner requirement, regression test, and closure evidence before V2 can
ship.


## Baseline Snapshot (Task 0.5)

The immutable pre-change baseline for this spec was captured at commit
`bae29a28d9657f288b3339062adb31285959c966`. It was first captured 2026-07-13 and
**re-captured 2026-07-15** at the same commit after the working tree evolved
(tasks 1.2–1.5 landed additional in-flight work); the 2026-07-15 numbers are the
current honest state and the manifest retains the capture history. The full run
(backend/frontend suites, OpenAPI generation, bundle/design audit, accessibility
smoke, browser suite enumeration, route inventory, read-only Neon database
invariants, and schema manifests) and the recorded current failures/skips live
at:

- Manifest: `docs/v2-evidence/0.5/manifest.json`
- Baseline findings (IDs `BL-0.5-01`..`BL-0.5-11`): `docs/v2-evidence/0.5/baseline-findings.md`
- Raw reports: `docs/v2-evidence/0.5/raw/`

Current (2026-07-15) headline numbers: backend pytest **14 failed / 3565 passed /
138 skipped** (SQLite fast suite); admissions vitest **3 real failures + 5
harness collection-error files / 3495 passed**; admissions lint **24 errors** (new
R14.3 architecture rule); OpenAPI **2.0.0 / 147 paths** with 20 non-fatal errors
from the new V2 demo views; route inventory **185 routes, zero unclassified**;
Neon read-only invariants unchanged. All backend/vitest failures and lint errors
originate in in-flight V2 work (tasks 0.4/1.3/1.4/1.5/1.6), not shipped-product
regressions.

Baseline findings that reinforce existing register entries: `BL-0.5-08`
(Neon authoring DB has all 33 applications with NULL canonical assignment IDs,
missing `canonical_program_id`/`intake_offering_id` columns, empty
`canonical_programs`, zero active memberships) feeds DATA-01/02/07/11 and STU-01;
`BL-0.5-01`..`BL-0.5-04` and `BL-0.5-10` reinforce GOV-04; `BL-0.5-05`/`BL-0.5-07`
reinforce GOV-05. No skipped or unverified work was relabeled as complete.

## Phase 13 Verification Findings (Task 13.6 Remediation, Item L9)

Registered **2026-08-14** by task 13.6's remediation batch **L9-L11**
(`docs/v2-evidence/13.6/remediation/L9-L11/README.md`), closing **GATE-13.6-02**.

### Why this section exists

Phase 13's five verification bullets went and looked at the product, and filed
**39** findings against their own lanes. Task 13.6 §4 then measured that **not one
of them was in this register**:

```
Distinct GATE findings mentioned across Phase 13 evidence: 34
GATE findings present in `findings.md`:                     0
```

That is a governance defect in its own right, not merely untidy bookkeeping. R1.3
rule 3 — *"a finding has no owner requirement"* — is **structurally unable to
fire** for a finding that was never registered, so the validator's "71 findings,
0 unowned" was a true statement measured against a register that did not know
these existed. 13.6 filed it as **GATE-13.6-02** and deliberately did not fix it
itself, on the grounds that editing the register should happen once, on purpose,
with the owning requirement chosen — not as a side effect of a closure audit.
This section is that edit.

### How to read these rows

- **Severity is the filing task's own word** (`high` / `med` / `low`), carried
  verbatim from that task's evidence table. It is **not** translated into this
  register's `P0` / `P1` / `P2` scale, because the two scales have different
  definitions and re-adjudicating another task's classification is outside this
  item's standing (13.6 §10 item 7 took the same position). One consequence
  matters and is easy to get wrong: **release-gate clause (i) is stated over
  P0/P1**, so a `high` here is not automatically a P0 for that clause. Clause (i)
  is argued through the *register* findings each of these contradicts — which are
  already P0/P1 and are listed in 13.6 §3.2.
- **Every `GATE-13.x-nn` finding was filed by task 13.x**, and its original
  measurement is in `docs/v2-evidence/13.x/README.md`. The **State** column
  therefore names the evidence for the finding's *current* state — for a fixed
  finding, where the fix was measured — rather than repeating the filing link on
  every row.
- **`Owner requirement(s)`** is the requirement this register holds accountable
  for the finding. See the note after the tables about what that does and does not
  do mechanically.
- **A `fixed` state whose evidence is a rehearsal is not a production fix.**
  Several rows below — GATE-13.5-01, GATE-13.4-02, GATE-13.6-03 (all L2-L3) and
  GATE-13.4-01 (L7) — were measured on **`v2_snap_13_6`**, a restored copy of the
  production lineage. Each is additive, idempotent and rollback-paired, and none
  has been applied to the real database: that is an operator step, backup-first.
  Read those `fixed` cells as *"the fix exists and is proven on a copy"*. The
  subsection *Register findings whose Phase 13 contradiction is now cleared* states
  which register findings this does and does not close.

### 13.1 — instruments and evidence integrity

| ID | Severity | Observed issue | Owner requirement(s) | Owning lane | State |
|---|---|---|---|---|---|
| GATE-13.1-01 | med | Nine tenant foreign keys are permanently `NOT VALID`: three tables got the expand half of expand/validate and never the validate half. | R15 (R15.4) | tenant lane (4.4 / 5.1) | **fixed** — `docs/v2-evidence/13.4/README.md` §5 |
| GATE-13.1-02 | high | 86 tests had not run since task 9.4. Eight of nine modules patch `document_views.AccessScopeService`, a target 9.4 removed, so `mock.patch` raised at fixture setup and every case in those files errored instead of running. | R1 (GOV-04), R18 (R18.3) | admin-query / scope lane (9.4) | **fixed** — `docs/v2-evidence/13.6/README.md` §5. Closed as a *measurement hole*: it uncovered 36 genuine failures, which `docs/v2-evidence/13.6/remediation/L1-L4/README.md` §3 then fixed (91 passed / 0 failed) |
| GATE-13.1-03 | med | The committed OpenAPI contract is Postgres-only, and `scripts/generate-api-types.sh` defaults `DATABASE_URL` to SQLite while writing over it. | R14, R1 (GOV-05) | API-contract lane (1.2 / 1.5) | **open** |
| GATE-13.1-04 | med | The concurrent reviewer test reported **8** assignments against a local workload cap of **3** because it compared a global sweep result with the test's local population. | R8, R17 (R17.1) | reviewer-assignment lane (9.5) | **fixed as an instrument defect** — the cap invariant is scoped to the test applications while the service report is reconciled to the global before/after delta. The PostgreSQL concurrency pair passes and proves the reviewer never exceeds the cap or crosses tenant eligibility. See the id-collision note below. |
| GATE-13.1-05 | low | Three registries drifted behind their code: `EXPECTED_TABLES` missing 6 tables, the migration-history release report omitting August scripts, `ERROR_CODES` missing codes used in views. | R15 (R15.2, R15.8), R14 | data (3.x) / release (1.7) / API (10.4) | **fixed** — remediation M3 registered the six tables and ten error codes (`.../M3/README.md` §5); M4 regenerated the release migration report from a fresh Postgres build with 46 applied migrations and zero omitted June-2026+ scripts (`.../M4-M5-M6/README.md` §1). |
| GATE-13.1-06 | low | `2026_07_16_02_canonical_assignment_backfill_rollback.sql` is not inverse-additive against the rollback contract. | R15 (R15.1) | data-migration lane (3.4 / 13.4) | **fixed** — `docs/v2-evidence/13.4/README.md` §6.1. The script was wrong, not the requirement |
| GATE-13.1-07 | med | ~~Three~~ **four** instruments write into `docs/v2-evidence/**`, so ~~five~~ **seven** earlier tasks' Required_Evidence artifacts are not immutable. **Count restated upward** — see the corrections note below. | R1 (GOV-04), R18 (R18.5) | harness lane (0.4) owns three mechanisms (incl. `harness/bin/harness`); 2.2 owns the fourth | **fixed** — `.../L7-L8-L12/README.md` §5. **4 of 4** mechanisms closed. Three defaulted harness runs and two defaulted whole-tree pytest runs left `0.4/playwright-report.json` (`85799ced60e970fe…`), `2.2/authority-conformance-summary.json` (`db5f2873c2049152…`), `11.1`–`11.5/screenshots/` (7/10/10/16/20) and `13.3/` (296 files) **byte-identical**, while the runs' own 53 + 1 artifacts landed run-scoped. Deliberate regeneration is one env var (`V2_EVIDENCE_TASK_DIRS=1`); a 39-case cross-language guard fails on a restored hard-coded literal. Narrowed first by `.../L5-L6/README.md` §8.4 |
| GATE-13.1-08 | med | Two Neon `migration_history` rows carry a **12-character truncated** checksum where the repo's own runner writes a full sha256 (`schema_cleanup_device_session_default.sql`, `schema_cleanup_drop_stale_columns.sql`), so those two scripts can never match. | R15 (R15.1, R15.8) | data lane | **open — accepted with reasoning**: `docs/v2-evidence/13.5/README.md` §4 accepts it as unfixable by re-running anything and permanently non-clean on 13.4 gate 10, to be carried as a named exception on the sign-off rather than as a failure |

**The GATE-13.1-04 id collision, recorded rather than silently resolved.** Task
13.1's own findings table gives `GATE-13.1-04` to the reviewer auto-assign
concurrency breach. Task 13.1 §5 separately recorded the two truncated checksums
with the words *"Recorded; the data lane's"* and **no id**. Tasks 13.4 §9.2, 13.5
§4 and 13.6 §4.1 then referred to the checksum item **as `GATE-13.1-04`** — so one
id carries two different defects across the Phase 13 evidence. Registering both
under one id would make the register unable to state either state. The checksum
item is therefore registered here as **GATE-13.1-08**: it is 13.1's finding, filed
in 13.1's own §5, which simply never numbered it, so the next free number in 13.1's
namespace is the truthful home for it. The downstream references in 13.4, 13.5 and
13.6 are **not** edited — those are other tasks' evidence directories, which this
item may not write to — so a reader following `GATE-13.1-04` from any of those three
documents lands on the concurrency row and needs this paragraph.

### 13.2 — tenant isolation and capacity under two tenants

| ID | Severity | Observed issue | Owner requirement(s) | Owning lane | State |
|---|---|---|---|---|---|
| GATE-13.2-01 | high | The staff application read publishes the **other tenant's** intake capacity, because it resolves the intake by display **name** (`student_draft_views.py:185` + 4 siblings). | R7 (DATA-01), R15, R10 (STU-01) | admin-query lane | **fixed** — `.../L1-L4/README.md` §2. Five sites resolve by canonical id and fail closed when it is absent; a 7-test two-tenant reproduction is green |
| GATE-13.2-02 | med | `CapacityService.SEAT_STATUSES` omitted `enrolled`, so its own `reconcile()` would hand an enrolled student's seat back. | R7 (R7.x capacity) | capacity lane (5.3 / 9.x) | **fixed** — `enrolled` is now an occupancy state, matching confirmation's deliberate no-op on the already-claimed counter; canonical capacity and enrollment-readiness tests prove reconciliation retains that seat. |
| GATE-13.2-03 | med | A stale tab's reload **reverted** another device's newer write to the same draft — intermittent, 2 of 3 recordings. | R10 (STU-02) | wizard lane (`useAutoSave`) | **fixed — M9** replaces the unversioned student write with a canonical `Idempotency-Key` + `expected_version` command under a PostgreSQL row lock, carries the returned version in the client, terminalizes `VERSION_CONFLICT`, and exposes an explicit reload action. The six-case PostgreSQL integration contract passes, including exactly one winner for two same-version commands. The exact stale, dirty wizard regression then passed three independent Playwright runs on a freshly rebuilt harness: device 1 won through **Save now**, its exact stable-key request replayed the original response, device 2's stale **Save now** surfaced terminal `409 VERSION_CONFLICT`, **Reload latest draft** hydrated the winning answer, and the stale value neither returned nor forked the draft. |

### 13.3 — mobile, accessibility and layout, measured in a real browser

| ID | Severity | Observed issue | Owner requirement(s) | Owning lane | State |
|---|---|---|---|---|---|
| GATE-13.3-01 | high | The authenticated mobile header trio measures 40 × 40 on **every** authenticated route. | R16 (R16.2) | shell — `navigation/AppLayout.tsx` | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-02 | high | The mobile wizard step indicator is squeezed to 18–20 px wide at the 320 px design width. | R16 (R16.1, R16.2) | wizard — `EnhancedProgressIndicator.tsx` | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-03 | high | The shared `Switch`'s 44 px wrapper is an inert `div`; the control that receives the tap measures 44 × 24. | R16 (R16.2) | design system — `ui/switch.tsx` | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-04 | med | `ErrorDisplay`'s support/back links measure 126.797 × 20 — on **every** error state in the product. | R16 (R16.2) | design system — `ui/ErrorDisplay.tsx` | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-05 | med | The desktop sidebar collapse control measures 36 × 36 on 7 of 8 surfaces at ≥ 768 px. | R16 (R16.2) | shell — `navigation/DesktopSidebar.tsx` | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-06 | low | The wizard's floating keyboard-shortcuts button measures 40 × 44 at ≥ 1280 px. | R16 (R16.2) | wizard — `KeyboardShortcutsHelp.tsx` | **fixed** — `.../L5-L6/README.md` §2 |
| GATE-13.3-07 | med | Dashboard first paint shifts over the CLS budget at two widths, reproducibly: 0.116 @ 375 and 0.105 @ 390 against a 0.100 budget. | R16 (R16.7), R17 (R17.6) | dashboard (11.1) | **fixed** — `.../L5-L6/README.md` §3 (0.0406 / 0.0357) |
| GATE-13.3-08 | med | Heading order on the dashboard, status and payment surfaces: a heading precedes the `h1`, and levels skip (`h2→h1`, `h2→h4`, `h1→h3`). | R16 (R16.2) | dashboard + shell | **fixed** — `.../L5-L6/README.md` §4.1 |
| GATE-13.3-09 | high | The canonical `/student/status` route tells a student who owns **2** applications that none exists. | R13 (R13.1, R13.13), R16 | student workspace | **fixed** — `.../L5-L6/README.md` §1. Register finding **STU-23** is no longer contradicted |
| GATE-13.3-10 | high | Going offline while the wizard is mounted shows the student a raw JavaScript `TypeError`, and the wizard is gone. | R16 (R16.8) | wizard / shell | **fixed** — `.../L5-L6/README.md` §6.1, with a named residual: a route whose lazy chunk cannot be fetched cannot be kept mounted without a service worker the platform deliberately does not ship |
| GATE-13.3-11 | high | At 320 px — R16.1's own design width — the four bottom-navigation links have **no accessible name**. | R16 (R16.1, R16.2) | shell — `ui/BottomNavigation.tsx` | **fixed** — `.../L5-L6/README.md` §2, §8.3 (axe `link-name` 16 nodes → 0) |
| GATE-13.3-12 | med | Colour contrast below AA on the wizard's Education step and the bottom-nav labels — 9 axe rows, one of them white on near-white. | R16 (R16.2, R16.4) | wizard + shell | **fixed** — `.../L5-L6/README.md` §4.2 (24 nodes → 0) |
| GATE-13.3-13 | high | A *legally-named* long intake makes **every** student application create fail with an unhandled `DataError` → HTTP 500. | R15 (R15.2, R15.3), R10 | applications / data lane | **open — one half fixed.** The production-lineage half (`varchar(50)` → the model's widths) is closed by `.../L2-L3/README.md` §3. This row's own 113-character input still 500s against `Application.intake`'s `max_length=100`, re-measured in `.../L5-L6/README.md` §7. Closing it needs a model change **plus** a matching widen |
| GATE-13.3-14 | med | The font fallback chain is fixed in the config and still **reduced in the browser** — 3 families rendered of 11 declared. | R16 (R16.4) | design system — `index.css` | **fixed** — `.../L5-L6/README.md` §4.3 (11 of 11 in the browser) |
| GATE-13.3-15 | med | The amendment form's own field controls measure 37–38 px tall, at ≥ 768 px only, because the platform's 44 px form floor is scoped to `max-width: 639px`. | R16 (R16.2) | student workspace — `AmendmentForm.tsx` | **fixed** — `.../L5-L6/README.md` §4.4 |
| GATE-13.3-16 | high | The fixed bottom navigation **overlaps the dashboard's primary next action** in the first mobile viewport — 18.2 px of 68 px = 26.7 % covered, 30.2 % on Pixel 5. Found by reviewing a screenshot, not by an assertion. | R16 (R16.3, R16.5, R16.7) | dashboard or shell | **fixed** — `.../L5-L6/README.md` §5 (0 %, 44–47 px clear, both profiles) |

### 13.4 — migration and rollback rehearsal on a restored production-lineage snapshot

| ID | Severity | Observed issue | Owner requirement(s) | Owning lane | State |
|---|---|---|---|---|---|
| GATE-13.4-01 | high | A **migration script** seeds the platform-wide communication fallback with a **legacy tenant's brand**: the rows are `institution_id IS NULL` *and* MIHAS-branded, and the rehearsal watched one reach a real queued email. **The count is ~~19~~ 31, restated upward** — 19 come from the seed script; **12 more exist only on the production lineage and are produced by no script in this repository**. See the corrections note below. | R2 (TEN-09), R5 (templates) | communication / tenancy lane | **fixed on the rehearsal lineage** — `.../L7-L8-L12/README.md` §1–§4. 13.4 `invariants.sql` **gate 19 PASSES** on `v2_snap_13_6` (33 templates / 33 platform fallbacks / **0** legacy-branded, was 33/33/**31**); an end-to-end render probe over 33 template keys and 8 `render_message` types carries a legacy brand **0** times where the reproduced pre-L7 text carries it **81** times across 31 keys; idempotent, boot-gate-clean, R9.2-paired. **Not applied to production** — that is operator step O9's sibling, backup-first. The 12 rows of unknown origin have no explained source; gate 19 catches recurrences |
| GATE-13.4-02 | high | A restore-from-backup of the production lineage **cannot be brought forward**: the boot gate refuses it and `apply_sql_migrations` dies at `2026_06_08_01`, which is the RUNBOOK's own prescribed remedy. | R15 (R15.1, R15.7) | data-migration lane | **fixed** — `.../L2-L3/README.md` §1–2. Preflight gate 22 reads PASS, the sweep completes 24/24, the second run is a clean no-op, the boot gate exits 0 under `--strict`. It was **two** defects; the second is GATE-13.6-03 |
| GATE-13.4-03 | med | `deploy/RUNBOOK.md` §3a pins `postgres:16-alpine` to dump a **PG17** server, so the runbook's first command cannot succeed as written. | R18 (R18.5, R18.7) | deploy / runbook lane | **fixed** — `docs/v2-evidence/13.5/README.md` §1 |

### 13.5 — read-only production-lineage pre-flight

| ID | Severity | Observed issue | Owner requirement(s) | Owning lane | State |
|---|---|---|---|---|---|
| GATE-13.5-01 | high | Three production-lineage columns are **narrower than the model declares** — `applications.institution/intake/program` all `varchar(50)` against `varchar(255)`/`varchar(100)` — and `check_schema_drift` documents this entire class as out of scope, so the boot gate passes. `institutions.name` was already **46 of 50**. | R15 (R15.2, R15.3) | data-migration + applications lanes | **fixed** — `.../L2-L3/README.md` §3. Width probe 3 narrower → 0; the long-value reproduction 4 failing writes → 0, including the ORM's own `create` |
| GATE-13.5-02 | high | **GATE-13.2-01 is LIVE on the production lineage**, not dormant: 3 intake names are shared across the 2 active institutions. 13.2 had to *build* that collision in the harness; production already had it. | R7 (DATA-01), R15, R10 (STU-01) | admin-query lane | **fixed** — `.../L1-L4/README.md` §2. Preflight gate 21's *data* half (3 shared names) is untouched and is the tenancy lane's |
| GATE-13.5-03 | high | **A host-scoped canary tenant is not servable by this stack.** Caddy has three fixed site blocks, no wildcard and no on-demand TLS, the Caddyfile is baked into the frontend image, and the production lineage has **zero** `institution_domains` rows. | R5 (domains), R18 (R18.7) | deploy / edge lane + tenancy lane | **open — accepted with reasoning**: `docs/v2-evidence/13.5/README.md` §4 redefines the canary as **tenant activation** rather than a host, and keeps the finding because R17's wording implies a capability the stack does not have |
| GATE-13.5-04 | med | **Two tenants are simultaneously exposed** on the production lineage — MIHAS and KATC each have 2 offerings with 2 open intakes — so "one canary tenant" requires a catalogue write to close the other's intakes. | R18 (R18.7) | operations (a decision, not a code defect) | **open — operator step O2** (13.6 §8.2) |
| GATE-13.5-05 | med | The shipped bundle's CSP pins `connect-src https://api.beanola.com` **literally**, while `deploy/RUNBOOK.md` cuts DNS to `api.mihas.edu.zm` (15 refs, 0 to beanola) and `scripts/smoke-production.sh` defaults to it. One of those documents is wrong about production's identity. | R2 (R2.x identity), R18 (R18.7) | deploy / runbook lane | **open — operator step O1, first to resolve.** Until it is settled every HTTP check in the post-deploy proof aims at a possibly-wrong host |

### 13.6 — the closure audit's own findings, and the remediation's

| ID | Severity | Observed issue | Owner requirement(s) | Owning lane | State |
|---|---|---|---|---|---|
| GATE-13.6-01 | med | 4 of 7 legacy registers carry no per-entry owner and 6 of 7 no removal date, while task 12.5's bullet requires *"a registered Legacy_Exception with owner/removal date"* — and task 12.5 is `[x]`. | R1 (R1.3), R15 (R15.6) | admissions-v2 for the registers it owns; `beanola-production-readiness` / `multi-tenant-beanola` / system-alignment-audit for two others | **fixed** — L9-L11 §4 dated the three admissions-v2 registers (`LEGACY_EXCEPTIONS`, `PREVIEW_ALLOWLIST`, `SHIMS`) on the `2027-02-07` window. Task 12.5 pass 2 (2026-10-09, `docs/v2-evidence/12.5/README.md` §13) then closed the two the finding left to other specs **under the user's authorization, recorded on their behalf**: `_ALLOWED_PREDICATES` (11) now carries `owner=multi-tenant-beanola` (backed by `_OWNER_PROVENANCE`) and `legacy-brand-allowlist` (19) splits per entry into dated Legacy_Exceptions (`owner`+`removeBy`) and permanent-by-design entries (`owner`+`reviewBucket`+`permanentBecause`). Every date is **read from** `compatibility_register.COMPATIBILITY_SURFACES['catalog.legacy_institution_write'].end_date` (one window, one source), and each register's guard **evaluates** owner+window — fails on drift and once the window closes — replacing the invented owner and hardcoded date M11 Q12 flagged. The register audit (`v1_surface_telemetry.py` HALF 5b) reports all 7 registers `own=yes` and `gaps: none`; the only undated register is `module-size-report.DECLINED_REMOVALS`, which stays undated **by design** (a *declined removal* is a decision not to delete; a removal date would assert the opposite — the same treatment the finding itself carved out). Guards green in both stacks (backend 30 passed, frontend 14 passed). |
| GATE-13.6-02 | med | All Phase 13 GATE findings were absent from `findings.md`, so R1.3 rule 3 was structurally unable to fire for any of them. | R1 (R1.3) | admissions-v2 governance (this spec) | **fixed** — all 39 are registered here and remediation M6 made the validator parse and verify their requirement ownership; 110 findings are now checked with 0 unowned. |
| GATE-13.6-03 | high | GATE-13.4-02's **second layer**, and a class rather than an instance: any migration file that writes rows and then indexes or alters the same table cannot apply on a database carrying `DEFERRABLE INITIALLY DEFERRED` foreign keys while the runner wraps a whole file in one transaction. Invisible to any read-only probe and invisible to a fresh-build rehearsal — it exists only on the restored-backup lineage, while a transaction is open. | R15 (R15.1) | data-migration lane | **fixed** — `.../L2-L3/README.md` §1.4, in the runner (`_set_constraints_immediate`), not in the SQL, with a 3-case regression test proven to discriminate |
| GATE-13.6-04 | med | Task 0.2's validator recognised a finding id only as `[A-Z]{2,6}-\d+` (`_FINDING_ROW_RE` / `_FINDING_ID_RE`), so the dotted `GATE-13.x-nn` ids registered above were not parsed as finding definitions and R1.3 rule 3 could not fire over them. | R1 (R1.3) | admissions-v2 governance (this spec) | **fixed** — remediation M6 widened the grammar and assigned all 39 dotted findings to their matching requirements in one coordinated change. The validator now parses **110** findings, reports **0 unowned**, exits 0, and all **24** self-tests pass. Evidence: `docs/v2-evidence/13.6/remediation/M4-M5-M6/README.md` §3. |

### Register findings whose Phase 13 contradiction is now cleared

Added **2026-08-14** by task 13.6's **second closure pass** (O10),
`docs/v2-evidence/13.6/README.md` Part II. The rows above changed state; the
register findings they contradicted did not automatically follow, so this is where
the difference is stated.

Task 13.6 §3.2 recorded a set of **register** findings whose owning tasks are all
`[x]` while a Phase 13 measurement said the behaviour was still broken. Those
contradictions are what keep release-gate clause **(i)** failing, because clause (i)
is stated over **P0/P1**, and the GATE rows are only the evidence. This table
records which of them are now clear — and it keeps *contradiction cleared* and
*finding closed* apart, because for three of them the fix is rehearsed on
`v2_snap_13_6` and **has not been applied to production**.

| register finding | sev | contradicted by | contradiction | closed? |
|---|---|---|---|---|
| **DATA-01** / **STU-01** | **P0** | GATE-13.2-01, GATE-13.5-02 | **cleared** — five reads resolve the intake/offering by canonical id and fail closed when it is absent; a 7-test two-tenant reproduction is green (`.../L1-L4/README.md` §2) | yes for this limb. The *data* half of 13.5 preflight gate 21 — 3 intake names still shared across the 2 active institutions on the production lineage — is untouched and is the tenancy lane's |
| **STU-13** | **P0** | GATE-13.3-13, GATE-13.5-01 | **partly cleared** — the production-lineage half (`varchar(50)` → the model's widths) is fixed and rehearsed (`.../L2-L3/README.md` §3). GATE-13.3-13's own 113-character input **still 500s** against `Application.intake`'s `max_length=100` | **no.** Needs a model change plus a matching widen — and the widen is **rehearsed on `v2_snap_13_6`, not applied to production** |
| **STU-23** | P1 | GATE-13.3-09 | **cleared** — `/student/status` now shows a student who owns 2 applications both of them (`.../L5-L6/README.md` §1) | yes |
| **STU-03 / STU-04 / STU-05 / STU-10 / STU-24** | P1/P2 | GATE-13.3-01…-08, -10…-12, -14…-16 | **cleared** — smallest target at 320 px 18×24 → **44×44**, sub-44 offenders 214 → **0**, axe `link-name` 16 nodes → 0 and contrast 24 nodes → 0, CLS 0.116/0.105 → 0.041/0.036, occlusion 26.7 % → **0 %**, font families 3 → 11, offline copy replaces a raw `TypeError` (`.../L5-L6/README.md` §1–§6) | yes for the 14 findings measured; GATE-13.3-13 is the 15th and is above |
| **TEN-09** | P1 | GATE-13.4-01 | **cleared** — the platform-wide communication fallback is brand-neutral; a fallback-rendered email carries a legacy brand **0** times where the reproduced pre-L7 text carries it **81** times across 31 keys, and 13.4 gate 19 reads PASS on `v2_snap_13_6` (`.../L7-L8-L12/README.md` §1–§4) | **not yet.** *Contradiction cleared* ≠ *finding closed*: the fix is a migration **rehearsed on `v2_snap_13_6` and not applied to production**, and 12 of the 31 branded rows exist only on the production lineage |
| **GOV-04** | **P0** | GATE-13.1-02, GATE-13.1-07 | **backend/immutability limbs cleared** — 4 of 4 mechanisms that wrote into `docs/v2-evidence/**` are closed, the guarded artifacts survive defaulted runs byte-identical (`.../L7-L8-L12/README.md` §5), the 86 absent tests and the 36 they uncovered are restored (`.../L1-L4/README.md` §3), and M9's local PostgreSQL whole tree is green at **5,425 passed / 0 failed / 0 errors** | **no.** M9 proved the scoped F1/F2/F3 regressions, but did not re-run every complete required Playwright project with zero skips. GOV-04 remains open on that unmeasured browser-gate limb; the historical 94-failure snapshot below is superseded, not erased |
| **DATA-10** / **DATA-11** | P1/**P0** | 12.3's own registered exception | **unchanged** — the legacy-column *contraction* is still blocked behind 16 unbacked money rows, exit criterion `unbacked_money_rows = 0` | no |

**The distinction this table exists to keep.** A schema or data fix **rehearsed on
`v2_snap_13_6` is not applied to production.** L2 (the three widened columns), L3
(the migration-runner fix and the `gen_random_uuid()` default) and L7 (the
brand-neutral fallback) are all in that state: proven on a restored copy of the
production lineage, additive, idempotent, rollback-paired — and **not yet run
against the real database.** Until an operator runs them backup-first, the
production behaviour those three findings describe is unchanged.

### Corrections — two counts restated upward

Both come from a remediation lane re-measuring from the filing task's **raw
artifact** rather than from the finding's headline sentence, and both make the
defect **larger** than the register said:

| finding | register said | measured | where |
|---|---|---|---|
| **GATE-13.4-01** | *"all **19** rows are `institution_id IS NULL` and MIHAS-branded"* | **31** branded rows. 19 come from the seed script; **12 exist only on the production lineage and are produced by no script in this repository** | `.../L7-L8-L12/README.md` §1.1, §9.2 |
| **GATE-13.1-07** | *"**three** instruments write into `docs/v2-evidence/**`, so **five** earlier tasks' artifacts are not immutable"* | **four** mechanisms, and **seven** victims. The fourth is **`harness/bin/harness` itself** — the runner script the catalogued config lives inside, latent only because nobody had typed `harness smoke` since the task that wrote it. The sixth and seventh victims are `13.3/` and 0.4's three extra files | `.../L7-L8-L12/README.md` §5.2, §9.2 |

**No Phase 13 README was edited to accommodate either restatement.** `13.1/` and
`13.4/` are other tasks' Required_Evidence and are immutable under **R2.7**; both
tasks measured correctly and recorded their raw output, which is the only reason
the true numbers were recoverable at all. A reader who follows the headline number
from either README lands on 19 or 3, and this note is what tells them why the
register says 31 and 4.

### Judged as notes, not findings

Three items the remediation batches recorded were considered for registration and
**deliberately not registered**, with the basis stated so the decision is
reviewable rather than silent:

| item | filed in | judged | basis |
|---|---|---|---|
| **The stuck-skeleton failure mode** — a silent boundary over a lazily-loaded global leaves the route a permanent skeleton with no recovery control | `.../L5-L6/README.md` §6.1 | **note** | It **does not exist in the shipped tree**. It was produced by an experiment that was then rolled back, precisely because the measurement showed it was worse. A finding is a defect in the product with a closure criterion; a register row describing code that does not exist would sit permanently "open" with nothing to close. It is a hazard note for whoever next tries to isolate a lazy global — shell lane |
| **The `evidenceRoot()` instrument slip** — the first re-run wrote a 20 MB `apps/docs/v2-evidence/...` tree in the wrong place | `.../L5-L6/README.md` §8.4 | **note** | An instrument defect found and corrected **within its own batch**, with no residual in the tree (`apps/docs/` was removed). This is the same handling 13.3 §9 and 13.6 `raw/residual-items.txt` gave their own instrument corrections. Its *class* — an instrument writing into `docs/v2-evidence/**` — is already registered as **GATE-13.1-07** |
| **Two undiagnosed `test_production_readiness_metrics.py` failures** | `.../L1-L4/README.md` §4 | **note** | Undiagnosed test failures in another lane's file, inside the whole-tree failure count other lanes already own (`.../L2-L3/README.md` §7 item 5). No cause was determined and no reproduction was analysed, so there is nothing to state as a finding beyond "these two fail". Registering each whole-tree failure individually would turn this register into a test report |

By contrast, the L2-L3 batch's own filing **was** registered, as
**GATE-13.6-03**: it is a reproducible defect in shipped code (the migration
runner), it has a named mechanism, a fix, and a regression test that fails without
the fix — every property the three notes above lack.

### What registration does and does not do mechanically

Historical note: this was the gap filed as **GATE-13.6-04**. Remediation M6 has
since closed it:

- **What is now true.** Every Phase 13 GATE finding is in this register with an
  owner requirement of record, a severity, an owning lane and a state. A reader —
  or an auditor — asking "is this finding known, owned, and open?" gets an answer
  from the register itself. That is what GATE-13.6-02 asked for.
- **What is now mechanically true.** `scripts/validate_spec_governance.py`
  recognises both plain and dotted finding ids. `finding_count` is **110** (71
  plain + 39 dotted), and rule 3 confirms that all 110 have requirement owners.
- **How it was closed safely.** M6 first demonstrated that widening the grammar
  alone produced 39 unowned-finding errors, then made the coordinated
  `requirements.md` ownership edit. It retained every immutable finding id and
  added regression tests against truncation and vacuous success.
