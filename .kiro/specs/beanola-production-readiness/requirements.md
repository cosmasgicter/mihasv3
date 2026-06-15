# Requirements Document

## Introduction

This spec takes the MIHAS/Beanola multi-school admissions platform from
**code-complete** to **production-ready**. Its authoritative source is the
**Beanola Production Readiness Follow-Up Plan**
(`docs/beanola-production-readiness-followup-plan.md`): a 15-phase plan with an
Operating Standard, Non-Negotiables, Definition of Done, and Final Agent
Instructions. Each of those becomes one or more testable EARS requirements here.

This spec does **not** re-deliver the behaviour already shipped by the
remediation spec `.kiro/specs/multi-tenant-beanola-remediation/` (requirements
R1–R21, all tasks complete and Neon-validated). That spec already delivered:
migration delivery/ordering (R1–R2), cross-tenant document security — OCR scope
and official-document deletion protection (R3–R4), official-document
consolidation with the backend fingerprint/current-version lifecycle (R5–R7),
tenant document profiles (R8), brand fallback removal plus the brand drift guard
(R9–R10), admin config validation (R11–R13), tenant-aware communication
templates (R14), program-first assignment edge cases (R15), provenance/audit
(R16–R17), document UI states (R18), drift guards (R19), and rollout-runbook
honesty (R20–R21). This spec **references** that spec for the underlying
behaviour and verifies it in production conditions.

The **one open item** carried over from the remediation spec is the **production
application of the additive multi-tenant schema** to the self-hosted EC2
Postgres — a backup-gated operator step documented in
`docs/runbooks/multi-tenant-beanola-rollout.md`. This spec owns that gated
cutover (Requirement 3) and adds the production-readiness work the follow-up
plan introduces: full-surface audits (API contract, tenant scope, documents),
per-route and mobile-first UI/UX critique across the Mobile_Breakpoint set,
end-to-end workflow QA, backend reliability/operations, security/privacy review,
performance/Core Web Vitals, data quality/seed readiness, the CI gate, and the
production launch checklist with rollback posture.

**Scope boundary:** this plan is admissions/Beanola-tenant focused. The
`apps/jobs-ops/` surface and its backend domains are **out of scope** unless a
requirement explicitly names jobs-ops.

**Hard constraints that bound every requirement** (from the plan's Operating
Standard, Non-Negotiables, and the repo steering) are captured as first-class
testable requirements in Requirement 16 (platform invariants) and Requirement 15
(production-ready exit gate), and are referenced throughout.

## Glossary

### Reused canonical terms (from `.kiro/specs/multi-tenant-beanola-remediation/`)

- **Beanola**: The platform owner and central payment collector. The default brand on the Shared_Portal before a school is assigned. Beanola is platform identity; schools are never platform identity.
- **Institution / School**: A client tenant (MIHAS, KATC, future schools). Row in `institutions`; identity is `institutions.id`. Tenant data only.
- **Canonical_Program**: A shared cross-school program definition (`canonical_programs.id`). What a student chooses first.
- **Offering**: A school-specific program (`programs` row) linked to a Canonical_Program via `programs.canonical_program_id` and owned by an institution via `programs.institution_id`.
- **Intake**: An admission window (`intakes`); per-offering availability/capacity/priority lives in `program_intakes`.
- **Assignment_Service**: `backend/apps/catalog/services.py:OfferingAssignmentService` — resolves institution + offering + intake + required documents from a chosen Canonical_Program.
- **Access_Scope_Service**: `backend/apps/catalog/services.py:AccessScopeService` — computes the institution/offering/application IDs a non-super-admin may access.
- **Scope_Filters**: The dataclass returned by Access_Scope_Service describing whether the caller is global and which IDs they may access.
- **Super_Admin**: A global actor with platform-wide access.
- **School_Staff**: A non-super-admin admin/reviewer bounded by Memberships and Access_Grants.
- **RBAC_Hierarchy**: The role ordering `super_admin > admin > reviewer > student` (`backend/apps/accounts/permissions.py:ROLE_HIERARCHY`).
- **Migration_Runner**: The management command `backend/apps/common/management/commands/apply_sql_migrations.py`.
- **Tenant_Migration**: The additive, idempotent multi-tenant schema SQL at the Deployable_Migration_Path `backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql` (plus the three additive follow-on scripts: student-number, document profiles, communication templates).
- **Deployable_Migration_Path**: The top-level `backend/scripts/` location (date-ordered filename) from which the Migration_Runner actually applies SQL.
- **Migration_History_Prerequisite**: `2026_05_22_migration_history_extend.sql`, required before the Migration_Runner will run.
- **Official_Document**: A backend-generated canonical PDF (`ApplicationDocument` row with `system_generated=True`) carrying tenant provenance in `verification_notes.official_document`.
- **Official_Document_Generator**: `backend/apps/applications/tasks/pdf_generation.py` — the tenant-aware backend generator.
- **Client_PDF_Generators**: The frontend functions `generateApplicationSlip`, `generateAcceptanceLetter`, `generatePaymentReceipt` exported from `@/lib/pdf` — preview/draft use only.
- **Institution_Document_Profile**: The backend tenant document-content record (`institution_document_profiles`) holding structured sections, fee chart, bank accounts, requirements, signatory, rules, and version.
- **Institution_Asset**: Versioned logo/signature/seal in `institution_assets` (storage key, MIME, checksum, version).
- **Access_Grant**: Row in `access_grants` granting scoped extra access at institution, program-offering, or application scope, optionally time-bounded.
- **Communication_Template**: Row in `communication_templates` driving notification/email content with `{{variable}}` substitution and tenant-aware resolution.
- **Brand_Allowlist**: The reviewed allowlist file `docs/legacy-brand-allowlist.json` naming the files permitted to contain MIHAS/KATC/Mukuba/Kalulushi/legacy-domain strings.
- **Brand_Drift_Guard**: The paired guards `backend/tests/unit/test_brand_drift_guard.py` and `apps/admissions/tests/unit/brandDriftGuard.test.ts`.
- **Canonical_Truth_Map**: `docs/canonical-truth-map.md` — the master index mapping every domain concept to its single source of truth.
- **Audit_Event**: A row written through the platform audit mechanism (`audit_logs`) recording actor, action, target, and non-PII metadata.
- **Legacy_String_Fields**: The pre-existing columns `applications.institution`, `applications.program`, `applications.intake` — immutable read-only display snapshots.
- **API_Envelope**: The `{"success": true, "data": ...}` response envelope used by all authenticated endpoints, with paginated payloads shaped `{page, pageSize, totalCount, results}` inside `data`.
- **Not_Found_Envelope**: The HTTP 404 `{"success": false}` not-found response whose status code, error code, and message are byte-identical for an out-of-scope resource and a missing resource, so existence cannot be inferred.

### New production-readiness terms (this spec)

- **Definition_of_Done**: The set of exit conditions in the plan's "Definition Of Done" section; the platform is production-ready only when all are true (Requirement 15).
- **Production_Cutover**: The gated, backup-first operator procedure that applies the Tenant_Migration and follow-on additive scripts to the production EC2 Postgres after Neon validation (Requirement 3).
- **Neon_First_Workflow**: The infrastructure rule that all schema/data changes are authored and validated on Neon (project `wild-bar-37055823`) first and copied to the self-hosted EC2 production Postgres second; production is never the first place a change lands and production applies are never run from the development environment (`.kiro/steering/infrastructure.md`).
- **Operator**: The human who performs the gated Production_Cutover on the EC2 box during a maintenance window after explicit user confirmation.
- **Mobile_Breakpoint**: One of the required responsive widths the UI is verified at: 360px, 390px, 768px, 1024px, and desktop (≥1440px). "360px" is the primary mobile target.
- **UI_Route**: A single addressable screen in `apps/admissions` (public, student, or admin) enumerated in the plan's Phase 7 route matrix.
- **Smoke_Check**: A single-execution post-deploy verification step (automated job or documented manual script) that confirms a critical surface works after deploy, distinct from property-based or iterated tests.
- **E2E_Flow**: A scripted end-to-end user journey (student, admin, or negative) listed in the plan's Phase 9.
- **Verification_Gate**: The CI-reproducible command set that must pass with **zero errors** before production-ready: backend `python3 -m pytest`, `python3 manage.py check`, `python3 manage.py spectacular`; admissions `bun run type-check`, `bun run lint`, `bun run test`, and `bun run build` (Requirement 13).
- **Drift_Guard**: A CI-blocking test that fails when a canonical source and its mirror diverge (brand, document-flow, official-document dedup, scope, unscoped-endpoint, canonical-tenant, payment-status, error-code, role-mirror, application-lifecycle, schema). Inventoried in the Canonical_Truth_Map.
- **Production_Readiness_Status_Document**: `docs/multi-tenant-beanola-progress.md` (and the plan file), updated with date/time and evidence as phases complete.

## Requirements

### Requirement 1: Freeze the Canonical Architecture

**User Story:** As a platform engineer, I want exactly one authoritative source for every business concept recorded in the Canonical_Truth_Map before further code changes, so that any new agent or engineer can identify the source of truth for any concept without ambiguity.

#### Acceptance Criteria

1. THE Canonical_Truth_Map SHALL record the single source of truth for the platform brand, tenant brand, the admin route `/beanola-admin-panel/`, the email sender/default contact, the OpenAPI metadata, and the Brand_Allowlist.
2. THE Canonical_Truth_Map SHALL contain a "No New Mirrors Without Guard" section stating that any enum, status, error code, document type, route name, role, permission, payment state, or tenant scope shared by both frontend and backend requires a Drift_Guard.
3. WHERE a domain concept has both a frontend mirror and a backend source of truth, THE concept SHALL have either a registered Drift_Guard test or an explicit backend-only note recorded in the Canonical_Truth_Map.
4. IF a domain concept or frontend mirror exists in active runtime source without a corresponding Canonical_Truth_Map entry and (where a mirror exists) a Drift_Guard test, THEN THE Verification_Gate SHALL fail.
5. WHERE a legacy-fallback branch exists in active runtime source, THE branch SHALL be named as legacy, SHALL be covered by a test, SHALL NOT execute for new canonical records, and SHALL have a documented removal condition recorded in the Canonical_Truth_Map.
6. THE Canonical_Truth_Map SHALL contain no platform-level language that presents MIHAS as the platform identity rather than a tenant.

### Requirement 2: Brand and Tenant Boundary Cleanup

**User Story:** As the platform owner, I want the branding migration finished without destroying legitimate tenant data, so that generic platform surfaces present Beanola while seeded tenant, historical, and preview references remain only where reviewed.

#### Acceptance Criteria

1. THE Brand_Drift_Guard SHALL pass, failing IF `MIHAS`, `KATC`, `Mukuba`, `Kalulushi`, `mihas.edu.zm`, `katc.edu.zm`, or a legacy MIHAS API/app domain appears in non-allowlisted active runtime source under `apps/admissions/src`, `apps/admissions/index.html`, `backend/apps`, or `backend/config`.
2. THE Brand_Allowlist SHALL contain only reviewed entries, each classified as exactly one of: seeded tenant data, historical archived document, named legacy-compatibility code with a guard, or a dev/PDF-preview fixture not reachable from official-document download paths, and each entry SHALL state why it cannot be removed yet.
3. THE Brand_Allowlist SHALL NOT contain a whole-directory entry; each entry SHALL name a single file path.
4. WHEN a dev/PDF-preview fixture is allowlisted, THE fixture SHALL NOT be reachable from any official-document download path.
5. THE active runtime PDF theme SHALL NOT render a MIHAS/KATC identity for an unknown institution; THE theme SHALL return a Beanola-generic preview or raise an explicit error for official documents.
6. THE active documentation and runbooks SHALL present Beanola as the platform owner, and historical/archived audit reports SHALL be left unchanged where they are clearly historical.
7. THE Beanola logo asset paths referenced by active runtime source SHALL resolve to existing assets, and the Verification_Gate SHALL surface any broken Beanola logo path.

### Requirement 3: Gated Production Database Cutover (Neon-First)

**User Story:** As an Operator, I want to apply the additive multi-tenant schema to the production EC2 Postgres only after Neon validation, a verified backup, and explicit user confirmation, so that the production cutover is safe, evidenced, and reversible in posture.

#### Acceptance Criteria

1. THE Tenant_Migration and the three follow-on additive scripts SHALL be authored and validated on Neon before any production apply, per the Neon_First_Workflow, and SHALL NOT be applied to production from the development environment.
2. WHEN the Migration_Runner dry-run is executed against the target database, THE Migration_Runner SHALL list the pending Tenant_Migration and follow-on scripts in correct lexical order, and the additive-only lint SHALL pass (no `DROP`, `TRUNCATE`, or unguarded `DELETE`).
3. WHILE validating on a Neon staging branch, THE system SHALL apply the migrations, reapply them to prove idempotency, and run the validation SQL from `docs/runbooks/multi-tenant-beanola-rollout.md` with all duplicate-hostname and duplicate-slug checks returning zero rows and `canonical_programs` non-zero.
4. THE Production_Cutover SHALL be gated on explicit user confirmation and SHALL be performed by the Operator on the EC2 box during a maintenance window, never as an automatic task run from the development environment.
5. WHEN the Production_Cutover begins, THE Operator SHALL take a production database backup and SHALL confirm the backup file is non-empty and restorable before applying any migration.
6. BEFORE applying migrations in production, THE Operator SHALL verify the Migration_History_Prerequisite is applied, and IF it is missing, THEN the Migration_Runner SHALL refuse to run and emit `MIGRATION_HISTORY_NOT_EXTENDED`.
7. WHEN the Production_Cutover applies migrations, THE Operator SHALL run a dry-run, apply, then run the post-migration validation SQL, and SHALL produce a production evidence block recording: migration names applied, `migration_history` rows and checksums, counts of institutions / canonical programs / offerings / intakes / applications with canonical IDs / unlinked legacy rows, duplicate domain/slug checks, scope-table counts, and document-profile counts.
8. THE Production_Cutover SHALL use only additive SQL and SHALL NOT apply any destructive schema change through the container-startup sweep.
9. AFTER the Production_Cutover, applications with null canonical IDs, applications with legacy string snapshots, previously generated Official_Documents, and prior payments/receipts SHALL remain readable and unchanged.
10. WHERE a database would receive the Tenant_Migration under two different migration-history names, THE Operator SHALL reconcile the migration history per the runbook so the migration is not applied twice.

### Requirement 4: Backend API Contract Audit

**User Story:** As a platform engineer, I want every frontend admissions API call to map to a documented backend endpoint with a verified response shape, so that the backend is a single predictable contract with no undocumented fields.

#### Acceptance Criteria

1. THE system SHALL generate the OpenAPI schema via `python3 manage.py spectacular` with zero errors, and the schema SHALL present Beanola-branded metadata.
2. THE audit SHALL enumerate every admissions frontend service method and map it to a matching backend endpoint across auth, profile, catalog/context/canonical-programs, applications, student documents, official documents, payments, interviews, notifications, and the admin dashboard/applications/users/audit-trail/tenant-onboarding/document-profiles/assets/templates/access-grants surfaces.
3. WHEN an authenticated admissions endpoint returns a response, THE response SHALL use the API_Envelope, and list responses SHALL use the paginated `{page, pageSize, totalCount, results}` shape inside `data`.
4. THE audit SHALL verify, for each audited endpoint, the envelope shape, error code, pagination shape, authentication class, scope filter, serializer fields, frontend type, and UI consumer, with no UI depending on an undocumented field.
5. THE test suite SHALL include backend serializer response tests, frontend service normalization tests, and an OpenAPI drift guard covering route presence and important fields.
6. IF a recoverable error reaches a student-facing surface, THEN THE response SHALL carry a stable error code and user guidance, and SHALL NOT expose a raw Django or DRF error.
7. WHEN a request targets an out-of-scope resource, THE response SHALL be the Not_Found_Envelope.
8. THE audit SHALL confirm rate limits exist for login/register/password-reset, the public tracker, payment initiation, document download/sign-URL, and admin bulk operations.

### Requirement 5: Tenant Scoping and Security Audit

**User Story:** As a school, I want every staff/admin endpoint that returns tenant data to enforce scope through the Access_Scope_Service, so that a regular admin can neither read nor mutate another school's data and out-of-scope reads cannot leak existence.

#### Acceptance Criteria

1. THE audit SHALL produce an endpoint inventory classifying every admissions endpoint as public-anonymous, student-owned, staff-scoped, or super-admin-only, with no unresolved "unknown scope" rows.
2. WHEN a School_Staff user reads or mutates a tenant resource (application, payment, document, dashboard aggregate, audit trail, user listing, notification/communication, or tenant-onboarding child resource), THE backend SHALL filter the queryset through the Access_Scope_Service.
3. WHEN a School_Staff user requests an in-scope resource, THE backend SHALL return it via the API_Envelope.
4. WHEN a School_Staff user requests an out-of-scope resource, THE backend SHALL return the Not_Found_Envelope.
5. IF a School_Staff user's Access_Grant has expired, THEN THE backend SHALL deny access and return the Not_Found_Envelope for the previously granted resource.
6. WHERE an Access_Grant is scoped to a single offering or a single application, THE backend SHALL permit access only to that offering or that application respectively.
7. WHEN a Super_Admin reads any tenant resource, THE backend SHALL permit the read.
8. THE object-level permission checks SHALL use canonical IDs and SHALL NOT authorize based on Legacy_String_Fields.
9. THE scope-drift guard and the unscoped-endpoint guard SHALL pass, and there SHALL be no non-super-admin path that loads applications, payments, or documents without going through the Access_Scope_Service.
10. THE audit SHALL confirm no PII is exposed on out-of-scope responses, anonymous surfaces (including the public tracker), error payloads, audit logs, or export files, and that signed-URL expiry, MIME/magic-byte validation, SVG handling, storage key naming, document-delete protection, and official-document overwrite protection are enforced.

### Requirement 6: Document System Production Audit

**User Story:** As a school, I want official documents to be tenant-configured, backend-generated, traceable, and reliable, so that students and admins only ever download authoritative backend records and missing configuration fails visibly and safely.

#### Acceptance Criteria

1. THE audit SHALL cover each official document type (application slip, acceptance letter, conditional offer, finance receipt, payment receipt, and any future enrollment/registration document) and SHALL verify its backend generation path, profile resolution, required tenant assets, required template tokens, fingerprint inputs, versioning behaviour, storage path, download permission, and email-attachment behaviour.
2. WHEN a student or admin downloads an official document, THE document SHALL be the backend-generated stored Official_Document and SHALL NOT be a client-side render.
3. THE client-side official-PDF actions on the student wizard success screen, the student payment page, the public tracker, and the admin application-detail screen SHALL be removed or quarantined so that Client_PDF_Generators are not reachable from official-download paths.
4. IF no active Institution_Document_Profile resolves for the application's institution and document type, THEN THE Official_Document_Generator SHALL set generation status to `failed`, record a descriptive error, and SHALL NOT produce a document from frontend content.
5. IF a required logo or signature Institution_Asset is missing, a template token is invalid, an asset upload has an invalid MIME type, storage fails, or PDF rendering fails, THEN THE system SHALL surface the failure state and SHALL NOT serve a stale or client-rendered official document.
6. WHEN the Official_Document_Generator runs repeatedly for an unchanged `(application, document_type)`, THE generator SHALL reuse the Current_Official_Version by fingerprint and SHALL NOT create duplicate records (per remediation R6).
7. THE production tenant document profiles for the existing MIHAS and KATC tenants SHALL be seeded from a backend seed script or management command, and a Beanola demo/test institution profile SHALL exist only on staging.
8. WHEN an admin previews a document, THE preview SHALL use sample data and SHALL be clearly labelled as a preview, while official generation SHALL use the persisted backend profile.
9. THE Official_Document provenance SHALL include the institution, profile id+version, asset ids, and fingerprint, and SHALL NOT include document bodies, full PII, or secrets in audit trails.

### Requirement 7: Per-Route and Mobile-First UI/UX Critique and Polish

**User Story:** As a student or staff member on a phone, I want every route to work and feel complete at 360px and up, so that I can complete every workflow without overlap, truncation, dead buttons, or hidden required actions.

#### Acceptance Criteria

1. THE UI/UX audit SHALL produce pass/fail notes for every UI_Route in the plan's Phase 7 matrix (public, student, and admin), and every fail SHALL have an issue ID or task.
2. WHEN any UI_Route is rendered at each Mobile_Breakpoint (360px, 390px, 768px, 1024px, and desktop), THE route SHALL have no horizontal overflow, no clipped buttons, no overlapping text, and no hidden required actions.
3. WHILE a UI_Route is displayed at 360px, every interactive element (button, tab, icon button, input) SHALL present a touch target of at least 44×44px.
4. THE text and background pairs on every UI_Route SHALL meet WCAG AA contrast, status colours SHALL always be paired with an icon or label, and icons SHALL be Lucide icons.
5. THE product surfaces SHALL NOT use purple gradients, gradient text, glassmorphism, nested cards, or emoji icons, and the Inter font fallback chain SHALL be preserved in full.
6. WHEN a student form is displayed, THE form SHALL show visible labels, field-level errors, server errors mapped to a field or the form, submit disabled/loading behaviour, a clear success state, and SHALL preserve auto-save and protect dirty state on navigation and `beforeunload`.
7. WHILE a reduced-motion preference is set, THE UI SHALL respect it and SHALL NOT override the global reduced-motion rule.
8. WHEN a staff member views a scoped surface, THE UI SHALL make the active school/scope visible, a Super_Admin SHALL see a clear all-schools vs selected-school context, and a student SHALL see the assigned school only after assignment is known.
9. WHEN an admin table is rendered on mobile, THE table SHALL become a card or an intentional scroll container with collapsible filters, safe and discoverable bulk actions, and readable status/payment badges.
10. WHEN a dialog or modal is shown on mobile, THE dialog SHALL be full-screen or bottom-sheet styled with a focus trap, no clipped footer buttons, and working close/escape/back behaviour.
11. THE UI/UX audit SHALL capture screenshot evidence (Playwright or equivalent) for key routes, including failure screenshots referenced from issue notes.
12. THE UI copy SHALL present Beanola as the platform, SHALL show school names only from tenant data, and SHALL NOT hard-code fees or health-only language on generic surfaces.

### Requirement 8: End-to-End Workflow QA

**User Story:** As a product owner, I want the platform proven against the way users actually use it, so that critical student and admin journeys pass on staging and negative journeys prove the security boundaries hold.

#### Acceptance Criteria

1. THE student E2E_Flow set SHALL pass on staging, covering signup, verification (or dev equivalent), application creation, canonical-program-and-intake selection, seeing the assigned institution, document upload, save-draft-and-resume, pay-or-defer-where-allowed, submission, downloading the backend application slip, public tracking, receiving a communication, the interview path, receiving a decision, and downloading acceptance/conditional-offer and receipt documents.
2. THE admin E2E_Flow set SHALL pass on staging, covering super-admin login, institution creation, logo/signature upload, document-profile creation, offering creation/assignment, the routing simulator, adding a staff member, adding a scoped Access_Grant, staff login seeing only scoped data, application review, payment verification, official-document generation, super-admin audit, and scoped report export.
3. WHEN a wrong-school staff member attempts to open an application, payment, or document, THE backend SHALL return the Not_Found_Envelope.
4. WHEN an Access_Grant has expired, THE staff member SHALL be unable to open the previously granted payment or document.
5. IF no document profile is configured, THEN official generation SHALL be blocked with a clear error.
6. WHEN a duplicate application is attempted, THE canonical duplicate logic SHALL block it, and WHEN an intake/offering is full, THE system SHALL return recoverable guidance.
7. IF a payment fails, THEN THE system SHALL NOT produce a paid receipt.
8. WHEN the anonymous public tracker is queried, THE response SHALL NOT expose PII.
9. THE system SHALL provide a documented manual smoke checklist for production release covering the critical flows.

### Requirement 9: Backend Reliability and Operations

**User Story:** As an operator, I want production backend behaviour to be observable and recoverable, so that failures are detected, alerted, and rolled back without data loss.

#### Acceptance Criteria

1. WHEN the liveness endpoint `/health/live/` and the readiness endpoint `/health/ready/` are called, THE backend SHALL report status including database connectivity, and Redis/Celery readiness where required.
2. THE background task surfaces (PDF generation, email queue, payment reconciliation, notification dispatch, uptime task) SHALL be operational and monitored.
3. WHEN payment initiation, a webhook, official-document generation, or an email retry is processed more than once with the same identity, THE system SHALL behave idempotently and SHALL NOT duplicate the effect.
4. THE structured logs SHALL include request ID, user ID where safe, institution ID for tenant actions, payment reference, and document ID, and SHALL NOT include secrets or full PII.
5. THE monitoring configuration SHALL have error tracking enabled, a Beanola-default alert email, and alerts for failed tasks, payment-webhook failures, and PDF-render failures, and the system SHALL receive a test monitoring event successfully.
6. THE production backup script SHALL be tested, a restore drill SHALL be performed on staging or local, and backup retention SHALL be documented.
7. THE rollback posture SHALL document code rollback steps, SHALL treat additive migrations as forward-only, and SHALL document how to disable a feature without dropping data, including feature flags for risky surfaces.
8. WHEN `python3 manage.py check` is run in the staging/production environment, THE command SHALL pass with zero errors.

### Requirement 10: Security and Privacy Review

**User Story:** As a security owner, I want the platform hardened before launch, so that authentication, authorization, input handling, secrets, payments, privacy, headers, and abuse controls have no high-severity open findings.

#### Acceptance Criteria

1. THE auth stack SHALL enforce HTTP-only cookie flags, a 30-minute access token, a 7-day refresh token with JTI blacklisting, refresh rotation, logout/session cleanup, and CSRF enforcement on state-changing requests.
2. THE authorization checks SHALL enforce student-owner checks, School_Staff scope checks via the Access_Scope_Service, super-admin-only endpoints, and object-level permissions, consistent with the RBAC_Hierarchy.
3. WHEN input is received at the API boundary (template tokens, HTML, file uploads, query params, bulk actions), THE backend SHALL validate it, HTML-escape rendered token values, and reject invalid input with a descriptive error.
4. THE repository SHALL contain no secrets, env examples SHALL be current, and the production environment variables SHALL be reviewed.
5. THE payment security controls SHALL enforce webhook signature validation, idempotency keys, reconciliation, and receipt authorization, preserving the Lenco mobile-money-first UX with deferral allowed.
6. THE privacy controls SHALL minimize public-tracker data, gate export access, document audit-trail retention, and keep PII out of logs.
7. THE production responses SHALL set the CSP, HSTS, X-Frame-Options, and Referrer-Policy headers.
8. THE abuse controls SHALL enforce rate limits, password-reset throttling, public-tracker throttling, and upload size limits.
9. THE security review SHALL have no high-severity open finding, and any medium finding SHALL have an explicit owner and a recorded launch decision.

### Requirement 11: Performance and Core Web Vitals

**User Story:** As a mobile user on a weak network, I want the app to be fast, so that public pages meet acceptable Core Web Vitals and admin pages stay responsive at realistic data volumes.

#### Acceptance Criteria

1. THE team SHALL measure Lighthouse mobile for the public home, signup, tracker, student dashboard, and admin dashboard, plus bundle analysis and API response timings.
2. THE public/student/admin entry chunks SHALL NOT pull in dev-preview routes or oversized PDF/vendor chunks, and admin-heavy modules SHALL be lazy-loaded.
3. WHEN a tenant-scoped query backs the application detail, dashboard, documents, or payments surfaces, THE query SHALL avoid N+1 access, paginate large lists, and use an index for any slow tenant-scoped query.
4. THE public pages SHALL meet acceptable Lighthouse/Core Web Vitals thresholds, and admin pages SHALL remain responsive with realistic data volume.
5. WHEN images and skeletons load, THE layout SHALL not shift (stable skeleton dimensions, no dynamic text resizing), so cumulative layout shift stays within the acceptable threshold.

### Requirement 12: Data Quality and Seed Readiness

**User Story:** As an operator opening applications, I want production data to be coherent and complete per school, so that no active offering or active school is missing the configuration students depend on.

#### Acceptance Criteria

1. THE institution data per school SHALL include slug, code, brand name, legal name, emails, phone numbers, domains, and active status, signed off per school.
2. THE asset data per school SHALL include logo, signature, seal where needed, asset checksums, and an active version.
3. IF an active offering lacks a linked canonical program, intake, or fee rule, THEN THE data-quality check SHALL flag it as not ready.
4. THE catalog data SHALL include canonical programs, offerings, intakes, fees, capacity, assignment priority, and eligibility rules.
5. IF an active school lacks a required document profile with its assets, THEN THE data-quality check SHALL flag it as not ready.
6. THE document configuration SHALL include required documents, document profiles, template tokens, bank details, and signatory per school.
7. THE staff data SHALL include super-admins, institution admins, reviewers, finance approvers, and scoped grants.
8. THE communication configuration SHALL include email templates, any SMS templates used, the sender email, and the support contact, all Beanola or tenant-derived.

### Requirement 13: Test Suite and Verification Gate (CI)

**User Story:** As a platform engineer, I want CI to reproduce the production-readiness commands and block drift, so that no guard is optional and a regression cannot reach production silently.

#### Acceptance Criteria

1. THE Verification_Gate SHALL pass with zero errors for backend `python3 -m pytest`, `python3 manage.py check`, and `python3 manage.py spectacular`, and for admissions `bun run type-check`, `bun run lint`, `bun run test`, and `bun run build`.
2. THE CI configuration SHALL include jobs matching the required Drift_Guard list: frontend brand drift, backend brand drift, document-flow drift, official-document dedup, scope drift, unscoped endpoint, canonical-tenant drift, payment-status drift, error-code drift, role mirror, application-lifecycle, and schema drift.
3. WHEN any type error, lint error, build failure, brand drift, unscoped-endpoint drift, or schema drift occurs, THE CI pipeline SHALL fail.
4. THE repository SHALL have all intended new tests committed and SHALL contain no untracked production-readiness test left out of CI.
5. THE release process SHALL link a production Smoke_Check job or a documented manual smoke checklist from the release notes.
6. THE CI pipeline SHALL reproduce the local production-readiness commands, and no required guard SHALL be marked optional.

### Requirement 14: Production Launch Checklist and Rollback Posture

**User Story:** As an operator, I want a complete pre-launch, deploy, smoke-test, and rollback checklist, so that launch is evidenced and a failure of any risky surface degrades safely without serving stale or wrong data.

#### Acceptance Criteria

1. BEFORE launch, THE Operator SHALL freeze a release branch, confirm no uncommitted production code, and confirm the required env vars (`DATABASE_URL`, `SECRET_KEY`, JWT signing key, email sender credentials, Lenco keys, R2/S3 keys, CORS origins, cookie domain, frontend base URL, error-monitoring DSN).
2. BEFORE deploy, THE Operator SHALL run the full Verification_Gate and a production build, back up the production database, apply migrations, and run the validation SQL.
3. AFTER deploy, THE Operator SHALL run the immediate Smoke_Check set: public home loads with Beanola branding, contact mailto uses a Beanola address, signup/login works, catalog loads, the wizard creates a draft, assignment preview works, payment initiation works in a safe environment, the public tracker works without PII leak, admin login works at the documented admin route, super-admin tenant onboarding loads, the staff scoped-data check passes, official-document generation works for one staged application, email render/send uses a Beanola or tenant template, error monitoring shows no deployment errors, and health checks pass.
4. IF a tenant feature fails after launch, THEN THE Operator SHALL disable the feature route/action and keep data intact.
5. IF payment fails after launch, THEN THE Operator SHALL stop payment initiation while keeping application submission safe.
6. IF official-document generation fails after launch, THEN THE system SHALL show "generation failed" and block download rather than serving a stale frontend PDF.
7. THE database rollback posture SHALL be forward-only unless a tested rollback script exists, and code rollback SHALL be allowed.
8. AFTER the launch window, THE Operator SHALL confirm no critical errors in logs and SHALL update the Production_Readiness_Status_Document with the exact date/time and evidence.

### Requirement 15: Production-Ready Exit Gate (Definition of Done)

**User Story:** As the platform owner, I want a single explicit gate that is true only when every Definition_of_Done condition holds, so that "production-ready" is a verifiable state rather than a judgement call.

#### Acceptance Criteria

1. THE platform SHALL be declared production-ready only WHEN the Canonical_Truth_Map accurately maps every domain concept to its single source of truth and the Brand_Allowlist contains only reviewed, justified exceptions.
2. THE platform SHALL be declared production-ready only WHEN repository scans prove no non-allowlisted legacy branding remains in active runtime source or config.
3. THE platform SHALL be declared production-ready only WHEN all tenant migrations are applied to staging and production with validation evidence captured (Requirement 3).
4. THE platform SHALL be declared production-ready only WHEN every endpoint that returns tenant data is scope-reviewed and covered by a scoped-access test, and every frontend service response shape matches the backend serializers and the OpenAPI schema.
5. THE platform SHALL be declared production-ready only WHEN every UI_Route has a mobile-first QA pass at every Mobile_Breakpoint and every critical workflow has a Smoke_Check or a documented manual smoke script.
6. THE platform SHALL be declared production-ready only WHEN the Verification_Gate (build, lint, type-check, backend tests, frontend tests) and the production Smoke_Check set pass.
7. THE platform SHALL be declared production-ready only WHEN monitoring, backups, error reporting, alert email, CORS, cookies, and deploy env vars are verified.
8. IF any Definition_of_Done condition is unmet, THEN THE platform SHALL NOT be marked production-ready.

### Requirement 16: Non-Negotiable Platform Invariants

**User Story:** As the platform owner, I want the plan's Non-Negotiables and Operating Standard enforced as invariants throughout the production-readiness work, so that no audit, polish, or cutover step can violate the platform's identity, tenancy, security, or contract guarantees.

#### Acceptance Criteria

1. THE platform defaults, metadata, API docs, emails, public pages, admin routes, and unauthenticated surfaces SHALL present Beanola unless they render tenant-owned data from an explicit tenant configuration row, and no platform default SHALL reference MIHAS, KATC, Mukuba, Kalulushi, `mihas.edu.zm`, `katc.edu.zm`, or a legacy MIHAS API/app domain except via the reviewed Brand_Allowlist.
2. THE system SHALL maintain exactly one authoritative (canonical) source per business concept, and every frontend mirror SHALL be generated-from, imported-from, or Drift_Guarded against that source.
3. WHEN a student applies, THE student SHALL choose a Canonical_Program first, and the institution, fees, required documents, official-document templates, logos, signatures, and settlement metadata SHALL be resolved from backend tenant configuration.
4. WHEN a regular admin reads data outside their scope, THE backend SHALL return the Not_Found_Envelope using the same shape as a missing resource.
5. THE official documents SHALL be backend-generated, backend-stored, fingerprinted, and versioned, and frontend PDFs SHALL be preview-only.
6. THE system SHALL preserve all `/api/v1/...` routes, the API_Envelope for authenticated endpoints (including authenticated list endpoints), the paginated `{page, pageSize, totalCount, results}` shape inside `data`, cookie auth with CSRF, the 30-minute access / 7-day refresh tokens with JTI blacklisting, the Lenco mobile-money-first payment UX with deferral allowed, and the RBAC_Hierarchy `super_admin > admin > reviewer > student`.
7. THE system SHALL NOT write PII, secrets, or document bodies to logs or audit trails.
8. THE schema changes SHALL ship as additive SQL under `backend/scripts/`, validated on Neon first per the Neon_First_Workflow, and SHALL NOT be applied to the production database from the development environment.
9. THE admissions auto-save behaviour SHALL be preserved on every student form and SHALL NOT be removed without a replacement.
10. THE jobs-ops surface SHALL be treated as out of scope unless a requirement explicitly names it.
