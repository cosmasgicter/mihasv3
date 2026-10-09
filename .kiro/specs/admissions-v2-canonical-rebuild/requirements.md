# Requirements: Admissions V2 Canonical Rebuild

## Introduction

Admissions V2 is an end-to-end correction of the Beanola admissions product,
not a visual refresh and not a collection of compatibility patches. It makes
Beanola the platform owner, institutions first-class tenants, canonical IDs the
only write authority, backend capabilities the authorization boundary, and
real browser journeys the definition of working.

The release includes the React admissions frontend and Django admissions
backend at product version `2.0.0`. Product version does not silently change the
existing `/api/v1/` contract. Breaking API removals follow the compatibility
decision in R14 and the release sequence in `design.md`.

## Glossary

- **Platform_Admin:** Beanola operator with platform-scoped capabilities.
- **Tenant_Admin:** Institution staff member with capabilities for one or more
  institution memberships.
- **Reviewer:** Institution member authorized for assigned application review
  work, without implicit platform or tenant-wide admin authority.
- **Student:** Applicant who owns a profile and applications.
- **Canonical_Program:** Beanola's global program definition.
- **Program_Offering:** A tenant's offering of a Canonical_Program.
- **Intake_Offering:** A Program_Offering linked to an Intake with capacity and
  admissions configuration.
- **Assignment:** The canonical institution, program, offering, and intake IDs
  bound to one application, plus output-only display snapshots.
- **Effective_Capabilities:** Platform and tenant capabilities resolved by the
  backend for the current user and institution.
- **Required_Evidence:** Executable test output, schema evidence, screenshots,
  or operational proof linked from a task. A checklist mark is not evidence.
- **Canonical_Path:** The one documented production route and service that owns
  a domain command or query.
- **Legacy_Exception:** A named, measured, read-only fallback for a pre-cutover
  record with an owner and removal date.

## Requirements

### R1. Evidence-Driven Scope And Spec Governance

**User Story:** As a release owner, I want every known and newly discovered
admissions defect tied to executable proof, so that completion status reflects
runtime reality.

#### Acceptance Criteria

1. THE repository SHALL register this spec as the active admissions V2
   implementation authority without deleting historical specs.
2. WHEN a source, route, database, visual, accessibility, or journey audit finds
   a reproducible issue, THE team SHALL add a finding ID, severity, linked
   requirement, implementation task, regression test, and closure evidence.
3. THE spec validator SHALL fail when a required task is checked without
   Required_Evidence, a requirement is not referenced by a task, a finding has
   no owner requirement, a live spec ID is duplicated, or a completed spec has
   unchecked required tasks.
4. WHEN a test is required for release, THE test SHALL run without environment
   gating or `skip` in the V2 CI profile.
5. THE release report SHALL distinguish verified behavior, operator-gated work,
   deferred work, and unknown/unverified behavior; it SHALL NOT describe any of
   the latter three as complete.
6. THE implementation SHALL use the steering and skill execution order named
   in `design.md`, with steering taking precedence over generic skill advice.

_Findings: GOV-01, GOV-02, GOV-03, GOV-04, GOV-05, GATE-13.1-02, GATE-13.1-03, GATE-13.1-07, GATE-13.6-01, GATE-13.6-02, GATE-13.6-04_

### R2. Platform Identity, Release Version, And Compatibility

**User Story:** As a user, I want a consistent Beanola platform that shows my
institution only in tenant context, so that ownership and support are clear.

#### Acceptance Criteria

1. THE admissions frontend package, backend package, runtime metadata, example
   environment files, and generated OpenAPI document SHALL report product
   version `2.0.0` from drift-guarded sources.
2. THE public platform identity SHALL be Beanola Admissions by Beanola
   Technologies; MIHAS, KATC, and other institutions SHALL appear only as
   resolved tenant data, explicit fixtures, or Legacy_Exceptions.
3. WHEN no trusted tenant domain/context resolves, THE product SHALL fail closed
   to neutral Beanola context and SHALL NOT guess an institution.
4. WHEN a trusted tenant host is present, THE host tenant SHALL override or
   reject any conflicting explicit institution filter; only the neutral shared
   portal MAY accept an explicit tenant selector.
5. THE release SHALL keep API major metadata distinct from product version.
6. WHEN V2 removes or changes a public request/response contract, THE platform
   SHALL either expose the breaking behavior under `/api/v2/` or first publish a
   measured deprecation window for `/api/v1/`.
7. THE version consistency test SHALL fail when any maintained release source
   differs; immutable historical launch evidence SHALL remain labeled with the
   release and commit that produced it.
8. THE backend release environment SHALL install/build reproducibly from its
   declared project metadata or explicitly declare a non-package workflow; its
   supported release command SHALL report version `2.0.0`.

_Findings: TEN-09, TEN-10, REL-01, REL-02, GOV-05, GATE-13.4-01, GATE-13.5-05_

### R3. One Authorization Model

**User Story:** As a platform administrator, tenant administrator, reviewer, or
student, I want every surface to enforce exactly my effective authority, so
that no route grants too much or hides legitimate work.

#### Acceptance Criteria

1. THE backend capability service SHALL be the sole authority for platform and
   tenant administration; assignment-scoped reviewer rules SHALL be an explicit
   backend policy composed with it.
2. EVERY protected command and query SHALL declare its capability, tenant
   scope, ownership, or assignment rule and return an indistinguishable `404`
   for cross-tenant object substitution where object disclosure is unsafe.
3. THE frontend SHALL consume Effective_Capabilities to control navigation and
   affordances, but backend authorization SHALL remain mandatory for every API.
4. THE product SHALL remove invented permissions and unsupported roles from
   forms, imports, frontend constants, tokens, and documentation.
5. WHEN a role, membership, grant, or reviewer assignment changes, THE backend
   SHALL audit the change and revoke or refresh affected sessions so stale
   authority does not persist.
6. A generated authority matrix test SHALL exercise every protected endpoint
   for anonymous, Student, Reviewer, Tenant_Admin, and Platform_Admin contexts,
   including two institutions and cross-tenant IDs.
7. THE user detail surface SHALL show backend-derived effective capabilities as
   read-only data and link authorized operators to canonical role, membership,
   or grant commands.

_Findings: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, ADM-05, ADM-06_

### R4. Atomic Tenant Onboarding And Launch Lifecycle

**User Story:** As a Beanola operator, I want to configure and launch a new
institution without orphan accounts or hidden manual steps, so that every
tenant starts complete and isolated.

#### Acceptance Criteria

1. WHEN onboarding begins, THE backend SHALL create a resumable draft workflow
   with an idempotency key and explicit completion state; it SHALL NOT activate
   the institution implicitly.
2. THE workflow SHALL collect and persist institution profile, branding,
   support contacts, domain policy, document profile, required documents,
   Program_Offerings, Intake_Offerings, fee schedules, administrator invitation,
   and routing configuration through canonical commands.
3. WHEN an administrator is invited, THE backend SHALL create the membership
   and invitation atomically and SHALL NOT return, log, or persist a reusable
   plaintext password in browser storage.
4. WHEN a step fails, THE workflow SHALL remain safely resumable or compensate
   all records created by the failed atomic operation; no global orphan admin or
   partially authoritative tenant SHALL remain.
5. THE launch-readiness query SHALL return machine-readable blockers derived
   from live canonical data.
6. WHEN activation is requested, THE backend SHALL lock the tenant, re-evaluate
   readiness, transition draft/review to active, and emit one audited event; a
   missing blocker SHALL prevent activation with a stable error code.
7. A clean-database E2E test SHALL create, configure, launch, resolve, and use
   two same-shaped tenants without relying on seed-specific IDs or pre-linked
   offerings.

_Findings: TEN-01, TEN-02, TEN-03, TEN-07, TEN-08_

### R5. Tenant Domains, Branding, Templates, And Change Requests

**User Story:** As tenant staff, I want my institution's approved configuration
to work through complete workflows, so that I do not need Beanola staff to edit
the database manually.

#### Acceptance Criteria

1. DOMAIN creation SHALL enqueue verification, record retry state, and progress
   through the one declared state machine for review, verification, activation,
   disable, and reactivation.
2. THE domain resolver SHALL trust only active verified domains and SHALL fail
   closed on ambiguity or infrastructure errors.
3. BRAND assets, support contacts, communication template versions, and document
   profiles SHALL be tenant-scoped, versioned where applicable, auditable, and
   served without cross-tenant cache leakage.
4. WHEN tenant staff request a protected profile, program, or domain change, THE
   system SHALL create a durable request with draft, submitted, approved,
   rejected, applied, and cancelled semantics as applicable.
5. WHEN a change request is approved, THE backend SHALL apply it transactionally
   through the same canonical command used by a Platform_Admin, notify relevant
   parties, and retain before/after audit data without secrets or unnecessary
   personal information.
6. THE communication-template schema SHALL allow tenant-scoped versions and
   enforce one active version according to the design invariant.

_Findings: TEN-04, TEN-06, TEN-08, TEN-09, STU-10, GATE-13.4-01, GATE-13.5-03_

### R6. Admin Users, Memberships, Grants, And Audit

**User Story:** As an authorized administrator, I want to manage people and
their tenant access beyond the first result page, so that the directory is
accurate and operable at scale.

#### Acceptance Criteria

1. USER list, search, filters, sort, pagination, facets, counts, and export SHALL
   be server-side and preserve tenant scope in every request.
2. USER create/update serializers and forms SHALL share one supported field and
   role contract; ignored mutation fields SHALL be rejected, not silently lost.
3. STAFF invitation and access-grant forms SHALL use accessible tenant-scoped
   user, offering, intake, and application search selectors instead of raw UUID
   entry.
4. BULK import SHALL provide validation preview, reject unsupported roles,
   require the intended memberships, apply atomically per declared mode, remain
   idempotent, and return downloadable row-level failures.
5. BULK mutation and export SHALL be backend commands with explicit capability,
   audit, redaction, size, and rate limits; the frontend SHALL NOT export only
   its loaded page.
6. TENANT audit list and export SHALL use the selected institution endpoint,
   require `tenant.audit.read` or platform equivalent, paginate, and never leak
   another tenant's events.
7. ACCESS grant scope/target combinations and duplicates SHALL be prevented by
   database constraints as well as serializer validation.

_Findings: AUTH-04, ADM-03, ADM-04, ADM-05, TEN-05, DATA-06_

### R7. Canonical Catalog, Capacity, Requirements, And Fees

**User Story:** As a platform operator, I want one catalog path from global
program to tenant intake and fee, so that routing, eligibility, capacity, and
payment cannot disagree.

#### Acceptance Criteria

1. NEW catalog writes SHALL follow Canonical_Program -> Program_Offering ->
   Intake_Offering and SHALL NOT accept institution/program/intake display
   strings as identifiers.
2. THE server SHALL derive tenant, snapshots, currency, fee, required documents,
   eligibility, and capacity from canonical IDs under one transactionally
   consistent configuration version.
3. THE admin UI SHALL create, edit, deactivate, and inspect offerings, linked
   intakes, capacity, eligibility, required documents, and fees through the
   canonical endpoints; legacy catalog write routes SHALL have no frontend
   caller after migration.
4. THE database SHALL enforce unique offering/intake links and one active fee
   per offering, fee type, and residency; duplicate races SHALL return 409.
5. WHEN an active offering lacks a required fee, intake, document profile, or
   other mandatory configuration, THE relevant command SHALL fail closed with a
   stable configuration error and the readiness surface SHALL name the blocker.
6. CAPACITY and waitlist operations SHALL key on tenant-scoped canonical IDs,
   lock the capacity row, and maintain constrained non-negative counters.
7. A concurrent last-seat test and two-tenant same-name test SHALL prove that
   capacity, waitlist order, fees, documents, and routing never cross tenants.

_Findings: TEN-03, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, GATE-13.2-01, GATE-13.2-02, GATE-13.5-02_

### R8. Admin Application Review And Decisions

**User Story:** As admissions staff, I want a truthful, assignment-aware review
queue with complete actions, so that I can make defensible decisions without
workarounds.

#### Acceptance Criteria

1. APPLICATION list, filters, facets, search, pagination, aggregates, and
   dashboard links SHALL be served by one scoped query contract and SHALL NOT
   infer portfolio totals from one page.
2. REVIEWER queues SHALL contain only tenant-authorized assigned work, and
   assignment candidates SHALL be searchable members eligible for that tenant.
3. STATUS, document verification, payment verification, amendment, interview,
   decision, bulk action, and export commands SHALL enforce the authority matrix
   and valid state transitions in the backend.
4. EACH command SHALL be idempotent where retry is possible, lock the affected
   workflow rows, record actor/reason/before/after, and return allowed next
   actions.
5. THE application review surface SHALL show canonical identity, submitted
   answers, evidence, payment, interview, communication, and history without
   requiring parallel legacy detail calls.
6. DASHBOARD metrics SHALL be authoritative, scope-aware, definition-labeled,
   and explicit about loading, stale, error, and unknown states; missing data
   SHALL NOT become a healthy zero.
7. REVIEWER and Tenant_Admin browser journeys SHALL complete their allowed work
   and prove denied work without relying on UI hiding.

_Findings: AUTH-01, AUTH-02, AUTH-03, ADM-01, ADM-02, API-02, MAINT-01, GATE-13.1-04_

### R9. Student Account, Profile, And Session

**User Story:** As a student, I want reliable account and profile behavior on
slow or intermittent mobile networks, so that I can safely start and resume an
application.

#### Acceptance Criteria

1. REGISTRATION, verification, login, refresh, logout, password reset, session
   expiry, and session revocation SHALL use one cookie/CSRF contract with stable
   success and error envelopes.
2. ALL HTTP methods SHALL share the same refresh and error pipeline; concurrent
   refresh attempts SHALL serialize and an unsafe request SHALL not be replayed
   without an idempotency guarantee.
3. PROFILE reads and writes SHALL have one schema, field-level validation,
   explicit save/error state, and no silently ignored fields.
4. A student SHALL see and mutate only their own profile, applications, uploads,
   payments, communications, interviews, and official documents.
5. AUTH and profile forms SHALL preserve non-secret input after recoverable
   errors and SHALL never store tokens, passwords, identity documents, or
   sensitive profile payloads in local storage or logs.
6. TESTS SHALL cover expired cookies during GET and mutation requests, refresh
   concurrency, revoked membership/role sessions, duplicate registration, and
   multi-tab logout.
7. EMAIL links SHALL be generated from trusted tenant/platform configuration and
   registered frontend routes. If email verification is required, token issue,
   expiry, consume, resend, duplicate registration, and verified-session rules
   SHALL work end to end; otherwise verification claims and dead state SHALL be
   removed through a documented migration.
8. PROFILE/settings edits SHALL use versioned per-section autosave, visible
   saved/offline/conflict state, and the same validation contract as the backend.

_Findings: API-01, API-03, STU-10, STU-20, STU-21, STU-24, AUTH-03_

### R10. One Student Application And Draft State Machine

**User Story:** As a student, I want to start, save, resume, reroute, delete, and
submit an application without duplicate or lost drafts, so that my work is
trustworthy.

#### Acceptance Criteria

1. THE application wizard SHALL require explicit `new` or `resume` intent and
   use `Application.id` as the online draft identity.
2. ONE frontend state machine SHALL own hydration, edits, local outbox,
   debounced autosave, manual save, retry, conflict, delete, payment gate, and
   submit; other modules SHALL be pure adapters or views.
3. EACH draft mutation SHALL include an optimistic version and idempotency key;
   stale versions SHALL return a merge/reload conflict without silently choosing
   the latest timestamp.
4. LOCAL pending data SHALL be keyed by user, tenant/offering, and draft ID,
   encrypted or minimized according to its sensitivity, and cleared on logout,
   successful sync, delete, or submit.
5. ASSIGNMENT fields SHALL be immutable after draft creation unless the student
   invokes one reroute command that revalidates and transactionally updates all
   canonical IDs and snapshots; any payment activity SHALL block reroute.
6. SUBMISSION SHALL re-evaluate profile, eligibility, documents, capacity, fee,
   payment/defer policy, declarations, duplicates, and optimistic version under
   row locks, then perform one legal state transition.
7. AUTOSAVE SHALL expose saving, saved, offline, retrying, and conflict states
   without blocking typing or duplicating requests.
8. TESTS SHALL cover refresh during each step, offline edit/reconnect, two tabs,
   conflict, upload retry, delete, new-versus-resume intent, reroute, payment
   activity, double submit, and slow network.
9. THE start-draft command SHALL accept the minimum canonical selection needed
   to create a valid server draft. Draft rename SHALL either be a supported,
   validated server field or be removed from all clients.
10. CACHE and outbox cleanup SHALL target one user/application identity. Starting,
    deleting, abandoning, or submitting one application SHALL NOT erase another
    draft or payment recovery record.

_Findings: STU-01, STU-02, STU-03, STU-12, DATA-03, DATA-04, MAINT-01, GATE-13.2-01, GATE-13.2-03, GATE-13.3-13, GATE-13.5-02_

### R11. Deterministic Documents, Grades, And Review Readiness

**User Story:** As a student or reviewer, I want transparent deterministic
validation, so that no hidden AI model influences admissions data or decisions.

#### Acceptance Criteria

1. THE admissions runtime SHALL make no generative AI call for student summaries,
   reviewer summaries, document classification, grade extraction, eligibility,
   verification, routing, or decisions.
2. THE student submission summary SHALL be composed deterministically from
   stored fields and current validation results and SHALL identify actionable
   blockers without persuasive or generated prose.
3. THE reviewer readiness query SHALL return payment gate, required-document
   state, identity verification state, grade/eligibility results, duplicate/late
   flags, and allowed next actions from deterministic services.
4. STUDENTS SHALL enter grades manually. Optional local OCR MAY propose subject
   and grade candidates against a versioned alias catalog, but candidates SHALL
   include provenance/confidence and require explicit confirmation before they
   become application data.
5. SUBJECT selectors SHALL contain only server-provided canonical IDs. Server
   readiness and submission SHALL require the configured minimum, at least five
   unique persisted grades where policy requires it, and program eligibility;
   fake or unresolved subject IDs SHALL never count as complete.
6. REQUIRED document controls SHALL be rendered from a versioned requirements
   snapshot on the application, not a hardcoded type list. Failure to evaluate
   canonical requirements SHALL block readiness with a retryable service error.
7. DOCUMENT uploads SHALL be immutable evidence versions with checksum, owner,
   type, scan/extraction status, verification actor, and structured notes;
   extracted analysis SHALL NOT be overloaded into human verification notes.
8. THE database SHALL enforce one current document version per application and
   requirement/type. Replace/delete commands SHALL update metadata atomically
   with object-storage compensation and preserve prior evidence history.
9. THE build SHALL remove unused browser OCR packages/assets and admissions AI
   UI, endpoints, settings, caches, throttles, circuit breakers, prompts, and
   imports. Any AI retained for another product SHALL be isolated outside the
   admissions boundary.
10. A fixture corpus SHALL prove deterministic parsing behavior, manual fallback,
   low-confidence handling, tamper/size/type rejection, and no automatic
   authority for extracted values.

_Findings: STU-06, STU-07, STU-11, STU-13, STU-19, MAINT-02_

### R12. Canonical Fee Quote And Payment Lifecycle

**User Story:** As a student or finance reviewer, I want one accurate payment
state and amount, so that I am never charged an invented or stale fee.

#### Acceptance Criteria

1. BEFORE payment, THE backend SHALL create an expiring fee quote using canonical
   offering, intake, residency, fee type, currency, provider fee policy, and
   configuration version; the frontend SHALL perform no amount arithmetic.
2. WHEN no unique active fee exists, THE quote command SHALL return
   `FEE_NOT_CONFIGURED` and SHALL NOT substitute a hardcoded amount.
3. THE wizard SHALL own pre-submission payment or allowed deferral; the student
   payment page SHALL own post-submission deferred, failed, expired, and pending
   recovery plus payment history.
4. PAYMENT states SHALL distinguish user action required, provider processing,
   paid/verified, failed/retryable, cancelled, expired, refunded, and manually
   resolved according to one backend state machine.
5. INITIALIZATION, provider callbacks, reconciliation, admin verification, and
   application-state propagation SHALL be idempotent, signed/verified where
   applicable, tenant-scoped, and auditable.
6. THE UI SHALL display server amounts, quote expiry, provider state, recovery
   action, and receipt status without hardcoded fees or indefinite disabled
   controls.
7. TESTS SHALL use a deterministic local payment adapter for success, failure,
   timeout, duplicate callback, delayed callback, expired quote, mismatch,
   defer, recovery, refund, and two-tenant settlement isolation.

_Findings: STU-08, STU-09, ADM-06, DATA-05_

### R13. Post-Submission Student Lifecycle

**User Story:** As a student, I want one place to understand and act on my
submitted application, so that payment, interview, communications, and official
documents do not become dead ends.

#### Acceptance Criteria

1. THE dashboard SHALL order each student's next required action before passive
   metrics and SHALL derive it from backend allowed-next-action data.
2. APPLICATION detail/tracker SHALL show canonical status history, payment,
   verified documents, amendments, interview, communications, decision, and
   official-document availability with precise dates and actors where permitted.
3. INTERVIEW scheduling, rescheduling, attendance, and outcome SHALL use one
   timezone-aware state machine and notify the student through durable
   communication history.
4. COMMUNICATION history SHALL show delivery state and channel without exposing
   secrets or internal provider payloads; retry SHALL be an authorized audited
   command.
5. OFFICIAL document generation, status, email, and download SHALL use one
   idempotent fingerprinted API family; legacy acceptance-letter, slip, and
   receipt callers SHALL be deprecated and removed after measured zero use.
6. WITHDRAWAL and amendment commands SHALL enforce current lifecycle rules,
   preserve history, and present a focused confirmation dialog with recovery
   information.
7. A student browser journey SHALL cover submitted/deferred payment recovery,
   amendment, interview, communication, decision, official document download,
   and terminal tracking on desktop and mobile.
8. NOTIFICATION preferences SHALL use one persisted backend/frontend schema;
   unknown channels SHALL be rejected, and the mobile navigation SHALL expose a
   single communications/inbox history rather than static placeholder settings.
9. CONDITIONAL offers SHALL support per-condition evidence/comment submission,
   replacement, review, rejection reason, reminders, and history. Enrollment
   readiness/deadline SHALL be server-authored and rechecked under the
   enrollment lock before confirmation.
10. AMENDMENT requests SHALL have owner-scoped list/detail status, prevent a
    second pending request for the same field, and notify only tenant-authorized
    recipients through the durable communication outbox.
11. OFFICIAL document generation SHALL persist durable work before returning
    202 or return `GENERATION_UNAVAILABLE`; reading an already issued artifact
    SHALL not be disabled merely because the application later becomes terminal.
12. PUBLIC tracking SHALL require a random non-PII tracking secret or a second
    factor, bind results to trusted tenant context, rate-limit attempts, and
    share a contract-valid URL. Sequential application numbers alone SHALL not
    authorize public disclosure.
13. ONE canonical student application workspace SHALL own status, next action,
    payment, documents, interview, communications, conditions, amendments,
    enrollment, and history; duplicate routes SHALL redirect to it.

_Findings: AUTH-06, API-04, STU-04, STU-05, STU-09, STU-10, STU-14, STU-15, STU-16, STU-17, STU-18, STU-21, STU-22, STU-23, STU-24, MAINT-02, GATE-13.3-09_

### R14. Strict API And Frontend Contract

**User Story:** As an engineer, I want the frontend and backend to share an
executable contract, so that compatibility normalizers cannot hide drift.

#### Acceptance Criteria

1. EVERY JSON response SHALL use the registered success or error envelope with
   stable code, human-safe message, field errors where applicable, and request
   ID; nested and string error variants SHALL NOT coexist after cutover.
2. THE OpenAPI schema SHALL describe actual route, method, authentication,
   request, response, pagination, error, and idempotency behavior and SHALL be
   generated from the candidate backend.
3. THE admissions frontend SHALL consume generated strict TypeScript contracts
   through domain service modules; direct API client calls from pages and
   components SHALL fail a lint/architecture check.
4. THE shared HTTP client SHALL use one request/response path for all methods,
   including refresh, CSRF, timeout, retry policy, envelope parsing, telemetry,
   abort, and normalized errors.
5. AFTER coordinated endpoint cutover, permissive array/result/data/application
   normalizers and legacy request aliases SHALL be deleted rather than retained
   indefinitely.
6. CONTRACT tests SHALL execute representative success and every registered
   error response for each endpoint family, then typecheck generated frontend
   fixtures against the same OpenAPI artifact.
7. BREAKING removals SHALL follow R2.5 and expose deprecation/usage telemetry
   until their exit criteria are met.

_Findings: API-01, API-02, API-03, API-04, REL-01, GATE-13.1-03, GATE-13.1-05_

### R15. Database As Enforced Canonical Truth

**User Story:** As an operator, I want repository models, migration history, and
each deployed Postgres database to agree, so that application checks are not the
only protection against corrupt tenant data.

#### Acceptance Criteria

1. SQL migrations SHALL follow expand, backfill, verify, switch, and contract;
   each change SHALL be checksum-tracked, idempotent according to the migration
   runner contract, and proven on an isolated Neon branch before production.
2. THE schema verifier SHALL introspect tables, columns, types, nullability,
   defaults, primary keys, foreign keys, validation state, unique constraints,
   checks, indexes, triggers, extensions, and migration checksums from the live
   database and the declared source.
3. UNEXPECTED drift, missing required indexes, invalid constraints, duplicate
   canonical keys, orphan tenant references, or inconsistent assignment
   snapshots SHALL fail the release gate.
4. ALL tenant foreign keys SHALL be validated after an orphan remediation
   preflight; a remaining `NOT VALID` tenant constraint SHALL block V2.
5. DATABASE constraints SHALL enforce the catalog, template version, grant,
   capacity, waitlist, fee, idempotency, and document invariants defined in
   `design.md`; services SHALL translate violations to stable errors.
6. LEGACY fields SHALL be output-only snapshots or named Legacy_Exceptions.
   Contract migrations SHALL run only after runtime reference count, legacy-row
   count, mismatch count, and telemetry removal gates are zero.
7. READ-ONLY evidence SHALL compare local/test Postgres, a fresh schema, a Neon
   branch, and production. Production changes SHALL never be the first apply.
8. THE migration history report SHALL be generated from the database, include
   every June 2026 and later migration, and link the schema fingerprint used for
   the release.
9. CANONICAL Payment rows SHALL have a mandatory application relationship after
   orphan remediation. Application payment summaries SHALL derive from Payment,
   and deprecated application payment columns SHALL be contracted only after
   mismatch and use telemetry are zero.

_Findings: TEN-08, DATA-01, DATA-02, DATA-03, DATA-05, DATA-06, DATA-07, DATA-08, DATA-09, DATA-10, DATA-11, STU-19, GATE-13.1-01, GATE-13.1-05, GATE-13.1-06, GATE-13.1-08, GATE-13.2-01, GATE-13.3-13, GATE-13.4-02, GATE-13.5-01, GATE-13.5-02, GATE-13.6-01, GATE-13.6-03_

### R16. Task-First, Mobile-Friendly, Accessible UI

**User Story:** As a mobile or assistive-technology user, I want concise,
predictable interfaces that expose the complete workflow, so that no essential
action depends on a desktop layout.

#### Acceptance Criteria

1. THE student experience SHALL be designed at 320 CSS pixels first; admin
   tables MAY become compact record lists or detail sheets without losing
   commands, filters, state, or pagination.
2. EVERY pointer target SHALL be at least 44 by 44 CSS pixels with at least 8
   pixels between adjacent targets where practical; keyboard focus order,
   visible focus, names, descriptions, errors, and modal focus containment SHALL
   meet WCAG 2.1 AA.
3. THE wizard SHALL render one mobile bottom action surface. The global bottom
   navigation SHALL not overlap, obscure, or compete with wizard controls.
4. CONTENT SHALL use the approved light-only Beanola design tokens, one page
   shell, restrained section hierarchy, no nested cards, no glassmorphism,
   decorative gradients, fake real-time animation, or unsupported dark styles.
5. THE product SHALL remove promotional copy, AI framing, redundant metrics,
   duplicate quick actions, feature narration, and destructive shortcuts from
   primary workflows while retaining necessary labels, policy, consent, and
   recovery guidance.
6. ALL dialogs SHALL be product components with keyboard support and focused
   consequences; native `window.confirm` SHALL not own a production workflow.
7. RESPONSIVE visual tests SHALL prove no horizontal overflow, clipped text,
   hidden commands, overlapping fixed surfaces, or layout shifts at 320x568,
   375x667, 390x844, 768x1024, 1280x800, and 1440x900.
8. THE student next action, current status, autosave state, payment action, and
   error recovery SHALL remain understandable under 400 percent text zoom,
   reduced motion, slow network, and offline/reconnect scenarios.

_Findings: STU-03, STU-04, STU-05, STU-10, STU-14, STU-20, STU-23, STU-24, MAINT-02, ADM-01, ADM-03, TEN-05, GATE-13.3-01, GATE-13.3-02, GATE-13.3-03, GATE-13.3-04, GATE-13.3-05, GATE-13.3-06, GATE-13.3-07, GATE-13.3-08, GATE-13.3-09, GATE-13.3-10, GATE-13.3-11, GATE-13.3-12, GATE-13.3-14, GATE-13.3-15, GATE-13.3-16_

### R17. Reliability, Observability, Privacy, And Performance

**User Story:** As an operator, I want failures to be visible and recoverable
without exposing applicant data, so that V2 can be supported in production.

#### Acceptance Criteria

1. EVERY multi-step command SHALL define transaction boundaries, idempotency,
   retry policy, timeout, compensation, and a stable operator-visible event.
2. STRUCTURED logs and traces SHALL include request/correlation ID, endpoint,
   tenant ID when authorized, actor ID, result code, latency, and retry count;
   they SHALL exclude passwords, tokens, raw documents, payment secrets, and
   unnecessary personal information.
3. METRICS SHALL cover auth failures, permission denials, tenant resolution,
   autosave conflicts, submission blockers, payment transitions, document jobs,
   domain verification, communication delivery, and migration/schema drift.
4. OPTIONAL providers SHALL use bounded retries, circuit breaking where useful,
   durable reconciliation, and honest degraded states; canonical database
   configuration SHALL fail closed, not degrade to guessed values.
5. LIST endpoints SHALL be indexed, paginated, bounded, and query-budget tested;
   large export/generation work SHALL be asynchronous with status and expiry.
6. PERFORMANCE gates SHALL measure mobile interaction and API percentiles using
   representative data and published budgets; failures SHALL not be relabeled
   as success by inventing healthy defaults.
7. SECURITY tests SHALL cover CSRF, cookie attributes, object-level tenant
   substitution, file validation, export redaction, rate limits, webhook
   verification, replay/idempotency, and session revocation.

_Findings: GOV-04, ADM-02, DATA-03, DATA-04, API-03, MAINT-01, GATE-13.1-04, GATE-13.3-07_

### R18. End-To-End Release Gate

**User Story:** As the release owner, I want one reproducible V2 gate from empty
database to real browser completion, so that nothing is left hanging.

#### Acceptance Criteria

1. THE local release harness SHALL provision isolated Postgres, Redis, object
   storage, console email, background workers, and a deterministic payment
   adapter; it SHALL seed only platform bootstrap data.
2. REQUIRED Playwright tests SHALL create two tenants and complete Platform_Admin,
   Tenant_Admin, Reviewer, Student, payment, document, interview,
   communication, audit, settlement, and official-document journeys at desktop
   and mobile viewports with zero required skips.
3. THE gate SHALL run backend unit/integration/property/concurrency tests,
   frontend unit/contract/accessibility/visual tests, generated OpenAPI
   typecheck, lint, production build, migration-from-empty, migration-from-
   production-snapshot, schema diff, and browser journeys.
4. THE gate SHALL assert there are no unhandled browser exceptions, failed
   network calls without an asserted error path, background jobs left pending,
   orphan records, cross-tenant leaks, canonical/snapshot mismatches, or
   unprocessed outbox/payment/domain/document events.
5. RELEASE evidence SHALL record commit SHA, build/version, dependency lock
   checksum, database schema fingerprint, test commands/results, browser and API
   artifacts, known exceptions, and rollback decision.
6. V2 SHALL NOT be marked complete or production-ready until every P0/P1
   finding is closed, every required task is evidenced, operator-gated items are
   explicitly signed off, and the production read-only post-deploy smoke passes.
7. AFTER deployment, THE rollout SHALL use a canary tenant, monitored migration
   and API compatibility windows, automated rollback criteria, and a final
   tenant-isolation/payment reconciliation before broad activation.

_Findings: all findings; primary GOV-01 through GOV-05, GATE-13.1-02, GATE-13.1-07, GATE-13.4-03, GATE-13.5-03, GATE-13.5-04, GATE-13.5-05_
