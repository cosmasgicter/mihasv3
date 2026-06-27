# Beanola Canonical Truth Map

This is the master index of canonical sources of truth in the Beanola
multi-school admissions platform. **Beanola Technologies is the platform owner
and platform identity; MIHAS, KATC, and any future school are tenants, never
platform identity.** Every domain concept has exactly one source of truth; every
other reference is a consumer. Drift-guard tests catch divergence at CI time.

## Active Alignment Spec

The active cleanup authority for completing the remaining multi-tenant
alignment work is `.kiro/specs/canonical-multi-tenant-alignment/`. That spec
preserves the completed foundations from the prior multi-tenant, enterprise
tenant authority, production-readiness, single-source-of-truth, and duplicate
consolidation specs, but it is the current implementation brief for removing
remaining route drift, document-flow drift, draft lifecycle ambiguity, legacy
branding, and compatibility-only duplication.

**Rule:** Any new domain concept added to the platform must register in this map
before merging. If it has a frontend mirror, a drift-guard test is required (see
"No New Mirrors Without Guard" below).

## No New Mirrors Without Guard (R1.2)

Any **enum, status, error code, document type, route name, role, permission,
payment state, or tenant scope** that is shared by both the frontend and the
backend requires a registered Drift_Guard test. A concept is allowed to live in
only one layer without a guard **only** when it is explicitly recorded here as
backend-only (no frontend data mirror) — in which case the "Frontend mirror /
drift guard" note must say so.

- If a domain concept or frontend mirror exists in active runtime source without
  a corresponding entry in this map and (where a mirror exists) a Drift_Guard
  test, the Verification_Gate fails (R1.4).
- A cross-layer mirror is registered with either a Drift_Guard test or an
  explicit backend-only note (R1.3).
- Legacy-fallback branches are governed by the "Legacy-string fallback
  allowlist (R1.3)" subsection under Multi-Tenant: named as legacy, test-covered,
  non-executing for new canonical records, and with a documented removal
  condition (R1.5).

## Platform Identity, Routes, and Operational Config

| Concept | Source of truth | Consumers / drift guard |
|---------|-----------------|--------------------------|
| Platform brand (owner identity) | `backend/apps/catalog/services.py:InstitutionContextService.BEANOLA_BRAND` (`name="Beanola Admissions"`, `owner="Beanola Technologies"`) | `GET /api/v1/catalog/context/` shared-portal default; frontend `apps/admissions/src/lib/constants/landing.ts:contactInfo`; brand drift guards (`backend/tests/unit/test_brand_drift_guard.py` + `apps/admissions/tests/unit/brandDriftGuard.test.ts`) |
| Tenant brand (school identity) | `backend/apps/catalog/models.py:Institution` rows (per-tenant brand name/colors/emails/domains; seeded by `management/commands/brand_institutions.py`) | white-label host resolution via `InstitutionContextService`; tenant data only — never platform identity |
| Platform attribution metadata | `backend/apps/common/meta_views.py` (`creator: Cosmas Kanchepa`, `developer: Beanola Technologies`, `https://beanola.com`) | `GET /api/v1/meta/platform/` |
| Product admin tenant surface (route) | `apps/admissions/src/routes/config.tsx` → `{ path: '/admin/tenants', guard: 'admin' }` (lazy `@/pages/admin/Tenants`) | **Beanola product admin** UI for tenant onboarding / school management; **authoritative for the launch smoke check (R14.3)**. No route rename. |
| Django operational admin surface (route) | `backend/config/urls.py` → `path("beanola-admin-panel/", admin.site.urls)` | low-level Django framework admin; checked separately from `/admin/tenants` per the R1 two-surface decision. No route rename. |
| Email sender / default contact | `backend/config/settings/base.py` (`DEFAULT_FROM_EMAIL` ← `ZOHO_FROM_EMAIL`/`EMAIL_FROM`, default `admin@beanola.com`; `EMAIL_FROM` default `noreply@beanola.com`; `ERROR_ALERT_EMAIL` default `admin@beanola.com`) | outbound email (`apps/common/tasks.py`, `apps/common/email/`); default contact `apps/common/communication_service.py:_DEFAULT_CONTACT_EMAIL` (`admissions@beanola.com`); admin setting `accounts/admin_serializers.py` `contact_email` |
| OpenAPI metadata | `backend/config/settings/base.py:SPECTACULAR_SETTINGS` (`TITLE`, `DESCRIPTION`, `VERSION`, `SERVERS`) | `python3 manage.py spectacular`; `/api/v1/` docs. Current title is `"Beanola Platform APIs"` and servers point to `api.beanola.com` plus local development. |
| Public routes / SEO | `apps/admissions/src/components/seo/Seo.tsx` (`DEFAULT_SITE_NAME="Beanola Admissions"`, default image `/images/logos/beanolalogo.webp`, site URL ← `VITE_APP_BASE_URL`/`VITE_SITE_URL`, default `https://apply.beanola.com`) | per-page `<Seo>` usage across public/student routes (`LandingPage`, `tracker`, `Privacy`/`Terms`/`Contact`, auth, dashboard) |
| Brand_Allowlist | `docs/legacy-brand-allowlist.json` (reviewed single-file entries permitted to contain MIHAS/KATC/Mukuba/Kalulushi/legacy-domain strings) | Brand_Drift_Guard pair (`backend/tests/unit/test_brand_drift_guard.py` + `apps/admissions/tests/unit/brandDriftGuard.test.ts`); R2 owns tightening |

## Application Lifecycle

| Concept | Source of truth | Consumers (drift-guarded) |
|---------|-----------------|----------------------------|
| Status enum & transitions | `backend/apps/applications/services.py:ALLOWED_TRANSITIONS` | `apps/admissions/src/types/applicationStatus.ts` |
| Online student drafts | `backend/apps/applications/models.py:Application` rows where `status='draft'` | Student dashboard draft list (`GET /api/v1/applications/?mine=true&status=draft`), wizard resume/update/delete (`GET/PATCH/DELETE /api/v1/applications/{id}/`), uploads, grades, payment protection. `Application.id` is the canonical draft id. |
| Compatibility draft payload | `backend/apps/applications/models.py:ApplicationDraft` + `ApplicationDraftView` (`/api/v1/applications/draft/`) | Compatibility/cache metadata only. Not the canonical online draft list and not a production wizard routing source. Removal condition: all frontend callers use explicit `Application(status='draft')` multi-draft APIs. |
| Wizard draft intent | Frontend route registry helpers for `/student/application-wizard?mode=new` and `/student/application-wizard?mode=resume&draftId=<application_id>` | Legacy `?new=true`, `?fresh=1`, and `/student/applications/new` normalize to `mode=new`; no silent timestamp-based resume or duplicate `existing_id` adoption. |
| Status UI labels/badges | `apps/admissions/src/lib/applicationStatusUi.ts` | (consumers via import) |
| Terminal statuses | `apps/admissions/src/types/applicationStatus.ts:TERMINAL_STATUSES` | `backend/apps/applications/duplicate_checker.py:TERMINAL_STATUSES` |
| Withdrawal eligibility | `apps/admissions/src/lib/withdrawalEligibility.ts:canWithdraw` | `backend/tests/unit/test_withdrawal_eligibility.py` |
| Drift guards | `apps/admissions/tests/unit/applicationStatusDriftGuard.test.ts` + `backend/tests/property/test_lifecycle_canonical.py` |

## Payment

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Canonical payment status enum | `backend/apps/documents/payment_service.py:CanonicalStatus` | `PAYMENT_TO_APP_MAP` |
| Derived app payment_status | `backend/apps/documents/payment_service.py:PAYMENT_TO_APP_MAP` | `apps/admissions/src/lib/paymentStatus.ts:normalizePaymentStatus` |
| State transitions | `backend/apps/documents/payment_service.py:ALLOWED_TRANSITIONS` | `_transition()` (sole writer) |
| Force-approved propagation | `review_queue.py:PAYMENT_READY_STATUSES`, `admin_views.py:_RESOLVED_PAYMENT_STATUSES`, analytics, frontend `normalizePaymentStatus` | drift-guarded |
| Payment error codes | `backend/apps/documents/payment_error_codes.py:PAYMENT_ERROR_CODES` | `apps/admissions/src/lib/paymentErrorCodes.ts` |
| Webhook event identity | `backend/apps/documents/webhook_processor.py:WebhookEventIdentity` | dedup table `webhook_event_logs` |
| Drift guards | `apps/admissions/tests/unit/paymentStatusMappingDriftGuard.test.ts` + `backend/tests/unit/test_payment_status_canonical.py` + `test_payment_force_approved_propagation.py` |

## Permissions & Roles

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Role hierarchy | `backend/apps/accounts/permissions.py:ROLE_HIERARCHY` | `apps/admissions/src/types/roles.ts:ROLE_HIERARCHY` |
| Role helpers | `apps/admissions/src/types/roles.ts` (`hasRole`, `isAdmin`, `isSuperAdmin`, `isReviewer`, `isStudent`) | all component role checks |
| Legacy shim | `apps/admissions/src/lib/auth/roles.ts` (re-exports from `types/roles.ts`) | back-compat |
| Auth contract | `docs/adrs/ADR-014-auth-cookie-csrf-design.md` | reference |
| Drift guard | `apps/admissions/tests/unit/rolesBackendMirror.test.ts` |

## Enterprise Tenant Authority (Capabilities & Routes)

Spec: `.kiro/specs/enterprise-tenant-authority/`. Steering model:
`.kiro/steering/enterprise-tenancy.md`. **Beanola owns the Platform; MIHAS/KATC
are example tenants.** Authority is resolved through **capabilities**, never raw
role strings. The backend `AdminCapabilityService` is the **sole source of
truth** for the capability catalogue; the admissions frontend mirrors it by
consuming `GET /api/v1/admin/capabilities/` through `CapabilityContext` and
pinning the one hard-coded capability string it needs for navigation
(`tenantNav.ts:TENANT_PROFILE_READ = 'tenant.profile.read'`).

| Concept | Source of truth | Consumers / drift guard |
|---------|-----------------|--------------------------|
| Capability catalogue (17 `platform.*` + 17 `tenant.*`) | `backend/apps/catalog/services.py:AdminCapabilityService.PLATFORM_CAPABILITIES` / `TENANT_CAPABILITIES` | Frontend mirror: `apps/admissions/src/contexts/CapabilityContext.tsx` + `apps/admissions/src/services/admin/capabilities.ts` (consume strings opaquely); `apps/admissions/src/components/navigation/tenantNav.ts` pins `tenant.profile.read`. Drift guards: `backend/tests/property/test_capability_endpoint_shape.py` (Property 2 — endpoint exposes the catalogue), `apps/admissions/tests/property/capabilityDerivation.property.test.ts` (Property 21 — frontend derivation), `apps/admissions/tests/unit/tenantNav.test.ts` (pins `tenant.profile.read`). A new capability string must be added here **and** to the backend catalogue together. |
| `CapabilitySet` shape | `backend/apps/catalog/services.py:CapabilitySet` (`role`, `is_super_admin`, `all_access`, `platform_capabilities`, `institution_capabilities`) | Capability endpoint payload; frontend `AdminCapabilitySet` type in `capabilities.ts` |
| Domain status machine | `backend/apps/catalog/services.py:DomainStatusMachine` | `verify_institution_domain_task`, domain activate view; drift via `backend/tests/property/test_domain_status_machine.py` (Property 11) |
| Fail-closed domain resolver | `backend/apps/catalog/services.py:InstitutionContextService.resolve` | `GET /api/v1/catalog/context/`; `backend/tests/property/test_domain_resolution_fail_closed.py` (Property 14) |

**The 17 `platform.*` capabilities** (Super_Admin only):
`platform.tenant.read_all`, `platform.tenant.create`, `platform.tenant.update`,
`platform.tenant.deactivate`, `platform.domain.manage`, `platform.asset.manage`,
`platform.template.manage`, `platform.document.manage`,
`platform.canonical_program.manage`, `platform.program_assignment.manage`,
`platform.intake.manage`, `platform.user.create_global`,
`platform.user.manage_all`, `platform.access_grant.manage`,
`platform.audit.read_all`, `platform.routing.simulate_all`,
`platform.settings.manage`.

**The 17 `tenant.*` capabilities** (per-institution, non-super-admin):
`tenant.profile.read`, `tenant.profile.request_change`, `tenant.application.read`,
`tenant.application.review`, `tenant.application.export`, `tenant.document.read`,
`tenant.document.verify`, `tenant.payment.read`, `tenant.payment.verify`,
`tenant.staff.read`, `tenant.staff.invite`, `tenant.staff.disable`,
`tenant.audit.read`, `tenant.program.read`, `tenant.program.request_change`,
`tenant.domain.read`, `tenant.domain.request_change`.

### Canonical routes (frontend)

| Route | Component | Authority |
|-------|-----------|-----------|
| `/admin/tenants` | `apps/admissions/src/pages/admin/Tenants.tsx` (capability switcher → `SuperAdminTenantConsole` / `TenantAdminSchoolConsole` / no-access) | Shared admin route; renders the correct console per capability. Not super-admin-flagged in the route config. |
| Super-admin tenant onboarding wizard | `apps/admissions/src/pages/admin/tenants/TenantOnboardingWizard.tsx` | Super_Admin only (guarded by `RequireSuperAdmin`; backend re-enforces) |
| Tenant-admin school console | `apps/admissions/src/pages/admin/tenants/TenantAdminSchoolConsole.tsx` | Tenant_Admin (scoped to assigned institution(s)) |

### Canonical backend tenant API paths

Mounted at `/api/v1/admin/` (`backend/apps/catalog/admin_urls.py`):
`institutions/`, `institutions/<id>/`, `institutions/<id>/audit/`,
`institutions/<id>/domains/`, `institutions/<id>/domains/<id>/`,
`institutions/<id>/domains/<id>/activate/`, `institutions/<id>/assets/`
(+ `assets/upload/`, `assets/<id>/`), `institutions/<id>/templates/`
(+ `templates/<id>/`), `institutions/<id>/document-profiles/`
(+ `document-profiles/<id>/`, `document-profiles/<id>/clone/`),
`institutions/<id>/required-documents/` (+ `required-documents/<id>/`),
`memberships/` (+ `memberships/<id>/`), `access-grants/`
(+ `access-grants/<id>/`), `routing/simulate/`, `tenant-audit/`. Capability +
scope endpoints (`backend/apps/accounts/admin_user_views.py`):
`GET /api/v1/admin/capabilities/`, extended `GET /api/v1/admin/scope/`.

### Domain context endpoint

`GET /api/v1/catalog/context/` (`backend/apps/catalog/views.py:CatalogContextView`)
returns the resolved tenant context or the Neutral Beanola context (fail-closed).

### Deprecated legacy catalog write paths

The institution / program / intake **write** methods in
`backend/apps/catalog/views.py` (`InstitutionListCreateView`,
`InstitutionDetailView`, `ProgramListCreateView`, `ProgramDetailView`,
`IntakeListCreateView`, `IntakeDetailView`) are **deprecated as a write surface**
and now **capability-gated** (`platform.tenant.*`, `can_manage_program`,
`platform.intake.manage`) via `HasPlatformCapability` + `TenantScopedCapabilityMixin`.
New tenant onboarding/management should use the `/api/v1/admin/institutions/...`
paths above. Public/student `GET` on these catalog endpoints is preserved
unchanged. **Never** restore an ungated write path on these views.

## Error Codes

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Catalog | `backend/apps/common/error_codes.py:ERROR_CODES` | views (via reference), tests |
| Frontend mirror | `apps/admissions/src/lib/errorMessages.ts` | UI components |
| Drift guards | `apps/admissions/tests/unit/errorCodesDriftGuard.test.ts` + `backend/tests/unit/test_error_codes_canonical.py` |

## System Actor (Automated Transitions)

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| UUID constant | `backend/apps/applications/services.py:SYSTEM_ACTOR_ID` | `tasks.py`, `condition_manager.py`, `waitlist_manager.py` |
| DB seed | `backend/scripts/system_actor_seed.sql` | manual application |
| UUID guard | `backend/apps/applications/services.py:transition_application_status` (validates `changed_by` is a UUID) | runtime |
| Pattern documentation | `docs/adrs/ADR-013-system-actor.md` | reference |
| Regression net | `backend/tests/integration/test_system_actor_transitions.py` |

## Submission Gates

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Gate logic | `backend/apps/applications/services.py:submit_application` | `POST /api/v1/applications/{id}/submit/` |
| Identity-document gate | `backend/apps/applications/services.py:_application_has_identity_document` | internal to `submit_application` |
| Intake/program capacity | `backend/apps/applications/intake_enforcer.py:IntakeEnforcer.check_submission` | `submit_application` |
| Multi-intake duplicate | `backend/apps/applications/duplicate_checker.py:DuplicateChecker.check_at_submit` (honors `multi_intake_policy`) | `submit_application` |
| Documentation | `docs/admissions-submission-gates.md` |

## Database Schema

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Canonical schema | `backend/scripts/00_full_schema.sql` (TODO: pg_dump from prod) | new-environment bootstrap |
| Schema migration tracking | `migration_history` table on production Neon project `wild-bar-37055823` | `backend/scripts/MIGRATION_HISTORY.md` (manual mirror, regenerated after reconciliation) |
| Applied migrations | `backend/scripts/applied/` | historical record |
| Legacy column inventory | `backend/apps/common/legacy_columns.py:LEGACY_DEPRECATED_COLUMNS` | drift test, drop migration |
| Drop migration (Day 90) | `backend/scripts/legacy_columns_drop_2026_08_15.sql` | scheduled execution |
| Migration-history coverage exemptions | `check_schema_drift.py:_COVERAGE_EXEMPT_SCRIPTS` (`00_full_schema.sql` snapshot + `legacy_columns_drop_2026_08_15.sql` future drop) | drift guard `test_check_schema_drift_migration_history_coverage.py::test_exempt_scripts_are_not_flagged_as_stale` |
| Jobs-ops missing-table degradation | `backend/apps/jobs/_persistence.py` (`resolve_job_posting`, `persist_match_score_safe`) | `JobScoreView`/`JobTailorDocumentsView`; guard `tests/unit/test_jobs_orm_degradation.py` |
| Drift guard | `backend/tests/property/test_schema_drift_strict.py` + `check_schema_drift --check-fk-indexes --check-migration-history-coverage` (Component 6 of `.kiro/specs/production-schema-reconciliation/`) |
| No-writes guard | `backend/tests/unit/test_legacy_columns_no_writes.py` |
| Deprecation runbook | `docs/runbooks/legacy-column-deprecation.md` |
| Reconciliation runbook | `docs/runbooks/schema-reconciliation-runbook.md` |

## Feature Flags

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Flag inventory | `docs/runbooks/feature-flags-2026-05-17.md` | runtime + deploy |
| Production overrides | `backend/config/settings/prod.py` + `staging.py` | runtime |
| Pre-flight assertion | `backend/apps/common/management/commands/check_production_state.py` | deploy gate |

## Wizard

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Wizard navigation | `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/useWizardNavigation.ts` | `useWizardController` |
| Wizard state | `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/state/useWizardState.ts` | `useWizardController` |
| Sanitizer | `apps/admissions/src/lib/security.ts:sanitizeInput` | wizard, services |
| Payment recovery | `apps/admissions/src/stores/paymentRecoveryStore.ts` | `PaymentStep` |

## Multi-Tenant (Beanola)

Spec: `.kiro/specs/multi-tenant-beanola-admissions/`. The Beanola conversion
makes canonical IDs the **sole** sources of truth for routing, scoping, payment
tagging, and document generation. The legacy `applications.institution /
program / intake` strings are **display snapshots only** — read-only mirrors,
never the authority for new business logic (R1.2, R1.3).

| Concept | Source of truth | Consumers / display snapshot (read-only) |
|---------|-----------------|-------------------------------------------|
| Canonical program | `backend/apps/catalog/models.py:CanonicalProgram` (`canonical_programs.id`, unique `code`) | `applications.canonical_program` (db_column `program_id`); display snapshot `applications.program` |
| School offering | `backend/apps/catalog/models.py:Program` (`programs.id` = `program_offering_id`, linked via `canonical_program_id`) | `applications.program_offering` (db_column `program_offering_id`); `OfferingAssignmentService.assign` |
| Institution scope | `backend/apps/catalog/models.py:Institution` (`institutions.id`) | `applications.institution_ref` (db_column `institution_id`); display snapshot `applications.institution` |
| Intake | `backend/apps/catalog/models.py:Intake` (`intakes.id`) | `applications.intake_ref` (db_column `intake_id`); display snapshot `applications.intake` |
| Assignment authority | `backend/apps/catalog/services.py:OfferingAssignmentService` | wizard create + `submit_application` revalidation |
| Institution context (white-label vs shared) | `backend/apps/catalog/services.py:InstitutionContextService` | host resolution; `GET /api/v1/catalog/context/` |
| Staff membership scope | `backend/apps/catalog/models.py:UserInstitutionMembership` (`user_institution_memberships`, partial-unique active `(user_id, institution_id)`) | `AccessScopeService.filters_for_user` |
| Access grant scope | `backend/apps/catalog/models.py:AccessGrant` (`access_grants`, scope_type institution/offering/application, time-boundable) | `AccessScopeService.filters_for_user` |
| Scope computation | `backend/apps/catalog/services.py:AccessScopeService` (`ScopeFilters`) | every scoped queryset (applications, payments, documents, analytics) |
| Application uniqueness | `(student identity, canonical program, intake)` keyed on canonical IDs | `backend/apps/applications/duplicate_checker.py:DuplicateChecker` (legacy string fallback only when canonical IDs absent) |
| Payment settlement reporting | `payments.metadata` settlement snapshot (Beanola collector + institution/canonical/offering/intake IDs) | tenant-scoped settlement summary; "Unassigned" bucket on missing metadata |
| Official document provenance | `verification_notes.official_document` (template id+version, asset ids) | `DocumentTemplateService` + `tasks/pdf_generation.py` |
| Drift guard | `backend/tests/unit/test_canonical_tenant_drift_guard.py` (no new runtime logic matches `applications.institution/program/intake` legacy strings outside migration/legacy-fallback) |

**Legacy-string fallback allowlist (R1.3, R1.5):** the only runtime modules
permitted to match on the `applications.program / intake / institution` legacy
strings are the explicitly-labelled legacy-fallback / pre-canonical branches
listed below. Each is named as legacy, is covered by the drift guard
`backend/tests/unit/test_canonical_tenant_drift_guard.py` (every entry is pinned
in `_ALLOWED_PREDICATES`), does **not** execute for new canonical records (the
canonical-ID path is taken whenever the id is present), and carries the shared
removal condition stated below. The drift guard fails on any unlisted new
occurrence.

| Module (`backend/apps/…`) | Allowlisted predicate(s) | Branch label / why legacy | Non-executing for new canonical records |
|---------------------------|--------------------------|---------------------------|------------------------------------------|
| `applications/duplicate_checker.py` | `program=program`, `intake=intake` | "Canonical-only keying (R8.1) … fall back to the legacy string only for an id that is absent (R8.5)." | Yes — `Q(canonical_program_id=program_id) if program_id else Q(program=program)` (and the same for `intake`); the legacy `program=`/`intake=` predicate is only reached when the canonical id is `None`. |
| `applications/waitlist_manager.py` | `program=program`, `intake=intake`, `program=application.program`, `intake=application.intake` | Pre-Beanola waitlist position/promotion keyed on the program+intake display strings. | Yes for new records — waitlist position is keyed on the snapshot strings carried alongside the canonical IDs; canonical IDs remain the routing/scoping authority and no canonical record is keyed off the legacy string for routing. |
| `applications/intake_enforcer.py` | `intake=intake_name`, `program=program_name` | Pre-canonical enrollment counting (capacity counts by intake/program name string). | Yes — the intake/program is first resolved to a canonical id via `IdentifierResolver`; the legacy-string `count()` is the pre-canonical capacity tally only. |
| `applications/tasks/waitlist.py` | `intake=intake.name`, `program=app.program`, `intake=next_intake.name` | `waitlist_cascade_task` carries waitlisted rows to the next intake using the pre-canonical display strings (existing pre-Beanola cascade logic; the `Application.create()` writes the snapshot and is correctly **not** a match). | Yes — cascade is a pre-canonical batch job over the display snapshots; new canonical routing/scoping never depends on it. |
| `analytics/admissions_analytics.py` | `institution__icontains=filters['institution']`, `program__icontains=filters['program']` | Admin display-string `__icontains` filter over the pre-canonical institution/program snapshots (reporting only). | Yes — read-only admin reporting filter; never drives create/assign/scope decisions for canonical records. |

**Removal condition (R1.5):** each branch is retained only while
`applications` rows with **null canonical IDs** (`canonical_program_id` /
`intake_ref_id` / `institution_id`) still exist — these are the legacy/historical
applications created before the multi-tenant conversion. The branches become
removable once a backfill sets canonical IDs on all remaining legacy rows and a
verification query confirms zero null-canonical-ID `applications` rows on
production (the same count captured in the Production_Cutover evidence block,
R3.7/R3.9). When that count reaches zero, drop the legacy-string predicate from
each module (keeping the canonical-ID path), delete the corresponding
`_ALLOWED_PREDICATES` entries, and confirm the drift guard still passes.

### Capacity policy: advisory until enrollment (R15.3, R15.4)

Spec: `.kiro/specs/multi-tenant-beanola-remediation/` (R15). The authoritative
decision for how capacity interacts with assignment and seats:

| Stage | Behaviour | Source of truth |
|-------|-----------|-----------------|
| Application creation / assignment | **Reserves no seat.** Capacity is *advisory*: `OfferingAssignmentService._has_capacity` excludes a candidate `ProgramIntake` whose `current_enrollment >= capacity` (where `capacity = program_intake.max_capacity or intake.max_capacity`) at assignment time only. No row is locked and no counter is incremented during assignment. | `backend/apps/catalog/services.py:OfferingAssignmentService._has_capacity` |
| Submission | Re-runs assignment against the locked application snapshot and atomically increments the intake/program-intake `current_enrollment` (`F()` expression) under the application's `select_for_update()` lock. A stale/full offering surfaces as recoverable 409 (`OFFERING_NO_LONGER_AVAILABLE` / `OFFERING_CAPACITY_FULL`). | `backend/apps/applications/services.py:submit_application` → `IntakeEnforcer.increment_enrollment` |
| Enrollment confirmation | The committed seat is finalised: `EnrollmentService.confirm_enrollment` re-validates and transitions to `enrolled` under `Application.objects.select_for_update()`. | `backend/apps/applications/enrollment_service.py:EnrollmentService.confirm_enrollment` |

**Decision rationale (R15.4):** the reserve-at-create alternative is rejected
for V1 because it would require holding a lock across the multi-step wizard and
would strand seats on abandoned drafts. Capacity therefore stays advisory at
assignment time and is committed under a lock at the submission/enrollment
stages, which prevents capacity races without blocking draft authoring.

### Document profiles, official-document lifecycle, and tenant templates (R8, R14, R16)

Spec: `.kiro/specs/multi-tenant-beanola-remediation/`. These concepts extend
the Multi-Tenant truth map registered above. Each names the single authoritative
backend source plus its consumers; the "Frontend mirror / drift guard" column
records the guard backing the concept (or states it is backend-only).

| Concept | Source of truth | Consumers | Frontend mirror / drift guard |
|---------|-----------------|-----------|-------------------------------|
| Institution document profile | `backend/apps/catalog/models.py:InstitutionDocumentProfile` (table `institution_document_profiles`, migration `backend/scripts/2026_06_08_03_institution_document_profiles.sql`, `managed=False`) resolved most-specific-first by `backend/apps/catalog/services.py:InstitutionDocumentProfileService.resolve` | official-document render context (`backend/apps/applications/tasks/pdf/render_context.py`); `pdf_generation._attach_profile_provenance` folds `profile_id`+`profile_version` into the fingerprint | Backend-only config (no frontend data mirror). The student/admin document UI that consumes the rendered PDF is drift-guarded by `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts` (R18.1, no client-only official PDFs); brand safety of resolved content is covered by the brand drift guard (`backend/tests/unit/test_brand_drift_guard.py` + `apps/admissions/tests/unit/brandDriftGuard.test.ts`). |
| Official-document current-version / fingerprint lifecycle | `backend/apps/applications/tasks/pdf_generation.py:_compute_document_fingerprint` (deterministic SHA-256 over render inputs, R6.1), `_current_official_version` (latest non-deleted `system_generated` doc), and the stored fingerprint at `verification_notes.official_document.fingerprint` (read by `_stored_fingerprint`) | `_generate_official_document_task` reuses the current version on an unchanged fingerprint and creates a new `ApplicationDocument` only on change (R6.3/R6.4); never mutates prior documents | Frontend mirror = student/admin document UI reflecting backend `Queued`/`Generating`/`Ready`/`Failed` status and downloading the stored official record — drift-guarded by `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts` (R18.1). Dedup invariant (one persisted record per fingerprint) drift-guarded by `backend/tests/unit/test_official_document_dedup_guard.py` (R18.2). |
| Tenant-aware communication templates | `backend/apps/common/models.py:CommunicationTemplate` (`institution_id` + `version` columns added by `backend/scripts/2026_06_08_04_communication_templates_tenant.sql`, `managed=False`); tenant-aware resolution in `backend/apps/common/communication_service.py:_resolve_template` (active institution-specific highest version → active Beanola platform highest version → safe Beanola default, R14.1/R14.4/R14.5) | `CommunicationService.render_template`/`send`; template context derives brand/contact/portal from the resolved institution, never the hard-coded `apply.mihas.edu.zm` (R14.3/R14.8) | Backend-only (no frontend mirror — no admissions frontend module references `communication_templates`/`template_key`); no frontend drift guard required. Brand safety of rendered content is enforced by the backend brand drift guard `backend/tests/unit/test_brand_drift_guard.py`. |
| Capacity advisory until enrollment | See the "Capacity policy: advisory until enrollment (R15.3, R15.4)" subsection above (registered by task 31.2) | `OfferingAssignmentService._has_capacity`, `IntakeEnforcer.increment_enrollment`, `EnrollmentService.confirm_enrollment` | Backend-only decision; no frontend mirror. Recoverable assignment failure surfaces via the canonical `NO_ELIGIBLE_OFFERING` error code (already error-code drift-guarded). |

**Recoverable assignment failure (R15.5):** when no eligible offering exists,
`OfferingAssignmentService.assign` raises
`OfferingAssignmentError(code="NO_ELIGIBLE_OFFERING")`. The program-first wizard
checkpoint (`GET /api/v1/catalog/assignment-preview/`) maps this to an HTTP
**409** recoverable envelope `{"success": false, "code": "NO_ELIGIBLE_OFFERING",
"guidance": ...}` — matching the canonical `NO_ELIGIBLE_OFFERING` (409) entry in
`backend/apps/common/error_codes.py` — so the student gets a next step (choose
another intake, join the interest list, contact admissions) rather than a
dead-end.

## Backend Module Decomposition

The following original modules are now thin re-export shims; the real
implementations live in per-workflow submodules:

| Original (re-export shim) | Submodules |
|--------------------------|------------|
| `backend/apps/applications/admin_views.py` | `admin_review_views.py`, `admin_assignment_views.py`, `admin_export_views.py`, `admin_bulk_views.py`, `admin_amendment_views.py` |
| `backend/apps/applications/student_views.py` | `student_draft_views.py`, `student_submission_views.py`, `student_amendment_views.py`, `student_withdrawal_views.py`, `student_document_views.py` |
| `backend/apps/documents/views.py` | `mobile_money_views.py`, `payment_widget_views.py`, `payment_admin_views.py`, `payment_query_views.py`, `lenco_webhook_views.py`, `document_storage_views.py` |
| `backend/apps/accounts/views.py` | `auth_views.py`, `password_views.py`, `profile_views.py` |
| `backend/apps/accounts/admin_views.py` | `admin_user_views.py`, `admin_settings_views.py`, `admin_audit_views.py` |

`backend/apps/documents/payment_service.py` (104 KB) is intentionally NOT
decomposed in this program — it ships in a separate spec because of its
critical-path nature.

## Drift Guard Inventory

CI-blocking tests that fail when canonical truth diverges:

- `apps/admissions/tests/unit/applicationStatusDriftGuard.test.ts`
- `apps/admissions/tests/unit/paymentStatusMappingDriftGuard.test.ts`
- `apps/admissions/tests/unit/errorCodesDriftGuard.test.ts`
- `apps/admissions/tests/unit/rolesBackendMirror.test.ts`
- `apps/admissions/tests/unit/sanitizeInputCanonical.test.ts`
- `apps/admissions/tests/unit/wizardBasicKycMobileAttributes.test.tsx`
- `apps/admissions/tests/unit/paymentRecoveryStoreMigration.test.ts`
- `apps/admissions/tests/unit/useWizardNavigation.test.tsx`
- `apps/admissions/tests/unit/paymentErrorCodes.test.ts` (existing)
- `backend/tests/property/test_lifecycle_canonical.py`
- `backend/tests/property/test_schema_drift_strict.py`
- `backend/tests/unit/test_error_codes_canonical.py`
- `backend/tests/unit/test_payment_status_canonical.py`
- `backend/tests/unit/test_payment_force_approved_propagation.py`
- `backend/tests/unit/test_legacy_columns_no_writes.py`
- `backend/tests/unit/test_check_production_state.py`
- `backend/tests/unit/test_prod_settings_required_flags.py`
- `backend/tests/unit/test_submission_gates.py`
- `backend/tests/unit/test_withdrawal_eligibility.py`
- `backend/tests/integration/test_system_actor_transitions.py`
- `backend/tests/unit/test_canonical_tenant_drift_guard.py`
- `backend/tests/unit/test_brand_drift_guard.py` + `apps/admissions/tests/unit/brandDriftGuard.test.ts`
- `apps/admissions/tests/unit/documentFlowDriftGuard.test.ts`
- `backend/tests/unit/test_official_document_dedup_guard.py`
- `backend/tests/unit/test_scope_drift_guard.py` + `backend/tests/unit/test_unscoped_endpoint_guard.py`
- `backend/tests/unit/test_migration_drift_guard.py`
- `apps/admissions/tests/unit/tenantNav.test.ts` (pins `tenant.profile.read`; enterprise-tenant-authority)
- `backend/tests/property/test_capability_endpoint_shape.py` (Property 2 — capability catalogue exposed) + `apps/admissions/tests/property/capabilityDerivation.property.test.ts` (Property 21 — frontend capability derivation)
- `backend/tests/property/test_domain_status_machine.py` (Property 11) + `backend/tests/property/test_domain_resolution_fail_closed.py` (Property 14)

## How To Add A New Domain Concept

1. Decide where the source of truth lives. Backend if it's authoritative business logic; frontend lib if it's purely UI.
2. If a frontend mirror is needed, add a fixture file under `__fixtures__/` and a drift-guard test.
3. Register the new concept in this file with a row in the relevant section.
4. Document the concept's contract with an ADR if it is non-trivial.
5. Add tests for both the source of truth and the drift guard.
