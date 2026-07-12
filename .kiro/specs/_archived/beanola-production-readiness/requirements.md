# Requirements Document

## Introduction

This spec tracks the remaining production-readiness work for the **Beanola** multi-school
admissions platform after the MIHAS/KATC-to-Beanola migration. The authoritative source
is the postmortem at `docs/beanola-production-postmortem-2026-06-16.md`, which concluded the
codebase is **code-close** but **not production-complete**.

The deliverables in this spec are primarily **evidence and verification gates**, not new
features. Each requirement is satisfied by producing captured, reviewable evidence
(migration logs, smoke checklists, Lighthouse reports, Playwright artifacts, timing tables,
contract diffs, suite results) and by meeting defined thresholds — not merely by writing code.
The requirements translate the postmortem's open Issue Register and "Production-Ready
Definition From Here" into testable acceptance criteria.

The work respects the repo steering: the Neon-first-then-production database workflow, the
`/api/v1/` REST contract, the `{"success": true, "data": ...}` response envelope, the rule
that destructive database operations are never run autonomously, and the design guardrails
(no purple gradients/glassmorphism/emoji icons, WCAG AA contrast, 44px touch targets, full
Inter fallback chain).

## Glossary

- **Beanola_Platform**: The multi-tenant admissions platform (frontend `apps/admissions` plus the Django backend in `backend/`) whose runtime identity is Beanola and whose schools (MIHAS, KATC) are tenant data.
- **Neon_DB**: The serverless Postgres authoring database (project `mihasApplication`, `aws-us-east-1`) used to author and validate schema/data changes first.
- **Production_DB**: The self-hosted production Postgres container `mihas-postgres-1` on the AWS EC2 host, reached only via `docker compose exec`, behind Caddy on the internal network.
- **Migration_Evidence**: The captured artifacts proving a database schema change was safely applied — dry-run output, staging apply log, idempotency re-apply log, validation SQL results, backup confirmation, and rollback/disable posture.
- **Smoke_Test_Suite**: The post-deployment manual/automated checklist executed against the deployed frontend and backend, including `/admin/tenants` and `/beanola-admin-panel/`.
- **Tenant_Admin_UI**: The product super-admin/staff UI canonical at `/admin/tenants` for onboarding and managing schools.
- **Django_Admin**: The low-level Django operational admin surface canonical at `/beanola-admin-panel/`.
- **Lighthouse_Report**: A captured Google Lighthouse mobile audit for a named route, reporting a Performance score.
- **API_Timing_Table**: A captured table of p50 and p95 latencies for the named API endpoints under representative load.
- **Entry_Path_Guard**: The CI check (`bun run check:entry`) that verifies which JavaScript chunks load on first paint.
- **Document_Action_Budget**: The gzip transfer budget (~772 KB across the two PDF engines) governing the first PDF/document-generation user action.
- **Mobile_UI_Verification**: The Playwright-driven rendered-UI check across the five named viewports for public/auth/student/admin routes.
- **Named_Viewports**: The five viewport sizes 360x800, 390x844, 768x1024, 1024x768, and 1440x900.
- **Brand_Drift_Guard**: The frontend and backend test suites plus allowlist (`docs/legacy-brand-allowlist.json`) that enforce no unreviewed legacy-brand (MIHAS/KATC) platform strings remain.
- **Contract_Sync_Process**: The CI process that generates a fresh OpenAPI artifact and contract-checks frontend tenant-admin service shapes against backend serializers.
- **Validation_Suite**: The full frontend and backend automated verification (type-check, lint, build, unit/property, Playwright, Django check, full pytest, OpenAPI generation).
- **Operational_Readiness_Review**: The captured proof that production environment variables, secure settings, backups, asset-upload security, audit retention, and break-glass recovery are in place.
- **Tenant_Onboarding_Smoke**: The end-to-end manual/automated walkthrough of onboarding one school through to official document generation and scoped visibility.
- **Launch_Scope_Gate**: The confirmation that jobs/automation/integrations stub modules are excluded from the admissions launch (`ENABLE_JOBS_OPS_ROUTES=False`).
- **Reviewer**: A human release approver who inspects captured evidence and records pass/fail against thresholds.

## Requirements

### Requirement 1: Production Database Migration And Schema Validation Evidence

**User Story:** As a release engineer, I want captured Neon-first-then-production migration evidence, so that I can prove the production schema change was applied safely and is reversible before launch.

#### Acceptance Criteria

1. THE Beanola_Platform SHALL produce Migration_Evidence that records the schema change being authored and validated on Neon_DB before any application to Production_DB.
2. WHEN a schema change carries risk, THE Migration_Evidence SHALL include a Neon_DB branch identifier on which the change was validated prior to applying to the Neon default branch.
3. THE Migration_Evidence SHALL include a dry-run output from `apply_sql_migrations --dry-run` listing the pending additive SQL scripts.
4. THE Migration_Evidence SHALL include a staging apply log showing the additive SQL scripts applied without error.
5. THE Migration_Evidence SHALL include an idempotency log showing that re-applying the same SQL scripts produces no additional schema changes.
6. THE Migration_Evidence SHALL include validation SQL results confirming `canonical_programs` count is non-zero, no duplicate institution hostnames or slugs exist, and active membership counts are present.
7. THE Migration_Evidence SHALL include a backup confirmation from `deploy/backup-db.sh` captured before the Production_DB apply.
8. THE Migration_Evidence SHALL record the recorded `migration_history` entries on Production_DB after apply, matching the intended additive SQL scripts.
9. THE Migration_Evidence SHALL document the rollback and disable posture for the change, including which changes are additive-only and therefore reversible by flag flip rather than schema revert.
10. IF a destructive SQL operation is proposed during migration, THEN THE Beanola_Platform SHALL require explicit operator confirmation and SHALL NOT execute the operation autonomously.

### Requirement 2: Production Smoke Test Evidence

**User Story:** As a release engineer, I want a recorded smoke test against the deployed environment, so that I can confirm core surfaces and both admin concepts respond correctly after deployment.

#### Acceptance Criteria

1. THE Smoke_Test_Suite SHALL be executed against the deployed Beanola_Platform frontend and backend, and the results SHALL be captured as evidence.
2. WHEN the Smoke_Test_Suite runs, THE Smoke_Test_Suite SHALL verify that the Tenant_Admin_UI at `/admin/tenants` loads and responds for an authorized super-admin.
3. WHEN the Smoke_Test_Suite runs, THE Smoke_Test_Suite SHALL verify that the Django_Admin at `/beanola-admin-panel/` loads and responds for an authorized operator.
4. THE Smoke_Test_Suite SHALL treat `/admin/tenants` and `/beanola-admin-panel/` as distinct surfaces and SHALL record a separate result for each.
5. WHEN the Smoke_Test_Suite checks an authenticated API surface, THE Smoke_Test_Suite SHALL confirm responses use the `{"success": true, "data": ...}` envelope.
6. IF any smoke check fails, THEN THE Smoke_Test_Suite SHALL record the failing surface and the observed response so the release is blocked until resolved.

### Requirement 3: Performance Validation

**User Story:** As a performance owner, I want Lighthouse scores, API timing tables, and entry-path guards captured against thresholds, so that I can confirm the platform meets its performance budget before launch.

#### Acceptance Criteria

1. THE Performance_Validation SHALL capture a Lighthouse_Report for each of the five named routes: `/`, `/auth/signup`, `/track-application`, `/student/dashboard`, and `/admin/dashboard`.
2. WHERE a route is public (`/`, `/auth/signup`, `/track-application`), THE Lighthouse_Report mobile Performance score SHALL be at least 90.
3. WHERE a route is authenticated or admin (`/student/dashboard`, `/admin/dashboard`), THE Lighthouse_Report mobile Performance score SHALL be at least 80.
4. THE Performance_Validation SHALL capture an API_Timing_Table reporting p50 and p95 latencies for tenant context, catalog offerings, draft save, application submit, payment init, payment status, tenant admin list, tenant admin detail, official document queue, official document status, official document download, and settlement summary endpoints.
5. THE API_Timing_Table SHALL record the defined p95 target for each named endpoint and SHALL mark whether each endpoint meets its target.
6. WHEN the Entry_Path_Guard runs in CI, THE Entry_Path_Guard SHALL confirm that the `vendor-react-pdf`, `vendor-pdf`, `html2canvas`, OCR, charts, and admin-heavy chunks are absent from the first-paint entry path.
7. THE Performance_Validation SHALL capture the measured Document_Action_Budget for the first PDF/document-generation action and SHALL confirm it does not exceed approximately 772 KB gzipped across the two PDF engines.
8. IF any captured Performance_Validation metric falls below its threshold, THEN THE Performance_Validation SHALL record the route or endpoint, the measured value, and the threshold so the gap is tracked.

### Requirement 4: Mobile Rendered UI Verification

**User Story:** As a UI quality owner, I want Playwright rendered-UI evidence across the named viewports, so that I can prove dense routes are usable on mobile before launch.

#### Acceptance Criteria

1. THE Mobile_UI_Verification SHALL capture Playwright screenshots and DOM checks at each of the Named_Viewports (360x800, 390x844, 768x1024, 1024x768, 1440x900) for representative public, auth, student, and admin routes.
2. WHEN Mobile_UI_Verification evaluates a route, THE Mobile_UI_Verification SHALL fail the route IF horizontal body overflow is detected.
3. WHEN Mobile_UI_Verification evaluates a route, THE Mobile_UI_Verification SHALL fail the route IF any button text is clipped.
4. WHEN Mobile_UI_Verification evaluates a route, THE Mobile_UI_Verification SHALL fail the route IF any interactive touch target is smaller than 44 by 44 pixels.
5. WHEN Mobile_UI_Verification evaluates a route, THE Mobile_UI_Verification SHALL fail the route IF an icon-only control lacks an accessible name.
6. WHEN Mobile_UI_Verification evaluates a route, THE Mobile_UI_Verification SHALL fail the route IF cards, tables, or forms overlap.
7. WHEN Mobile_UI_Verification evaluates a route that opens a dialog, THE Mobile_UI_Verification SHALL fail the route IF dialog focus management is broken.
8. THE Mobile_UI_Verification SHALL include `/admin/tenants` as a named risk route and SHALL record its ten-tab tab-list behavior across the Named_Viewports.
9. THE Mobile_UI_Verification SHALL include `/admin/applications` as a named risk route and SHALL record its dense-table scroll or card strategy across the Named_Viewports.

### Requirement 5: Brand-Leak And Drift Guard Completeness

**User Story:** As a brand owner, I want the brand-drift guards to pass with only reviewed allowlist entries, so that no unintended legacy-brand platform strings ship to production.

#### Acceptance Criteria

1. WHEN the Brand_Drift_Guard runs, THE Brand_Drift_Guard SHALL pass with no hard platform-brand leaks (such as `MIHAS Platform APIs`, `MIHAS Admissions`, `MIHAS-KATC PDF`, `MIHAS/2.0`, `mihas-admin-panel`, or `mihas.edu.zm` platform addresses) in scanned active platform paths.
2. THE Brand_Drift_Guard SHALL confirm that every remaining MIHAS/KATC string in active source maps to a reviewed entry in `docs/legacy-brand-allowlist.json` classified as tenant data, legacy compatibility, historical example, or preview fixture.
3. THE Brand_Drift_Guard SHALL confirm that `docs/legacy-brand-allowlist.json` is valid JSON and contains no stale entries for files that no longer contain legacy-brand strings.
4. WHERE the optional client PDF preview cleanup is performed, THE Beanola_Platform SHALL replace the MIHAS/KATC client PDF preview sample profiles with neutral or backend-driven preview data so no MIHAS/KATC strings remain in the client PDF preview source.
5. WHEN an acceptance-letter preview is requested for an unknown or empty institution, THE Beanola_Platform SHALL resolve to a neutral Beanola preview profile and SHALL NOT resolve to a MIHAS profile.

### Requirement 6: Frontend And Backend Contract Sync

**User Story:** As an API maintainer, I want a fresh OpenAPI artifact and contract checks in CI, so that frontend tenant-admin services stay aligned with backend serializers and error codes.

#### Acceptance Criteria

1. WHEN the Contract_Sync_Process runs in CI, THE Contract_Sync_Process SHALL generate a fresh OpenAPI artifact via `manage.py spectacular`.
2. THE Contract_Sync_Process SHALL contract-check the frontend tenant-admin service request and response shapes against the backend serializers for institution CRUD, domains, offerings and rules, routing simulator, required documents, templates, document profiles, assets, staff memberships and grants, settlement, and audit.
3. IF a frontend tenant-admin service shape diverges from its backend serializer, THEN THE Contract_Sync_Process SHALL report the diverging endpoint and field so it is resolved before launch.
4. THE Contract_Sync_Process SHALL confirm that frontend error handling maps the backend error code for each tenant-admin endpoint, including recoverable routing failures and out-of-scope 404 responses.

### Requirement 7: Full Validation Suite Execution

**User Story:** As a release engineer, I want the full frontend and backend validation suites to pass, so that I can prove the codebase is green before launch.

#### Acceptance Criteria

1. THE Validation_Suite SHALL run the admissions frontend `type-check`, `lint`, `build`, and unit and property tests, and SHALL capture a passing result for each.
2. THE Validation_Suite SHALL run the admissions Playwright mobile and desktop smoke tests and SHALL capture a passing result.
3. THE Validation_Suite SHALL run the backend `manage.py check` and SHALL capture a passing result.
4. THE Validation_Suite SHALL run the full backend pytest suite including tenant lifecycle, admin, and student journey tests, and SHALL capture a passing result.
5. WHEN the Validation_Suite generates the OpenAPI schema, THE Validation_Suite SHALL produce zero schema errors.
6. WHEN the Validation_Suite generates the OpenAPI schema, THE Beanola_Platform SHALL add an explicit schema field or type hint to `CanonicalProgramSerializer.get_available_offerings` so the schema generation produces zero warnings.
7. IF any Validation_Suite step fails, THEN THE Validation_Suite SHALL record the failing step and output so the release is blocked until resolved.

### Requirement 8: Operational Readiness

**User Story:** As an operations owner, I want production environment, security, backup, storage, audit, and recovery posture proven, so that the platform can run safely in production.

#### Acceptance Criteria

1. THE Operational_Readiness_Review SHALL confirm that all required production environment variables are set, including `SECRET_KEY` and `LENCO_API_SECRET_KEY`, without echoing their secret values.
2. THE Operational_Readiness_Review SHALL confirm secure production settings: `DEBUG=False`, HSTS enabled, a Content-Security-Policy present, and CORS and CSRF trusted origins configured.
3. THE Operational_Readiness_Review SHALL capture evidence of a completed backup-and-restore drill against the Production_DB.
4. THE Operational_Readiness_Review SHALL confirm tenant asset upload security on the production object storage, including content-type and file-shape validation.
5. THE Operational_Readiness_Review SHALL confirm audit log retention settings and sensitive-metadata redaction are in effect, with no PII or secrets persisted in audit records.
6. THE Operational_Readiness_Review SHALL document the super-admin break-glass recovery procedure and confirm super-admin account recovery is possible.

### Requirement 9: Tenant Onboarding End-To-End Smoke

**User Story:** As a platform operator, I want a recorded end-to-end onboarding walkthrough for one school, so that I can prove the full tenant journey works before launch.

#### Acceptance Criteria

1. THE Tenant_Onboarding_Smoke SHALL create a school (institution) through the Tenant_Admin_UI and SHALL capture the result.
2. THE Tenant_Onboarding_Smoke SHALL upload a logo asset and a signature asset for the school and SHALL confirm they are stored.
3. THE Tenant_Onboarding_Smoke SHALL configure a document profile and a document template for the school.
4. THE Tenant_Onboarding_Smoke SHALL assign a program and offering to the school.
5. THE Tenant_Onboarding_Smoke SHALL create a staff membership and an access grant scoped to the school.
6. THE Tenant_Onboarding_Smoke SHALL exercise the routing simulator for the school and SHALL capture the routed outcome.
7. THE Tenant_Onboarding_Smoke SHALL submit a student application against the school and SHALL complete a payment.
8. THE Tenant_Onboarding_Smoke SHALL generate an official document for the application using the backend tenant profile and assets.
9. WHEN a scoped staff member views applications, THE Beanola_Platform SHALL show only records within that staff member's tenant scope and SHALL mask out-of-scope records as not-found.
10. WHEN a super-admin views applications, THE Beanola_Platform SHALL show records across all tenants.

### Requirement 10: Launch Scope Confirmation For Jobs/Automation/Integrations Stubs

**User Story:** As a launch owner, I want the jobs/automation/integrations stub modules confirmed out of scope, so that incomplete domains do not ship with the admissions launch.

#### Acceptance Criteria

1. THE Launch_Scope_Gate SHALL confirm that `ENABLE_JOBS_OPS_ROUTES` is set to `False` for the admissions launch.
2. WHILE `ENABLE_JOBS_OPS_ROUTES` is `False`, THE Beanola_Platform SHALL exclude the jobs, automation, and integrations stub routes from the admissions launch surface.
3. THE Launch_Scope_Gate SHALL record the scope-out decision as evidence so the excluded stub modules are explicitly acknowledged rather than silently shipped.
