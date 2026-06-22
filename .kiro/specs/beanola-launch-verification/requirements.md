# Requirements Document

## Introduction

This feature captures the remaining production-launch verification and hardening
work identified in the 2026-06-16 Beanola production-readiness postmortem
(`docs/beanola-production-postmortem-2026-06-16.md`). The postmortem concludes
the Beanola multi-tenant admissions platform is **code-close** but **not yet
production complete**: the open work is primarily evidence-gathering, mobile
rendered-UI proof, full-suite execution, performance validation under
staging/production-like conditions, and operational hardening.

This is a **verification, evidence, and hardening feature**, not a feature that
adds new product behavior. Each requirement is expressed as a testable,
evidence-oriented gate: the platform is not declared launch-ready until each gate
produces the named, reviewable artifact and that artifact meets the stated
threshold. The requirements track the postmortem's "Final Issue Register" and its
"Production-Ready Definition From Here" exit criteria.

This spec is standalone and intentionally separate from
`.kiro/specs/beanola-production-readiness/`. It does not modify, merge with, or
reuse that spec.

### Operating Guardrails (binding on all requirements)

- **Database authoring is Neon-first.** Schema and data changes are authored and
  proven on Neon (branch first for anything risky), then copied to the
  self-hosted EC2 production Postgres (`mihas-postgres-1`). Production is never
  the first place a change lands. Production writes are operator-gated and
  backup-first.
- **No public Postgres port.** The production database stays on the internal
  Docker compose network behind Caddy.
- **No PII or secret logging.** Evidence artifacts must redact secrets,
  credentials, raw phone numbers, NRC/passport values, and document bodies.
- **Mobile-first and WCAG AA.** Touch targets >= 44x44 px, AA contrast minimum.
- **Product-surface design rules.** No purple gradients, gradient text,
  glassmorphism on product surfaces, nested cards, or emoji icons.
- **Two canonical admin surfaces are not interchangeable.** The product
  tenant-admin UI at `/admin/tenants` and the Django operational admin at
  `/beanola-admin-panel/` are distinct and must both be verified.

## Glossary

- **Launch_Verification**: The overall process and artifact set that determines
  whether the Beanola platform is declared production-launch-ready.
- **Verification_Engineer**: The role executing the verification gates and
  capturing evidence.
- **Operator**: The role authorized to perform operator-gated production actions
  (backups, production migration apply) on the EC2 host.
- **Evidence_Artifact**: A reviewable, persisted output (log, report file,
  table, screenshot, JSON, SQL output) that proves a gate was executed and its
  result, stored under `docs/launch-evidence/` (or a path named in the design).
- **Migration_Evidence_Gate**: The gate covering database migration dry-run,
  staging apply, idempotency apply, validation SQL, backup proof, and
  rollback/disable posture.
- **Smoke_Test_Gate**: The gate covering production smoke tests against the
  deployed frontend and backend, including both canonical admin surfaces.
- **Performance_Gate**: The gate covering Lighthouse mobile reports and the
  live API p50/p95 timing table.
- **Mobile_UI_Gate**: The gate covering Playwright rendered-UI verification at
  the named viewport sizes.
- **Bundle_Guard**: The CI guardrail that keeps heavy chunks off the entry path
  and enforces a separate document-generation performance budget.
- **Suite_Execution_Gate**: The gate covering full frontend and backend
  test/build/check suite execution.
- **Brand_Scan_Gate**: The gate covering the brand-drift scan and its reviewed
  allowlist.
- **Contract_Sync_Gate**: The gate covering OpenAPI artifact generation in CI
  and frontend/backend tenant-admin contract checks.
- **Operational_Readiness_Gate**: The gate covering secure production settings,
  backup/restore drill, asset upload security, audit retention, and super-admin
  recovery.
- **Onboarding_Smoke_Gate**: The gate covering the end-to-end tenant onboarding
  smoke run.
- **Scope_Gate**: The gate confirming jobs/automation/integrations stubs stay
  out of admissions launch scope.
- **Tenant_Admin_UI**: The product super-admin/staff UI at `/admin/tenants`.
- **Django_Admin**: The Django operational admin at `/beanola-admin-panel/`.
- **Neon**: The serverless Postgres authoring database (`mihasApplication`).
- **Production_DB**: The self-hosted Docker Postgres `mihas-postgres-1` on the
  EC2 host.
- **Entry_Path**: The set of entry and preloaded JavaScript chunks loaded on
  first paint of a public route.
- **Public_Route**: An unauthenticated route (`/`, `/auth/signup`,
  `/track-application`).
- **Authenticated_Route**: A route requiring login (`/student/dashboard`,
  `/admin/dashboard`, and admin tenant/application routes).

## Requirements

### Requirement 1: Production/Staging Database Migration Evidence

**User Story:** As a Verification_Engineer, I want captured, Neon-first database
migration evidence, so that production schema changes are proven safe, reversible
in posture, and backup-protected before launch.

#### Acceptance Criteria

1. WHEN a migration dry-run is executed on Neon before any production apply, THE
   Migration_Evidence_Gate SHALL produce an Evidence_Artifact recording the
   dry-run, including the applied migration script identifier(s), the Neon target
   (branch or default branch), and the planned schema changes the dry-run reports.
2. WHEN the pending additive SQL migration scripts are applied to staging, THE
   Migration_Evidence_Gate SHALL produce an Evidence_Artifact recording the
   staging apply together with the resulting `migration_history` entries, with one
   recorded entry per applied script.
3. WHEN the same migration scripts are applied a second time, THE
   Migration_Evidence_Gate SHALL record in an Evidence_Artifact that the second
   apply produces zero additional schema changes and zero new `migration_history`
   entries (idempotency evidence).
4. WHEN post-apply validation SQL is executed, THE Migration_Evidence_Gate SHALL
   produce an Evidence_Artifact confirming all tenant invariants:
   `canonical_programs` count greater than or equal to 1, active `institutions`
   count greater than or equal to 1, zero duplicate institution hostnames, zero
   duplicate institution slugs, and active memberships count greater than or equal
   to 1.
5. IF any post-apply tenant invariant fails validation (zero `canonical_programs`,
   zero active `institutions`, one or more duplicate hostnames, one or more
   duplicate slugs, or zero active memberships), THEN THE Migration_Evidence_Gate
   SHALL record the specific failed invariant in an Evidence_Artifact and SHALL
   mark the migration evidence as failed rather than recording a passing result.
6. IF a production apply is recorded, THEN THE Migration_Evidence_Gate SHALL
   include backup proof captured by `deploy/backup-db.sh` bearing a completion
   timestamp that precedes the production apply start time by no more than 60
   minutes.
7. THE Migration_Evidence_Gate SHALL document, for each migration, a rollback or
   disable posture stating that schema changes are additive and that rollback is
   performed by redeploy or feature disable rather than a destructive revert.
8. WHERE a schema or data change is risky, THE Migration_Evidence_Gate SHALL
   record in an Evidence_Artifact that the change was validated on a Neon branch
   before the Neon default branch and before Production_DB.
9. THE Migration_Evidence_Gate SHALL exclude connection strings, database
   passwords, and any secret values from every recorded Evidence_Artifact.
10. IF a migration dry-run on Neon reports an error or schema conflict, THEN THE
    Migration_Evidence_Gate SHALL record the error in an Evidence_Artifact and
    SHALL withhold any production-apply evidence until a subsequent dry-run records
    zero errors.

### Requirement 2: Production Smoke-Test Evidence

**User Story:** As a Verification_Engineer, I want production smoke-test evidence
against the deployed system, so that core flows and both canonical admin surfaces
are confirmed working post-deploy.

#### Acceptance Criteria

1. WHEN a smoke run executes, THE Smoke_Test_Gate SHALL produce an
   Evidence_Artifact that, for each smoke check against the deployed frontend and
   the deployed backend, records the target identifier, the observed result, the
   pass/fail outcome, and the execution timestamp.
2. WHEN a smoke check targets the Tenant_Admin_UI at `/admin/tenants`, THE
   Smoke_Test_Gate SHALL record the check as passed only if the surface returns a
   successful (non-error) reachability response within a 10-second timeout, and
   SHALL record it as failed otherwise.
3. WHEN a smoke check targets the Django_Admin at `/beanola-admin-panel/`, THE
   Smoke_Test_Gate SHALL record the check as passed only if the surface returns a
   successful (non-error) reachability response within a 10-second timeout, and
   SHALL record it as failed otherwise.
4. THE Smoke_Test_Gate SHALL treat `/admin/tenants` and `/beanola-admin-panel/`
   as distinct surfaces and record a separate result for each.
5. WHEN a smoke check targets a state-changing endpoint, THE Smoke_Test_Gate
   SHALL issue a request that omits valid cookie-based auth and CSRF protection
   and SHALL record the check as passed only if that request is rejected rather
   than processed.
6. IF any smoke check fails, THEN THE Smoke_Test_Gate SHALL record the failing
   surface and the observed result, retain the Evidence_Artifact, and mark the
   gate as not passed.

### Requirement 3: Lighthouse Mobile And Live API Timing Evidence

**User Story:** As a Verification_Engineer, I want Lighthouse mobile reports and a
live API timing table, so that performance meets defined thresholds under
staging/production-like conditions.

#### Acceptance Criteria

1. WHEN the Performance_Gate runs against the deployed staging/production-like
   target, THE Performance_Gate SHALL produce Lighthouse mobile reports for `/`,
   `/auth/signup`, `/track-application`, `/student/dashboard`, and
   `/admin/dashboard`, where each route's recorded score is the median of at least
   3 runs.
2. WHERE a route is a Public_Route, THE Performance_Gate SHALL require a
   Lighthouse mobile performance score, on the 0-to-100 scale, of at least 90.
3. WHERE a route is an Authenticated_Route or admin route, THE Performance_Gate
   SHALL require a Lighthouse mobile performance score, on the 0-to-100 scale, of
   at least 80.
4. WHEN the Performance_Gate runs against the deployed target, THE
   Performance_Gate SHALL produce a p50 and p95 live API timing table, expressed
   in milliseconds and based on at least 100 sampled requests per surface,
   covering tenant context, catalog offerings, draft save, application submit,
   payment init, payment status, tenant admin list, tenant admin detail, official
   document queue, official document status, official document download, and
   settlement summary.
5. THE Performance_Gate SHALL state the defined p95 target, in milliseconds, for
   each measured API surface and record the measured value against that target.
6. IF a measured Lighthouse score or API p95 value does not meet its stated
   threshold, THEN THE Performance_Gate SHALL record the shortfall (the measured
   value, the threshold, and the surface), retain the measurements, and mark the
   gate as not passed.
7. IF a Lighthouse report or an API timing measurement cannot be produced for a
   surface, or the sample count for a surface is below the required minimum, THEN
   THE Performance_Gate SHALL mark that surface as not measured and mark the gate
   as not passed.

### Requirement 4: Mobile Rendered-UI Verification

**User Story:** As a Verification_Engineer, I want Playwright rendered-UI proof at
multiple viewport sizes, so that mobile and dense admin routes render without
layout, accessibility, or interaction defects.

#### Acceptance Criteria

1. WHEN the Mobile_UI_Gate is invoked, THE Mobile_UI_Gate SHALL run Playwright
   rendered-UI checks at viewport sizes 360x800, 390x844, 768x1024, 1024x768, and
   1440x900 pixels.
2. WHEN the Mobile_UI_Gate runs, THE Mobile_UI_Gate SHALL check every route in the
   public, auth, student, and admin route sets, including `/admin/tenants` and
   `/admin/applications`, at each of the five viewport sizes in criterion 1.
3. IF a checked route exhibits horizontal body overflow, defined as document body
   scrollWidth exceeding the active viewport width by more than 1 pixel, THEN THE
   Mobile_UI_Gate SHALL fail that route check and record the offending route and
   viewport size.
4. IF a checked route exhibits clipped button text, defined as a control whose
   text content scrollWidth exceeds its rendered clientWidth, THEN THE
   Mobile_UI_Gate SHALL fail that route check and record the offending control,
   route, and viewport size.
5. IF a checked route contains an interactive touch target with a rendered width
   or height smaller than 44x44 pixels, THEN THE Mobile_UI_Gate SHALL fail that
   route check and record the control, route, and viewport size.
6. IF a checked route contains an icon-only control without an accessible name,
   defined as an interactive control with no non-empty accessible name from text
   content, `aria-label`, or `aria-labelledby`, THEN THE Mobile_UI_Gate SHALL fail
   that route check and record the control, route, and viewport size.
7. IF a checked route exhibits overlapping cards, tables, or forms, defined as
   intersecting bounding rectangles of two such sibling layout regions, THEN THE
   Mobile_UI_Gate SHALL fail that route check and record the overlap, route, and
   viewport size.
8. IF a dialog on a checked route loses focus containment or cannot be dismissed
   by the Escape key or its close control, THEN THE Mobile_UI_Gate SHALL fail that
   route check and record the dialog, route, and viewport size.
9. IF a checked route does not reach a loaded, interactive state within 30 seconds
   at a given viewport size, THEN THE Mobile_UI_Gate SHALL fail that route check
   and record the route and viewport size.
10. WHEN the Mobile_UI_Gate completes all route checks, THE Mobile_UI_Gate SHALL
    report an overall failed outcome if one or more route checks failed at any
    viewport size, and an overall passed outcome only if every route check passed
    at every viewport size.
11. WHEN the Mobile_UI_Gate checks `/admin/tenants` and `/admin/applications`, THE
    Mobile_UI_Gate SHALL produce a screenshot Evidence_Artifact for each of these
    routes at each of the five viewport sizes, each artifact labeled with its
    route and viewport size.

### Requirement 5: Bundle And Performance Guardrails

**User Story:** As a Verification_Engineer, I want enforced bundle guardrails, so
that heavy document, monitoring, and admin chunks stay off the public entry path
and document generation has its own performance budget.

#### Acceptance Criteria

1. WHEN the Bundle_Guard runs in CI, THE Bundle_Guard SHALL confirm the Entry_Path
   excludes `vendor-react-pdf`, `vendor-pdf`, `html2canvas`, OCR chunks, chart
   chunks, and admin-only page chunks.
2. IF any excluded chunk appears in the Entry_Path, THEN THE Bundle_Guard SHALL
   fail the CI check and record the offending chunk.
3. THE Bundle_Guard SHALL enforce an Entry_Path gzipped size budget of at most
   150 KB and record the measured gzipped Entry_Path size against that budget.
4. IF the measured gzipped Entry_Path size exceeds the 150 KB budget, THEN THE
   Bundle_Guard SHALL fail the CI check and record the measured size against the
   budget.
5. THE Bundle_Guard SHALL define a document-generation and download performance
   budget covering the two PDF engines (`@react-pdf/renderer` and `jspdf`), with a
   hard upper bound of 772 KB gzip transferred on the first user action that
   triggers PDF generation or download.
6. IF the document-generation download exceeds the 772 KB gzip budget on the first
   PDF action, THEN THE Bundle_Guard SHALL fail the CI check and record the overage
   against the budget.
7. THE Bundle_Guard SHALL verify and record a review of Sentry initialization and
   sampling confirming `vendor-sentry` is not loaded on the Entry_Path of a
   Public_Route.
8. IF `vendor-sentry` is present on the Entry_Path of a Public_Route, THEN THE
   Bundle_Guard SHALL fail the CI check and record the finding.

### Requirement 6: Full-Suite Execution Gates

**User Story:** As a Verification_Engineer, I want the full frontend and backend
suites executed and recorded, so that launch is backed by green build, lint,
type, test, and schema results.

#### Acceptance Criteria

1. WHEN the admissions type-check, lint (executed with a maximum of 0 allowed
   warnings), and build commands each complete with exit code 0 and zero reported
   errors, THE Suite_Execution_Gate SHALL record each command string, its exit
   code, and a passing result with a completion timestamp.
2. WHEN the admissions unit tests, property tests, and the Playwright smoke run
   each complete with exit code 0 and zero failed tests, THE Suite_Execution_Gate
   SHALL record each suite's executed, passed, and failed test counts and a
   passing result.
3. WHEN the Django system check command completes with exit code 0 and reports
   zero issues at ERROR or CRITICAL severity, THE Suite_Execution_Gate SHALL record
   a passing Django system check result.
4. WHEN the full backend pytest run completes with exit code 0 and zero failed
   tests, and the run includes the tenant lifecycle, admin journey, and student
   journey tests, THE Suite_Execution_Gate SHALL record a passing result with
   executed, passed, failed, and skipped test counts.
5. WHEN OpenAPI schema generation completes with exit code 0 and zero schema
   errors, THE Suite_Execution_Gate SHALL record a passing schema-generation
   result.
6. WHEN OpenAPI schema generation completes with zero warnings, including
   resolution of the `CanonicalProgramSerializer.get_available_offerings` schema
   warning, THE Suite_Execution_Gate SHALL record a passing zero-warning result.
7. WHEN every required suite result (admissions type-check, lint, build, unit
   tests, property tests, Playwright smoke, Django system check, backend pytest,
   and OpenAPI schema generation) has been recorded as passing, THE
   Suite_Execution_Gate SHALL mark the gate as passed.
8. IF any recorded suite result has a non-zero exit code, one or more failed tests,
   or any reported error or warning where zero is required, THEN THE
   Suite_Execution_Gate SHALL mark the gate as not passed, record the failing
   command string and its exit code, and retain all previously recorded passing
   results.

### Requirement 7: Brand-Drift Scan Acceptance

**User Story:** As a Verification_Engineer, I want a passing brand-drift scan with
a tight reviewed allowlist, so that legacy school names appear only as legitimate
tenant data behind guards.

#### Acceptance Criteria

1. WHEN the Brand_Scan_Gate runs across the guard-defined active scanned source
   paths, THE Brand_Scan_Gate SHALL record the scan as passed only if zero hard
   platform-brand leaks exist outside `docs/legacy-brand-allowlist.json`, and SHALL
   record the count of files scanned and the count of leaks found.
2. THE Brand_Scan_Gate SHALL validate `docs/legacy-brand-allowlist.json` as
   well-formed JSON and record the validation result.
3. IF `docs/legacy-brand-allowlist.json` is not well-formed JSON, THEN THE
   Brand_Scan_Gate SHALL fail, record the parse error, and record no passing
   result.
4. THE Brand_Scan_Gate SHALL confirm that every allowlist entry references a
   single existing file, is classified as exactly one of legitimate tenant seed,
   legacy compatibility, historical example, or client-side preview fixture, and
   currently contains at least one allowlisted pattern.
5. IF an allowlist entry is stale, defined as an entry whose referenced file no
   longer exists or no longer contains an allowlisted pattern, THEN THE
   Brand_Scan_Gate SHALL fail and record the stale entry.
6. WHERE MIHAS or KATC strings remain in active source, THE Brand_Scan_Gate SHALL
   confirm they are tenant seed or preview data behind guards rather than platform
   identity.
7. IF the brand-drift scan detects a hard platform-brand leak outside the
   allowlist, THEN THE Brand_Scan_Gate SHALL fail and record the leaking string
   and the file path.

### Requirement 8: Frontend/Backend Contract Sync

**User Story:** As a Verification_Engineer, I want CI-generated OpenAPI and
contract checks across every tenant-admin tab, so that frontend tenant-admin
services stay aligned with backend serializers.

#### Acceptance Criteria

1. WHEN a CI pipeline run executes for the tenant-admin surface, THE
   Contract_Sync_Gate SHALL generate an OpenAPI Evidence_Artifact from the current
   backend serializers within that same pipeline run, and SHALL fail the CI run if
   artifact generation does not complete.
2. WHEN the Contract_Sync_Gate runs, THE Contract_Sync_Gate SHALL contract-check
   each frontend tenant-admin service request and response shape against its
   corresponding backend serializer, including the `{"success": true, "data": ...}`
   envelope structure.
3. THE Contract_Sync_Gate SHALL contract-check the endpoints backing every
   tenant-admin tab — institution CRUD, domains, offerings and rules, routing
   simulator, required documents, templates, document profiles, assets, staff
   memberships and grants, settlement, and audit — and SHALL fail the CI run if any
   listed tab has zero endpoints checked.
4. THE Contract_Sync_Gate SHALL verify that, for each tenant-admin endpoint, the
   frontend error handling maps every backend error code the endpoint can return,
   including recoverable routing-simulator failures and out-of-scope not-found
   (404) responses.
5. IF a frontend tenant-admin request or response shape diverges from the backend
   serializer, THEN THE Contract_Sync_Gate SHALL fail the CI run and record the
   diverging field name and the endpoint path in the Evidence_Artifact.
6. IF a frontend tenant-admin endpoint omits a mapping for a backend error code it
   can return, THEN THE Contract_Sync_Gate SHALL fail the CI run and record the
   unmapped error code and the endpoint path in the Evidence_Artifact.

### Requirement 9: Operational Readiness

**User Story:** As an Operator, I want proven secure production settings and
operational drills, so that the deployed platform is hardened, recoverable, and
auditable.

#### Acceptance Criteria

1. WHEN the Operational_Readiness_Gate runs against the production configuration,
   THE Operational_Readiness_Gate SHALL confirm `DEBUG` is disabled and that
   `SECRET_KEY` is set to a value of at least 50 characters that is not equal to
   any value present in tracked example or template files.
2. WHEN the Operational_Readiness_Gate runs against the production configuration,
   THE Operational_Readiness_Gate SHALL confirm that secure cookies, trusted
   origins, CORS allowed hosts, CSRF allowed hosts, HTTPS redirection, HSTS with a
   max-age of at least 31536000 seconds, and a Content-Security-Policy are each
   present and non-empty.
3. WHEN the Operational_Readiness_Gate runs against the production configuration,
   THE Operational_Readiness_Gate SHALL confirm that per-user rate limiting is
   enabled for every payment, authentication, and AI-touching endpoint, and that
   each configured limit is greater than zero requests per window.
4. WHEN the Operational_Readiness_Gate runs against the production configuration,
   THE Operational_Readiness_Gate SHALL confirm that email, payment,
   object-storage, and error-monitoring credentials are each set to a non-empty
   value, and SHALL record only the credential name and a present/absent indicator
   without recording the credential value.
5. WHEN the Operational_Readiness_Gate runs, THE Operational_Readiness_Gate SHALL
   record a completed backup-and-restore drill whose record includes the drill
   timestamp, a restore that completed within 60 minutes (RTO), and a verified
   restored row count matching the source within a 0-row variance for audited
   tables (RPO).
6. WHEN the Operational_Readiness_Gate runs against production object storage, THE
   Operational_Readiness_Gate SHALL confirm that tenant asset upload validation
   rejects any upload whose declared content-type is not in the configured
   allow-list and whose file shape fails the configured size and structure checks,
   and SHALL record the rejection outcome.
7. WHEN the Operational_Readiness_Gate runs against the production configuration,
   THE Operational_Readiness_Gate SHALL confirm that audit retention is configured
   to 90 days for standard records and 365 days for security records, and that
   name, NRC, passport, contact, and payment-instrument metadata are redacted in
   stored audit records.
8. WHEN the Operational_Readiness_Gate runs, THE Operational_Readiness_Gate SHALL
   confirm that a super-admin account recovery and break-glass procedure document
   exists and is non-empty.
9. IF any required production setting or credential checked in criteria 1 through 8
   is absent or fails its check, THEN THE Operational_Readiness_Gate SHALL fail,
   SHALL record the missing or failing setting by name without revealing its value,
   and SHALL leave the production configuration unchanged.

### Requirement 10: End-To-End Tenant Onboarding Smoke

**User Story:** As a Verification_Engineer, I want a full tenant onboarding smoke
run, so that the multi-tenant journey works end to end with correct scoping.

#### Acceptance Criteria

1. WHEN a school is created through the Tenant_Admin_UI, THE Onboarding_Smoke_Gate
   SHALL record the step as passed only after confirming the created school is
   retrievable by its assigned identifier with a unique hostname and unique slug.
2. WHEN logo and signature assets are uploaded for the created school, THE
   Onboarding_Smoke_Gate SHALL record the step as passed only after confirming each
   uploaded asset is retrievable and associated with the created school.
3. WHEN a document profile and template configuration are saved for the created
   school, THE Onboarding_Smoke_Gate SHALL record the step as passed only after
   confirming the saved configuration is retrievable and scoped to the created
   school.
4. WHEN a program and offering are assigned to the created school, THE
   Onboarding_Smoke_Gate SHALL record the step as passed only after confirming the
   assignment is retrievable and scoped to the created school.
5. WHEN staff membership and access grant are created for the created school, THE
   Onboarding_Smoke_Gate SHALL record the step as passed only after confirming the
   membership and the access grant are active and scoped to the created school.
6. WHEN a routing simulator run executes for the created school, THE
   Onboarding_Smoke_Gate SHALL record the step as passed only after confirming the
   run completes and returns a result scoped to the created school.
7. WHEN a student application is submitted against the created school, THE
   Onboarding_Smoke_Gate SHALL record the step as passed only after confirming the
   application is persisted and scoped to the created school.
8. WHEN a scoped staff member reads records, THE Onboarding_Smoke_Gate SHALL
   confirm that in-scope records are returned and that each out-of-scope record
   returns a not-found response indicating the record does not exist.
9. WHEN a super-admin reads records across schools, THE Onboarding_Smoke_Gate SHALL
   confirm that records from every onboarded school remain visible to the
   super-admin.
10. WHEN a payment is recorded against the created school, THE
    Onboarding_Smoke_Gate SHALL record the step as passed only after confirming the
    payment reaches a verified state scoped to the created school.
11. WHEN an official document is generated against the created school, THE
    Onboarding_Smoke_Gate SHALL record the step as passed only after confirming the
    document is produced from the created school's document profile.
12. IF any onboarding step fails, returns an error response, or does not complete
    within 60 seconds, THEN THE Onboarding_Smoke_Gate SHALL halt the run, record
    the identity of the failing step, and report the run as failed without
    recording subsequent steps as passed.

### Requirement 11: Launch Scope Confirmation

**User Story:** As a Verification_Engineer, I want explicit scope-out
confirmation, so that unshipped jobs/automation/integrations stubs do not enter
the admissions launch.

#### Acceptance Criteria

1. WHEN the Scope_Gate evaluates the admissions launch configuration prior to
   launch approval, THE Scope_Gate SHALL verify that `ENABLE_JOBS_OPS_ROUTES` is
   set to `False`.
2. IF `ENABLE_JOBS_OPS_ROUTES` is set to any value other than `False` in the
   admissions launch configuration, THEN THE Scope_Gate SHALL fail, block launch
   approval, and record the flag's evaluated value.
3. WHERE a jobs, automation, or integrations module has no recorded ship decision
   for the admissions launch, THE Scope_Gate SHALL verify that none of that
   module's stub routes under `/api/v1/` are reachable in the launch configuration,
   where a route is reachable if a request to its path is served by the application
   instead of being rejected as not found.
4. IF a jobs, automation, or integrations stub route under `/api/v1/` is reachable
   in the launch configuration without a recorded ship decision, THEN THE
   Scope_Gate SHALL fail, block launch approval, and record the full path of each
   reachable route.

### Requirement 12: Launch-Ready Definition Of Done

**User Story:** As a Verification_Engineer, I want a single launch-ready rollup,
so that the platform is declared production-launch-ready only when every gate has
passed.

#### Acceptance Criteria

1. THE Launch_Verification SHALL produce a single rollup status, whose value is
   exactly one of `production-launch-ready` or `not-production-launch-ready`, by
   aggregating the pass/fail status of all 11 gates: the Migration_Evidence_Gate,
   Smoke_Test_Gate, Performance_Gate, Mobile_UI_Gate, Bundle_Guard,
   Suite_Execution_Gate, Brand_Scan_Gate, Contract_Sync_Gate,
   Operational_Readiness_Gate, Onboarding_Smoke_Gate, and Scope_Gate.
2. WHILE any aggregated gate is not passed, THE Launch_Verification SHALL report
   the platform as `not-production-launch-ready` and SHALL identify each gate that
   is not passed.
3. IF any of the 11 gates has a missing, unknown, or not-yet-evaluated status,
   THEN THE Launch_Verification SHALL treat that gate as not passed and report the
   platform as `not-production-launch-ready`.
4. WHEN every aggregated gate has passed, THE Launch_Verification SHALL report the
   platform as `production-launch-ready` and reference each gate's
   Evidence_Artifact.
5. IF every gate has passed but any referenced Evidence_Artifact is missing or
   unreadable, THEN THE Launch_Verification SHALL withhold the
   `production-launch-ready` verdict and report the platform as
   `not-production-launch-ready`.
6. THE Launch_Verification SHALL store every referenced Evidence_Artifact in the
   single reviewable location named in the design document.
