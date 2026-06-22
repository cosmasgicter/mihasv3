# Implementation Plan: Enterprise Tenant Authority

## Overview

This plan converts the Beanola-owned multi-tenant authority design into incremental, test-driven coding tasks. Work is **additive and backward compatible**: schema changes ship as idempotent additive SQL under `backend/scripts/` (the `managed = False` convention) with matching rollbacks, every API stays on the `{"success": true, "data": ...}` envelope, and cookie auth + CSRF is preserved on all state-changing endpoints.

The backend (Django 5 + DRF, `backend/apps/`) is the only security boundary. Every authority decision resolves through `AdminCapabilityService`; the frontend (`apps/admissions/`) consumes the capability set as a usability layer that the backend re-enforces. Property-based tests use **pytest + hypothesis** (`backend/tests/property/`) and **fast-check** (`apps/admissions/tests/property/`); each is tagged `Feature: enterprise-tenant-authority, Property N` and runs a minimum of 100 iterations.

Implementation order follows the dependency chain: additive SQL migration → authorization service + capability catalogue → capability endpoint → DRF permission classes → close legacy catalog write bypasses → admin/staff hardening → domain lifecycle → program/offering mapping → tenant documents/branding → audit emission → frontend capability context → console split + panels → capability nav + guards → onboarding wizard → steering docs → acceptance-scenario integration tests.

## Tasks

- [x] 1. Additive `institution_domains` lifecycle migration
  - [x] 1.1 Write the additive SQL migration and rollback
    - Create `backend/scripts/2026_06_18_01_institution_domain_lifecycle.sql`: `ALTER TABLE institution_domains ADD COLUMN IF NOT EXISTS` for `status varchar(20) NOT NULL DEFAULT 'active'`, `verification_token varchar(128)`, `dns_target varchar(255)`, `last_checked_at timestamptz`, `last_error varchar(1000)`, `created_by_id uuid`, `approved_by_id uuid`
    - Add partial unique index `CREATE UNIQUE INDEX IF NOT EXISTS uq_institution_domains_active_hostname ON institution_domains (lower(hostname)) WHERE status = 'active'` and `idx_institution_domains_status` on `status`
    - Add `NOT VALID` FKs for `created_by_id` / `approved_by_id` → `profiles(id)`; keep idempotent (re-applies as a no-op), additive-only, no `DROP`/rewrite; existing rows default to `status='active'` so production routing is unchanged
    - Create matching `backend/scripts/2026_06_18_01_institution_domain_lifecycle_rollback.sql`; ensure both register through `apply_sql_migrations` and `migration_history`
    - Reflect new columns on the `InstitutionDomain` model (`managed = False`) in `backend/apps/catalog/models.py`
    - _Requirements: 7.1, 7.10_
  - [x]* 1.2 Write property test for active hostname uniqueness
    - File `backend/tests/property/test_domain_migration_invariants.py`
    - **Property 15: Active hostname uniqueness** — creating a second `active` domain for a hostname already `active` for another tenant is rejected with a hostname-conflict error
    - Tag `Feature: enterprise-tenant-authority, Property 15`
    - _Requirements: 7.10_

- [x] 2. AdminCapabilityService and capability catalogue
  - [x] 2.1 Define capability catalogues, `CapabilitySet`, and `CapabilityResolutionError`
    - In `backend/apps/catalog/services.py` add `AdminCapabilityService.PLATFORM_CAPABILITIES` (17 `platform.*` strings) and `TENANT_CAPABILITIES` (17 `tenant.*` strings) exactly as listed in the design
    - Add the frozen `CapabilitySet` dataclass (`role`, `is_super_admin`, `all_access`, `platform_capabilities`, `institution_capabilities`) and the `CapabilityResolutionError` exception
    - _Requirements: 2.5, 2.6, 1.6_
  - [x] 2.2 Implement capability derivation
    - Implement `get_capabilities(user)` and `get_institution_capabilities(user, institution)` composing existing `is_super_admin`, `ROLE_HIERARCHY`, and `AccessScopeService.filters_for_user` (one scope computation, no raw role-string comparisons)
    - Super_Admin → full `PLATFORM_CAPABILITIES`; non-super-admin → per-institution `tenant.*` from active (`is_active`) non-expired memberships/grants using the design's read-default + granted-mutation bundle; empty set for non-canonical roles or admin with no active membership/grant; raise `CapabilityResolutionError` on dependency failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 3.2, 3.3, 1.6_
  - [x] 2.3 Implement enforcement and scope helpers
    - Implement `require_capability`, `require_institution_capability`, `visible_institution_queryset(user)`, `can_manage_institution`, `can_manage_program` (canonical → platform cap; school-local → tenant cap for owner), `can_manage_domain`, and `can_invite_staff(user, institution, target_role)` in `backend/apps/catalog/services.py`
    - _Requirements: 3.1, 3.4, 3.5, 5.2, 6.3, 6.4_
  - [x]* 2.4 Write property test for capability-set derivation
    - File `backend/tests/property/test_capability_derivation.py`
    - **Property 1: Capability-set derivation** — full `platform.*` iff `super_admin`; otherwise only `tenant.*` attributable to active/non-expired membership/grant; empty for non-canonical roles or no-scope admin
    - Tag `Feature: enterprise-tenant-authority, Property 1`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 3.2, 3.3_
  - [x]* 2.5 Write property test for fail-closed resolution
    - File `backend/tests/property/test_capability_fail_closed.py`
    - **Property 3: Capability-resolution failure fails closed** — on `CapabilityResolutionError` the effective set is empty, the action is denied, no tenant data is returned, and an authorization error is produced
    - Tag `Feature: enterprise-tenant-authority, Property 3`
    - _Requirements: 1.6_

- [x] 3. Capability source endpoint
  - [x] 3.1 Extend scope view and add capabilities alias
    - In `backend/apps/accounts/admin_user_views.py` extend `AdminScopeView` (`GET /api/v1/admin/scope/`) to add `is_super_admin`, platform `capabilities`, and per-institution `capabilities` while keeping existing `role`, `all_access`, `institutions[{id, code, name}]`
    - Add sibling `GET /api/v1/admin/capabilities/` returning the full `CapabilitySet` payload inside the `{"success": true, "data": ...}` envelope; register routes in the app `urls.py`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x]* 3.2 Write property test for endpoint payload shape
    - File `backend/tests/property/test_capability_endpoint_shape.py`
    - **Property 2: Capability endpoint payload shape** — response wrapped in the success envelope; data always carries `role`, `is_super_admin`, `all_access`, platform `capabilities`, and `institutions[]` each with `id`, `code`, `name`, per-institution `capabilities`
    - Tag `Feature: enterprise-tenant-authority, Property 2`
    - _Requirements: 2.1, 2.4_

- [x] 4. DRF permission classes and tenant-scoped mixin
  - [x] 4.1 Create `backend/apps/catalog/permissions.py`
    - Implement `HasPlatformCapability` (delegates to `AdminCapabilityService.require_capability`, emits `scope.denied`/`auth.denied` audit on failure, returns non-revealing denial)
    - Implement `TenantScopedCapabilityMixin.get_scoped_object()` that scopes through `visible_institution_queryset` **before** `.get()`, returning 404 for out-of-scope ids
    - _Requirements: 3.4, 3.5, 4.3, 4.5_
  - [x]* 4.2 Write property test for scope-before-lookup non-revealing not-found
    - File `backend/tests/property/test_scope_before_lookup.py`
    - **Property 5: Scope-before-lookup non-revealing not-found** — out-of-scope ids return 404 (or non-revealing 403) disclosing no tenant identifier/name/count/attribute; existence is never confirmed
    - Tag `Feature: enterprise-tenant-authority, Property 5`
    - _Requirements: 3.5, 4.3, 4.5, 17.4_
  - [x]* 4.3 Write property test for cross-tenant invisibility
    - File `backend/tests/property/test_cross_tenant_invisibility.py`
    - **Property 4: Cross-tenant invisibility across every scoped surface** — a non-super-admin scoped only to tenant A sees no row/identifier/name/count/attribute of tenant B across list, detail, search, exports, dashboards, documents, payments, audit, applications, users, routing simulation, analytics
    - Tag `Feature: enterprise-tenant-authority, Property 4`
    - _Requirements: 4.1, 4.2, 7.13, 10.8, 17.1, 17.2, 18.5_

- [x] 5. Close legacy catalog write bypasses
  - [x] 5.1 Retrofit institution legacy write views
    - In `backend/apps/catalog/views.py` change `InstitutionListCreateView` / `InstitutionDetailView` write methods to require `platform.tenant.create` / `platform.tenant.update` / `platform.tenant.deactivate` via `HasPlatformCapability` + `TenantScopedCapabilityMixin`; reject out-of-scope `institution_id` without mutation
    - _Requirements: 5.1, 5.4_
  - [x] 5.2 Retrofit program legacy write views
    - In `backend/apps/catalog/views.py` gate `ProgramListCreateView` / `ProgramDetailView` writes through `can_manage_program` (`platform.canonical_program.manage` for canonical/global; `tenant.program.request_change` for school-local offerings); reject a submitted out-of-scope `institution_id` without mutation
    - _Requirements: 5.2, 5.4_
  - [x] 5.3 Retrofit intake legacy write views
    - In `backend/apps/catalog/views.py` gate `IntakeListCreateView` / `IntakeDetailView` writes through `platform.intake.manage`
    - _Requirements: 5.3_
  - [x]* 5.4 Write property test for capability-gated writes / no privilege escalation
    - File `backend/tests/property/test_capability_gated_writes.py`
    - **Property 7: Capability-gated writes / no privilege escalation** — every tenant-sensitive write evaluates the required capability before any serializer save and succeeds only with the capability; creating/promoting `super_admin` or unscoped global admin succeeds only for `super_admin`
    - Tag `Feature: enterprise-tenant-authority, Property 7`
    - _Requirements: 3.4, 5.1, 5.2, 5.3, 6.1, 6.2, 7.14, 8.8, 9.4_
  - [x]* 5.5 Write property test for foreign / override institution id
    - File `backend/tests/property/test_foreign_institution_id.py`
    - **Property 6: Foreign / override institution id never mutates** — mutation requests (legacy catalog writes, admin tenant writes, application create) carrying an unauthorized institution id are rejected with no mutation, resolved binding retained, no target-tenant data disclosed
    - Tag `Feature: enterprise-tenant-authority, Property 6`
    - _Requirements: 4.4, 5.4, 7.12, 17.5_
  - [x]* 5.6 Write unit tests preserving public/student GET
    - File `backend/tests/unit/test_legacy_catalog_get_preserved.py` — public and student `GET` on the six legacy catalog views unchanged after the write retrofit
    - _Requirements: 5.5_

- [x] 6. Admin user and staff management hardening
  - [x] 6.1 Harden tenant-admin staff creation and grant/membership guards
    - In `backend/apps/accounts/admin_user_views.py` and `backend/apps/catalog/admin_views.py` wrap user + profile + `UserInstitutionMembership` in one `transaction.atomic()` (rollback user/profile on membership failure → `STAFF_CREATION_FAILED`)
    - Retain/extend `_role_level` guards: only super-admins create/promote `super_admin` or unscoped global admins; tenant-admins invite only into managed institutions with `target_role` at or below their authority via `can_invite_staff`; block tenant-admins altering their own grants/memberships and granting cross-tenant access; deactivating a tenant suspends that tenant's memberships
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [x]* 6.2 Write property test for invite scope and role ceiling
    - File `backend/tests/property/test_invite_scope_ceiling.py`
    - **Property 8: Invite scope and role ceiling** — a non-super-admin invite succeeds only with `tenant.staff.invite` for the target institution and a role at/below the actor's authority; otherwise rejected
    - Tag `Feature: enterprise-tenant-authority, Property 8`
    - _Requirements: 6.3, 6.4, 17.6_
  - [x]* 6.3 Write property test for transactional staff-creation rollback
    - File `backend/tests/property/test_staff_creation_rollback.py`
    - **Property 9: Transactional staff creation rollback** — on membership failure, no user row and no profile row persist
    - Tag `Feature: enterprise-tenant-authority, Property 9`
    - _Requirements: 6.5, 6.6_
  - [x]* 6.4 Write property test for no self-escalation / cross-grant
    - File `backend/tests/property/test_no_self_escalation.py`
    - **Property 10: Tenant-admins cannot self-escalate or cross-grant** — mutations targeting the actor's own grants/memberships, or granting access outside scope, are rejected
    - Tag `Feature: enterprise-tenant-authority, Property 10`
    - _Requirements: 6.7, 6.8_

- [x] 7. Tenant domain lifecycle
  - [x] 7.1 Implement the `DomainStatusMachine`
    - Add a pure, table-driven `DomainStatusMachine` to `backend/apps/catalog/services.py` allowing only `pending_dns→pending_review`, `pending_dns→failed`, `pending_review→verified`, `verified→active`, `active→disabled`, `failed→pending_dns`, `disabled→active`; reject all others
    - _Requirements: 7.2_
  - [x] 7.2 Domain create and activate endpoints
    - In `backend/apps/catalog/admin_views.py` add super-admin domain create (generate ≥32-char `verification_token` + `dns_target`, set `status=pending_dns`, return DNS record) and activate (`verified→active`, set `approved_by`; reject non-`verified` with `DOMAIN_NOT_VERIFIED`); map duplicate active hostname `IntegrityError` → `HOSTNAME_CONFLICT` 409
    - _Requirements: 7.3, 7.6, 7.7, 7.10, 7.14_
  - [x] 7.3 Domain verification Celery task
    - Add `verify_institution_domain_task(domain_id)` to `backend/apps/catalog/tasks.py`: DNS lookup (10s timeout); match → `pending_dns→pending_review`, set `verified_at` + `last_checked_at`, emit audit; mismatch/timeout → stay `pending_dns`, set descriptive `last_error` (≤1000 chars), update `last_checked_at`; never propagate exceptions
    - _Requirements: 7.4, 7.5_
  - [x] 7.4 Extend the Domain_Resolver to be status-aware and fail closed
    - Extend `InstitutionContextService.resolve` in `backend/apps/catalog/services.py` to resolve a tenant only when exactly one `InstitutionDomain` with `status=active`, `is_active=true`, and an active institution matches; unknown/multi-match/non-active-status hosts → Neutral Beanola context; log collisions/unknowns for operations review; single indexed `institution_domains.hostname` lookup
    - _Requirements: 7.8, 7.9, 19.1, 19.2, 19.3, 19.4_
  - [x] 7.5 Bind application creation to the resolved tenant
    - In the application create path (`backend/apps/applications/student_views.py` / `services.py`) attach applications to the resolved tenant; if a posted `institution_id` differs from the resolved context, reject with `INSTITUTION_OVERRIDE_NOT_PERMITTED` and retain the resolved binding
    - _Requirements: 7.11, 7.12_
  - [x]* 7.6 Write property test for the domain status machine
    - File `backend/tests/property/test_domain_status_machine.py`
    - **Property 11: Domain status machine allows only defined transitions** — transition permitted iff in the allowed set; activating non-`verified` rejected with status unchanged; `verified→active` records `approved_by`
    - Tag `Feature: enterprise-tenant-authority, Property 11`
    - _Requirements: 7.2, 7.6, 7.7_
  - [x]* 7.7 Write property test for domain creation init state
    - File `backend/tests/property/test_domain_creation_init.py`
    - **Property 12: Domain creation initializes verification state** — created domain has `verification_token` ≥32 chars, a generated `dns_target`, and `status=pending_dns`
    - Tag `Feature: enterprise-tenant-authority, Property 12`
    - _Requirements: 7.3_
  - [x]* 7.8 Write property test for verification outcome (mock DNS)
    - File `backend/tests/property/test_domain_verification_outcome.py`
    - **Property 13: Domain verification outcome** — with a mocked DNS resolver, match → `pending_dns→pending_review` + `verified_at`/`last_checked_at`; mismatch/timeout → stays `pending_dns`, `last_error` ≤1000 chars, `last_checked_at` updated
    - Tag `Feature: enterprise-tenant-authority, Property 13`
    - _Requirements: 7.4, 7.5_
  - [x]* 7.9 Write property test for fail-closed domain resolution
    - File `backend/tests/property/test_domain_resolution_fail_closed.py`
    - **Property 14: Fail-closed domain resolution** — resolves a tenant iff exactly one `active` domain with active institution matches; unknown/multi/non-active-status → Neutral Beanola, no tenant-private branding/offering
    - Tag `Feature: enterprise-tenant-authority, Property 14`
    - _Requirements: 7.8, 7.9, 18.1, 19.1, 19.2, 19.3_
  - [x]* 7.10 Write property test for application binding to resolved offering
    - File `backend/tests/property/test_application_binding.py`
    - **Property 16: Application binds to the resolved offering** — applications created under a resolved tenant are recorded against an `Institution_Program_Offering` belonging to that tenant
    - Tag `Feature: enterprise-tenant-authority, Property 16`
    - _Requirements: 7.11, 8.5, 18.4_

- [x] 8. Program and offering named mapping
  - [x] 8.1 Name and gate the offering model and portal visibility
    - In `backend/apps/catalog/services.py` / views, map `CanonicalProgram`/`Program`/`ProgramIntake`/`InstitutionRequiredDocument` to the requirement concepts; expose shared-portal listing (all active offerings grouped by canonical program) and tenant-portal listing (only the resolved tenant's offerings via `InstitutionContextService`); restrict canonical-program assignment to super-admins (`platform.program_assignment.manage`), tenant-admins limited to `tenant.program.request_change`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
  - [x]* 8.2 Write property test for offering visibility by portal
    - File `backend/tests/property/test_offering_visibility.py`
    - **Property 17: Offering visibility by portal** — shared portal lists exactly the active offerings grouped by canonical program; a resolved tenant portal lists only its own offerings
    - Tag `Feature: enterprise-tenant-authority, Property 17`
    - _Requirements: 8.6, 8.7, 18.3_

- [x] 9. Tenant documents, templates, and neutral branding fallback
  - [x] 9.1 Implement document-requirement resolution and branding fallback
    - Implement tenant/program/intake document-requirement resolution returning the single most-specific active profile (never another tenant's); gate template reads via `tenant.*` and production template edits via granted capability; fall back to `InstitutionContextService.BEANOLA_BRAND` when a tenant branding asset is missing (never MIHAS/KATC) in the document-generation path
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x]* 9.2 Write property test for tenant document requirement resolution
    - File `backend/tests/property/test_document_requirement_resolution.py`
    - **Property 18: Tenant document requirement resolution** — resolution returns the single most-specific active profile matching (tenant, program, intake), never a profile from another tenant
    - Tag `Feature: enterprise-tenant-authority, Property 18`
    - _Requirements: 9.1_
  - [x]* 9.3 Write property test for neutral branding fallback
    - File `backend/tests/property/test_neutral_branding_fallback.py`
    - **Property 19: Neutral branding fallback never leaks a legacy school** — missing branding asset falls back to the neutral Beanola asset, never to MIHAS/KATC
    - Tag `Feature: enterprise-tenant-authority, Property 19`
    - _Requirements: 9.3_

- [x] 10. Audit emission for tenant-sensitive actions
  - [x] 10.1 Wire audit emission across sensitive endpoints
    - Use `TenantAuditService` (`backend/apps/catalog/tenant_audit_service.py`) over `audit_logs` to emit events for tenant create/update/deactivate, domain create/verify/activate/disable, asset/template/document-config/program-assignment changes, user-invite/membership/grant changes, review/document-verify/payment-verify decisions, and failed authorizations (`auth.denied` alongside `scope.denied`); map all requirement fields onto `audit_logs` columns + `changes` jsonb (always write `institution_id`); run payloads through the shared PII redactor (SHA-256 IP/user-agent); scope tenant-admin audit reads by `changes.institution_id`; swallow audit-write exceptions
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_
  - [x]* 10.2 Write property test for audit event emission and shape
    - File `backend/tests/property/test_audit_event_shape.py`
    - **Property 20: Audit event emitted and well-formed** — exactly one Audit_Event per tenant-sensitive write and per failed authorization, carrying all required fields with no raw PII
    - Tag `Feature: enterprise-tenant-authority, Property 20`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 11. Backend checkpoint
  - Run `cd backend && python3 manage.py check`, `cd backend && python3 -m pytest`, and `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`. Ensure all tests pass and the schema generates cleanly; ask the user if questions arise.

- [x] 12. Frontend capability context
  - [x] 12.1 Build `CapabilityContext` with helpers and persistence
    - In `apps/admissions/src/contexts/` add a `CapabilityContext` consuming `GET /api/v1/admin/capabilities/` via React Query; expose `isSuperAdmin`, `isTenantAdmin`, `capabilities`, `institutionCapabilities`, `selectedInstitutionId`, `can(capability)`, `canForInstitution(institutionId, capability)`; derive flags from the backend `is_super_admin` flag (not raw role strings); persist `selectedInstitutionId` across refresh in `sessionStorage`; render a clear no-access state (no leaked tenant data) when there is no scope
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  - [x]* 12.2 Write fast-check property test for frontend capability derivation
    - File `apps/admissions/tests/property/capabilityDerivation.property.test.ts`
    - **Property 21: Frontend capability derivation** — `isSuperAdmin`/`isTenantAdmin`/`capabilities`/`institutionCapabilities` derive correctly; `can`/`canForInstitution` correctness; controls/nav render iff governing capability present
    - Tag `Feature: enterprise-tenant-authority, Property 21`
    - _Requirements: 11.1, 11.2, 12.3, 12.4, 12.5, 12.6, 13.1, 13.2, 13.3_
  - [x]* 12.3 Write fast-check property test for selected-scope persistence
    - File `apps/admissions/tests/property/selectedScopePersistence.property.test.ts`
    - **Property 23: Selected institution scope persists across refresh** — persist then rehydrate yields the same selected institution
    - Tag `Feature: enterprise-tenant-authority, Property 23`
    - _Requirements: 11.4_

- [x] 13. Authority-specific admin console split
  - [x] 13.1 Split `Tenants.tsx` into a capability switcher
    - Turn `apps/admissions/src/pages/admin/Tenants.tsx` into a thin switcher rendering `SuperAdminTenantConsole` (isSuperAdmin) or `TenantAdminSchoolConsole` (isTenantAdmin) or a no-access state, under `apps/admissions/src/pages/admin/tenants/`
    - _Requirements: 12.1, 11.5_
  - [x] 13.2 Build the authority-specific panels
    - Add `TenantListPanel`, `TenantBrandingPanel`, `TenantDomainPanel`, `TenantDocumentsPanel`, `TenantProgramsPanel`, `TenantStaffPanel`, `TenantAccessGrantsPanel`, `TenantAuditPanel` under `apps/admissions/src/pages/admin/tenants/`; super-admin sees all tenants + "New institution"; tenant-admin sees only assigned institution(s), never "New institution" or global access-grant tooling unless granted; remove/disable mutation controls without the capability; render a precise authorization message and no tenant data on backend 403
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  - [x]* 13.3 Write unit/integration tests for the console split
    - Files under `apps/admissions/tests/` — super-admin sees create control + all tenants; tenant-admin sees only its school and no create control; 403 renders clean unauthorized state with no tenant data
    - _Requirements: 12.2, 12.3, 12.4, 12.7_

- [x] 14. Capability-based navigation and route guards
  - [x] 14.1 Implement capability-driven nav and guards
    - In `apps/admissions/src/components/layout/` and the route config, drive desktop + mobile nav and route guards from `can()`: super-admins see "Tenants"; tenant-admins with `tenant.profile.read` see a "My School" item instead of platform tenant management; global tenant create/manage links are super-admin-only; a tenant-admin deep-linking a super-admin route is blocked by the guard (backend re-enforces)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  - [x]* 14.2 Write fast-check property test for nav parity
    - File `apps/admissions/tests/property/navParity.property.test.ts`
    - **Property 22: Desktop and mobile navigation parity** — for all actors, the set of nav items on desktop equals the set on mobile
    - Tag `Feature: enterprise-tenant-authority, Property 22`
    - _Requirements: 13.4_

- [x] 15. Super-admin tenant onboarding wizard
  - [x] 15.1 Build the `TenantOnboardingWizard`
    - Add `apps/admissions/src/pages/admin/tenants/TenantOnboardingWizard.tsx` as a super-admin-only stepper (institution profile → branding → domains → application templates → required documents → program assignments → intake availability → tenant-admin invitation → review & activate) calling existing admin tenant APIs; completing it persists the tenant with no manual DB edit, shows it in the list immediately, verifies + activates the domain to `active`, and creates a tenant-admin membership scoped to the new tenant
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 16.1, 16.2, 16.3_
  - [x]* 15.2 Write integration test for the wizard
    - File under `apps/admissions/tests/integration/` — completing the wizard persists tenant + config and surfaces it in the tenant list; invited tenant-admin is scoped to the new tenant
    - _Requirements: 14.2, 14.3, 16.1, 16.2_

- [x] 16. Steering documentation and canonical-truth alignment
  - [x] 16.1 Update steering docs and the canonical truth map
    - Reframe `.kiro/steering/product.md` (Beanola owns the platform; MIHAS/KATC are example tenants); add `.kiro/steering/enterprise-tenancy.md` (role/capability model, isolation invariants, domain lifecycle, offering model, application routing, nav rules, audit, data-leakage prevention, no-legacy-hardcoding); update `.kiro/steering/tech.md` (centralized authz, scope-before-lookup, frontend consumes backend capabilities, fail-closed domains, cross-tenant denial tests, no legacy bypasses); update `.kiro/steering/structure.md` (where capability logic, tenant services, frontend hooks, domain portal logic, onboarding components, permission matrix live); register the capability catalogue in `docs/canonical-truth-map.md` with a frontend drift guard, including canonical admin/onboarding/school-console routes, canonical backend tenant API paths, deprecated legacy catalog write paths, and the domain context endpoint
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 17. Acceptance-scenario integration tests
  - [x]* 17.1 Scenario A — super admin creates a tenant end to end
    - File `backend/tests/unit/test_scenario_super_admin_onboarding.py` (+ frontend integration as needed) — wizard creates tenant + config with no manual DB edit; invited tenant-admin is membership-scoped; tenant-admin sees only the new tenant; a student on the new tenant's portal sees only its offerings
    - _Requirements: 16.1, 16.2, 16.3, 16.4_
  - [x]* 17.2 Scenario B — MIHAS tenant admin isolated from KATC
    - File `backend/tests/unit/test_scenario_tenant_isolation.py` — MIHAS tenant-admin cannot list/fetch/patch KATC (including legacy catalog endpoints), cannot create an institution, cannot create a KATC program by id, cannot invite KATC staff; non-revealing denials throughout
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_
  - [x]* 17.3 Scenario C — tenant domain routes correctly
    - File `backend/tests/unit/test_scenario_domain_routing.py` — active MIHAS domain resolves MIHAS context and branding/offerings, hides KATC offerings, stores a submitted application against a MIHAS offering, and denies a KATC admin access to it
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_
  - [x]* 17.4 Scenario D — unknown or broken domain fails closed
    - File `backend/tests/unit/test_scenario_domain_fail_closed.py` — unknown/disabled domains fail closed to the Neutral Beanola context, expose no tenant-private branding/offering, and the event is logged for operations review
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

- [x] 18. Final checkpoint and verification
  - Backend: `cd backend && python3 manage.py check`, `cd backend && python3 -m pytest`, `cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`
  - Frontend: `cd apps/admissions && bun run test`, `cd apps/admissions && bun run lint`, `cd apps/admissions && bun run build`
  - Ensure all tests pass and the build is clean; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks (property, unit, integration) and can be skipped for a faster MVP; core implementation sub-tasks are never optional.
- Each task references specific requirement clauses for traceability, and every property-based test sub-task names its design property number and the requirements it validates.
- All 23 design correctness properties are covered: Properties 1–20 under pytest + hypothesis (`backend/tests/property/`), Properties 21–23 under fast-check (`apps/admissions/tests/property/`); each test is tagged `Feature: enterprise-tenant-authority, Property N` and runs ≥100 iterations. Property 13 mocks the DNS resolver.
- Work stays additive and backward compatible: additive SQL with rollback under `backend/scripts/` (`managed = False`), the `{"success": true, "data": ...}` envelope, and cookie auth + CSRF on all state-changing endpoints.
- The backend is the only security boundary; frontend capability gating is a usability layer the backend re-enforces.
- Checkpoints (tasks 11 and 18) validate incrementally with the repo's real commands.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["2.2"] },
    { "id": 2, "tasks": ["2.3"] },
    { "id": 3, "tasks": ["1.2", "3.1", "4.1", "7.1"] },
    { "id": 4, "tasks": ["2.4", "2.5", "3.2", "5.1", "7.4", "12.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "5.2", "7.2", "7.3", "8.1", "12.2", "12.3"] },
    { "id": 6, "tasks": ["5.3", "6.1", "7.5", "9.1", "13.1"] },
    { "id": 7, "tasks": ["5.4", "5.5", "5.6", "6.2", "6.3", "6.4", "7.6", "7.7", "7.8", "7.9", "7.10", "8.2", "9.2", "9.3", "10.1", "13.2", "14.1"] },
    { "id": 8, "tasks": ["10.2", "13.3", "14.2", "15.1"] },
    { "id": 9, "tasks": ["15.2", "16.1"] },
    { "id": 10, "tasks": ["17.1", "17.2", "17.3", "17.4"] }
  ]
}
```
