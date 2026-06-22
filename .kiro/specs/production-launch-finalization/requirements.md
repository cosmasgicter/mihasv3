# Requirements Document

## Introduction

This feature drives the Beanola admissions platform from "major implementation
complete" to "100% end-to-end production ready". It captures the eight phases of
the End-to-End Production Readiness Finalization Runbook
(`docs/runbooks/end-to-end-production-readiness-finalization.md`) as testable
requirements and encodes the non-negotiable launch rules that govern the release
decision.

Beanola Technologies owns and operates the Platform. MIHAS, KATC, and every
other school are tenant data only. Student flows are program-first; admin
authority is capability-based; the frontend never invents authority from local
role strings. No production launch is approved without real, readable evidence
for all eleven launch gates, and no launch is approved while the release branch
carries accidental or unrelated changes.

The work spans release hygiene, frontend legacy purge, backend/database/contract
synchronization, tenant onboarding, launch evidence completion, operations
documentation cleanup, performance hardening closure, and the final Go/No-Go
release decision. Completion is defined by the launch rollup returning
`production-launch-ready` with no gate unknown.

## Glossary

- **Platform**: The Beanola-owned, multi-tenant admissions system comprising the
  admissions frontend, the jobs-ops frontend, and the Django backend.
- **Tenant**: A scoped `Institution` record (for example MIHAS or KATC). Tenants
  are data, never the Platform identity or owner.
- **Super_Admin**: A Beanola platform operator whose authority is platform-wide,
  derived only from `role == "super_admin"`.
- **Tenant_Admin**: A scoped school operator whose authority is derived only from
  active, non-expired `UserInstitutionMembership` and `AccessGrant` records.
- **Reviewer**: A scoped application reviewer for assigned Institutions only.
- **Student**: An applicant who accesses only their own application data.
- **Capability_Service**: The backend `AdminCapabilityService`
  (`backend/apps/catalog/services.py`) that resolves every authority decision.
- **Scope_Endpoint**: `GET /api/v1/admin/scope/`.
- **Capabilities_Endpoint**: `GET /api/v1/admin/capabilities/`.
- **Catalog_Context_Endpoint**: `GET /api/v1/catalog/context/`.
- **Domain_Resolver**: `InstitutionContextService.resolve`, which fails closed to
  the neutral Beanola context.
- **Notification_Service**: The admissions frontend `notificationService` and the
  `useNotificationPolling` hook.
- **Cursor_Polling**: Notification polling using an optional `after` parameter
  (`?after=<id>`) instead of count-based or page-number mode.
- **Release_Engineer**: The human or agent preparing the release branch.
- **Launch_Verifier**: The launch verification tooling under
  `scripts/launch-verification/`, including `rollup.py`.
- **Launch_Evidence**: Artifacts under `docs/launch-evidence/` that prove each
  gate.
- **Launch_Rollup**: The conservative aggregation produced by `rollup.py` and
  written to `docs/launch-evidence/launch-readiness.md`.
- **Onboarding_Harness**: `scripts/launch-verification/run-onboarding-smoke.py`.
- **Perf_Cache**: The scoped caches gated by `PERF_CACHE_CAPABILITIES`,
  `PERF_CACHE_DASHBOARD`, and `PERF_CACHE_CATALOG`.
- **Schema_Drift_Checker**: The Django `check_schema_drift` management command.
- **Bundle_Guard**: `scripts/launch-bundle-guard.ts` and its budget thresholds.
- **Eleven_Gates**: The eleven launch readiness gates aggregated by the
  Launch_Rollup, including migration, smoke, performance, mobile-ui, and
  onboarding.
- **Production_Ready_Verdict**: The Launch_Rollup verdict string
  `production-launch-ready`.

## Requirements

### Requirement 1: Release Hygiene And Branch Control

**User Story:** As a Release_Engineer, I want the dirty worktree turned into a
release-shaped, reviewable branch, so that another engineer can review, test,
and deploy the release safely.

#### Acceptance Criteria

1. WHEN the Release_Engineer captures the worktree state via `git status --short`, THE Release_Engineer SHALL classify every listed changed or untracked file into exactly one of the seven defined buckets, leaving no file unclassified: tenant authority and multi-tenant backend, frontend tenant admin and multi-tenant UX, performance hardening, launch verification and evidence, branding cleanup, operational docs and deploy, or unrelated/generated artifact.
2. IF a changed or untracked file is a generated artifact (build output, compiled or minified bundles, dependency directories, coverage or test-report output, cache directories, or editor/OS temporary files) and is not located under `docs/launch-evidence/`, THEN THE Release_Engineer SHALL remove the file from the release branch.
3. IF a changed or untracked file cannot be classified into a bucket, THEN THE Release_Engineer SHALL mark the file for manual review in the release notes and SHALL retain the file without deleting user work.
4. THE Release_Engineer SHALL split the release work into the five defined reviewable units: tenant authority and backend scoping, frontend tenant admin and capability-driven navigation, performance hardening and notification cursor polling, launch evidence and runbooks, and final legacy branding purge.
5. THE Release_Engineer SHALL include a scope summary, a risk summary, the tests run, the evidence artifacts created or updated, and a rollback path in each reviewable unit.
6. WHEN the release branch is prepared for review, THE Release_Engineer SHALL ensure `git status --short` lists only files whose bucket maps to the active reviewable unit, with no files belonging to another unit, no generated artifacts, and no unclassified files.
7. THE Release_Engineer SHALL exclude build output (compiled, bundled, or minified assets and generated reports) from the release branch unless that output is located under `docs/launch-evidence/` as an explicit Launch_Evidence artifact.

### Requirement 2: Frontend Legacy Purge And Multi-Tenant Future-Readiness

**User Story:** As a Student or admin user, I want every frontend surface to be
tenant-aware and capability-aware, so that the Platform serves any current or
future school without single-tenant assumptions.

#### Acceptance Criteria

1. WHEN the active admissions frontend runtime code (excluding tests and named compatibility migration modules) is scanned with a case-insensitive match for the tokens MIHAS, KATC, mihas.edu.zm, and katc.edu.zm, THE scan SHALL return zero unauthorized matches, where an authorized match is limited to tenant data rendering, a named compatibility migration module with a removal condition, or a test fixture.
2. WHERE a legacy frontend reference remains, THE Platform SHALL record the reference in a frontend legacy allowlist with a documented removal condition.
3. THE admissions frontend SHALL resolve all authority decisions from the Capabilities_Endpoint and the Scope_Endpoint rather than from local role strings.
4. THE admissions frontend SHALL contain no role-string authority checks outside named compatibility helpers or tests.
5. THE admissions frontend SHALL resolve all tenant branding from the Catalog_Context_Endpoint, tenant asset APIs, tenant document profile APIs, or official document generation responses.
6. WHEN no tenant context is resolved, THE admissions frontend SHALL render only neutral Beanola defaults in SEO metadata, page titles, auth pages, navigation labels, student dashboard empty states, application wizard copy, notification settings, payment pages, and PDF preview UI, with zero hardcoded school names, domains, logos, or contacts.
7. THE admissions frontend SHALL present `apps/admissions/public/.well-known/security.txt` with Beanola contacts, the Beanola canonical URL, and the Beanola policy URL.
8. WHERE a user holds super-admin capability, THE admissions frontend SHALL display the `/admin/tenants` console and the `/admin/tenants/new` onboarding control.
9. WHERE a Tenant_Admin holds `tenant.profile.read`, THE admissions frontend SHALL display the `/admin/tenants` school console and SHALL hide the `/admin/tenants/new` onboarding control.
10. THE admissions frontend SHALL produce a set of capability-gated route identifiers for mobile navigation equal to the set for desktop navigation, with each route gated by the same capability on both.
11. WHEN a Student starts an application, THE admissions frontend SHALL present a program-first selection that resolves `institution_id`, fees, required documents, intakes, branding, and document templates from the selected program offering without asking the Student to choose a school as a platform concept.
12. WHERE the request resolves to a white-label tenant domain, THE admissions frontend SHALL narrow the offered programs to that tenant's offerings.
13. THE admissions frontend SHALL prefix all browser storage keys with a single common Beanola namespace, and SHALL include a tenant identifier segment and a user identifier segment in tenant-specific stored state so that no two tenants or users share a stored entry.
14. IF a stored selected institution is no longer in the user's scope, THEN THE admissions frontend SHALL discard the stored selected institution.
15. WHEN the Notification_Service has completed its initial load, THE Notification_Service SHALL poll on a 60-second interval with tab-visibility pause using Cursor_Polling with `?after=<id>`, and SHALL merge new results into cache de-duplicated by notification identifier.
16. THE Notification_Service SHALL retain page-number polling mode only for the full communications page.
17. IF the Capabilities_Endpoint or the Scope_Endpoint returns an authorization failure or an empty scope, THEN THE admissions frontend SHALL render a no-access state and SHALL display no tenant data and no capability-gated route or control.

### Requirement 3: Backend, Database, And Contract Sync

**User Story:** As a Platform operator, I want backend authority, schema, SQL
migrations, caches, and frontend contracts synchronized against a real Postgres
target, so that production behavior matches what was validated.

#### Acceptance Criteria

1. WHEN the Perf_Cache flags `PERF_CACHE_CAPABILITIES`, `PERF_CACHE_DASHBOARD`, and `PERF_CACHE_CATALOG` are enabled in staging, THE Release_Engineer SHALL enable them in the order capabilities, then dashboard, then catalog, confirming each flag reports enabled before enabling the next.
2. WHEN a membership is created, updated, or deactivated, THE Platform SHALL invalidate the capability cache within 5 seconds such that subsequent capability reads return the updated state.
3. WHEN an access grant is created, updated, or deactivated, THE Platform SHALL invalidate the capability cache within 5 seconds such that subsequent capability reads return the updated state.
4. WHEN a tenant is updated or deactivated, THE Platform SHALL invalidate the dashboard cache and the catalog cache within 5 seconds such that subsequent reads return the updated state.
5. WHEN a program, intake, required document, or template is updated, THE Platform SHALL invalidate the catalog cache and the tenant document profile cache within 5 seconds such that subsequent reads return the updated state.
6. WHEN the performance index script is applied to the Postgres target, THE Platform SHALL expose the index `idx_applications_status_submitted_at` in that database's index catalog.
7. WHEN the Schema_Drift_Checker runs against Postgres with foreign-key-index and migration-history-coverage checks, THE Schema_Drift_Checker SHALL report exactly zero drift items across both checks.
8. WHILE a Tenant_Admin is scoped to one tenant, THE Platform SHALL deny that Tenant_Admin the ability to list another tenant's applications, create institutions, activate another tenant's domains, or grant themselves capabilities, returning a 404 or non-revealing 403 that discloses no other tenant's identifier, name, count, or attribute.
9. WHERE the actor holds super-admin capability, THE Platform SHALL permit creation of tenants, domains, memberships, templates, document profiles, and program assignments.
10. WHEN the OpenAPI schema is regenerated, THE Launch_Verifier SHALL report zero contract differences between the frontend contract and the regenerated schema.
11. WHEN the targeted backend test suites run under both the SQLite test settings and a Postgres-backed settings file, THE targeted backend test suites SHALL report zero failed tests and zero errored tests under both databases.
12. IF the Schema_Drift_Checker detects any drift item, THEN THE Schema_Drift_Checker SHALL report the detected drift and THE release SHALL be treated as not production-ready.
13. IF the frontend contract differs from the regenerated OpenAPI schema, THEN THE Launch_Verifier SHALL report the contract as out of sync and THE release SHALL be treated as not production-ready.
14. IF a cache-invalidation operation fails, THEN THE Platform SHALL fail safe by serving freshly computed data rather than stale cached data.

### Requirement 4: Tenant Domain And Onboarding End-To-End

**User Story:** As a Super_Admin, I want to onboard a new school without code
changes and receive real student applications through its configured portal, so
that the Platform proves true multi-tenancy.

#### Acceptance Criteria

1. WHEN a Super_Admin creates a new institution, uploads assets, configures templates, required documents, and fees, assigns canonical programs, configures intakes, and configures a tenant domain through the admin console, THE Platform SHALL onboard the new school with no source-code modification and no redeploy, leaving the institution active and its portal reachable.
2. WHEN the Super_Admin requests domain verification, THE Domain_Resolver SHALL transition the domain only along the documented status machine pending_dns to pending_review to verified to active, using a DNS lookup with a 10-second timeout.
3. IF domain verification fails or times out, THEN THE Domain_Resolver SHALL keep the domain at pending_dns, set a descriptive `last_error` of at most 1000 characters, and propagate no exception.
4. WHILE a Tenant_Admin for the new school is signed in, THE Platform SHALL display only that tenant's data and SHALL deny creating a new institution, viewing other tenants' applications, activating another tenant's domain, and granting themselves super-admin capabilities, returning for each denial a 404 or non-revealing 403 that discloses no other tenant's identifier, name, count, or attribute.
5. WHEN a Student visits the configured tenant domain, THE admissions frontend SHALL render that tenant's logo, name, and theme as resolved from the tenant context.
6. WHEN a Student submits an application from the resolved tenant context, THE Platform SHALL create the application with the canonical `institution_ref_id`, `program_ref_id`, and `intake_ref_id` of the resolved tenant and selected offering.
7. WHEN a Student's application is created, THE Platform SHALL set the required documents, payment amount, and currency to match the tenant and program configuration.
8. WHEN an official document is generated for the new tenant's application, THE Platform SHALL render the document using the tenant's logo, signature, and template.
9. WHEN the Onboarding_Harness runs against the staging base URL and all onboarding checks pass, THE Onboarding_Harness SHALL write `docs/launch-evidence/10-onboarding/onboarding-evidence.json` with an onboarding gate status of `passed`.
10. THE Onboarding_Harness SHALL exclude secret values from the onboarding evidence artifact.
11. WHEN a newly onboarded tenant is deactivated, THE Platform SHALL leave no active staff scope referencing the deactivated tenant.
12. WHEN the onboarding scenario is repeated for a second tenant using the same canonical program, THE Platform SHALL complete the scenario successfully for the second tenant.
13. IF an application create request supplies an `institution_id` different from the resolved tenant context, THEN THE Platform SHALL reject the request with no mutation and retain the resolved tenant binding.
14. IF any onboarding check fails, THEN THE Onboarding_Harness SHALL write the evidence artifact with a gate status other than `passed`.

### Requirement 5: Launch Evidence Completion

**User Story:** As a Launch decision owner, I want all missing evidence
artifacts generated, so that the conservative Launch_Rollup can approve the
launch.

#### Acceptance Criteria

1. WHEN Gate 1 migration verification completes, THE Launch_Verifier SHALL write `docs/launch-evidence/01-migration/migration-evidence.json` proving backup before production apply, dry-run pass, staging apply pass, idempotency apply pass, recorded migration history rows, validated tenant invariants, and recorded rollback posture.
2. WHEN Gate 2 smoke verification completes, THE Launch_Verifier SHALL write `docs/launch-evidence/02-smoke/smoke-evidence.json` covering health live and ready, public landing, auth session, CSRF flow, student sign-in, admin sign-in, `/admin/tenants`, `/admin/dashboard`, catalog context on the shared portal, catalog context on a tenant domain, application create/draft/submit, payment initiation safe path, document generation safe path, and the notification list cursor path.
3. WHEN Gate 3 performance verification completes, THE Launch_Verifier SHALL write `docs/launch-evidence/03-performance/performance-evidence.json` proving a Lighthouse performance-score median of at least 90 for each verified route, recorded API timing samples whose median is at most 500 ms per sampled endpoint, dashboard cache enabled and observed, catalog cache enabled and observed, capability cache enabled and observed, notification Cursor_Polling observed, Bundle_Guard evidence within the Requirement 7 budgets of at most 150 KB gzipped on the entry path and at most 772 KB gzipped on the first PDF action, and an entry-path median route timing that does not exceed the previously recorded baseline.
4. WHEN Gate 4 mobile UI verification completes, THE Launch_Verifier SHALL write `docs/launch-evidence/04-mobile-ui/mobile-ui-evidence.json` proving that, at each of the viewports 360x800, 390x844, 768x1024, 1024x768, and 1440x900 across public, auth, student, admin, tenant onboarding, and application wizard paths for both Tenant_Admin and Super_Admin views: no page produces horizontal overflow beyond the viewport width, every interactive control presents a touch target of at least 44x44 px and lies fully within the viewport bounds, and every mobile navigation control is reachable and operable.
5. WHEN Gate 10 onboarding verification completes, THE Launch_Verifier SHALL write `docs/launch-evidence/10-onboarding/onboarding-evidence.json` per Requirement 4.
6. WHEN the Launch_Rollup runs after a readable Launch_Evidence artifact exists for each of the Eleven_Gates and each artifact reports a gate status of `passed`, THE Launch_Rollup SHALL return the Production_Ready_Verdict.
7. WHEN the Launch_Rollup runs, THE Launch_Rollup SHALL report no gate as `unknown`.
8. IF any Launch_Evidence artifact is missing or unreadable, THEN THE Launch_Rollup SHALL withhold the Production_Ready_Verdict.
9. WHEN the Launch_Verifier writes any Launch_Evidence artifact, THE Launch_Verifier SHALL record in that artifact a machine-readable gate status of exactly one of `passed`, `failed`, or `unknown` and a generation timestamp.
10. IF any Launch_Evidence artifact reports a gate status other than `passed`, THEN THE Launch_Rollup SHALL withhold the Production_Ready_Verdict.

### Requirement 6: Operations And Documentation Cleanup

**User Story:** As a Platform operator, I want operations and public
documentation to describe the current Beanola Platform, so that responders are
not misled by stale MIHAS deployment content.

#### Acceptance Criteria

1. THE Platform SHALL present Beanola canonical content — identifying Beanola as the platform owner with no unauthorized MIHAS/KATC/school-domain references except content explicitly marked as sample tenant data — in `deploy/RUNBOOK.md`, `deploy/GRAFANA-DASHBOARDS-AND-ALERTS.md`, `deploy/GRAFANA-CLOUD-STEP-BY-STEP.md`, `deploy/.env.prod.example`, `deploy/docker-compose.prod.yml` comments, `deploy/harden-host.sh` comments, and `deploy/backup-db.sh` backup prefix and bucket examples.
2. THE Platform SHALL present Beanola canonical content, identifying Beanola as the platform owner with no unauthorized school references except content explicitly marked as sample tenant data, in `docs/api/VERSIONING.md`, `docs/api/ROLLBACK.md`, and `docs/api/DEPLOYMENT_CHECKLIST.md`.
3. WHERE a tenant-specific historical document is retained, THE Platform SHALL display a visible top-of-document notice marking the document as historical or sample tenant data.
4. THE Platform SHALL present monitoring labels using the Beanola production hostname, Beanola dashboard names, and Beanola alert folder names.
5. WHEN a backup is taken and restored into a disposable Postgres target, THE Release_Engineer SHALL record the backup completion time, restore completion time, a row-count variance of zero, the recovery time objective, and the recovery point objective as backup/restore drill evidence.
6. WHEN operational readiness verification runs with production-derived facts, THE Launch_Verifier SHALL produce operational readiness evidence under `docs/launch-evidence/` based on those production-derived, non-synthetic facts.
7. WHEN any operational or public surface is scanned, THE Platform SHALL contain no token that identifies MIHAS as the Platform.
8. THE Platform SHALL document the disk gate, image prune, and rollback procedures.
9. WHEN the disk gate, image prune, and rollback procedures are verified, THE Release_Engineer SHALL record a pass or fail result for each procedure.
10. IF a backup restore drill fails, THEN THE Release_Engineer SHALL record the failure and THE release SHALL be treated as not production-ready.

### Requirement 7: Performance Hardening Closure

**User Story:** As a Platform operator, I want scoped caches and bounded
background work proven on the single-host deployment, so that performance is
hardened rather than merely implemented.

#### Acceptance Criteria

1. WHEN the capability, dashboard, and catalog caches are enabled, THE Platform SHALL apply the time-to-live values of 60 seconds for capabilities, 45 seconds for dashboard, and 450 seconds for catalog.
2. WHEN a second same-scope dashboard request occurs within the 45-second dashboard cache time-to-live after a first dashboard request that computed and stored a result, and before any cache-invalidating event for that scope, THE Platform SHALL serve the second request from cache and SHALL return a result identical to the stored result.
3. THE Platform SHALL use distinct cache keys for distinct tenants so that two tenants never share a cache entry.
4. IF Redis is unavailable when a cacheable result is requested, THEN THE Platform SHALL degrade to database computation, SHALL return the correct computed result, SHALL surface no user-facing error, and SHALL record the cache-unavailable degradation for operations review.
5. THE Platform SHALL bound payment polling to at most 10 items per run, a Lenco timeout of at most 10 seconds, at most 2 retries, and a task wall time of at most 90 seconds.
6. THE Platform SHALL process condition expiry and draft expiry using bulk update and bulk notification and email helpers, and SHALL not re-send a notification or email for any already-processed item within a single run.
7. THE Bundle_Guard SHALL enforce an entry-path budget of at most 150 KB gzipped and a first PDF action budget of at most 772 KB gzipped, with no Sentry on the public entry path and no PDF, chart, or admin-only chunks on the public entry path.
8. THE Platform SHALL serve the first public route with no single raster image whose transferred size exceeds 100 KB, SHALL serve tenant logos as optimized assets, and SHALL exclude PDF-only assets from the public first load.
9. WHEN the Platform is released, THE Platform SHALL have every implemented performance item enabled and observable, including the capability cache, the dashboard cache, the catalog cache, the bounded payment polling task, and the Bundle_Guard budgets, such that no implemented performance item remains disabled at launch.

### Requirement 8: Final Release Decision

**User Story:** As a Launch decision owner, I want a single authoritative
Go/No-Go gate, so that the Platform launches only when every readiness condition
is proven.

#### Acceptance Criteria

1. WHEN the full verification command set runs, THE verification command set SHALL return a success exit status with zero failed checks for the backend local-logic suites, the backend launch-property suites, the frontend type-check, the frontend targeted test suite, the frontend build, the Bundle_Guard, the brand scan, the launch scope check, and the Launch_Rollup.
2. WHEN the Postgres-backed backend suite, the deployed smoke check, the performance gate, the mobile UI gate, and the onboarding gate run against staging or production-like targets, THE respective gates SHALL each report a passed status with zero failed checks.
3. THE Go/No-Go checklist SHALL be approved only when every checklist item is answered yes and backed by a readable Launch_Evidence artifact: the branch is clean and release-shaped; all migrations are proven on Postgres; backup/restore evidence is real rather than synthetic; all performance caches are enabled and observed; notification polling uses Cursor_Polling; active frontend runtime code has zero unauthorized legacy tenant leaks; every Tenant_Admin surface enforces tenant scope; a Super_Admin can onboard a new school without code changes; a tenant domain routes Students to the correct school context; tenant assets, signatures, templates, and documents are tenant-configured; mobile, admin, student, and public routes pass visual defect checks; and `docs/launch-evidence/launch-readiness.md` states the Production_Ready_Verdict.
4. IF any Go/No-Go checklist item is answered no, OR any verification command returns a non-success exit status, OR any check fails, OR any gate does not report a passed status, THEN THE release SHALL be treated as not production-ready.
5. THE Launch_Rollup SHALL report the Production_Ready_Verdict with no gate reported as `unknown` before the release is approved.

### Requirement 9: Non-Negotiable Launch Rules

**User Story:** As the Platform owner, I want the non-negotiable launch rules
enforced across every phase, so that authority drift and unsafe launches are
structurally prevented.

#### Acceptance Criteria

1. THE Platform SHALL treat Beanola Technologies as the platform owner and platform identity.
2. THE Platform SHALL treat MIHAS, KATC, and every other school as tenant data only.
3. WHEN a Student applies, THE Platform SHALL resolve the `institution_id`, the application fee amount and currency, the required documents, the branding assets, the signatures, and the document templates automatically from the selected program offering and tenant configuration, without asking the Student to choose a school as a platform concept.
4. THE Platform SHALL resolve every admin authority decision through the Capability_Service using capabilities rather than raw role-string comparison.
5. THE admissions frontend SHALL derive no authority from local role strings and SHALL consume the Scope_Endpoint and the Capabilities_Endpoint for authority decisions.
6. IF the Scope_Endpoint or the Capabilities_Endpoint returns a 403 response or an empty scope, THEN THE admissions frontend SHALL render a no-access state and SHALL display no tenant data.
7. IF a tenant branding asset, signature, or document template is not configured for the selected program offering, THEN THE Platform SHALL fall back to the neutral Beanola asset and SHALL NOT substitute another tenant's asset.
8. IF an application create request supplies a tenant identifier different from the resolved tenant context, THEN THE Platform SHALL reject the request with no mutation and a non-revealing error that discloses no other tenant's identifier, name, count, or attribute, and SHALL retain the resolved tenant binding.
9. IF the Capability_Service cannot resolve a capability set for an admin authority decision, THEN THE Platform SHALL fail closed by denying the action, exposing zero capabilities, returning no tenant data, and returning an authorization error.
10. IF a machine-readable Launch_Evidence artifact that parses successfully, is non-empty, and carries a gate status field does not exist for every one of the Eleven_Gates, THEN THE release SHALL be treated as not production-ready.
11. IF `git status --short` on the release branch lists any file that is not classified into one of the seven defined release buckets and intentionally included for the active reviewable unit, THEN THE release SHALL be treated as not production-ready.
