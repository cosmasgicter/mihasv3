# Implementation Plan: Admissions V2 Canonical Rebuild

## Execution Rules

- Work in the numbered dependency order unless a task explicitly says it can run
  in parallel.
- Each vertical slice starts with `source-code-context`, a failing behavior test,
  and database/API impact analysis.
- Do not check a task because code exists. Link its Required_Evidence under
  `docs/v2-evidence/<task-id>/` and record the candidate commit and schema hash.
- A required test may not be skipped or gated by a staging credential.
- Schema changes follow Neon branch first, then production self-hosted Postgres.
- Keep user changes and unrelated specs intact. Delete legacy code only at the
  named exit gate.
- After behavior works, run code-structure cleanup, grep-loop review,
  Impeccable audit/harden/polish, responsive checks, and the affected E2E slice.

## Phase 0: Make Scope And Evidence Honest

- [x] 0.1 Register this spec as the active admissions V2 authority
  - Update `docs/canonical-truth-map.md` to point at this spec and describe the
    admissions-only supersession boundary.
  - Keep older specs available as historical inputs; do not mark them complete
    or archive them solely because this spec exists.
  - Correct duplicate live spec IDs and add a metadata validator.
  - _Requirements: R1_
  - _Findings: GOV-01, GOV-02, GOV-03_
  - _Evidence: spec validator output and reviewed canonical truth map diff_

- [x] 0.2 Build the V2 finding/requirement/task/evidence validator
  - Parse Kiro config, requirements, tasks, finding IDs, checkbox state, and
    evidence links.
  - Fail unowned findings, unreferenced requirements, missing evidence, duplicate
    IDs, and false completed status.
  - Add it to CI without modifying unrelated user-owned workflow changes until
    they are reconciled.
  - _Requirements: R1.2-R1.5_
  - _Findings: GOV-02, GOV-03, GOV-05_
  - _Evidence: validator tests containing intentional failing fixtures_

- [x] 0.3 Generate complete route, authority, domain, and source inventories
  - Enumerate Django URL patterns/methods, frontend routes, raw API-client calls,
    permissions, capabilities, role checks, status machines, scheduled tasks,
    provider calls, AI imports, and legacy endpoints/fields.
  - Register every endpoint in a machine-readable route/authority catalogue.
  - Append any new reproducible issue to `findings.md` before implementation.
  - _Requirements: R1, R3, R14, R17_
  - _Findings: all; initial focus AUTH-02, API-02, MAINT-01_
  - _Evidence: inventory artifacts and zero-unclassified-route report_

- [x] 0.4 Replace gated descriptive E2E setup with an isolated local harness
  - Compose Postgres, Redis, local object storage, console email, worker/beat,
    deterministic payment/domain adapters, backend, and frontend preview.
  - Add API helpers that create fresh users and two tenants without storage
    state or production credentials.
  - Make required Playwright projects fail on `test.skip`, unexpected console
    errors, unasserted failed requests, and undrained required jobs.
  - _Requirements: R1.4, R18.1-R18.4_
  - _Findings: GOV-04, TEN-07_
  - _Evidence: one-command clean-machine smoke and CI artifact_

- [x] 0.5 Capture the immutable pre-change baseline
  - Run current frontend/backend suites, OpenAPI generation, bundle/design audit,
    accessibility smoke, browser suites, route inventory, database invariants,
    and schema manifests without relabeling skipped/unverified work.
  - Record current failures and skipped tests as baseline findings.
  - _Requirements: R1.5, R18.5_
  - _Findings: GOV-04, GOV-05_
  - _Evidence: `docs/v2-evidence/0.5/manifest.json` and raw reports_

## Phase 1: Release Metadata, Strict Contract, And Session Pipeline

- [x] 1.1 Set maintained frontend and backend product version sources to `2.0.0`
  - Updated admissions package metadata and `bun.lock` workspace entry.
  - Updated backend package metadata, runtime `APP_VERSION`, generated OpenAPI
    version setting, and frontend example environment files.
  - Left the locked May V1 schema baseline at its generated `1.0.0`; a temporary
    candidate generated from current source reports `2.0.0`.
  - Did not rewrite immutable historical evidence or rename `/api/v1/`.
  - _Requirements: R2.1, R2.4-R2.6_
  - _Findings: REL-01, GOV-05_
  - _Evidence: `docs/v2-evidence/1.1/version-sources.md`; consistency guard remains 1.2_

- [x] 1.2 Add an executable version and API-major drift guard
  - Check frontend/backend package versions, runtime meta endpoint, environment
    defaults, generated OpenAPI product version, lockfile, and release manifest.
  - Assert that product `2.0.0`, API `v1` compatibility, and target `v2` schema
    are separately labeled.
  - _Requirements: R2_
  - _Findings: REL-01, GOV-05_
  - _Evidence: unit/CI test plus generated version manifest_

- [x] 1.3 Define and implement the canonical V2 response/error serializers
  - Use one success, error, validation-field, pagination, and metadata shape.
  - Convert representative auth, catalog, application, payment, and document
    endpoints first; add contract tests for every registered error code.
  - Do not add another frontend compatibility union.
  - _Requirements: R14.1-R14.2, R17.2_
  - _Findings: API-01_
  - _Evidence: OpenAPI examples and request tests for success/validation/denial/conflict/provider failure_

- [x] 1.4 Unify `ApiClient` request, refresh, CSRF, retry, abort, and error handling
  - Remove the separate GET response path.
  - Serialize refresh, preserve stable backend codes, prevent blind unsafe-method
    replay, and preserve cancellation/timeouts.
  - Add expired-cookie GET/mutation, concurrent refresh, network, and multi-tab
    tests.
  - _Requirements: R9.1-R9.2, R14.4, R17.1_
  - _Findings: API-01, API-03_
  - _Evidence: client unit/property tests and browser expired-session journey_

- [x] 1.5 Generate the V2 TypeScript client from candidate OpenAPI
  - Generate strict types for routes, requests, responses, errors, pagination,
    and enums.
  - Add architecture enforcement against page/component raw client calls.
  - Convert one domain service as the reference pattern and remove its permissive
    normalizer.
  - _Requirements: R14.2-R14.6_
  - _Findings: API-02, API-04_
  - _Evidence: generated-client reproducibility diff, typecheck, architecture test_

- [x] 1.6 Implement or deliberately remove the unimplemented email-verification contract
  - Centralize trusted tenant/platform frontend URL generation for reset,
    verification, resend, and duplicate registration emails.
  - Correct nonexistent route links.
  - If verification remains required, implement issue/expiry/consume/resend and
    session rules. If not, migrate the field and all copy/contracts out.
  - _Requirements: R9.1, R9.7_
  - _Findings: STU-21, STU-24_
  - _Evidence: real email-link Playwright tests for both tenant and neutral hosts_

- [x] 1.7 Make backend project installation/release metadata reproducible
  - Decide whether the backend is an installable Python distribution or a
    non-package Django application.
  - For an installable distribution, configure explicit setuptools discovery
    for intended `apps` and `config` packages and exclude schema/tests/scripts.
  - For a non-package application, remove the misleading editable-build contract
    and document/use a requirements-based release environment.
  - Test the selected `uv`/container build and runtime version output.
  - _Requirements: R2.8, R17.1_
  - _Findings: REL-02_
  - _Evidence: clean-environment backend build/install and `2.0.0` runtime output_

## Phase 2: Canonical Tenant Context And Authorization

- [x] 2.1 Generate and approve the endpoint authority matrix
  - Classify every backend endpoint as public, owner, reviewer assignment,
    tenant capability, platform capability, worker, or internal callback.
  - Define object-disclosure and 404/403 policy.
  - Generate allow/deny cases for anonymous, Student, Reviewer, Tenant_Admin,
    and Platform_Admin in tenant A and B.
  - _Requirements: R3_
  - _Findings: AUTH-01, AUTH-02, AUTH-05, AUTH-07, ADM-05, ADM-06_
  - _Evidence: zero-unclassified endpoint report and matrix tests_

- [x] 2.2 Replace raw role checks with capability/ownership/assignment policies
  - Cover application review, status, payment, document, interview, amendment,
    bulk, export, audit, settlement, fee, and catalog endpoints.
  - Keep role only as input to capability derivation, never the endpoint's
    second authority.
  - Revoke/refresh sessions on authority changes.
  - _Requirements: R3.1-R3.6_
  - _Findings: AUTH-01, AUTH-02, AUTH-05, ADM-05, ADM-06_
  - _Evidence: generated authority suite and cross-tenant UUID substitution suite_

- [x] 2.3 Make tenant host resolution fail closed
  - Prevent explicit institution filters from overriding a trusted tenant host.
  - Permit explicit selection only on registered neutral shared-portal queries.
  - Partition caches and background task context by canonical institution ID.
  - _Requirements: R2.2-R2.4, R5.2-R5.3_
  - _Findings: TEN-09, TEN-10, STU-24_
  - _Evidence: tenant A/B host, query override, cache, and unknown-host tests_

- [x] 2.4 Retire the fake permissions UI and legacy override authority
  - Remove invented colon permission vocabulary and unsupported roles.
  - Make platform role, membership, and access grants the only mutations.
  - Add a read-only Effective_Capabilities endpoint/view and audit/session revoke
    behavior.
  - _Requirements: R3.4-R3.7, R6.2-R6.3_
  - _Findings: AUTH-04, AUTH-05_
  - _Evidence: user authority browser journey and grep report for invented permissions_

- [x] 2.5 Repair reviewer membership, queue, assignment, and workload rules
  - Add tenant-scoped searchable candidates.
  - Fix manual assignment payload and enforce membership/eligibility on manual
    and automatic assignment under locks.
  - Allow reviewers to access only assigned review commands.
  - _Requirements: R3, R8.2-R8.4_
  - _Findings: AUTH-01, AUTH-03_
  - _Evidence: reviewer E2E and concurrent auto-assignment test_

## Phase 3: Live Schema Truth And Integrity Constraints

- [x] 3.1 Replace static hand lists with a live schema manifest/diff tool
  - Introspect tables, columns, types, defaults, nullability, PK/FK validation,
    unique/check constraints, indexes/predicates, triggers, extensions, and
    migration checksums.
  - Compare fresh empty DB, migrated snapshot, Neon branch, and production
    read-only manifests; missing required indexes are failures.
  - Regenerate `00_full_schema.sql` only from a verified canonical database.
  - _Requirements: R15.1-R15.4, R15.7-R15.8_
  - _Findings: DATA-07, DATA-08, DATA-09_
  - _Evidence: four schema manifests, diff report, and verifier regression tests_

- [x] 3.2 Inventory and remediate canonical assignment data
  - Count null/dangling institution, canonical program, offering, and intake IDs;
    snapshot mismatches; ambiguous legacy strings; and same-name cross-tenant
    collisions.
  - Backfill deterministically, quarantine ambiguous rows with an exception
    ledger, and enforce validated FKs/non-null constraints for active records.
  - _Requirements: R7.1-R7.2, R15.3-R15.7_
  - _Findings: DATA-01, DATA-02, DATA-07, DATA-10, STU-01_
  - _Evidence: before/after invariant SQL, sample reconciliation, Neon rehearsal/rollback_

- [x] 3.3 Add catalog, fee, grant, template, waitlist, and capacity constraints
  - Add unique ProgramIntake, active fee, access-grant, document-profile version,
    communication-template version/active, and waitlist-position constraints.
  - Add scope/target and non-negative capacity checks.
  - Remove the global communication `template_key` unique constraint only after
    duplicate preflight; use null-safe tenant uniqueness.
  - Catch `IntegrityError` and return registered 409 codes.
  - _Requirements: R5.6, R6.7, R7.4-R7.7, R15.5_
  - _Findings: TEN-08, DATA-02, DATA-03, DATA-05, DATA-06_
  - _Evidence: concurrent duplicate/last-seat tests and constraint introspection_

- [x] 3.4 Validate every tenant foreign key
  - Inventory `NOT VALID` constraints from all June tenant scripts.
  - Repair or quarantine orphans, run online validation on Neon, measure lock
    behavior, then validate in production deployment window.
  - _Requirements: R15.3-R15.4, R18.7_
  - _Findings: DATA-07_
  - _Evidence: zero invalid tenant constraints in each schema manifest_

- [x] 3.5 Reconcile canonical payments and document versions
  - Inventory orphan/duplicate Payment rows and deprecated application payment
    columns; backfill or quarantine and make `Payment.application` mandatory.
  - Add immutable document version/provenance fields and one-current partial
    unique constraint.
  - Preserve old evidence and payment values during observation.
  - _Requirements: R11.7-R11.8, R15.5-R15.6, R15.9_
  - _Findings: DATA-11, STU-19_
  - _Evidence: zero-orphan/mismatch/duplicate queries and migration rollback rehearsal_

- [x] 3.6 Generate migration history from real databases
  - Include June 2026 and later IDs, checksums, applied timestamps, schema
    fingerprint, and environment identity without secrets.
  - Replace contradictory progress claims with a single current evidence link.
  - _Requirements: R1.5, R15.8_
  - _Findings: DATA-09, GOV-05_
  - _Evidence: generated history and freshness test_

## Phase 4: Tenant Onboarding, Domains, And Change Requests

- [x] 4.1 Implement durable resumable tenant onboarding
  - Add onboarding aggregate/state, idempotent step commands, blocker query,
    audit, and outbox integration.
  - Replace fragile client multi-call orchestration with server workflow calls.
  - Never mark an institution active on create.
  - _Requirements: R4.1-R4.6_
  - _Findings: TEN-01, TEN-02_
  - _Evidence: service/integration tests for every state, retry, and compensation_

- [x] 4.2 Implement atomic tenant-admin invitation and membership handoff
  - Invite/search by email; create identity/invitation/membership consistently.
  - Remove initial-password display and all browser persistence.
  - Handle existing identity, expired invite, resend, accept, and revoked invite.
  - _Requirements: R4.3-R4.4, R6.3_
  - _Findings: TEN-01, TEN-05_
  - _Evidence: browser invite journey and storage/log secret scan_

- [x] 4.3 Make onboarding configuration steps real canonical mutations
  - Build branding/support, document profile/requirements, offering, intake,
    capacity, fee, administrator, routing simulation, and readiness UI/API.
  - Replace instructional placeholders and raw UUID fields with scoped selectors.
  - _Requirements: R4.2, R4.5-R4.7, R6.3, R7.3_
  - _Findings: TEN-02, TEN-03, TEN-05, TEN-07_
  - _Evidence: clean-database tenant A/B launch journey on desktop and mobile_

- [x] 4.4 Complete domain verification and lifecycle
  - Commit verification work before returning accepted.
  - Implement retry, pending review, approve/reject, activate, disable, and
    reactivate through one state machine and capability policy.
  - Ensure resolver/cache update and audit on each transition.
  - _Requirements: R5.1-R5.3_
  - _Findings: TEN-04, TEN-10_
  - _Evidence: state-machine property tests and broker-down/retry E2E_

- [x] 4.5 Implement tenant change requests end to end
  - Add durable records and typed payloads for profile, program, and domain.
  - Build submit/list/detail/cancel/review/apply/notify/audit paths.
  - Apply approval through the canonical configuration command.
  - _Requirements: R5.4-R5.5_
  - _Findings: TEN-06_
  - _Evidence: tenant request and platform approval browser journey_

## Phase 5: Canonical Catalog, Requirements, Capacity, And Fees

- [x] 5.1 Retire legacy catalog writes from the frontend
  - Implement strict V2 CanonicalProgram, ProgramOffering, IntakeOffering,
    RequirementProfile, and FeeSchedule services and generated hooks.
  - Convert Programs, Intakes, fees, and onboarding to these services.
  - Freeze legacy writes, add usage telemetry, and reject new string identifiers.
  - _Requirements: R7.1-R7.5, R14.7_
  - _Findings: TEN-03, DATA-01, API-02_
  - _Evidence: source/telemetry zero first-party legacy callers and catalog E2E_

- [x] 5.2 Make assignment and requirement resolution canonical and fail closed
  - Resolve only canonical offering/intake IDs, return a configuration version,
    and snapshot dynamic required documents and eligibility to the application.
  - Remove IdentifierResolver/name/code fallback from new writes.
  - Return stable retryable configuration errors instead of empty requirements.
  - _Requirements: R7.1-R7.3, R7.5, R10.5-R10.6, R11.6_
  - _Findings: DATA-01, DATA-04, STU-01, STU-13_
  - _Evidence: same-name tenant isolation and dependency-failure integration tests_

- [x] 5.3 Rebuild capacity, waitlist, withdrawal, and promotion around IDs/locks
  - Replace string signatures with institution/offering/intake IDs.
  - Lock IntakeOffering and application in a fixed order; allocate constrained
    positions and update counters atomically.
  - Reconcile counters from canonical rows before switching reads.
  - _Requirements: R7.6-R7.7, R10.6_
  - _Findings: DATA-02, DATA-03_
  - _Evidence: concurrent last-seat, withdrawal, promotion, and same-name two-tenant tests_

- [x] 5.4 Replace fee defaults/name lookup with canonical fee schedules
  - Resolve by offering, fee type, residency, currency, and active version only.
  - Return `FEE_NOT_CONFIGURED` or ambiguity error; delete K150/name fallback.
  - Expose readiness blockers to onboarding and operators.
  - _Requirements: R7.4-R7.5, R12.1-R12.2_
  - _Findings: DATA-05, STU-08_
  - _Evidence: fee invariant tests and grep report for hardcoded amounts_

## Phase 6: Student Account, Profile, Drafts, And Readiness

- [x] 6.1 Make profile/settings autosave canonical
  - Align backend/frontend NRC, phone, date, and field schemas.
  - Add per-section optimistic version, debounced autosave, offline outbox, retry,
    conflict UI, and explicit save state.
  - Remove `beforeunload` ownership, fake settings metrics, and duplicate static
    notification tiles.
  - _Requirements: R9.3-R9.5, R9.8, R16.5-R16.8_
  - _Findings: STU-20, STU-10, MAINT-02_
  - _Evidence: offline/conflict/profile browser tests at mobile widths_

- [x] 6.2 Implement valid server draft start/list/rename policy
  - Add a start command with minimum canonical selection and idempotency.
  - Decide and implement a real `draft_name` field or remove rename everywhere.
  - Return and surface errors instead of suppressing them.
  - _Requirements: R10.1, R10.3, R10.9_
  - _Findings: STU-12_
  - _Evidence: two-draft start/switch/resume API and browser tests_

- [x] 6.3 Consolidate draft persistence into one state machine
  - Characterize current `useAutoSave`, smart autosave, wizard persistence,
    application session, loader, and controller behaviors.
  - Implement one state machine and thin adapters; preserve slow/offline recovery.
  - Scope all cache/outbox deletion to one user/application.
  - Remove timestamp arbitration and redundant owners after parity tests pass.
  - _Requirements: R10.1-R10.4, R10.7-R10.10_
  - _Findings: STU-02, STU-03, STU-12, MAINT-01_
  - _Evidence: model/property tests plus refresh/offline/two-tab/device-switch E2E_
  - _M12/M13 evidence (`docs/v2-evidence/6.3/README.md` §M): one machine
    (`lib/wizardDraftController.ts`) owns every draft write; `useAutoSave` is
    deleted and the other owners are adapters/views; no timestamp arbitration;
    cleanup is scoped per `(user, application)`; same-value writes are gone. M13
    fixed outbox loss on every page load and resume hydrating another tenant's
    same-named intake._
  - _M14 evidence (README §N, final bundle `index-DFYqzK57.js`):_
    - _New required journeys: a refresh at each of the six steps, and slow draft
      writes including an answer held past the client's 30 s timeout (18/18 ×3)._
    - _The outbox is addressed by `(user, application, assignment)`, holds only
      pending answers with their base and version, and is cleared on sync, delete,
      submit and sign-out; a record for another assignment opens a conflict._
    - _Fixed: retrying hidden during a replay; resuming one draft erasing another
      application's unsent work; an F3 helper race._
    - _Two-tab 20/20, offline-outbox 12/12, F1-F9 18/18, wizard journeys 30/30;
      Vitest 4,740 passed (1 pre-existing skip); lint and type-check green._
    - _Still open, out of scope: the auth-bootstrap defect (§M.3.1)._

- [x] 6.4 Add transactional application selection change
  - Remove assignment/display fields from generic draft PATCH.
  - Implement `change-selection` to update canonical IDs, snapshots,
    configuration, requirements, eligibility, and dependent answers together.
  - Reject after any payment activity and expose a clear recovery path.
  - _Requirements: R7.2, R10.5_
  - _Findings: STU-01, DATA-01_
  - _Evidence: reroute success/rollback/payment-block/cross-tenant tests_

- [x] 6.5 Add authoritative server readiness and locked submission
  - Report profile, canonical persisted grades, dynamic docs, eligibility,
    duplicates, capacity, fee/payment/defer, declarations, configuration health,
    and allowed next actions.
  - Re-evaluate under locks on idempotent submit; fail closed on canonical config.
  - _Requirements: R10.6, R11.2-R11.6, R12.3_
  - _Findings: DATA-03, DATA-04, STU-11, STU-13_
  - _Evidence: direct API negative matrix and lost-submit-response browser recovery_

## Phase 7: Deterministic Grades, Documents, And De-AI

- [x] 7.1 Seed and enforce the canonical subject/grade contract
  - Inventory/migrate canonical subject catalog and aliases.
  - Remove selectable `fallback-*` IDs and count only persisted unique grades.
  - Enforce configured minimum and program eligibility in readiness/submission.
  - _Requirements: R11.4-R11.5_
  - _Findings: STU-11_
  - _Evidence: 0/4/5/duplicate/fake/unknown/program-ineligible grade tests_

- [x] 7.2 Render and persist dynamic required documents
  - Generate upload fields from the application requirement snapshot.
  - Support all configured types with type/size/malware validation, progress,
    retry, replacement, and accessible errors.
  - _Requirements: R11.6-R11.8_
  - _Findings: STU-13, STU-19_
  - _Evidence: custom tenant requirement and interrupted upload E2E_

- [x] 7.3 Implement immutable document versions and storage compensation
  - Use staged object writes, checksums, durable metadata, one-current version,
    replace/delete commands, reconciliation sweeper, and verification history.
  - Ensure UI replace changes the server record, not only local state.
  - _Requirements: R11.7-R11.8, R17.1-R17.4_
  - _Findings: STU-19_
  - _Evidence: failure-injection tests between storage and DB steps_

- [x] 7.4 Remove admissions generative AI and generated summaries
  - Replace student preview with deterministic readiness summary.
  - Replace admin AI panel/endpoint with structured review readiness.
  - Remove admissions AI calls, UI, flags, settings, cache/circuit-breaker/redactor,
    throttles, copy, and dependencies; isolate any jobs-ops AI dependency.
  - Preserve historical extracted data as labeled read-only provenance until
    migration policy allows cleanup.
  - _Requirements: R11.1-R11.3, R11.9_
  - _Findings: STU-06, MAINT-02_
  - _Evidence: grep/import/runtime network guard proving zero admissions AI calls_

- [x] 7.5 Make deterministic OCR optional assistance only
  - Evaluate server Tesseract against a versioned fixture corpus.
  - Map candidates through catalog aliases with confidence/provenance and require
    explicit confirmation; manual entry is always available.
  - Add structured extraction state instead of writing AI analysis into human
    verification notes.
  - Remove unused frontend Tesseract assets and build preparation.
  - _Requirements: R11.4, R11.7, R11.9-R11.10_
  - _Findings: STU-06, STU-07_
  - _Evidence: deterministic corpus report, bundle diff, and manual fallback E2E_

## Phase 8: Fee Quotes, Payment, And Settlement

- [x] 8.1 Implement expiring server-authored fee quotes
  - Store configuration version, base/provider/total amounts, currency, bearer,
    residency, expiry, and signature/status.
  - Delete frontend 1 percent arithmetic, hardcoded empty amounts, and provider
    network guessing.
  - _Requirements: R12.1-R12.2, R12.6_
  - _Findings: STU-08, DATA-05_
  - _Evidence: quote contract tests and source scan for fee/provider hardcodes_

- [x] 8.2 Converge on one payment state machine and service path
  - Promote the hardened path, remove the default-off recovery flag and duplicate
    legacy path after parity.
  - Separate action-required from provider-processing states.
  - Make initialization/callback/reconciliation/application projection idempotent.
  - _Requirements: R12.3-R12.7, R15.9_
  - _Findings: STU-09, DATA-11_
  - _Evidence: deterministic adapter matrix including refresh/delayed/duplicate callback_

- [x] 8.3 Complete the student payment ownership split
  - Wizard handles pre-submit pay/defer.
  - Payment page handles submitted/deferred/failed/expired/pending recovery and
    history using tenant fee/support context.
  - Remove indefinite disabled controls and stale hardcoded support copy.
  - _Requirements: R12.3-R12.7, R13.1-R13.2_
  - _Findings: STU-08, STU-09, STU-24_
  - _Evidence: golden and every recovery browser journey_

- [x] 8.4 Make fee administration and settlement server-scoped/capability-gated
  - Add server filtering, pagination, aggregates, reconciliation state, export,
    redaction, and audit.
  - Remove broad fetch plus client institution filtering.
  - _Requirements: R3, R6.5, R8.3-R8.4, R12.5-R12.7_
  - _Findings: ADM-06, AUTH-02_
  - _Evidence: tenant A/B settlement/fee authority and export tests_

## Phase 9: Admin Applications, Dashboard, Users, And Audit

- [x] 9.1 Create one scoped applications query and aggregate contract
  - Move search, filters, sort, pagination, facets, totals, deadlines, and saved
    filters server-side.
  - Make dashboard deep links use registered query parameters.
  - Do not derive filter options/totals from the loaded page.
  - _Requirements: R8.1, R8.6_
  - _Findings: ADM-01_
  - _Evidence: direct DB aggregate comparison and page 2+/filter browser tests_

- [x] 9.2 Make dashboard metrics truthful
  - Define each metric and scope, add freshness/error/unknown states, and preserve
    tenant selection through polling.
  - Remove invented zero/healthy defaults and relabel enabled accounts correctly.
  - _Requirements: R8.6, R17.3-R17.6_
  - _Findings: ADM-02, MAINT-02_
  - _Evidence: metric query tests, provider/API failure UI tests, scoped polling E2E_

- [x] 9.3 Rebuild user directory CRUD, import, bulk, and export
  - Align form/serializer fields and supported roles.
  - Implement server pagination/search/sort/facets and page-independent export.
  - Add previewed tenant-bound atomic/idempotent import with row errors.
  - _Requirements: R6.1-R6.5_
  - _Findings: ADM-03, ADM-04, AUTH-04_
  - _Evidence: page 2+, ignored-field rejection, import rollback, audited export E2E_

- [x] 9.4 Build one deterministic admin review workspace
  - Replace multi-call/AI detail composition with one structured detail/readiness
    query and separate versioned commands.
  - Complete reviewer/admin document, payment, amendment, interview, decision,
    bulk, and export paths under the authority matrix.
  - _Requirements: R8.2-R8.5, R8.7, R11.3_
  - _Findings: AUTH-01, AUTH-02, AUTH-03, API-02, MAINT-01_
  - _Evidence: Reviewer and Tenant_Admin desktop/mobile journeys_

- [x] 9.5 Correct tenant audit and amendment notification scope
  - Bind the audit UI to the selected tenant endpoint and capability.
  - Scope amendment recipients through institution memberships/capabilities and
    durable communication outbox; lock review transitions.
  - _Requirements: R3, R6.6, R13.10_
  - _Findings: ADM-05, AUTH-06_
  - _Evidence: cross-tenant event/recipient negative tests and audit export E2E_

## Phase 10: Post-Submission Student Lifecycle

- [x] 10.1 Consolidate notifications and communications
  - Define the supported preference schema and implement real GET/PUT controls.
  - Reject unknown whatsapp/in-app fields unless actually implemented.
  - Merge duplicate inbox/history concepts and add Communications to mobile More.
  - _Requirements: R13.3-R13.4, R13.8_
  - _Findings: STU-14, STU-24_
  - _Evidence: preference persistence, mandatory-message, delivery/retry, mobile-nav E2E_

- [x] 10.2 Implement condition evidence and amendment history
  - Add condition-specific upload/comment/replace/status/reason/reminder workflow.
  - Add owner-scoped amendment list/detail/status and same-field pending uniqueness.
  - _Requirements: R13.2-R13.4, R13.9-R13.10_
  - _Findings: STU-16, STU-17, AUTH-06_
  - _Evidence: condition rejection/replacement and amendment approve/reject journeys_

- [x] 10.3 Make enrollment readiness and confirmation transactional
  - Add deadline/readiness to list/detail contracts.
  - Support conditionally approved applications only after verified conditions.
  - Recheck conditions/deadline/capacity/existing enrollment under lock.
  - _Requirements: R13.2, R13.9, R17.1_
  - _Findings: STU-15, DATA-03_
  - _Evidence: concurrent confirm, deadline, missing-condition, and success tests_

- [x] 10.4 Make official-document work durable and historically readable
  - Persist a DB job before 202, dispatch/retry from outbox, expose terminal
    failure/retry, and never report phantom queued work.
  - Separate issue eligibility from read-existing policy.
  - Implement canonical email, neutral student recovery, and staff setup alerts.
  - Move all first-party slip/letter/receipt calls to official-document services.
  - _Requirements: R13.2, R13.5, R13.7, R13.11, R17.1-R17.4_
  - _Findings: STU-18, API-04_
  - _Evidence: broker-down recovery, terminal artifact read, email/download E2E_

- [x] 10.5 Secure and correct public tracking
  - Migrate to random hashed tracking secrets or second-factor verification.
  - Bind tenant host, rate-limit, align frontend/backend fields, and generate a
    valid share URL without PII/application number authority.
  - _Requirements: R2.3-R2.4, R13.12, R17.2, R17.7_
  - _Findings: STU-22, TEN-10_
  - _Evidence: enumeration/rate-limit/host-isolation/contract/share-link tests_

- [x] 10.6 Consolidate the student application workspace
  - Choose one canonical route for next action, status, payment, documents,
    interview, communications, conditions, amendments, enrollment, and history.
  - Redirect the duplicate route and remove duplicate data/action logic after
    usage and browser parity proof.
  - _Requirements: R13.1-R13.7, R13.13_
  - _Findings: STU-23, API-04, MAINT-01_
  - _Evidence: route redirect, parity tests, and golden student lifecycle E2E_

## Phase 11: Mobile Convergence, Accessibility, And De-Fluff

- [x] 11.1 Recompose the student dashboard around next action
  - Put server-derived blocker/action first; make active draft/application status
    concise; remove decorative metrics and duplicate QuickActions.
  - Move destructive draft cleanup to scoped draft management.
  - _Requirements: R13.1, R16.1, R16.4-R16.8_
  - _Findings: STU-04, STU-12, MAINT-02_
  - _Evidence: 320/375/390 screenshots and task-first usability assertions_

- [x] 11.2 Recompose the mobile wizard
  - Suppress global bottom nav during the wizard.
  - Use one safe-area action bar, compact progress/current blockers, integrated
    draft picker, and mobile-accessible context/checklist.
  - Decompose the giant controller/index along state-machine boundaries only
    after behavior characterization.
  - _Requirements: R10.2, R16.1-R16.3, R16.7-R16.8_
  - _Findings: STU-02, STU-03, MAINT-01_
  - _Evidence: viewport/zoom/offline/keyboard/safe-area Playwright artifacts_

- [x] 11.3 Reduce application/document action density
  - Show application status/next action first.
  - Use one primary document action and accessible menu/sheet for download/email
    and historical documents; keep live status feedback outside dense rows.
  - _Requirements: R13.1-R13.2, R16.1-R16.7_
  - _Findings: STU-05, STU-18_
  - _Evidence: long-name/mobile snapshots and keyboard/screen-reader tests_

- [x] 11.4 Make admin surfaces complete on mobile
  - Preserve server filters/pagination and every authorized command in compact
    records/detail sheets for applications, users, tenants, catalog, audit, and
    settlement.
  - Replace raw UUID controls with search selectors.
  - _Requirements: R6, R8, R16_
  - _Findings: ADM-01, ADM-03, ADM-05, ADM-06, TEN-05_
  - _Evidence: 390-width admin journey matrix with no hidden action or overflow_

- [x] 11.5 Apply the product design system and remove operational fluff
  - Remove first-viewport marketing blocks, PageShell implementation metrics,
    AI language, fake real-time widgets, duplicate cards, "coming soon", and
    feature-description prose.
  - Resolve visible brand/support through trusted tenant context.
  - Replace `window.confirm`, stray dark utilities, sub-44 controls, and overlap.
  - Run Impeccable detect/audit/harden/polish and design audit gate.
  - _Requirements: R2.2-R2.4, R16.2-R16.8_
  - _Findings: STU-10, STU-14, STU-20, STU-24, MAINT-02, TEN-09_
  - _Evidence: design diff, audit reports, visual matrix, accessibility scan_

## Phase 12: Legacy Contraction And Maintainability

- [x] 12.1 Split oversized modules after behavior is protected
  - Extract domain commands/queries from large catalog/application views and
    state-machine/adapters/sections from wizard, onboarding, application, and
    user pages.
  - Follow existing domain patterns; do not add generic repositories or a new
    state library without measured need.
  - _Requirements: R14.3-R14.5, R17.5_
  - _Findings: MAINT-01_
  - _Evidence: characterization tests unchanged, size/dependency report, no cycle increase_

- [x] 12.2 Remove V1 first-party compatibility normalizers and duplicate routes
  - Confirm the V2 frontend has zero V1 first-party calls for migrated domains.
  - Remove permissive envelope/list normalizers and duplicate document/catalog/
    application workspaces after telemetry and rollback checks.
  - Keep documented external compatibility until its announced end date.
  - _Requirements: R2.5-R2.7, R14.5-R14.7_
  - _Findings: API-02, API-04, REL-01, STU-23_
  - _Evidence: source/route telemetry zero report and V1 deprecation tests_

- [x] 12.3 Contract legacy identity and payment columns safely
  - Reconcile the user-edited legacy-column deprecation runbook with live source
    and DB evidence without overwriting unrelated changes.
  - Prove zero runtime references, legacy rows, canonical/snapshot mismatches,
    payment projection mismatches, and required external callers.
  - Apply contract migrations on Neon, rehearse rollback, then production.
  - _Requirements: R15.6-R15.9, R18.7_
  - _Findings: DATA-01, DATA-10, DATA-11_
  - _Evidence: grep, telemetry, invariant queries, migration/rollback manifests_
  - Closure (2026-10-09): accepted as **proof plus a registered Legacy_Exception** —
    `docs/v2-evidence/12.3/README.md` §14. Re-verified that day (`raw/closure-01…06`):
    17/17 contraction tests pass with no database, telemetry half 4 verdict unchanged,
    the three column register entries intact (end date 2027-02-07), and `invariants.sql`
    read-only on both Neon databases reproduces every gate count — **16 unbacked money
    rows** still forbid the drop. No column dropped anywhere; production never measured.

- [x] 12.4 Remove admissions AI/OCR/browser and other dead dependencies/assets
  - Use dependency/import/build-output analysis after runtime callers are gone.
  - Remove prepare scripts, assets, flags, services, components, tests, and docs
    that describe retired behavior; retain jobs-ops dependencies only in its
    boundary.
  - _Requirements: R11.1, R11.9, R16.5_
  - _Findings: STU-06, STU-07, MAINT-02_
  - _Evidence: lock/bundle diff, zero-dead-import scan, production build_

- [x] 12.5 Run the final grep-loop canonical-path review
  - Search legacy institution/program/intake writes, raw role authorization,
    invented permissions, raw UUID form labels, hardcoded fees/support/brands,
    AI copy/imports, direct client calls, `window.confirm`, V1 document callers,
    fallback subject IDs, global draft clearing, and stale status aliases.
  - Every remaining match must be canonical, test fixture, immutable evidence,
    or a registered Legacy_Exception with owner/removal date.
  - _Requirements: R1, R2, R3, R7, R11, R14-R16_
  - _Findings: all relevant cleanup findings_
  - _Evidence: reviewed search manifest with zero unregistered matches_
  - Pass 2 (2026-10-09, `docs/v2-evidence/12.5/README.md` §13): reopened by
    **GATE-13.6-01**, now closed. Re-measured the whole review on the current
    tree after task 6.3's M14 draft rework — bare and `--review` both report
    **889 hits, UNREGISTERED=0**, and categories 11 (global draft clearing) and
    12 (stale status aliases) are byte-identical before/after, so M14 introduced
    no unregistered hit (the M11 Q12 `typeof draft.payment_status` regression did
    not reproduce — M14 reads through named bindings). The two registers L9-L11
    left to other specs are closed **under the user's authorization, on their
    behalf**: `_ALLOWED_PREDICATES` (owner `multi-tenant-beanola`, date read from
    the 12.2 window) and the brand allowlist (per entry — 11 dated
    Legacy_Exceptions, 8 permanent-by-design and reclassified under 12.5's
    vocabulary like `DECLINED_REMOVALS`). Every date is read from
    `compatibility_register`'s one window and each guard **evaluates** owner+window,
    replacing the invented values M11 flagged. Register audit `gaps: none`; guards
    green (backend 30 / frontend 14); both spec validators PASS (findings=110).

## Phase 13: Full Verification, Rollout, And Closure

- [x] 13.1 Run the complete functional and quality gate
  - Backend unit/integration/property/concurrency/security suites.
  - Frontend unit/contract/accessibility/visual suites, lint, typecheck, and
    production build.
  - Generated OpenAPI client compile, migration-from-empty/snapshot, schema diff,
    query budgets, and all Playwright projects.
  - _Requirements: R17, R18.1-R18.4_
  - _Findings: GOV-04, GOV-05_
  - _Evidence: signed candidate manifest with raw command outputs/artifacts_

- [x] 13.2 Run the two-tenant golden and adversarial matrix
  - Same program/intake names: host override, routing, drafts, grades, custom
    docs, capacity, waitlist/promotion, payment, amendments, notifications,
    review, official documents, audit, settlement, and public tracking remain
    isolated.
  - Complete register/verify/login, profile autosave, two drafts, assignment,
    five grades, documents, pay/defer, submit, interview/comms, condition,
    amendment, approval, enrollment, official docs, tracking, withdrawal/new
    application where legal.
  - Inject offline, refresh, tab/device switch, interrupted upload, lost submit
    response, provider delay, duplicate callback, and broker outage.
  - _Requirements: R18_
  - _Findings: all P0/P1 workflow findings_
  - _Evidence: Playwright traces/videos/screenshots, DB invariant report, drained queues_

- [x] 13.3 Verify mobile, zoom, accessibility, and long-content behavior
  - Run 320x568, 375x667, 390x844, 768x1024, 1280x800, and 1440x900.
  - Test keyboard, screen reader semantics, focus restore/error focus, reduced
    motion, 200/400 percent zoom, safe areas, slow 3G/offline, and long tenant/
    program/localized strings.
  - Assert 44px targets, no overflow/occlusion/layout shift, and actual next
    action in the first mobile viewport.
  - _Requirements: R16, R18.2-R18.4_
  - _Findings: STU-03, STU-04, STU-05, STU-10, STU-14, STU-20, STU-23, STU-24_
  - _Evidence: visual/a11y report with reviewed screenshots and pixel checks_
  - Evidence: `docs/v2-evidence/13.3/README.md` — all six viewports x 8 student
    surfaces x 2 device profiles (96 measurements, `raw/pixel-matrix.txt`), all
    nine dimensions exercised with none unavailable, 149 screenshots organised
    per viewport, 54 traces. `54 passed, EXIT=0`, queues drained, stack torn down.
  - **16 findings, none fixed** (GATE-13.3-01..16): 7 sub-44 controls incl. the
    authenticated mobile header at 40x40 on every route and the 320 px wizard step
    row at 18-20 px; the bottom navigation unlabelled to a screen reader at
    R16.1's own 320 px design width; an offline chunk failure showing the student a
    raw TypeError; a legally-named long intake 500ing every application create
    (`varchar(100)` snapshot vs `varchar(255)` source); the font chain fixed in the
    config and still reduced in the browser; 9 axe contrast rows; dashboard CLS
    0.105-0.116 at 375/390; and the fixed bottom nav overlapping 26.7% of the
    dashboard's primary next action in the first mobile viewport — the last one
    found by **reviewing a screenshot**, after every number in the file had passed.
    Seven carry a `test.fail()` row stating the unweakened claim so a fix fails the
    row. All attributed to owning lanes with file and line.
  - Safe areas were **measurable** here (CDP inset override accepted): the action
    bar resolves 46 px against a real 34 px inset and the bottom nav 34 px, with
    the global bar suppressed on the wizard route. Video remains unobtainable on
    this OS (13.2 §7); this bullet asks for screenshots and pixel checks instead.
  - Five of the task's own instruments were wrong first and each correction is
    recorded (§9), incl. a centre-point occlusion probe replaced by an area
    intersection; GATE-13.1-07 did not fire — own config, own directory, 0.4/2.2
    byte-identical and 11.1-11.5 untouched (§10).

- [x] 13.4 Rehearse data migration, rollback, and operational recovery
  - Apply from empty and production-like snapshot on Neon.
  - Rehearse failed batch restart, constraint validation, app rollback while
    expanded schema remains, payment/document/domain/communication reconciliation,
    and database restore.
  - _Requirements: R15, R17, R18.3-R18.7_
  - _Findings: DATA-03, DATA-07, DATA-08, DATA-09, DATA-10, DATA-11_
  - _Evidence: timed rehearsal log, manifests, rollback and reconciliation output_

- [ ] 13.5 Deploy canary and run production read-only/post-deploy proof
  - Deploy expanded compatible schema and V2 code to a canary tenant.
  - Monitor authority denials, schema drift, assignment mismatches, autosave,
    payment, jobs, tenant cache/domain, documents, and communications.
  - Execute rollback criteria if thresholds fail; broaden activation only after
    reconciliation and sign-off.
  - _Requirements: R17, R18.5-R18.7_
  - _Findings: GOV-05 and all production-risk findings_
  - _Evidence: canary dashboard/export, post-deploy smoke, operator sign-off_
  - **Deferred — blocked on infrastructure** (2026-10-09,
    `docs/v2-evidence/13.5/README.md` §11). The canary is prepared and its
    database half is rehearsed read-only on the production-lineage snapshot
    `v2_snap_13_4` (preflight gates 20-25 reproduce every predicted blocker,
    write refusal proven; `raw/preflight-two-databases.txt`). GATE-13.5-05 is
    **resolved**: the operator confirmed production is `*.beanola.com`, so the
    shipped bundle's enforced CSP is correct and the `*.mihas.edu.zm` runbook/
    smoke defaults are the stale side (a deploy-lane doc-fix). The remaining
    steps — deploy, HTTP post-deploy proof, 24h signal sampling, and the two
    human sign-offs — all need a reachable production target. **The production
    server is offline and hosting is being switched**, so the checkbox stays
    `[~]` (deferred). Trigger to complete: the new host goes live; then §6
    Block A → deploy → Block B → `sign-off.md` with `*.beanola.com`.

- [ ] 13.6 Close the spec truthfully
  - Re-run the spec validator and finding traceability report.
  - Require every P0/P1 finding closed, every required task evidenced, no required
    skips, no unregistered Legacy_Exception, and no hanging required job/outbox.
  - Update canonical truth map and spec status only after the final gate passes.
  - _Requirements: R1, R18.5-R18.6_
  - _Findings: all_
  - _Evidence: final closure manifest and reviewer/operator approvals_
  - Evidence: `docs/v2-evidence/13.6/README.md` — the closure manifest. **VERDICT:
    NOT CLOSED. 2 of 5 clauses pass, 3 fail, 11 blocking items.** So the bullet's
    own condition ("only after the final gate passes") was honoured: `.config.kiro`
    stays `"status": "planned"`, `docs/canonical-truth-map.md` is unchanged, and
    this checkbox is `[-]`, not `[x]`.
  - **The spec validator (task 0.2) FAILS, exit 2** (`raw/spec-governance-validator.txt`):
    tasks **4.1** and **7.4** are `[x]` with no `docs/v2-evidence/<id>/` at all.
    Its own self-tests fail **2 of 20**, so the `spec-governance` CI gate is red —
    the second failure is a stale finding-count pin (register holds 71, 0.2 asserts
    70, AUTH-07 arrived after the pin). Rules 2, 3, 4 pass; rule 5 passes only
    *because* status is not `completed`.
  - Traceability over **71 register findings + all 34 Phase 13 GATE findings**
    (`raw/traceability-report.md`, built on the blocking validator's own parsers):
    29 P0 / 40 P1 / 2 P2, 0 unowned, 70 with all-`[x]` owners — **and a checkbox is
    not a closure**. §3.2 names **6 P0 and 5 P1 register findings contradicted by a
    Phase 13 measurement** (GOV-04, STU-23 via GATE-13.3-09, STU-13/DATA-01 via
    GATE-13.3-13/13.5-01, DATA-01/STU-01 via GATE-13.2-01/13.5-02, TEN-09 via
    GATE-13.4-01, STU-03/04/05/10/24 via 13.3's set). Of the 34 GATE findings
    **4 are fixed, 2 accepted, 28 open, 13 of those high — and 0 are registered in
    `findings.md`**, which is why rule 3 cannot see them (filed: GATE-13.6-02).
  - **GATE-13.1-02 fixed — the one blocker in reach.** The `hasattr` patch-target
    guard task 9.4 wrote into 1 of 9 modules was added to the other 8, plus two
    other shapes (`_SCOPE` → the canonical lazily-imported seam; the interview
    property test's two retired helpers → `resolve_scoped_application` +
    `assert_version`). Baseline reproduced first at **72 errors + 14 failed + 5
    passed = the documented 86**; after: **0 errors, 55 passed, 36 failed**. Whole
    tree, serial, real Postgres: **73 errors → 1**, 106 → 128 failed, 5133 → 5192
    passed, **skips 104 → 104**. The 36 are genuine — 13.1's cluster A — and encode
    retired pre-9.4/pre-5.3 shapes (`promote_next('CS','Jan 2026')` vs canonical
    IDs; `objects.get()` vs the scoped locked lookup). **An unrun test is not a
    passing test, and a running failing test is better news than an absent one.**
    Not fixed here: they belong to the admin-query and capacity lanes.
  - Clause verdicts, each measured separately (§7): (i) P0/P1 closed **FAIL** ·
    (ii) every required task evidenced **FAIL** — 4.1/7.4 unevidenced, 13.5 never
    executed, and **the bullet's own "reviewer/operator approvals" do not exist and
    cannot be produced by an agent** · (iii) no required skips **FAIL** — the 86
    absent tests are closed but 36 now fail, 1 error remains, 15 lint errors stand ·
    (iv) no unregistered Legacy_Exception **PASS** — 847 hits, **0 unregistered**,
    7 registers all shrink-only and staleness-checked · (v) no hanging required
    job/outbox **PASS** on `v2_snap_13_4` (347 outbox rows, 0 failed, 0 stale) and
    `v2_fresh_13_4`, with `LLEN celery` **unmeasurable off production**.
  - **Item D decided, not deferred a third time** (§7.1): a per-entry dated owner is
    **not** required for 13.6's clause (iv) — registration is what that clause
    measures, all 7 registers are shrink-only, and a staleness check buys the
    property a date is meant to buy, sooner (it deleted 3 stale entries in 12.5
    alone). But **task 12.5's clause is stricter, is not met, and 12.5 is `[x]`** —
    filed as **GATE-13.6-01** with the ordered work and the note that
    `LEGACY_EXCEPTIONS` (9) + `PREVIEW_ALLOWLIST` (5) are admissions-v2's own and
    are the cheapest real closure.
  - 73-task evidence audit (`raw/evidence-audit.md`): 71 of 73 directories present,
    **0** orphans, **0** checked tasks missing an `_Evidence:` descriptor, 1,417
    files / 302 MB. 4.1's and 7.4's named instruments were **run** and are green
    (**46 passed**, **18 passed**) — the claims hold, the evidence links do not, and
    13.6 **did not** create their directories.
  - State: production **never contacted**; Neon **read-only** on the reused branch
    `br-jolly-pine-ahybtg2e`; 13.4's three scratch databases **preserved**
    (`v2_snap_13_4` is the only reproduction of GATE-13.4-02); 11 backend **test**
    files changed and nothing else; `manage.py check` clean (1 silenced, exit 0);
    **nothing committed**; `findings.md`, `.config.kiro`, the canonical truth map and
    every other task's checkbox untouched.
  - **SECOND PASS (§8.2 item O10), after all twelve lane items L1-L12 closed or
    partly closed** — `docs/v2-evidence/13.6/README.md` **Part II** (appended; Part I
    is left byte-for-byte as the record of what the gate read before remediation),
    new artifacts under `raw/pass2/`. **VERDICT: STILL NOT CLOSED. 3 of 5 clauses
    pass, 2 fail, 3 blocking items** (was 2/5 and 11). So the bullet's condition
    ("only after the final gate passes") is honoured a second time: `.config.kiro`
    stays `"status": "planned"` (mtime 2026-07-12), `docs/canonical-truth-map.md` is
    unchanged (mtime 2026-08-12), and this checkbox stays `[-]`, not `[x]`.
  - Clause verdicts, each measured separately (Part II §16): (i) P0/P1 closed
    **FAIL** · (ii) every required task evidenced **FAIL** · (iii) no required skips
    **PASS** (moved) · (iv) no unregistered Legacy_Exception **PASS** · (v) no
    hanging required job/outbox **PASS**.
    - **(i) FAIL** — 8 of the 11 Phase 13 contradictions are cleared (DATA-01/STU-01
      via L1-L4, STU-23 and STU-03/04/05/10/24 via L5-L6, TEN-09 via L7, GOV-04's
      immutability limb via L8), but **STU-13** and **TEN-09** wait on a **production
      apply that has not happened**, GOV-04 fails its own exit criterion at 94
      backend failures, and **12 of the 39 registered GATE findings are not plain
      `fixed` — 3 of them `high`** (GATE-13.3-13, GATE-13.4-01, GATE-13.5-03). Still
      open: GATE-13.3-13, GATE-13.2-02/-03, GATE-13.1-03/-04/-05/-08,
      GATE-13.5-03/-04/-05, GATE-13.6-01 (partly), GATE-13.6-04.
    - **(ii) FAIL, and it is the most decisive of the five.** The blocking validator
      is green and 73 of 73 evidence directories are present, but **13.5 is still
      `[~]` — never executed — and `docs/v2-evidence/13.5/sign-off.md` is wholly
      unsigned** (Part 4a/4b blank rule lines, 4c unticked, `md5sum dae18daf…`, mtime
      2026-08-12, untouched here). This bullet's own `_Evidence:` line requires
      *"reviewer/operator approvals"*, and **an agent must not produce them**.
    - **(iii) PASS** — the 36 failures the 13.1-02 guard uncovered are fixed
      (`91 passed / 0 failed`, L1-L4 §3); **lint 15 errors -> 0**, all fifteen fixed
      **in code** with 0 `eslint-disable` added and `LEGACY_EXCEPTIONS` 9 -> 0
      entries (L12); skips 104 -> 103 with the one difference identified as an
      environment-conditional guard. **94 backend failures and 1 error remain and no
      skip conceals them** — they are attributed by cluster to named lanes and belong
      to GOV-04's exit criterion under clause (i). This PASS is not a claim of a
      green suite.
    - **(iv) PASS** — **866 hits, 0 UNREGISTERED**, 13 categories, halves 1-3 / 5 /
      5b all PASS. The 847 -> 874 -> 866 delta is attributed line by line to L12's
      own files. Residual: 2 registers with no per-entry owner are **other specs'**,
      and `DECLINED_REMOVALS` is undated **by design**.
    - **(v) PASS where reachable** — `v2_snap_13_6`: 347 outbox rows, 0 pending, 0
      failed, 0 stale, every beat proxy 0. `LLEN celery` is still **unmeasurable off
      production** and reads "cannot tell", never zero; it gets its answer at O7.
  - **Gates re-run: the validator now PASSES.** `validate_spec_governance.py`
    **exit 0, 0 errors / 0 warnings** and its own self-tests **Ran 24 - OK** (was
    exit 2, 2 errors, 2 of 20 failing) — L11 recorded 4.1's and 7.4's runs, L9 moved
    0.2's finding-count pin 70 -> 71. `validate_spec_metadata.py` exit 0, 9/9.
    Traceability over **two** populations: the 71 register findings unchanged (29 P0
    / 40 P1 / 2 P2, 0 unowned) **plus the 39 Phase 13 GATE findings L9 registered**
    (39 of 39 registered, 0 unowned, 26 fixed + 1 fixed-on-the-rehearsal-lineage, 12
    not plain-fixed; 16 high / 20 med / 3 low). Evidence audit **73 of 73**
    directories (was 71), 0 orphans, 1,827 files / 490 MB. Whole tree, serial:
    backend **94 failed / 5278 passed / 103 skipped / 2 xfailed / 1 xpassed / 1
    error**, frontend **1 failed / 4619 passed / 1 skipped over 495 files**, lint
    **0 errors**, type-check exit 0.
  - **M9 current delta (2026-08-15; supersedes the SECOND PASS suite counts, not
    its historical record):** local PostgreSQL whole tree **5,425 passed / 0
    failed / 0 errors / 104 skipped / 2 xfailed / 1 xpassed**; frontend Vitest
    **4,627 passed / 0 failed / 1 skipped**, lint and production type-check exit
    0; the exact stale-dirty-wizard F3 journey passed **3 of 3** independent runs
    with zero skips/unexpected/flaky, and the final F1/F2 run passed **2 of 2**.
    This fixes GATE-13.2-03 and clears GOV-04's obsolete backend-failure limb. It
    does **not** close GOV-04 or 13.6: every complete required Playwright project
    was not re-run as a zero-skip matrix, 13.5 is still unexecuted, production
    actions remain operator-owned, and reviewer/operator approvals remain blank.
    Evidence: `docs/v2-evidence/13.6/remediation/M9/README.md` and
    `manifest.json`.
  - **GATE-13.6-04 is why rule 3's green is narrower than it looks**, and it is
    registered rather than papered over: the validator parses a finding id only as
    `[A-Z]{2,6}-\d+`, so the dotted `GATE-13.x-nn` ids do not match — `finding_count`
    stays **71** and the 39 are registered **documentally, not mechanically**
    (demonstrated by importing the real module, not asserted). **The validator was
    not edited.** Closing it needs the grammar widened **and** `requirements.md`'s
    `_Findings:` lines extended in one edit, which is the requirements author's call;
    widening alone turns the CI gate red with 39 unowned findings.
  - **The distinction that decides clause (i): a fix rehearsed on `v2_snap_13_6` is
    not applied to production.** L2 (three widened columns), L3 (the migration-runner
    fix + `gen_random_uuid()` default) and L7 (the brand-neutral communication
    fallback) are all additive, idempotent, rollback-paired, boot-gate-clean — and
    **none has been run against the real database**. So TEN-09's and STU-13's Phase 13
    *contradictions* are cleared while the *findings* stay open.
  - `findings.md` **state updates applied** (Part II §17), each carried from the batch
    that measured it, nothing re-measured: GATE-13.4-01 -> **fixed on the rehearsal
    lineage**, GATE-13.1-07 -> **fixed**, plus a new subsection separating
    *contradiction cleared* from *finding closed* for TEN-09, GOV-04, DATA-01/STU-01,
    STU-13, STU-23 and STU-03/04/05/10/24. **Two counts restated upward as
    corrections**: GATE-13.4-01 is **31 branded rows, not 19** (12 exist only on the
    production lineage and are produced by no script in this repo) and GATE-13.1-07 is
    **4 write mechanisms, not 3** (the fourth is `harness/bin/harness` itself). **No
    Phase 13 README was edited** — they are immutable under R2.7, and both tasks'
    kept raw output is the only reason the true numbers were recoverable.
  - **Shortest remaining path, lane versus operator.** No lane item blocks the gate:
    §18.1's M1-M7 (the 113-char intake ceiling, the 94 by cluster, 3.6's migration
    report, the harness base timeout, the validator grammar + `requirements.md`, two
    other specs' register dates) are real work that closes **no clause on its own**.
    The gate is waiting on **O1** — is production `*.beanola.com` or
    `*.mihas.edu.zm`? still first, still one answer — then one backup-first window
    for **O3b** (apply L2/L3/L7 to production, which is what clause (i) waits on)
    and **O3-O8**, ending in two humans signing `sign-off.md` Part 4a and 4b. Then
    re-run this task a third time.
  - State: production **never contacted**; Neon **read-only** (`v2_snap_13_6` only,
    branch reused not created; `v2_snap_13_4` / `v2_fresh_13_4` / `v2_batch_13_4` and
    the Neon default branch untouched); local `test_%` empty before and restored empty
    after; **nothing committed or staged**; **`13.5/sign-off.md` not signed, not
    partially filled, not opened for writing**; **13.5's checkbox and every other
    task's untouched**; `.config.kiro` and `docs/canonical-truth-map.md` unchanged;
    other tasks' `docs/v2-evidence/**` read, never written — and the defaulted pytest
    run also confirmed L8's fix by writing into none of them.

  - **PART III (2026-10-09) — deferred on infrastructure, not closed**
    (`docs/v2-evidence/13.6/README.md` Part III). The owner settled the one
    open question: production is `*.beanola.com` (GATE-13.5-05 resolved), and
    the production server is **offline** with hosting being switched. Re-read
    against that: validators green (governance exit 0, 110 findings, 71/73
    checked, 24/24 self-tests; metadata exit 0); clauses (iii)/(iv)/(v) PASS
    ((iv) reinforced by 12.5 pass 2 closing GATE-13.6-01 — all 7 registers
    own=yes, gaps none). Clauses (i) and (ii) remain FAIL but **reduce to one
    operator-owned item**: deploy the prepared canary to the new host, apply
    three rehearsed additive migrations (L2/L3/L7 — close TEN-09, STU-13,
    GATE-13.5-01/-13.4-02), close GATE-13.5-02/-04, and have two humans sign
    `docs/v2-evidence/13.5/sign-off.md`. Trigger: the new host goes live.
    Honouring the bullet's condition, `.config.kiro` stays **not**
    `completed` (a `deferredOn` field records the open item),
    `docs/canonical-truth-map.md` is unchanged, and this checkbox stays `[-]`.
    No production contact; no Neon write; nothing committed.

## Finding-To-Task Traceability

| Finding group | Primary tasks |
|---|---|
| GOV-01 through GOV-05 | 0.1-0.5, 1.2, 3.6, 13.1, 13.6 |
| AUTH-01 through AUTH-07 | 2.1-2.5, 8.3, 8.4, 9.4-9.5 |
| ADM-01 through ADM-06 | 8.4, 9.1-9.5, 11.4 |
| TEN-01 through TEN-10 | 2.3, 3.3, 4.1-4.5, 5.1, 10.5, 11.5 |
| STU-01 through STU-05 | 5.2, 6.2-6.5, 11.1-11.3 |
| STU-06 through STU-07 | 7.4-7.5, 12.4 |
| STU-08 through STU-09 | 5.4, 8.1-8.3 |
| STU-10 through STU-13 | 6.2-6.5, 7.1-7.3, 11.2, 11.5 |
| STU-14 through STU-18 | 9.5, 10.1-10.4 |
| STU-19 through STU-24 | 3.5, 6.1, 7.2-7.3, 10.5-10.6, 11.5 |
| DATA-01 through DATA-11 | 3.1-3.6, 5.2-5.4, 6.4-6.5, 8.1-8.2, 12.3 |
| API-01 through API-04 | 1.3-1.5, 9.4, 10.4, 12.2 |
| MAINT-01 through MAINT-02 | 6.3, 7.4, 9.2, 10.6, 11.1-11.5, 12.1, 12.4 |
| REL-01 through REL-02 | 1.1-1.2, 1.7, 12.2, 13.5-13.6 |
