# Requirements Document

## Introduction

This feature transforms the admissions platform from a fixed MIHAS/KATC single-purpose admin system into a Beanola-owned enterprise multi-tenant admissions platform. Beanola Technologies owns and operates the platform; MIHAS, KATC, and any future university or college are tenants, not platform owners.

The driving problem is **authority drift**: some backend surfaces already understand tenant scoping, but other backend endpoints (notably legacy catalog write paths) and frontend screens still behave like the old single-purpose admin. This is a security risk. A tenant admin for MIHAS must never see KATC data, create institutions, or reach global tenant configuration unless Beanola explicitly grants that authority.

The non-negotiable principle for this entire spec: **backend permissions are the source of truth, and frontend hiding is never the security boundary.** Every frontend capability check is a usability control layered on top of mandatory backend enforcement.

The work spans the Django 5 + DRF backend under `backend/apps/`, the React 18 + TypeScript admissions frontend under `apps/admissions/`, the Neon Postgres database (production changes ship as additive SQL scripts under `backend/scripts/` following the `managed = False` convention), and the steering documentation under `.kiro/steering/`. All API responses use the `{"success": true, "data": ...}` envelope, and authentication remains cookie-based with CSRF on state-changing requests.

## Glossary

- **Platform**: The Beanola-owned multi-tenant admissions system comprising the Django backend, the admissions frontend, and the Neon Postgres database.
- **Beanola**: Beanola Technologies, the owner and operator of the Platform.
- **Tenant**: A client institution served by the Platform, such as MIHAS, KATC, or any future university or college. Represented by an `Institution` record.
- **Super_Admin**: A Beanola platform operator with platform-wide authority. Identified by the `super_admin` role.
- **Tenant_Admin**: A school-level operator whose authority is scoped to one or more explicitly assigned Institutions through active memberships and grants.
- **Reviewer**: A scoped operator who reviews assigned applications for assigned Institutions and takes only workflow-permitted review actions.
- **Student**: An applicant who applies to program offerings, manages their own application, uploads documents, and pays fees.
- **Capability**: A named permission string in the `platform.*` or `tenant.*` namespace that expresses what an actor may do. Capabilities, not raw role strings, drive frontend and backend authorization decisions.
- **Capability_Set**: The collection of platform-level and per-institution capabilities returned by the backend for the current actor.
- **AdminCapabilityService**: The centralized backend authorization service (located near `backend/apps/catalog/services.py`) that computes capabilities, scopes querysets, and enforces capability and institution checks.
- **Capability_Endpoint**: The backend endpoint that exposes the actor's Capability_Set, implemented by extending `GET /api/v1/admin/scope/` or adding `GET /api/v1/admin/capabilities/`.
- **Membership**: A `UserInstitutionMembership` record linking a user to an Institution with a bounded tenant role.
- **Access_Grant**: An explicit, audited exception that extends an actor's access beyond their default memberships.
- **Institution_Domain**: An `InstitutionDomain` record mapping a hostname to a Tenant, with a lifecycle status, verification token, and DNS target.
- **Domain_Resolver**: The backend service that maps an incoming request host to a Tenant context or to the neutral Beanola context.
- **Neutral_Beanola_Context**: The shared, tenant-agnostic Platform context used when no single active Tenant resolves from a host. It exposes neutral Beanola branding and never MIHAS/KATC branding.
- **Canonical_Program**: A global Beanola program definition (`CanonicalProgram`).
- **Institution_Program_Offering**: A tenant-specific offering of a Canonical_Program (`InstitutionProgramOffering`).
- **Offering_Requirement**: Tenant-specific documents, payment rules, eligibility, and templates attached to an offering (`OfferingRequirement`).
- **Intake_Offering**: A tenant/program/intake availability record (`IntakeOffering`) linking a global intake period to a tenant's participation.
- **Audit_Event**: A record of a tenant-sensitive write or a failed authorization on a sensitive admin endpoint, stored in the audit log.
- **Out_Of_Scope_Object**: A persisted object belonging to a Tenant that the current actor is not authorized to access.
- **Legacy_Catalog_Endpoints**: The institution, program, and intake write endpoints in `backend/apps/catalog/views.py` that currently use the generic `IsAdmin` permission.

## Requirements

### Requirement 1: First-Class Role Model

**User Story:** As Beanola, I want a clear four-role authority model with a first-class tenant-admin concept at the permission boundary, so that generic `admin` is never interpreted as platform-wide authority.

#### Acceptance Criteria

1. THE Platform SHALL recognize exactly four authority roles identified by the role strings `super_admin`, `admin`, `reviewer`, and `student`, mapping them respectively to Super_Admin (Beanola platform operator), Tenant_Admin (scoped school operator), Reviewer (scoped application reviewer), and Student, and SHALL treat any actor whose role string is not one of these four as having a Capability_Set containing zero capabilities.
2. THE Platform SHALL derive Tenant_Admin authority only from Membership records and Access_Grant records that are both marked active (`is_active` true) and not past any expiry timestamp, and SHALL NOT derive Tenant_Admin authority from the generic `admin` role string alone.
3. WHERE an actor holds the generic `admin` role string but has no active Membership and no active Access_Grant, THE Platform SHALL expose a Capability_Set containing zero capabilities and SHALL return zero Tenant data records, unless the actor's role string is `super_admin`.
4. THE Platform SHALL grant Super_Admin platform-wide authority only to actors whose role string is `super_admin`, and SHALL NOT derive Super_Admin authority from any Membership record or Access_Grant record.
5. WHEN any backend authorization decision is made, THE Platform SHALL evaluate Capabilities resolved through AdminCapabilityService rather than comparing raw role strings in endpoint code.
6. IF AdminCapabilityService cannot resolve a Capability_Set for an actor because of a resolution error or an unavailable dependency, THEN THE Platform SHALL deny the requested action, expose a Capability_Set containing zero capabilities, return no Tenant data, and return an authorization error response indicating that the actor's capabilities could not be resolved.

### Requirement 2: Capability Source Endpoint

**User Story:** As a frontend developer, I want the backend to expose an explicit capability set for the current actor, so that the frontend drives navigation and controls from backend authority instead of duplicating role logic.

#### Acceptance Criteria

1. THE Capability_Endpoint SHALL return the actor's `role`, `is_super_admin` flag, `all_access` flag, platform-level `capabilities` list, and an `institutions` list where each institution entry includes its `id`, `code`, `name`, and per-institution `capabilities` list.
2. WHERE the actor is a Super_Admin, THE Capability_Endpoint SHALL return the full set of `platform.*` capabilities.
3. WHERE the actor is a non-super-admin, THE Capability_Endpoint SHALL return only the `tenant.*` capabilities derived from the actor's active Memberships and active Access_Grants, scoped per institution.
4. THE Capability_Endpoint SHALL return its payload inside the `{"success": true, "data": ...}` response envelope.
5. THE Capability_Endpoint SHALL define platform capabilities including `platform.tenant.read_all`, `platform.tenant.create`, `platform.tenant.update`, `platform.tenant.deactivate`, `platform.domain.manage`, `platform.asset.manage`, `platform.template.manage`, `platform.document.manage`, `platform.canonical_program.manage`, `platform.program_assignment.manage`, `platform.intake.manage`, `platform.user.create_global`, `platform.user.manage_all`, `platform.access_grant.manage`, `platform.audit.read_all`, `platform.routing.simulate_all`, and `platform.settings.manage`.
6. THE Capability_Endpoint SHALL define tenant capabilities including `tenant.profile.read`, `tenant.profile.request_change`, `tenant.application.read`, `tenant.application.review`, `tenant.application.export`, `tenant.document.read`, `tenant.document.verify`, `tenant.payment.read`, `tenant.payment.verify`, `tenant.staff.read`, `tenant.staff.invite`, `tenant.staff.disable`, `tenant.audit.read`, `tenant.program.read`, `tenant.program.request_change`, `tenant.domain.read`, and `tenant.domain.request_change`.

### Requirement 3: Centralized Authorization Service

**User Story:** As a backend maintainer, I want one centralized authorization service, so that authorization rules are consistent, testable, and not hand-rolled across endpoints.

#### Acceptance Criteria

1. THE AdminCapabilityService SHALL provide `get_capabilities(user)`, `get_institution_capabilities(user, institution)`, `require_capability(user, capability)`, `require_institution_capability(user, institution, capability)`, `visible_institution_queryset(user)`, `can_manage_institution(user, institution)`, `can_manage_program(user, program)`, `can_manage_domain(user, domain)`, and `can_invite_staff(user, institution, target_role)`.
2. WHERE an actor is a Super_Admin, THE AdminCapabilityService SHALL return the full platform Capability_Set.
3. WHERE an actor is a non-super-admin, THE AdminCapabilityService SHALL derive tenant Capabilities from the actor's active Memberships and active Access_Grants.
4. WHEN a write operation is requested on a tenant-sensitive endpoint, THE Platform SHALL evaluate the required Capability through AdminCapabilityService before any serializer save.
5. WHEN an object lookup is performed on a tenant-sensitive endpoint, THE Platform SHALL scope the queryset through `visible_institution_queryset(user)` before retrieving the object.

### Requirement 4: Tenant Isolation Invariant

**User Story:** As Beanola, I want strict tenant isolation, so that a tenant admin can never observe or infer another tenant's data through any surface.

#### Acceptance Criteria

1. THE Platform SHALL restrict a Tenant_Admin to viewing only the Institutions explicitly assigned through active Memberships or active Access_Grants.
2. THE Platform SHALL prevent a Tenant_Admin from observing another Tenant in list, detail, search, exports, dashboards, documents, payments, audit logs, applications, users, routing simulation, and analytics surfaces.
3. WHEN a Tenant_Admin requests an Out_Of_Scope_Object by identifier, THE Platform SHALL return a 404 response or a non-revealing 403 response that discloses no Tenant identifier, name, count, or attribute.
4. WHEN a Tenant_Admin submits another Tenant's institution identifier in a mutation request, THE Platform SHALL reject the request without mutating data and without disclosing the target Tenant's data.
5. THE Platform SHALL scope every tenant-sensitive queryset before object lookup so that out-of-scope identifiers cannot be confirmed to exist.

### Requirement 5: Close Legacy Catalog Write Bypasses

**User Story:** As Beanola, I want the legacy catalog write endpoints secured, so that they cannot bypass the stricter `/api/v1/admin/institutions/` authority model.

#### Acceptance Criteria

1. WHEN a create, update, or delete request is made against the institution Legacy_Catalog_Endpoints in `backend/apps/catalog/views.py`, THE Platform SHALL require the corresponding `platform.tenant.create`, `platform.tenant.update`, or `platform.tenant.deactivate` Capability.
2. WHEN a create, update, or delete request is made against the program Legacy_Catalog_Endpoints, THE Platform SHALL require either a platform-level Capability when programs are canonical, or an explicit tenant-scoped program-management Capability when the program is school-local.
3. WHEN a create, update, or delete request is made against the intake Legacy_Catalog_Endpoints, THE Platform SHALL require a platform-level Capability unless the data model supports school-specific intakes.
4. WHEN a Tenant_Admin submits another Institution's identifier to a Legacy_Catalog_Endpoint, THE Platform SHALL reject the request without mutating data.
5. THE Platform SHALL preserve existing public and Student GET behavior on catalog endpoints.

### Requirement 6: Admin User And Staff Management

**User Story:** As Beanola, I want strong tenancy guarantees on user and staff creation, so that tenant admins cannot escalate privileges or create cross-tenant users.

#### Acceptance Criteria

1. THE Platform SHALL allow only a Super_Admin to create or promote a Super_Admin.
2. THE Platform SHALL allow only a Super_Admin to create an unscoped global platform admin.
3. WHERE a Tenant_Admin holds `tenant.staff.invite` for an Institution, THE Platform SHALL allow that Tenant_Admin to invite users only into that Institution.
4. WHEN a Tenant_Admin invites a user, THE Platform SHALL restrict the assignable tenant role to a role at or below the inviting Tenant_Admin's delegated authority.
5. WHEN a Tenant_Admin creates a staff user, THE Platform SHALL create the user, profile, and Institution Membership within one database transaction.
6. IF Membership creation fails during staff creation, THEN THE Platform SHALL roll back the user and profile creation.
7. THE Platform SHALL prevent a Tenant_Admin from altering their own Access_Grants or Memberships.
8. THE Platform SHALL prevent a Tenant_Admin from granting cross-tenant access to any user.
9. WHEN a Tenant is deactivated, THE Platform SHALL disable or suspend that Tenant's Memberships predictably.

### Requirement 7: Tenant Domain Lifecycle

**User Story:** As a Super_Admin, I want a complete tenant domain lifecycle, so that each tenant domain is verified, activated, and resolved safely end to end.

#### Acceptance Criteria

1. THE Institution_Domain record SHALL carry `hostname`, `institution`, `is_primary`, `is_active`, `status`, `verification_token`, `dns_target`, `verified_at`, `last_checked_at`, `last_error`, `created_by`, and `approved_by` fields, WHERE `hostname` holds a valid DNS hostname of 1 to 253 characters and `last_error` holds at most 1000 characters.
2. THE Institution_Domain `status` field SHALL take exactly one of the values `pending_dns`, `pending_review`, `verified`, `active`, `disabled`, or `failed`, and SHALL permit only the transitions `pending_dns → pending_review`, `pending_dns → failed`, `pending_review → verified`, `verified → active`, `active → disabled`, `failed → pending_dns`, and `disabled → active`.
3. WHEN a Super_Admin adds a domain for a Tenant, THE Platform SHALL generate a verification token of at least 32 characters, generate a DNS target, set the domain `status` to `pending_dns`, and present the required DNS record.
4. WHEN the verification job runs for a domain, THE Platform SHALL perform a DNS lookup with a timeout of 10 seconds, and IF the DNS record matches the expected `dns_target`, THEN THE Platform SHALL set the domain `status` to `pending_review`, set `verified_at`, and update `last_checked_at`.
5. IF the verification job's DNS lookup does not match the expected `dns_target` or exceeds the 10-second timeout, THEN THE Platform SHALL leave the domain `status` as `pending_dns`, record a descriptive `last_error` indicating the verification failure, and update `last_checked_at`.
6. WHEN a Super_Admin activates a domain whose `status` is `verified`, THE Platform SHALL set the domain `status` to `active` and record `approved_by`.
7. IF a Super_Admin attempts to activate a domain whose `status` is not `verified`, THEN THE Platform SHALL reject the activation, leave the domain `status` unchanged, and return an error indicating the domain is not verified.
8. WHEN a request arrives on an active hostname mapped to exactly one Tenant, THE Domain_Resolver SHALL resolve that request to the corresponding Tenant context within 100 milliseconds.
9. IF an incoming host is unknown, mapped to more than one Tenant, or mapped to a domain whose `status` is `disabled`, `failed`, `pending_dns`, `pending_review`, or `verified`, THEN THE Domain_Resolver SHALL resolve the request to the Neutral_Beanola_Context without exposing any Tenant context.
10. IF a hostname is already `active` for one Tenant, THEN THE Platform SHALL reject creation of a duplicate active hostname for another Tenant and return an error indicating the hostname conflict.
11. WHEN an application is created from a resolved Tenant context, THE Platform SHALL attach the application to the resolved Tenant.
12. IF an application creation request supplies an institution identifier that differs from the resolved Tenant context, THEN THE Platform SHALL reject the request, retain the resolved Tenant binding, and return an error indicating the institution override is not permitted.
13. WHERE a Tenant_Admin holds `tenant.domain.read`, THE Platform SHALL allow that Tenant_Admin to read configured domains for their own Institution only.
14. THE Platform SHALL restrict direct domain activation to Super_Admins.

### Requirement 8: Program And Offering Data Model

**User Story:** As Beanola, I want a canonical program and tenant offering model, so that schools can offer shared programs while students apply to tenant-specific offerings.

#### Acceptance Criteria

1. THE Platform SHALL model global program definitions as Canonical_Program records owned by Beanola.
2. THE Platform SHALL model each tenant's offering of a Canonical_Program as an Institution_Program_Offering record.
3. THE Platform SHALL model tenant-specific documents, payment rules, eligibility, and templates as Offering_Requirement records attached to an Institution_Program_Offering.
4. THE Platform SHALL model tenant participation in a global intake period as an Intake_Offering record linking tenant, offering, and intake.
5. WHEN a Student applies, THE Platform SHALL record the application against an Institution_Program_Offering.
6. WHEN the shared Beanola portal lists offerings, THE Platform SHALL list all active offerings grouped by program.
7. WHEN a tenant portal lists offerings, THE Platform SHALL list only the offerings belonging to that resolved Tenant.
8. THE Platform SHALL allow only a Super_Admin to assign Canonical_Programs to Tenants, and SHALL restrict a Tenant_Admin to requesting offering changes rather than altering Canonical_Programs.

### Requirement 9: Tenant-Specific Documents, Templates, And Branding

**User Story:** As Beanola, I want documents, templates, and branding to be tenant-specific with a neutral fallback, so that generated artifacts never leak another tenant's identity.

#### Acceptance Criteria

1. THE Platform SHALL resolve document requirements by tenant, program, and intake context.
2. WHEN a Tenant has configured branding assets, THE Platform SHALL generate PDFs using that Tenant's logo, signature, and template.
3. IF a Tenant's branding asset is missing, THEN THE Platform SHALL fall back to neutral Beanola assets and SHALL NOT fall back to MIHAS or KATC assets.
4. WHERE a Tenant_Admin holds template-read access, THE Platform SHALL allow that Tenant_Admin to view configured templates while restricting production template edits to granted actors.

### Requirement 10: Audit Logging For Tenant-Sensitive Actions

**User Story:** As Beanola, I want every tenant-sensitive write and failed authorization recorded, so that the platform has complete security observability.

#### Acceptance Criteria

1. WHEN a tenant create, update, or deactivate occurs, THE Platform SHALL emit an Audit_Event.
2. WHEN a domain create, verify, activate, or disable occurs, THE Platform SHALL emit an Audit_Event.
3. WHEN a branding asset, template, document configuration, or program assignment change occurs, THE Platform SHALL emit an Audit_Event.
4. WHEN a user invitation, Membership change, or Access_Grant change occurs, THE Platform SHALL emit an Audit_Event.
5. WHEN an application review decision, document verification, or payment verification occurs, THE Platform SHALL emit an Audit_Event.
6. IF an authorization check fails on a sensitive admin endpoint, THEN THE Platform SHALL emit an Audit_Event recording the failure.
7. THE Audit_Event SHALL include `actor_user_id`, `actor_role`, `actor_institution_scope`, `target_institution_id`, `action`, `object_type`, `object_id`, `request_id`, `ip_address`, `user_agent`, `status`, `reason`, and `created_at`.
8. WHERE a Tenant_Admin holds `tenant.audit.read`, THE Platform SHALL allow that Tenant_Admin to read Audit_Events only for their own Institution.

### Requirement 11: Capability-Aware Frontend Admin State

**User Story:** As a frontend developer, I want capability-aware admin state, so that the admin UI renders correctly for super admins and tenant admins from a single backend source of truth.

#### Acceptance Criteria

1. THE Admissions_Frontend SHALL expose `isSuperAdmin`, `isTenantAdmin`, `capabilities`, `institutionCapabilities`, and `selectedInstitutionId` state derived from the Capability_Endpoint response.
2. THE Admissions_Frontend SHALL provide a `can(capability)` helper and a `canForInstitution(institutionId, capability)` helper that evaluate the backend Capability_Set.
3. THE Admissions_Frontend SHALL render distinct admin surfaces for a Super_Admin and a Tenant_Admin based on Capabilities.
4. WHEN the admin page is refreshed, THE Admissions_Frontend SHALL preserve the selected institution scope.
5. WHERE an actor has no tenant scope, THE Admissions_Frontend SHALL render a clear no-access state and SHALL NOT render leaked Tenant data.

### Requirement 12: Authority-Specific Admin Console Split

**User Story:** As a user, I want the tenant admin screen split into authority-specific modes, so that I only see controls appropriate to my authority.

#### Acceptance Criteria

1. THE Admissions_Frontend SHALL split `apps/admissions/src/pages/admin/Tenants.tsx` into a `SuperAdminTenantConsole` and a `TenantAdminSchoolConsole` plus authority-specific panels including tenant list, onboarding wizard, branding, domain, documents, programs, staff, access grants, and audit panels.
2. WHERE the actor is a Super_Admin, THE Admissions_Frontend SHALL display all Tenants and a control to create a new Tenant.
3. WHERE the actor is a Tenant_Admin, THE Admissions_Frontend SHALL display only the assigned Institution or Institutions.
4. WHERE the actor is not a Super_Admin, THE Admissions_Frontend SHALL NOT display a "New institution" control.
5. WHERE the actor is a Tenant_Admin without an explicit grant, THE Admissions_Frontend SHALL NOT display global access-grant tooling.
6. WHEN an actor lacks a mutation Capability, THE Admissions_Frontend SHALL remove or disable the corresponding mutation control.
7. WHEN the backend returns a 403 response, THE Admissions_Frontend SHALL display a precise authorization message and SHALL NOT display Tenant data.

### Requirement 13: Capability-Based Navigation And Route Guards

**User Story:** As a user, I want navigation and route guards driven by capabilities on desktop and mobile, so that I cannot reach pages outside my authority.

#### Acceptance Criteria

1. WHERE the actor is a Super_Admin, THE Admissions_Frontend SHALL display the "Tenants" navigation item.
2. WHERE the actor is a Tenant_Admin holding `tenant.profile.read`, THE Admissions_Frontend SHALL display a school-specific navigation item rather than the platform tenant-management item.
3. THE Admissions_Frontend SHALL restrict global tenant creation and management navigation links to Super_Admins.
4. THE Admissions_Frontend SHALL apply identical capability rules to desktop and mobile navigation.
5. WHEN a Tenant_Admin attempts to deep-link into a Super_Admin-only route, THE Admissions_Frontend SHALL block the route through a route guard and THE Platform SHALL enforce the corresponding backend permission.

### Requirement 14: Super-Admin Tenant Onboarding Wizard

**User Story:** As a Super_Admin, I want a complete tenant onboarding wizard, so that I can create and activate a tenant without manual database edits.

#### Acceptance Criteria

1. THE TenantOnboardingWizard SHALL guide a Super_Admin through institution profile, branding, domains, application templates, required documents, program assignments, intake availability, tenant admin invitation, and review-and-activate steps.
2. WHEN a Super_Admin completes the wizard, THE Platform SHALL create the Tenant without requiring a manual database edit.
3. WHEN a Tenant is created through the wizard, THE Admissions_Frontend SHALL show the Tenant in the admin tenant list immediately.
4. WHEN a Super_Admin verifies and activates the Tenant's domain through the wizard, THE Platform SHALL transition the domain to `active`.
5. WHEN the invited Tenant_Admin logs in, THE Platform SHALL expose only the created Tenant to that Tenant_Admin.

### Requirement 15: Steering Documentation Alignment

**User Story:** As a future contributor, I want steering documentation reframed around Beanola-owned multi-tenancy, so that agents stop reintroducing old MIHAS/KATC platform assumptions.

#### Acceptance Criteria

1. THE Platform documentation SHALL reframe `.kiro/steering/product.md` to state that Beanola owns the Platform and that MIHAS and KATC are example Tenants only.
2. THE Platform documentation SHALL add `.kiro/steering/enterprise-tenancy.md` covering the role model, capability model, tenant isolation invariants, domain resolution lifecycle, program offering model, student application routing, admin navigation rules, audit requirements, data leakage prevention rules, and the no-legacy-hardcoding rule.
3. THE Platform documentation SHALL update `.kiro/steering/tech.md` to require centralized backend authorization, queryset scoping before object lookup, frontend consumption of backend capabilities, fail-closed tenant domains, cross-tenant denial tests, and no legacy endpoint bypasses.
4. THE Platform documentation SHALL update `.kiro/steering/structure.md` to record where admin capability logic, tenant services, frontend capability hooks, domain portal logic, tenant onboarding components, and permission matrix docs live.
5. THE Platform documentation SHALL update `docs/canonical-truth-map.md` with the canonical admin tenant route, the super-admin onboarding route, the tenant-admin school console route, the canonical backend tenant API paths, any deprecated legacy catalog write paths, and the domain context endpoint.

### Requirement 16: Acceptance Scenario — Super Admin Creates A Tenant End To End

**User Story:** As a Super_Admin, I want to create a new tenant entirely from the UI, so that onboarding requires no manual database work.

#### Acceptance Criteria

1. WHEN a Super_Admin completes the onboarding flow for a new Tenant including profile, branding, domain, programs, documents, and templates, THE Platform SHALL persist the Tenant and its configuration without a manual database edit.
2. WHEN the Super_Admin invites a Tenant_Admin for the new Tenant, THE Platform SHALL create that Tenant_Admin with a Membership scoped to the new Tenant.
3. WHEN the invited Tenant_Admin logs in, THE Platform SHALL expose only the new Tenant to that Tenant_Admin.
4. WHEN a Student opens the new Tenant's portal, THE Platform SHALL display only the new Tenant's offerings.

### Requirement 17: Acceptance Scenario — MIHAS Tenant Admin Is Isolated

**User Story:** As Beanola, I want a MIHAS tenant admin fully isolated from KATC, so that no KATC data leaks through any path.

#### Acceptance Criteria

1. WHEN a MIHAS Tenant_Admin logs in, THE Platform SHALL expose only the MIHAS school console.
2. THE Platform SHALL NOT expose any KATC identifier, name, data count, document, application, payment, or Audit_Event to a MIHAS Tenant_Admin.
3. WHEN a MIHAS Tenant_Admin attempts to create an Institution, THE Platform SHALL reject the request.
4. WHEN a MIHAS Tenant_Admin attempts to patch a KATC Institution through any API path including Legacy_Catalog_Endpoints, THE Platform SHALL return a 404 or non-revealing 403 without data leakage.
5. WHEN a MIHAS Tenant_Admin posts a KATC institution identifier to create a program, THE Platform SHALL reject the request.
6. WHEN a MIHAS Tenant_Admin attempts to invite KATC staff, THE Platform SHALL reject the request.

### Requirement 18: Acceptance Scenario — Tenant Domain Routes Correctly

**User Story:** As a Student, I want a configured tenant domain to route consistently, so that branding, catalog, and application persistence all agree.

#### Acceptance Criteria

1. WHEN a request arrives on the configured active MIHAS domain, THE Domain_Resolver SHALL resolve the MIHAS Tenant context.
2. WHEN the MIHAS context is resolved, THE Platform SHALL serve MIHAS-specific logo, signature, documents, and program offerings.
3. THE Platform SHALL NOT display KATC offerings on the MIHAS domain.
4. WHEN a Student submits an application on the MIHAS domain, THE Platform SHALL store the application against a MIHAS Institution_Program_Offering.
5. WHEN a KATC Tenant_Admin attempts to view an application submitted on the MIHAS domain, THE Platform SHALL deny access.

### Requirement 19: Acceptance Scenario — Unknown Or Broken Domain Fails Closed

**User Story:** As Beanola, I want unknown or broken domains to fail closed, so that no tenant is guessed and no tenant-private data leaks.

#### Acceptance Criteria

1. WHEN a request arrives on an unknown host, THE Domain_Resolver SHALL return the Neutral_Beanola_Context.
2. WHILE serving the Neutral_Beanola_Context, THE Platform SHALL NOT expose any tenant-private branding or offering.
3. WHEN a request arrives on a disabled domain, THE Domain_Resolver SHALL NOT resolve an active Tenant context.
4. IF a domain resolution is unknown or conflicting, THEN THE Platform SHALL log the event for operations review.
