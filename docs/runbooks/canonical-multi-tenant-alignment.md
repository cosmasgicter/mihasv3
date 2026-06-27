# Canonical Multi-Tenant Alignment Runbook

Status: active implementation baseline for
`.kiro/specs/canonical-multi-tenant-alignment/`.

This runbook records the current alignment baseline before implementation
starts. It is intentionally operational: implementation agents should update it
when a canonical decision changes, and should not add new duplicate paths when a
canonical path already exists.

## Canonical Model Summary

Beanola Technologies owns the admissions platform. MIHAS, KATC, and every
future university or college are tenant `Institution` records. The student flow
is program-first: the student chooses a program/intake and the backend resolves
the institution offering, fees, required documents, document profiles, branding,
and application numbering.

Backend authorization is the security boundary. Frontend guards and hidden
buttons are usability aids only. Admin authority flows through
`AdminCapabilityService`; tenant data scope flows through `AccessScopeService`;
domain context flows through `InstitutionContextService`; offering assignment
flows through `OfferingAssignmentService`; official document content flows
through `InstitutionDocumentProfileService`.

Official documents are backend-generated records. Frontend PDF utilities are
allowed only for dev previews or clearly non-official previews; they must not be
reachable from student/admin official document actions.

Starting a brand-new application and resuming an old application must be
explicit user intents. A route, dashboard card, duplicate conflict, or draft
loader must not silently convert a "new" application action into an old draft.

## Contradictions And Gaps Found

| Area | Current source | Gap against new spec | Required direction |
| --- | --- | --- | --- |
| Route truth | `docs/canonical-truth-map.md` currently identifies `apps/admissions/src/routes/config.tsx` as the product tenant route source. | The new spec requires a typed route registry consumed by route config, nav, auth redirects, not-found links, prefetch, and SEO. | Keep `config.tsx` working until migration, but make a registry under `apps/admissions/src/routes/` the next canonical owner. |
| Draft lifecycle | `Application` rows with `status='draft'` already drive dashboard draft lists, document uploads, grades, payments, and deletion protection; `ApplicationDraftView` still exposes a latest-only compatibility payload. | The wizard loader can still silently compare local/server timestamps and adopt duplicate `existing_id`, so user intent is not fully canonical yet. | Canonicalize on true multi-draft using `Application` rows. Start-new and resume must be explicit everywhere; `/applications/draft/` is compatibility-only. |
| Official documents | Backend official document endpoints and tenant profile rendering exist. Dev-only preview hooks have been moved under `pages/dev/hooks`. | Some service methods still expose older document/PDF paths for compatibility. | Official user flows must call backend official document services; legacy endpoints must delegate or be deprecated. |
| Tenant service contract | `services/admin/tenants.ts` mostly targets `/api/v1/admin/...`, but offering get/update still calls `/catalog/programs/{id}/`. | Tenant-admin configuration should not depend on a public/catalog write surface. | Move tenant configuration writes behind canonical admin endpoints or document the read-only exception. |
| Compatibility layers | Several re-export shims and legacy helpers remain. | Some are useful compatibility; others keep old paths alive and make the codebase harder to reason about. | Remove after tests import canonical modules, or record owner/removal condition. |

## Canonical Paths

| Surface | Canonical path | Source |
| --- | --- | --- |
| Public shared portal | `/` | `apps/admissions/src/routes/config.tsx` until route-registry migration |
| Student dashboard | `/student/dashboard` | `apps/admissions/src/routes/config.tsx` |
| Student wizard | `/student/application-wizard` with aliases | `apps/admissions/src/routes/config.tsx` |
| Product admin | `/admin/*` | `apps/admissions/src/routes/config.tsx` until route-registry migration |
| Tenant console | `/admin/tenants` | `apps/admissions/src/pages/admin/Tenants.tsx` |
| Tenant onboarding | `/admin/tenants/new` | `apps/admissions/src/pages/admin/tenants/TenantOnboardingWizard.tsx` |
| Django operational admin | `/beanola-admin-panel/` | `backend/config/urls.py` |
| Admin API | `/api/v1/admin/*` | `backend/config/urls.py` + admin URL includes |
| Official documents API | `/api/v1/applications/{id}/official-documents/*` | `backend/apps/applications/official_document_views.py` |

## Tenant Domain Setup

Canonical API path: `/api/v1/admin/institutions/{institution_id}/domains/`.
Super admins create, activate, and disable domains; tenant admins may only read
or request changes according to their scoped capabilities.

1. Create the domain from the tenant console or admin API. The backend always
   creates `status=pending_dns`, generates `dns_target` and
   `verification_token`, and returns the DNS records to publish.
2. Publish the CNAME record for the host and the TXT record at
   `_beanola-verify.{hostname}`. The tenant console shows both values for
   pending domains.
3. Let `verify_institution_domain_task` run. A DNS match moves the domain to
   `pending_review`; mismatch or timeout leaves it in `pending_dns` and records
   `last_error`.
4. After platform review marks the row `verified`, activate it from the tenant
   console. Activation is `verified -> active`; any other activation attempt
   returns `DOMAIN_NOT_VERIFIED`.
5. Only `status=active`, `is_active=true`, and an active institution resolve to
   a white-label tenant. Unknown, pending, failed, disabled, inactive, or
   conflicting hosts resolve to the neutral Beanola context.
6. Deactivating an active domain moves it through `active -> disabled` and sets
   `is_active=false`; it must stop routing immediately.

## Official And Legacy Document Endpoints

| Category | Endpoint / module | Current status | Canonical decision |
| --- | --- | --- | --- |
| Official list | `GET /api/v1/applications/{id}/official-documents/` | Canonical backend list/status surface. | Keep and expand. |
| Official detail/generate | `GET/POST /api/v1/applications/{id}/official-documents/{document_type}/` | Canonical backend generate/download/status surface. | Keep and expand. |
| Legacy slip | `POST /api/v1/applications/{id}/application-slip/` | Legacy route still registered. | Delegate to official document generation or deprecate after callers migrate. |
| Legacy acceptance | `POST /api/v1/applications/{id}/acceptance-letter/` | Legacy route still registered. | Delegate or deprecate. |
| Legacy conditional | `POST /api/v1/applications/{id}/conditional-offer/` | Legacy route still registered. | Delegate or deprecate. |
| Legacy finance receipt | `POST /api/v1/applications/{id}/finance-receipt/` | Legacy route still registered. | Delegate or deprecate. |
| Legacy payment receipt | `POST /api/v1/applications/{id}/payment-receipt/` | Legacy route still registered. | Delegate or deprecate. |
| Email slip | `POST /api/v1/applications/{id}/email-slip/` | Used by official document service for application slip email. | Keep only if it sends backend-stored official document. |
| Frontend PDF library | `apps/admissions/src/lib/pdf/` | Still exists and is imported by dev previews and legacy hooks. | Dev-preview/non-official only. |
| Dev document hook | `apps/admissions/src/pages/dev/hooks/useDocumentGeneration.ts` | Imports `@/lib/pdf` for local preview tests only. | Keep dev-only; production official flows must not import it. |
| Dev receipt hook | `apps/admissions/src/pages/dev/hooks/usePaymentReceipt.ts` | Imports `generatePaymentReceipt` for local preview tests only. | Keep dev-only or delete after tests migrate; production receipts use official backend documents. |

### Document Caller Matrix

| Caller | Current path | Classification | Required action |
| --- | --- | --- | --- |
| `services/officialDocuments.ts` | `/applications/{id}/official-documents/*` | Canonical official backend service. | Keep as the only production official-document service. |
| `hooks/useOfficialDocument.ts` | `officialDocumentService` | Canonical student action hook. | Keep; add tests that it never imports `@/lib/pdf`. |
| `components/student/DocumentButtons.tsx` | `useOfficialDocument` + `ApplicationSlipActions` | Canonical student document surface. | Keep; continue rendering queued/generating/ready/failed states. |
| `components/student/ApplicationSlipActions.tsx` | `useOfficialDocument('application_slip')` and backend email-slip endpoint | Canonical for slip download/email; email endpoint is type-limited. | Keep; backend must ensure email-slip sends the stored official slip. |
| `components/student/DownloadReceiptButton.tsx` | `useOfficialDocument('payment_receipt')` | Canonical student receipt surface. | Keep; remove any competing receipt buttons that use local PDF hooks. |
| `hooks/useAdminOfficialDocuments.ts` | `officialDocumentService` | Canonical admin document hook. | Keep and use as the only admin generation/download path. |
| `components/admin/applications/AdminOfficialDocumentsPanel.tsx` | `useAdminOfficialDocuments` | Canonical admin panel. | Keep; ensure modal/page actions point here instead of legacy handlers. |
| `components/admin/applications/ApplicationDetailModal.tsx` | Documents tab renders `AdminOfficialDocumentsPanel`; legacy header generation buttons removed. | Canonical admin document surface. | Keep document generation/download inside the official panel. |
| `pages/admin/Applications.tsx` | Legacy modal generate handlers removed. | Canonical admin path delegates to modal official panel. | Keep legacy `applicationService.generate*` methods unused until service cleanup/deprecation. |
| `services/applications.ts` `generate*` methods | Legacy generation endpoints | Legacy service methods. | Remove after admin callers migrate, or mark deprecated and block new imports. |
| `pages/dev/hooks/useDocumentGeneration.ts` | Client `@/lib/pdf` rendering | Dev-only local renderer; no production callers found. | Keep behind dev namespace or delete after preview tests migrate. |
| `pages/dev/hooks/usePaymentReceipt.ts` | Backend receipt data + client `@/lib/pdf` rendering | Dev-only/non-official local renderer; no production callers found. | Keep behind dev namespace or delete after preview tests migrate. |
| `pages/dev/*Preview.tsx` | `@/lib/pdf` preview components | Dev-only preview. | Allowed only under `/dev`; keep out of student/admin official flows. |
| `lib/slipService.ts` | Dynamic import of `@/lib/pdf` + local storage | Legacy local slip helper. | Confirm no production official callers, then move to dev-only or delete. |

## Draft And Application Entry Points

Canonical decision: **true multi-draft**. A saved online draft is an
`Application` row with `status='draft'`. The `Application.id` is the draft id
used by the wizard, dashboard, uploads, grades, payment protection, and delete
flows. Local wizard snapshots are recovery caches only; they must be keyed by
user id plus application id when attached to an online draft, and they must not
override an explicit new/resume intent.

| Entry point | Current behavior | Canonical requirement |
| --- | --- | --- |
| `/student/application-wizard` | Wizard loader may restore local/server draft. | If drafts exist and no mode/id is supplied, show an explicit choice rather than silently resuming. |
| `/student/application-wizard?mode=new` | Target canonical new-application route. | Guarantee no local or server draft adoption; clear only unattached local recovery state. |
| `/student/application-wizard?new=true` / `?fresh=1` | Legacy new aliases. | Normalize to `mode=new` and preserve as aliases. |
| `/student/application-wizard?mode=resume&draftId={application_id}` | Target canonical resume route. | Load only the selected `Application(status='draft')` for the authenticated user. |
| `/student/applications/new` | Redirects to `/student/application-wizard?new=true`. | Preserve alias, but registry should normalize it to `mode=new`. |
| `GET /api/v1/applications/?mine=true&status=draft` | Existing list of online drafts. | Canonical multi-draft list API. |
| `POST /api/v1/applications/` with `status='draft'` | Creates online draft application. | Canonical online draft create API. |
| `GET/PATCH/DELETE /api/v1/applications/{id}/` | Existing draft detail/update/delete. | Canonical selected-draft resume/update/delete API; delete remains blocked when resolved payment activity exists. |
| `GET /api/v1/applications/draft/` | Returns latest `ApplicationDraft` row for current user. | Compatibility-only; do not use for production wizard routing. Deprecate after callers are removed. |
| `POST /api/v1/applications/draft/` | Upserts by user/application id into `ApplicationDraft`. | Compatibility-only local payload backup; must not create a second lifecycle. |
| Duplicate conflict | Some frontend persistence can adopt `existing_id`. | Must require explicit user choice: continue existing, start different program/intake, or cancel. |

Draft lifecycle rules:

1. `Application(status='draft')` is the only online draft record.
2. `ApplicationDraft` is compatibility/cache metadata only, not the canonical
   draft list or resume target.
3. A local snapshot may restore only when it matches the selected resume target,
   or when no online draft exists and the user chooses local recovery.
4. New mode never attaches to an old application id and never restores server
   or local draft data.
5. Resume mode never creates a second draft for the selected application.
6. Duplicate create conflicts never silently adopt `existing_id`; the UI must
   ask the student.
7. Payment-linked drafts cannot be deleted automatically or by bulk local clear.
8. Dashboard and wizard draft cards refresh from the canonical applications
   query after create, save, delete, or submit.

## Tenant Onboarding Panels

Current tenant admin page modules under
`apps/admissions/src/pages/admin/tenants/`:

- `SuperAdminTenantConsole.tsx`
- `TenantAdminSchoolConsole.tsx`
- `TenantOnboardingWizard.tsx`
- `TenantListPanel.tsx`
- `TenantBrandingPanel.tsx`
- `TenantDomainPanel.tsx`
- `ProfilesPanel.tsx`
- `TenantDocumentsPanel.tsx`
- `TenantProgramsPanel.tsx`
- `OfferingsPanel.tsx`
- `TemplatesPanel.tsx`
- `TenantStaffPanel.tsx`
- `TenantAccessGrantsPanel.tsx`
- `RoutingSimulatorPanel.tsx`
- `SettlementPanel.tsx`
- `TenantAuditPanel.tsx`
- `AuditPanel.tsx`
- `panelStates.tsx`
- `primitives.tsx`

## Tenant Service Methods

Current tenant service owner:
`apps/admissions/src/services/admin/tenants.ts`.

Important method groups:

- Institutions: `listInstitutions`, `createInstitution`, `updateInstitution`
- Domains: `listDomains`, `createDomain`, `updateDomain`, `activateDomain`
- Assets: `listAssets`, `createAsset`, `uploadAsset`, `updateAsset`
- Templates: `listTemplates`, `createTemplate`, `updateTemplate`
- Document profiles: `listDocumentProfiles`, `createDocumentProfile`,
  `updateDocumentProfile`, `cloneDocumentProfile`
- Required documents: `listRequiredDocuments`, `createRequiredDocument`,
  `updateRequiredDocument`
- Memberships: `listMemberships`, `createMembership`, `updateMembership`
- Access grants: `listAccessGrants`, `createAccessGrant`,
  `updateAccessGrant`
- Offerings: `listOfferings`, `updateOfferingRules`
- Settlement: `listSettlements`
- Routing: `simulateRouting`

Offering rule writes are tenant-scoped under
`/admin/institutions/{institution_id}/programs/{offering_id}/`. Public catalog
program endpoints remain for public catalog/student flows, not tenant-admin
configuration writes.

## Known Compatibility And Re-Export Layers

These are not automatically wrong, but each must eventually be removed or
tracked with an owner/removal condition:

- `backend/apps/applications/views.py` backward-compatible URL re-exports.
- `backend/apps/applications/student_views.py` re-export shim.
- `backend/apps/applications/admin_views.py` re-export shim.
- `backend/apps/applications/tasks/__init__.py` task re-export package.
- `backend/apps/applications/_view_helpers.py` legacy single-tenant resolver
  and application-number fallback branches.
- `apps/admissions/src/lib/auth/roles.ts` role helper re-export.
- `apps/admissions/src/components/auth/AuthShell.tsx` compatibility re-export.
- `apps/admissions/src/components/ui/Dialog.tsx` modal compatibility wrapper.
- `apps/admissions/src/components/ui/alert-dialog.tsx` confirm dialog
  compatibility wrapper.
- `apps/admissions/src/pages/dev/hooks/useDocumentGeneration.ts` dev-only
  frontend document generation hook.
- `apps/admissions/src/pages/dev/hooks/usePaymentReceipt.ts` dev-only
  frontend receipt generation hook.
- `apps/admissions/src/lib/pdf/` official-looking frontend PDF renderers.
- `apps/admissions/src/routes/config.tsx` legacy aliases, to be migrated under
  the typed route registry.

## Decision Records To Fill During Implementation

| Decision | Current value | Required before marking complete |
| --- | --- | --- |
| Draft lifecycle | True multi-draft via `Application(status='draft')`; `ApplicationDraft` is compatibility-only. | Implement explicit `mode=new` / `mode=resume&draftId=...` behavior and remove silent duplicate adoption. |
| Route registry | Current owner is `routes/config.tsx`; target owner is new typed registry. | Implement registry and migrate consumers. |
| Tenant readiness | Wizard exists; readiness gate is not yet canonical. | Backend readiness endpoint/command plus UI launch gate. |
| Domain lifecycle | Domain model/resolution exists. | Verify simulation, cache invalidation, audit, and fail-closed behavior end to end. |
| Legacy document endpoints | Registered and partly used. | Delegate to official documents or mark deprecated with no production callers. |

## Do Not Add New Duplicate Paths

Before adding a new route, service, hook, helper, document renderer, or tenant
configuration endpoint:

1. Check this runbook and `docs/canonical-truth-map.md`.
2. Reuse the canonical service or route if one exists.
3. If a new path is genuinely needed, register it in the canonical truth map
   and add a drift guard.
4. Do not add a second implementation because an existing one looks difficult.
   Fix or replace the canonical implementation instead.

## Route Drift Inventory

Inventory completed from task 3 of
`.kiro/specs/canonical-multi-tenant-alignment/tasks.md`.

| Path / concern | Current owner(s) | Duplicate definitions found | Planned canonical owner |
| --- | --- | --- | --- |
| Product route list | `apps/admissions/src/routes/config.tsx` | Route paths, lazy components, guards, aliases, and `requiresSuperAdmin` live here today. | New typed route registry under `apps/admissions/src/routes/`; `config.tsx` should consume it. |
| `/admin/tenants` | `routes/config.tsx`; `tenantNav.ts`; `AppLayout.tsx`; `DesktopSidebar.tsx`; `MobileBottomNav.tsx`; `SuperAdminTenantConsole.tsx`; `TenantAdminSchoolConsole.tsx`; `NotFoundPage.tsx` indirectly. | Tenant nav decision is centralized in `tenantNav.ts`, but path labels/titles are duplicated in layout/nav files. | Registry route id `admin.tenants`, with tenant nav helper consuming that id. |
| `/admin/tenants/new` | `routes/config.tsx`; `TenantOnboardingWizard.tsx` SEO; navigation calls inside tenant console/wizard. | Super-admin-only requirement lives in route config and backend, but links navigate with raw string. | Registry route id `admin.tenantOnboarding`. |
| `/admin/dashboard` and `/admin` | `routes/config.tsx`; `DashboardRedirect.tsx`; `SignInPage.tsx`; `MobileBottomNav.tsx`; `DesktopSidebar.tsx`; `AppLayout.tsx`; `BottomNavigation.tsx`; `NotFoundPage.tsx`. | Dashboard route and redirect target are repeated; `/admin` and `/admin/dashboard` both route to dashboard. | Registry ids `admin.home` and/or `admin.dashboard`, with one canonical redirect policy. |
| Admin secondary routes | `routes/config.tsx`; `MobileBottomNav.tsx`; `DesktopSidebar.tsx`; `AppLayout.tsx`; `BottomNavigation.tsx`; `SignInPage.tsx`. | `/admin/programs`, `/admin/intakes`, `/admin/users`, `/admin/audit`, `/admin/settings`, `/admin/program-fees` are repeated across nav, auth allowlist, titles, back routes, and prefetch map. | Registry route ids for each admin destination; nav, auth allowlist, page titles, and prefetch derive from registry metadata. |
| Student dashboard | `routes/config.tsx`; `DashboardRedirect.tsx`; `SignInPage.tsx`; `MobileBottomNav.tsx`; `DesktopSidebar.tsx`; `AppLayout.tsx`; `BottomNavigation.tsx`; `NotFoundPage.tsx`. | `/student/dashboard` repeated as default redirect, nav item, title, and not-found suggestion. | Registry route id `student.dashboard`. |
| Student wizard | `routes/config.tsx`; `MobileBottomNav.tsx`; `DesktopSidebar.tsx`; `AppLayout.tsx`; `BottomNavigation.tsx`; `SignInPage.tsx`. | `/student/application-wizard`, `/apply`, and `/student/applications/new` are handled in several active-match and redirect branches. | Registry route id `student.applicationWizard` with aliases and explicit `mode=new` helper. |
| Student secondary routes | `routes/config.tsx`; `MobileBottomNav.tsx`; `DesktopSidebar.tsx`; `AppLayout.tsx`; `BottomNavigation.tsx`; `SignInPage.tsx`; `NotFoundPage.tsx`. | Payment, interview, notifications, settings, communications, history, status paths are repeated across nav, auth allowlist, titles, and prefetch. | Registry route ids for each student destination. |
| Auth redirects | `SignInPage.tsx`; `DashboardRedirect.tsx`; auth/session listeners. | Admin/student redirect allowlists are local arrays in sign-in code; defaults are raw strings. | Registry-generated allowlists by guard/role. |
| Mobile bottom navigation | `MobileBottomNav.tsx`; `AppLayout.tsx` with `BottomNavigation`; `BottomNavigation.tsx` defaults. | There are two mobile-nav implementations plus default student/public items in the reusable component. | One registry-derived mobile nav model consumed by both shell paths, or one shell path after consolidation. |
| Route prefetch map | `BottomNavigation.tsx`; speculative prefetch utilities. | Route-to-import map repeated route paths separately from `routes/config.tsx`; speculative prefetch utilities currently prefetch data/API endpoints and chunk imports, not product route paths. | `BottomNavigation.tsx` route-to-import keys derive from registry ids. Keep speculative prefetch route-free unless it grows product-route decisions. |
| Page titles/back routes | `AppLayout.tsx`. | Page titles and mobile back routes repeat route paths. | Registry metadata: title, mobile header behavior, back behavior. |
| 404 suggestions | `NotFoundPage.tsx`. | Helpful links are raw strings and can drift from route aliases. | Registry helper for public/admin/student suggestions. |

Route registry implementation notes:

- Keep `/admin/tenants` shared. It must not become Super_Admin-only.
- Keep `/admin/tenants/new` Super_Admin-only.
- Keep `/beanola-admin-panel/` out of product route metadata except production
  smoke/runbook references.
- Preserve legacy aliases only as explicit alias metadata with redirect tests.
- Derive desktop nav, mobile nav, auth redirect allowlists, prefetch targets,
  page titles, and helpful links from route ids.

## Admin Capability Audit

Inventory completed from task 7 of
`.kiro/specs/canonical-multi-tenant-alignment/tasks.md`.

### Authority Sources

| Surface | Current source | Finding | Follow-up |
| --- | --- | --- | --- |
| Frontend capability set | `CapabilityContext.tsx` via `GET /api/v1/admin/capabilities/` | Backend-driven and fail-closed outside provider. `isTenantAdmin` is derived from institution capabilities, not raw role strings. | Keep all new admin UI on `can()` / `canForInstitution()`. |
| Frontend institution scope | `InstitutionScopeContext.tsx` via `GET /api/v1/admin/scope/` | Scoped admins are auto-locked to their assigned institution. Super-admin stale selections are cleared when invalid. | Add regression tests for stale selected tenant cleanup. |
| Admin route guard | `AdminRoute.tsx` | Uses `useCapabilities().isSuperAdmin` for super-admin route blocking, but still redirects with raw paths. | Replace route literals with route-registry helpers. |
| Tenant route switch | `pages/admin/Tenants.tsx` | Correctly renders super-admin console, tenant-admin school console, or no-access state. | Add render-boundary tests. |

### Tenant Console Action Matrix

| Panel / action | Super admin | Tenant admin | Current gate | Risk / gap |
| --- | --- | --- | --- | --- |
| Tenant list / create school | Yes | No | `TenantListPanel` requires `platform.tenant.create`; tenant-admin console does not render it. | Good; needs test proving tenant admin sees no create control. |
| Tenant onboarding wizard | Yes | No | Route `admin.tenantOnboarding` requires super admin and wizard checks `isSuperAdmin`. | Good; raw navigation path remains in console/wizard. |
| School profile create/update/deactivate | Yes | No | Only in `SuperAdminTenantConsole`. | Parent-gated only; acceptable if tests prove tenant-admin route never renders it. |
| Domains read | Yes | Tenant admins with `tenant.domain.read` | `TenantDomainPanel` gates query by `canRead`. | Good. |
| Domains add/deactivate | Super admin with `platform.domain.manage` | No direct mutation; request-change notice only | `TenantDomainPanel` uses `canManage` / `canRequest`. | Good; backend must enforce. |
| Programs/offering rules read | Yes | Tenant admins with `tenant.program.read` | `TenantProgramsPanel` gates read. | Good. |
| Programs/offering rules mutate | Super admin with `platform.program_assignment.manage` | Request-change notice only | `TenantProgramsPanel` composes `OfferingsPanel` only when `canManage`. | `OfferingsPanel` itself has no capability check, so it must remain parent-gated. |
| Required documents read | Yes | Tenant admins with `tenant.document.read` | `TenantDocumentsPanel` gates query by `canRead`. | Good. |
| Required documents add/deactivate | Super admin with `platform.document.manage` | No | `TenantDocumentsPanel` gates form/actions by `canManage`. | Good. |
| Branding/assets read | Yes | Tenant admins with `tenant.profile.read` | `TenantBrandingPanel` gates query by `canRead`. | Good. |
| Branding/assets mutate | Super admin with `platform.asset.manage` | No | `TenantBrandingPanel` gates upload/deactivate by `canManage`. | Good. |
| Staff read | Yes | Tenant admins with `tenant.staff.read` | `TenantStaffPanel` gates query by `canRead`. | Good. |
| Staff invite/disable | Super admin with `platform.user.manage_all`; tenant admins with `tenant.staff.invite` / `tenant.staff.disable` | Yes, scoped | `TenantStaffPanel` gates invite/disable separately. | Needs backend role-ceiling test. |
| Access grants | Super admin with `platform.access_grant.manage` | No | `TenantAccessGrantsPanel` requires super-admin platform capability. | Good; not rendered in tenant-admin console. |
| Tenant audit | Super admin with `platform.audit.read_all`; tenant admins with `tenant.audit.read` | Yes, scoped | `TenantAuditPanel` gates read. | Confirm backend filters target institution. |
| Routing simulator | Super admin only | No | Only rendered by `SuperAdminTenantConsole`. | Parent-gated only; add test if exposed later. |
| Templates and document profiles | Super admin only | No | Only rendered by `SuperAdminTenantConsole`. | Parent-gated only; add explicit capability gates before exposing to tenant admins. |
| Settlement | Super admin only | No | Only rendered by `SuperAdminTenantConsole`. | Parent-gated only; add capability gate before wider exposure. |

### Audit Conclusions

- The major historical bug, tenant admins seeing the global tenant console, has
  been addressed in the frontend structure: tenant admins now receive a scoped
  school console and no "new institution" control.
- The security boundary still has to be backend tests. Frontend capability gates
  are usability only, especially for parent-gated panels such as offerings,
  templates, profiles, routing simulator, and settlement.
- Any panel moved from the super-admin console into the tenant-admin console
  must add local `canForInstitution()` checks before the move.
- Route and navigation strings in admin authority surfaces should be replaced by
  route-registry helpers before task 8 is considered complete.

## Backend Scope Audit

Inventory completed from task 9 of
`.kiro/specs/canonical-multi-tenant-alignment/tasks.md`.

| Surface | Files inspected | Current scope behavior | Issues / follow-up |
| --- | --- | --- | --- |
| Tenant admin institutions | `backend/apps/catalog/admin_views.py` | Tenant list/detail reads filter to `_scope_institution_ids`; no-scope users get empty querysets; create/update are super-admin-only via `_write_allowed`. | Uses local helper rather than `TenantScopedCapabilityMixin`, but behavior is explicit and masked enough for list/detail. |
| Tenant child resources | `backend/apps/catalog/admin_views.py` | Domains, assets, templates, profiles, required documents, and programs scope by `institution_id`; no-scope non-super-admins get none. Writes are super-admin-only except staff membership writes. | Parent-child scope is duplicated across base classes; keep until a shared mixin can replace it safely. |
| Tenant staff memberships | `backend/apps/catalog/admin_views.py` | Lists are institution-scoped. Tenant-admin invites require `AdminCapabilityService.can_invite_staff`, prevent self-mutation, and role-ceiling/cross-tenant denial. | Needs explicit regression tests for cross-tenant invite, self-mutation, and role escalation. |
| Tenant access grants | `backend/apps/catalog/admin_views.py` | Grants are platform-managed and exposed through super-admin capability. | Needs regression test that tenant admins cannot create or deactivate grants. |
| Catalog public/admin views | `backend/apps/catalog/views.py`; `backend/apps/catalog/permissions.py`; `backend/apps/catalog/services.py` | Program/institution detail writes use scope-before-lookup and capability checks; institution create requires `platform.tenant.create`; public reads are filtered by active tenant context. | `catalog/institutions` remains a legacy/admin overlap surface; keep canonical admin tenant writes preferred. |
| Admin application list/review | `backend/apps/applications/admin_review_views.py` | Lists use `AccessScopeService.filter_applications` for non-super-admins. Review lookup scopes before object retrieval. | Fixed during this pass: the transaction row-lock path now also uses the scoped queryset before status mutation. |
| Document storage | `backend/apps/documents/document_storage_views.py` | Admin/student document access uses owner/admin checks and `AccessScopeService`; out-of-scope document reads are masked as canonical not-found in shared loader paths. | Some role checks still use raw `role in ("admin", "super_admin")`; audit each write endpoint in task 10. |
| Payments and settlements | `backend/apps/documents/payment_query_views.py` | Payment list and settlement summaries use `AccessScopeService.filter_payments` for non-super-admin admins; no-scope staff get empty settlement output. | Good current shape; add tests for `application_id` filter not widening scope. |
| Analytics funnel | `backend/apps/analytics/views.py` | Funnel cache key is namespaced by resolved access scope and `AdmissionsAnalyticsService` receives the caller. | Source/outreach/digest are sample-data scaffolds under `IsAdmin`; keep out of production dashboards until scoped real data exists. |

### Backend Fixes Applied

- `ApplicationReviewView.post` now scopes the `select_for_update()` queryset
  through `AccessScopeService.filter_applications()` before locking and
  mutating an application for non-super-admin admins. This closes the gap where
  the initial lookup was scoped but the transaction reload was global.

## Compatibility Shim Inventory

Inventory completed from task 29 of
`.kiro/specs/canonical-multi-tenant-alignment/tasks.md`.

### Current Policy

- Runtime URL routing must import canonical split modules directly, not
  umbrella re-export shims.
- Re-export shims may remain only for external/test compatibility and must
  declare `COMPATIBILITY_OWNER` and `REMOVAL_CONDITION`.
- The regression guard is
  `backend/tests/unit/test_canonical_import_boundaries.py`.

### Remaining Shims

| Shim | Canonical modules | Current reason to keep | Removal condition |
| --- | --- | --- | --- |
| `backend/apps/applications/views.py` | `student_*_views.py`, `admin_*_views.py`, `interview_views.py`, `document_views.py`, `public_views.py`, `_view_helpers.py` | Many legacy unit/property tests still import or patch `apps.applications.views.*`; external imports may also exist. | Remove after tests and external callers patch/import the canonical split modules. Runtime URLs already bypass this shim. |
| `backend/apps/documents/views.py` | `document_storage_views.py`, `mobile_money_views.py`, `payment_*_views.py`, `lenco_webhook_views.py`, `throttles.py` | Legacy tests still import or patch `apps.documents.views.*`; some helper imports use `_get_document_storage_key` / `_ip_allowed`. | Remove after tests and external callers patch/import canonical modules. Runtime URLs already bypass this shim. |
| `backend/apps/accounts/admin_views.py` | `admin_user_views.py`, `admin_settings_views.py`, `admin_audit_views.py`, `admin_serializers.py` | Tests still patch old admin symbols, including `_is_super_admin`; serializers/helpers are still re-exported for compatibility. | Remove after tests patch/import canonical modules and no production route imports the shim. |

### Cleanup Sequence

1. Move tests that only import view classes to canonical modules first.
2. Move patch paths that target model managers/helpers to the module where the
   symbol is actually used.
3. Keep one focused compatibility test per shim until all external callers are
   migrated.
4. Delete a shim only after `rg "apps.<app>.views"` shows no active production
   or test dependency except the deletion test being removed in the same change.
