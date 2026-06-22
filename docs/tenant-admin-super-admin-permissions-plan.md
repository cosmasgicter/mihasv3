# Tenant Admin, Super Admin, Domain Portal, and Enterprise Logic Plan

Date: 2026-06-17  
Owner: Beanola Technologies  
Scope: admissions platform admin authority, tenant isolation, tenant onboarding, domain routing, frontend/backend alignment, and steering documentation.

## 1. Executive Intent

The platform must stop behaving like a fixed MIHAS/KATC admissions system and behave like a Beanola-owned enterprise multi-tenant admissions platform. MIHAS and KATC are tenants, not platform owners.

The most urgent issue is authority drift: some backend surfaces now understand tenant scoping, but other backend endpoints and frontend screens still behave like the old single-purpose admin system. This creates a real security risk. A tenant admin for MIHAS must never see KATC data, must never create another institution, and must never reach global tenant configuration unless Beanola explicitly grants that authority.

This plan is written as a direct handoff to an agentic coding LLM. Follow it in order. Do not rely on frontend hiding as the security boundary. Backend permissions are the source of truth.

## 2. Current Evidence From Code Review

### 2.1 Backend Pieces That Are Moving In The Right Direction

- `backend/apps/catalog/admin_views.py` already contains stricter tenant-admin style endpoints.
- `AdminTenantListCreateView` scopes `GET /api/v1/admin/institutions/` for non-super-admin users.
- `AdminTenantListCreateView.post()` is guarded by `_write_allowed(user)`, and `_write_allowed()` currently only allows `is_super_admin(user)`.
- Child tenant endpoints for programs, documents, assets, membership, grants, and domains generally scope reads and restrict writes.
- `AdminRoutingSimulateView` is super-admin-only.
- `backend/apps/catalog/services.py` has a useful `AccessScopeService` and `InstitutionContextService`.
- `backend/apps/accounts/admin_user_views.py` has `AdminScopeView`, which is the correct kind of endpoint for frontend capability decisions.
- `apps/admissions/src/contexts/InstitutionScopeContext.tsx` already models scoped institutions and `allAccess`.

These are good foundations. The problem is that they are not yet the only path through the system.

### 2.2 Critical Gaps

1. `backend/apps/catalog/views.py` still exposes older catalog write endpoints using generic `IsAdmin`.
   - `InstitutionListCreateView.post()` can create institutions through the legacy catalog path.
   - `InstitutionDetailView.patch()` and `delete()` are generic-admin gated.
   - `ProgramListCreateView.post()` accepts an `institution_id` and only checks generic admin status.
   - `ProgramDetailView.patch()` and `delete()` are generic-admin gated.
   - `IntakeListCreateView.post()` and `IntakeDetailView.patch()` / `delete()` are generic-admin gated.
   - These endpoints can bypass the stricter `/api/v1/admin/institutions/` authority model.

2. `apps/admissions/src/pages/admin/Tenants.tsx` still renders like an all-powerful admin console.
   - It exposes “New” tenant creation controls to admins without checking `super_admin`.
   - It displays tenant onboarding, domain, document, membership, and access-grant management in one surface without capability-based gating.
   - Backend may return 403, but the UI is misleading and creates a dangerous operational model.

3. Navigation still treats tenant management as a generic admin feature.
   - Admin sidebar/mobile navigation includes the tenant surface broadly.
   - There is no strong capability-driven distinction between Beanola super admin and tenant school admin.

4. The global role model is too coarse.
   - `backend/apps/accounts/permissions.py` defines `super_admin`, `admin`, `reviewer`, and `student`.
   - There is no explicit first-class tenant admin concept at the permission boundary.
   - Tenant authority exists indirectly through `UserInstitutionMembership` and `AccessGrant`, but the frontend and some legacy endpoints still interpret `admin` too broadly.

5. User/staff creation needs stronger tenancy guarantees.
   - Tenant admins must not create global admins.
   - Tenant admins must not create users outside their institution.
   - A tenant staff user should not exist as an unscoped admin with no institution membership.

6. Domain configuration is not fully enterprise-grade end to end.
   - Domain resolution exists through `InstitutionContextService`.
   - Tenant domain management needs verification, lifecycle states, DNS guidance, conflict handling, frontend validation, deployment integration, and smoke tests.

7. Steering files still carry old product framing.
   - `.kiro/steering/product.md` still begins from the MIHAS platform framing.
   - The business logic for Beanola-owned multi-tenancy is not documented at the level required for an enterprise system.

## 3. Non-Negotiable Security And Product Invariants

Implement and test these invariants before considering the system production-ready.

1. Beanola owns the platform.
2. A tenant is a client institution, such as MIHAS, KATC, or any future university/college.
3. Super admins are Beanola platform operators.
4. Tenant admins are school-level operators.
5. Tenant admins can only access institutions explicitly assigned to them.
6. Tenant admins must never see another tenant in list, detail, search, exports, dashboards, documents, payments, audit logs, applications, users, routing simulation, or analytics.
7. Tenant admins must never create, deactivate, or globally configure institutions unless a separate explicit Beanola-granted capability exists.
8. Tenant admins must never create or promote a `super_admin`.
9. Tenant admins must never create a global `admin` without an institution membership and a bounded tenant role.
10. A user with admin-like role but no institution membership must receive no tenant data unless they are `super_admin`.
11. Frontend capability checks are usability controls only; backend checks are mandatory.
12. All object lookups must be scoped before mutation. Out-of-scope IDs should return 404 or a non-revealing 403.
13. Tenant domains must resolve to exactly one active tenant, or fail closed to the neutral Beanola context.
14. The shared Beanola portal may show all eligible offerings. A tenant domain may show only that tenant’s active offerings.
15. Every tenant-sensitive write must produce an audit event containing actor, actor role, institution, operation, object type, object id, request id, and result.

## 4. Canonical Management Model

### 4.1 Platform Super Admin

Beanola super admins can:

- Create tenants.
- Deactivate tenants.
- Configure tenant metadata, logos, signatures, colors, domains, documents, and application templates.
- Assign canonical programs to institutions.
- Create and manage global program catalog data.
- Create intakes if intakes remain global.
- Create tenant admins and scoped staff.
- Grant or revoke cross-tenant access.
- Run tenant routing simulations.
- View all audit logs.
- View all operational dashboards.

Super admins must use a Beanola-branded admin experience. They are not attached to one school’s white-label control panel.

### 4.2 Tenant Admin

Tenant admins can:

- View only their assigned institution or institutions.
- Manage only school-level operations explicitly allowed by capability.
- Review applications for their institution.
- View applicant documents for their institution.
- Verify payments for their institution, if granted.
- Invite school staff only into their own institution, if granted.
- View school configuration in read-only mode by default.
- Request tenant configuration changes where direct editing is not permitted.

Tenant admins cannot:

- Create institutions.
- See other institutions.
- Deactivate institutions.
- Create or verify arbitrary domains unless explicitly permitted by Beanola.
- Create global programs.
- Reassign programs between tenants.
- Create global intakes unless explicitly permitted.
- Create super admins.
- Create global platform admins.
- Grant themselves access.
- Grant another user access outside their own institution.
- Access unrestricted routing simulations.

### 4.3 Reviewer

Reviewers can:

- View and review assigned applications for assigned institutions.
- See only scoped application/document data.
- Take only review actions explicitly allowed by workflow.

Reviewers cannot:

- Manage tenant settings.
- Manage programs.
- Manage domains.
- Manage users.
- Manage access grants.

### 4.4 Student

Students can:

- Apply to visible programs.
- See their own application state.
- Upload required documents.
- Pay fees where required.

Students cannot:

- Discover hidden tenant configuration.
- Access another student’s data.
- Override institution routing.

## 5. Capability Model To Implement

Do not use raw role strings throughout the frontend. Backend must expose an explicit capability set.

Recommended capabilities:

### 5.1 Platform Capabilities

- `platform.tenant.read_all`
- `platform.tenant.create`
- `platform.tenant.update`
- `platform.tenant.deactivate`
- `platform.domain.manage`
- `platform.asset.manage`
- `platform.template.manage`
- `platform.document.manage`
- `platform.canonical_program.manage`
- `platform.program_assignment.manage`
- `platform.intake.manage`
- `platform.user.create_global`
- `platform.user.manage_all`
- `platform.access_grant.manage`
- `platform.audit.read_all`
- `platform.routing.simulate_all`
- `platform.settings.manage`

### 5.2 Tenant Capabilities

- `tenant.profile.read`
- `tenant.profile.request_change`
- `tenant.application.read`
- `tenant.application.review`
- `tenant.application.export`
- `tenant.document.read`
- `tenant.document.verify`
- `tenant.payment.read`
- `tenant.payment.verify`
- `tenant.staff.read`
- `tenant.staff.invite`
- `tenant.staff.disable`
- `tenant.audit.read`
- `tenant.program.read`
- `tenant.program.request_change`
- `tenant.domain.read`
- `tenant.domain.request_change`

### 5.3 Capability Source

Extend `GET /api/v1/admin/scope/` or add `GET /api/v1/admin/capabilities/` to return:

```json
{
  "role": "admin",
  "is_super_admin": false,
  "all_access": false,
  "capabilities": ["tenant.application.read", "tenant.application.review"],
  "institutions": [
    {
      "id": "uuid",
      "code": "MIHAS",
      "name": "MIHAS",
      "capabilities": ["tenant.application.read", "tenant.staff.invite"]
    }
  ]
}
```

Frontend must use this response for navigation, route guards, page mode, buttons, forms, empty states, and mutation availability.

## 6. Backend Remediation Plan

### Phase B1: Create A Permission Matrix

Create `docs/admin-permission-matrix.md`.

For every admin or catalog endpoint, document:

- URL.
- HTTP method.
- Current permission class.
- Required future capability.
- Scope rule.
- Whether out-of-scope objects return 403 or 404.
- Audit event required.
- Frontend surface that calls it.
- Test file that proves it.

Minimum endpoints to include:

- `/api/v1/admin/scope/`
- `/api/v1/admin/institutions/`
- `/api/v1/admin/institutions/<id>/`
- `/api/v1/admin/institutions/<id>/programs/`
- `/api/v1/admin/institutions/<id>/documents/`
- `/api/v1/admin/institutions/<id>/assets/`
- `/api/v1/admin/institutions/<id>/domains/`
- `/api/v1/admin/institutions/<id>/membership/`
- `/api/v1/admin/institutions/<id>/grants/`
- `/api/v1/admin/routing/simulate/`
- legacy catalog institution endpoints.
- legacy catalog program endpoints.
- legacy catalog intake endpoints.
- admin user endpoints.
- application review endpoints.
- payment review endpoints.
- document verification endpoints.
- analytics/export endpoints.

Acceptance:

- No admin endpoint is left unmapped.
- No write endpoint is mapped to generic `IsAdmin` without a scoped capability.

### Phase B2: Centralize Authorization

Add or extend a backend service, preferably near `backend/apps/catalog/services.py` or a shared admin permissions module:

- `AdminCapabilityService.get_capabilities(user)`
- `AdminCapabilityService.get_institution_capabilities(user, institution)`
- `AdminCapabilityService.require_capability(user, capability)`
- `AdminCapabilityService.require_institution_capability(user, institution, capability)`
- `AdminCapabilityService.visible_institution_queryset(user)`
- `AdminCapabilityService.can_manage_institution(user, institution)`
- `AdminCapabilityService.can_manage_program(user, program)`
- `AdminCapabilityService.can_manage_domain(user, domain)`
- `AdminCapabilityService.can_invite_staff(user, institution, target_role)`

Rules:

- Super admin returns full platform capabilities.
- Non-super-admin users derive tenant capabilities from active memberships and active grants.
- An admin with no active membership and no active grant gets an empty tenant scope.
- Capability checks must happen before serializer save.
- Object lookup helpers must scope querysets before object retrieval.

Acceptance:

- Endpoint code no longer hand-rolls role comparisons except for one central service.
- Tests prove a MIHAS tenant admin cannot fetch, patch, delete, or infer KATC objects.

### Phase B3: Close Legacy Catalog Write Bypasses

File: `backend/apps/catalog/views.py`

Fix or deprecate these endpoints:

- `InstitutionListCreateView.post()`
- `InstitutionDetailView.patch()`
- `InstitutionDetailView.delete()`
- `ProgramListCreateView.post()`
- `ProgramDetailView.patch()`
- `ProgramDetailView.delete()`
- `IntakeListCreateView.post()`
- `IntakeDetailView.patch()`
- `IntakeDetailView.delete()`

Required behavior:

- Institution create/update/delete must require `platform.tenant.create`, `platform.tenant.update`, or `platform.tenant.deactivate`.
- Program create/update/delete must either:
  - be platform-only, if programs are canonical/global, or
  - be tenant-scoped with explicit `tenant.program.manage` if the model is school-local.
- Intake create/update/delete must be platform-only unless the data model supports school-specific intakes.
- A tenant admin must not be able to submit another institution’s UUID to mutate data.
- Public/student GET behavior must remain compatible.

Acceptance tests:

- MIHAS tenant admin POST to legacy institution create returns forbidden.
- MIHAS tenant admin PATCH KATC institution returns not found or forbidden without data leakage.
- MIHAS tenant admin POST program with KATC `institution_id` fails.
- Super admin can still perform allowed platform operations.

### Phase B4: Harden Admin User And Staff Management

Files to inspect and update:

- `backend/apps/accounts/admin_user_views.py`
- `backend/apps/accounts/models.py`
- `backend/apps/catalog/models.py`
- serializers used by admin user creation.

Required behavior:

- Only super admins can create `super_admin`.
- Only super admins can create unscoped global platform admins.
- Tenant admins can invite users only into institutions they manage.
- Tenant admins can only assign tenant-level roles lower than or equal to their delegated authority.
- Tenant admin staff creation must create user, profile, and institution membership in one transaction.
- If membership creation fails, user creation must roll back.
- Tenant admins cannot alter their own grants or memberships.
- Tenant admins cannot grant cross-tenant access.
- Deactivating a tenant must disable or suspend tenant memberships predictably.

Acceptance tests:

- MIHAS admin cannot create KATC staff.
- MIHAS admin cannot create super admin.
- MIHAS admin cannot create global admin with no institution.
- MIHAS admin can invite MIHAS reviewer only if granted `tenant.staff.invite`.
- Super admin can create tenant admin and assign institution membership.

### Phase B5: Tenant Domain Lifecycle End To End

Files to inspect and update:

- `backend/apps/catalog/models.py`
- `backend/apps/catalog/services.py`
- `backend/apps/catalog/admin_views.py`
- frontend tenant admin service.
- frontend tenant detail page.
- environment/config for allowed hosts, CORS, CSRF, and frontend routing.

Recommended model fields for `InstitutionDomain`:

- `hostname`
- `institution`
- `is_primary`
- `is_active`
- `status`: `pending_dns`, `pending_review`, `verified`, `active`, `disabled`, `failed`
- `verification_token`
- `dns_target`
- `verified_at`
- `last_checked_at`
- `last_error`
- `created_by`
- `approved_by`

Required lifecycle:

1. Super admin adds domain for tenant.
2. System generates verification token and DNS target.
3. UI displays required DNS record.
4. Verification job checks DNS.
5. Super admin activates verified domain.
6. Domain resolver maps host to tenant context.
7. Frontend calls context endpoint and receives tenant branding.
8. Catalog/program APIs filter to that tenant.
9. Student application is assigned to the tenant automatically.

Rules:

- Duplicate active hostnames are forbidden.
- Disabled tenants cannot resolve as active domains.
- Unknown or conflicting domains fail closed to shared Beanola context.
- Tenant admins can read configured domains for their own school.
- Tenant admins can request a domain change if product requires it, but direct activation should remain super-admin-only by default.

Acceptance tests:

- Configured MIHAS domain resolves MIHAS context.
- KATC programs do not appear on MIHAS domain.
- Application submitted on MIHAS domain attaches MIHAS institution.
- Unknown domain returns Beanola shared context.
- Duplicate domain creation fails.
- Disabled domain no longer resolves to tenant context.

### Phase B6: Audit Logging And Security Observability

Every sensitive action must emit an audit event:

- Tenant create/update/deactivate.
- Domain create/verify/activate/disable.
- Logo/signature/template/document config changes.
- Program assignment changes.
- User invitation.
- Membership change.
- Grant change.
- Application review decision.
- Document verification.
- Payment verification.
- Failed authorization on sensitive admin endpoints.

Audit event fields:

- `actor_user_id`
- `actor_role`
- `actor_institution_scope`
- `target_institution_id`
- `action`
- `object_type`
- `object_id`
- `request_id`
- `ip_address`
- `user_agent`
- `status`
- `reason`
- `created_at`

Tenant admins may read audit logs only for their own institution and only if they have `tenant.audit.read`.

## 7. Frontend Remediation Plan

### Phase F1: Introduce Capability-Aware Admin State

Files to inspect and update:

- `apps/admissions/src/contexts/AuthContext.tsx`
- `apps/admissions/src/contexts/InstitutionScopeContext.tsx`
- `apps/admissions/src/types/roles.ts`
- admin API services.

Required frontend state:

- `isSuperAdmin`
- `isTenantAdmin`
- `capabilities`
- `institutionCapabilities`
- `selectedInstitutionId`
- `can(capability)`
- `canForInstitution(institutionId, capability)`

Do not duplicate backend rules manually. Use backend capability output as source of truth.

Acceptance:

- Frontend can render different admin surfaces for super admin and tenant admin.
- Refreshing the page does not lose selected institution scope.
- A no-scope admin sees a clear no-access state, not leaked data.

### Phase F2: Split The Tenant Admin Screen Into Authority-Specific Modes

File: `apps/admissions/src/pages/admin/Tenants.tsx`

Refactor into smaller components:

- `SuperAdminTenantConsole`
- `TenantAdminSchoolConsole`
- `TenantListPanel`
- `TenantOnboardingWizard`
- `TenantBrandingPanel`
- `TenantDomainPanel`
- `TenantDocumentsPanel`
- `TenantProgramsPanel`
- `TenantStaffPanel`
- `TenantAccessGrantsPanel`
- `TenantAuditPanel`

Required UI behavior:

- Super admin sees all tenants and can create a new tenant.
- Tenant admin sees only assigned school or schools.
- Tenant admin never sees “New institution”.
- Tenant admin never sees global access-grant tooling unless explicitly granted.
- Tenant admin cannot select KATC if scoped only to MIHAS.
- Tenant admin domain panel is read-only or request-only unless explicitly granted.
- Mutation buttons must be removed or disabled based on capability.
- 403 responses must show a precise authorization message.

Acceptance:

- MIHAS admin navigation and tenant page show MIHAS only.
- No create institution button for MIHAS admin.
- No KATC data appears in list, select boxes, tables, forms, breadcrumbs, or empty states.
- Super admin can still complete tenant onboarding.

### Phase F3: Capability-Based Navigation

Files to inspect and update:

- `apps/admissions/src/components/layout/AppLayout.tsx`
- sidebar components.
- mobile navigation components.
- route guards.

Rules:

- `Tenants` nav item is visible to super admins as “Tenants”.
- Tenant admins may see a school-specific item such as “My School” or “Institution Settings” if they have `tenant.profile.read`.
- Global tenant creation/management links are super-admin-only.
- Program/global config links are super-admin-only unless tenant-scoped program read/request capabilities exist.
- User management links must distinguish platform users from school staff.
- Mobile nav must follow the exact same capability rules as desktop nav.

Acceptance:

- Desktop and mobile nav show the same authority model.
- Tenant admin cannot deep-link into super-admin pages.
- Deep links are protected by route guards and backend permissions.

### Phase F4: Tenant Onboarding Wizard For Super Admin

Build a complete super-admin onboarding flow:

1. Institution profile.
2. Branding: logo, signature, colors.
3. Domains.
4. Application templates.
5. Required documents.
6. Program assignments.
7. Intake availability.
8. Tenant admin invitation.
9. Review and activate.

Acceptance:

- Super admin can create a tenant without manual database edits.
- The created tenant is immediately visible in admin list.
- Tenant domain can be verified and activated.
- Tenant admin can log in and sees only that tenant.
- Student can apply through shared or tenant-specific portal.

### Phase F5: Frontend Regression Tests

Add tests covering:

- Super admin tenant creation UI.
- Tenant admin read-only school settings.
- Tenant admin cannot see “New institution”.
- Tenant admin cannot see other institutions in dropdowns.
- Mobile nav respects capabilities.
- Deep-link route guard blocks super-admin-only routes.
- 403 mutation response shows clean message.

## 8. Data Model And Business Logic Decisions To Resolve

Resolve these explicitly before implementation drifts.

### 8.1 Program Model

Current model appears institution-attached in places, while the desired product says schools may offer the same programs.

Recommended model:

- `CanonicalProgram`: global Beanola program definition.
- `InstitutionProgramOffering`: tenant-specific offering of a canonical program.
- `OfferingRequirement`: tenant-specific documents, payment rules, eligibility, templates.
- `IntakeOffering`: tenant/program/intake availability.

Rules:

- Students apply to a program offering, even if UI says “program”.
- Shared portal can list all active offerings grouped by program.
- Tenant portal lists only offerings for that tenant.
- Super admin assigns canonical programs to tenants.
- Tenant admin may request offering changes but does not globally alter canonical programs.

### 8.2 Intake Model

Decide whether intakes are:

- global platform intakes, or
- tenant-specific intakes, or
- global intake periods with tenant-specific participation.

Recommended:

- Keep global intake periods.
- Add tenant/program offering participation.
- This avoids every tenant needing duplicate intake records while still allowing school-specific availability.

### 8.3 Documents And Templates

Rules:

- Document requirements should be tenant/program/intake aware.
- Generated PDFs must use institution-specific logo/signature/template.
- Missing tenant assets must fall back to neutral Beanola assets, not MIHAS/KATC assets.
- Tenant admin can view configured templates but should not edit production templates unless granted.

### 8.4 Domains And Portals

Rules:

- Domain determines tenant context.
- Tenant context determines branding and available offerings.
- Application creation stores the resolved tenant/offer context.
- A malicious user cannot override institution by posting a different institution id from a tenant portal.

### 8.5 Permissions

Rules:

- Role tells who the user is globally.
- Membership tells which institution they belong to.
- Capability tells what they may do.
- Grants are explicit exceptions and must be audited.

## 9. Steering Documentation Plan

Update steering files so future agents stop reintroducing old MIHAS/KATC assumptions.

### 9.1 Rewrite Product Context

File: `.kiro/steering/product.md`

Replace the old MIHAS-first framing with:

- Beanola Technologies owns and operates the platform.
- Institutions are tenants.
- MIHAS and KATC are example tenants only.
- The platform supports many universities and colleges.
- Tenant admins are school operators with scoped access.
- Super admins are Beanola operators with platform authority.
- Student-facing portals can be shared Beanola or tenant-domain specific.
- Documents, branding, signatures, and templates are tenant-specific.
- Programs are assigned to institutions through offerings.

### 9.2 Add Enterprise Tenancy Steering

Create `.kiro/steering/enterprise-tenancy.md`.

Include:

- Role model.
- Capability model.
- Tenant isolation invariants.
- Domain resolution lifecycle.
- Program/offering model.
- Student application routing.
- Admin navigation rules.
- Audit requirements.
- Data leakage prevention rules.
- No legacy MIHAS/KATC hardcoding rule.

### 9.3 Update Tech Steering

File: `.kiro/steering/tech.md`

Add:

- Backend authorization must be centralized.
- Every tenant-sensitive queryset must be scoped before object lookup.
- Frontend must consume backend capabilities.
- Tenant domains must fail closed.
- Tests must cover cross-tenant denial.
- Legacy endpoints must not bypass admin APIs.

### 9.4 Update Structure Steering

File: `.kiro/steering/structure.md`

Add:

- Where admin capability logic lives.
- Where tenant services live.
- Where frontend admin capability hooks live.
- Where domain portal logic lives.
- Where tenant onboarding components live.
- Where permission matrix and canonical truth docs live.

### 9.5 Update Canonical Truth Map

File: `docs/canonical-truth-map.md`

Add:

- Canonical admin route: `/admin/tenants`.
- Super-admin tenant onboarding route.
- Tenant-admin school console route.
- Canonical backend tenant API paths.
- Deprecated legacy catalog write paths, if not removed immediately.
- Domain context endpoint.

## 10. Immediate Red-Flag Fix Order

Do these first before broad UI polish:

1. Add backend tests reproducing MIHAS tenant admin seeing or mutating KATC data.
2. Close legacy catalog write bypasses in `backend/apps/catalog/views.py`.
3. Expand `/api/v1/admin/scope/` with capabilities.
4. Gate `apps/admissions/src/pages/admin/Tenants.tsx` by `isSuperAdmin` and capabilities.
5. Remove or disable “New institution” for non-super-admin users.
6. Add route guards for super-admin-only pages.
7. Add tenant-domain lifecycle fields and status handling.
8. Update steering docs to prevent old assumptions returning.

## 11. Test Plan

### 11.1 Backend Permission Tests

Create or update tests for:

- Super admin can list all tenants.
- Super admin can create tenant.
- Super admin can configure domain.
- Super admin can assign programs.
- MIHAS tenant admin lists only MIHAS.
- MIHAS tenant admin cannot list KATC.
- MIHAS tenant admin cannot fetch KATC detail.
- MIHAS tenant admin cannot patch KATC.
- MIHAS tenant admin cannot create institution.
- MIHAS tenant admin cannot use legacy catalog create institution path.
- MIHAS tenant admin cannot create program for KATC by UUID.
- MIHAS tenant admin cannot create super admin.
- MIHAS tenant admin cannot grant themselves KATC access.
- No-scope admin sees empty scope and no tenant data.

### 11.2 Frontend Tests

Create or update tests for:

- Super admin sees tenant onboarding.
- Tenant admin sees school console.
- Tenant admin does not see new tenant button.
- Tenant admin cannot select another institution.
- Mobile navigation hides platform tenant management for tenant admin.
- Deep link to super-admin tenant creation is blocked for tenant admin.
- 403 responses render a clear unauthorized state.

### 11.3 Domain Portal Tests

Create tests for:

- Known active MIHAS domain resolves MIHAS context.
- Known active KATC domain resolves KATC context.
- Unknown domain resolves neutral Beanola context.
- Disabled tenant domain does not resolve active tenant context.
- Duplicate domain is rejected.
- Tenant portal application cannot override institution assignment.

### 11.4 Performance Tests

Add performance checks around tenant context and admin lists:

- Tenant context resolution should perform one indexed domain lookup plus tenant fetch.
- Admin institution list must avoid N+1 queries.
- Tenant detail panels should load lazily or through separate queries.
- Frontend bundle should not force super-admin-only tenant onboarding code into every student portal route if code splitting is already used.

Recommended commands after implementation:

```bash
python manage.py test
npm test
npm run build
npm run lint
```

Use the actual project package manager and test commands found in the repo.

## 12. Production Acceptance Scenarios

### Scenario A: Super Admin Creates A New Tenant

1. Super admin logs in.
2. Super admin opens `/admin/tenants`.
3. Super admin creates “Example College”.
4. Super admin uploads logo and signature.
5. Super admin configures domain.
6. Super admin assigns programs.
7. Super admin configures documents/templates.
8. Super admin invites tenant admin.
9. Tenant admin logs in and sees only Example College.
10. Student opens tenant portal and sees only Example College offerings.

Pass condition: no manual database edit is required.

### Scenario B: MIHAS Tenant Admin Is Isolated

1. MIHAS tenant admin logs in.
2. Admin sees MIHAS school console only.
3. Admin does not see KATC anywhere.
4. Admin cannot create institution.
5. Admin cannot patch KATC through direct API calls.
6. Admin cannot create program assigned to KATC by posting KATC UUID.
7. Admin cannot invite KATC staff.

Pass condition: no KATC identifier, name, data count, document, application, payment, or audit event leaks.

### Scenario C: Tenant Domain Routes Correctly

1. User opens configured MIHAS domain.
2. Frontend receives MIHAS context.
3. Logo, signature, documents, and program offerings are MIHAS-specific.
4. Student applies.
5. Backend stores application against MIHAS offering.
6. KATC admin cannot view it.

Pass condition: domain context, catalog filtering, and application persistence agree.

### Scenario D: Unknown Or Broken Domain Fails Closed

1. User opens unknown host.
2. Backend returns neutral Beanola context.
3. No tenant-private branding or offering leaks.
4. Error is logged for operations review if relevant.

Pass condition: no tenant is guessed.

## 13. Agent Implementation Instructions

Follow this order exactly:

1. Read `docs/canonical-truth-map.md`.
2. Read this plan.
3. Inspect `backend/apps/accounts/permissions.py`.
4. Inspect `backend/apps/catalog/services.py`.
5. Inspect `backend/apps/catalog/admin_views.py`.
6. Inspect `backend/apps/catalog/views.py`.
7. Inspect `backend/apps/accounts/admin_user_views.py`.
8. Inspect `apps/admissions/src/contexts/AuthContext.tsx`.
9. Inspect `apps/admissions/src/contexts/InstitutionScopeContext.tsx`.
10. Inspect `apps/admissions/src/pages/admin/Tenants.tsx`.
11. Create `docs/admin-permission-matrix.md`.
12. Implement backend capability service.
13. Close legacy backend permission bypasses.
14. Add backend tests first.
15. Extend admin scope/capability API.
16. Refactor frontend to consume capabilities.
17. Add frontend tests.
18. Implement or complete domain lifecycle.
19. Update steering docs.
20. Run tests and build.

Do not:

- Reintroduce MIHAS/KATC as platform-level constants.
- Treat generic `admin` as global authority.
- Rely on frontend hiding for security.
- Add tenant-domain routing without backend scope tests.
- Leave old catalog write endpoints as bypasses.
- Create a tenant admin with no institution membership.

## 14. Definition Of Done

The work is complete only when:

- Super admin can create a tenant end to end from the UI.
- Tenant admin cannot create tenants.
- Tenant admin cannot see or mutate another tenant through UI or direct API.
- Legacy catalog write endpoints are secured or removed.
- Admin navigation is capability-driven on desktop and mobile.
- Domain configuration has a clear lifecycle and works end to end.
- Tenant portal context controls branding and catalog filtering.
- Student application creation respects resolved tenant/program offering context.
- User/staff creation cannot create unscoped tenant admins.
- Steering files document Beanola’s enterprise tenancy model.
- Automated tests prove cross-tenant denial.
- Build and test commands pass.
- No old MIHAS/KATC branding or authority assumptions remain outside tenant seed data, tests, or examples.

