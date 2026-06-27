---
inclusion: always
---

# Enterprise Multi-Tenancy (Beanola)

**Beanola Technologies owns and operates the Platform. MIHAS, KATC, and any
future university or college are tenants — example `Institution` records, never
the platform identity or platform owner.** This file is the authoritative
steering reference for the tenant authority model. Spec of record:
`.kiro/specs/enterprise-tenant-authority/`.

The single non-negotiable principle:

> **Backend permissions are the source of truth, and frontend hiding is never
> the security boundary.** Every frontend capability check is a usability
> control layered on top of mandatory backend enforcement.

## Role Model

The Platform recognizes **exactly four** authority roles, identified by role
strings. Any actor whose role string is not one of these four resolves to a
capability set containing **zero** capabilities.

| Role string | Authority | Scope source |
|-------------|-----------|--------------|
| `super_admin` | **Super_Admin** — Beanola platform operator, platform-wide authority | The role string alone. Never derived from a membership or grant. |
| `admin` | **Tenant_Admin** — scoped school operator | **Only** active (`is_active`, non-expired) `UserInstitutionMembership` + `AccessGrant` records. The generic `admin` role string alone grants **zero** authority and **zero** tenant data. |
| `reviewer` | **Reviewer** — scoped application reviewer | Active memberships/grants for assigned Institutions. |
| `student` | **Student** — applicant | Own application data only. |

Rules:

- Super_Admin authority comes **only** from `role == "super_admin"`. It is never
  derived from any membership or grant.
- Tenant_Admin authority is derived **only** from active, non-expired memberships
  and grants — never from the bare `admin` role string.
- An `admin` with no active membership/grant has an **empty** capability set and
  sees **zero** tenant data.
- Every backend authorization decision evaluates **capabilities** resolved
  through `AdminCapabilityService`, never a raw role-string comparison in
  endpoint code.

## Capability Model

Capabilities — not role strings — drive frontend and backend authorization.
There are **17 `platform.*`** capabilities (held by Super_Admins) and **17
`tenant.*`** capabilities (derived per institution for non-super-admins). The
authoritative catalogue lives in
`backend/apps/catalog/services.py:AdminCapabilityService` (`PLATFORM_CAPABILITIES`
and `TENANT_CAPABILITIES`) and is registered in `docs/canonical-truth-map.md`.

- **Platform (`platform.*`)**: tenant read_all/create/update/deactivate,
  domain.manage, asset.manage, template.manage, document.manage,
  canonical_program.manage, program_assignment.manage, intake.manage,
  user.create_global, user.manage_all, access_grant.manage, audit.read_all,
  routing.simulate_all, settings.manage.
- **Tenant (`tenant.*`)**: profile read/request_change, application
  read/review/export, document read/verify, payment read/verify, staff
  read/invite/disable, audit.read, program read/request_change, domain
  read/request_change.
- **Read-by-default, mutate-only-when-granted**: a non-super-admin gets the
  tenant read bundle for institutions in scope; mutation capabilities are added
  only when the membership/grant `permissions` explicitly grant them.

`CapabilitySet` is the frozen result type (`role`, `is_super_admin`,
`all_access`, `platform_capabilities`, `institution_capabilities`).

## Centralized Authorization Service

All authority resolves through `AdminCapabilityService`
(`backend/apps/catalog/services.py`). Do not hand-roll role checks in endpoints.

| Method | Purpose |
|--------|---------|
| `get_capabilities(user)` | Full `CapabilitySet` for the actor. |
| `get_institution_capabilities(user, institution)` | Per-institution `tenant.*` set. |
| `require_capability(user, capability)` | Enforce a `platform.*` capability (raises `PermissionDenied`). |
| `require_institution_capability(user, institution, capability)` | Enforce a per-institution `tenant.*` capability. |
| `visible_institution_queryset(user)` | Scope a queryset to in-scope institutions **before** lookup. |
| `can_manage_institution` / `can_manage_program` / `can_manage_domain` / `can_invite_staff` | Object-level authority predicates. |

`CapabilityResolutionError` **fails closed**: an unresolvable capability set
means deny the action, expose zero capabilities, return no tenant data, and
return an authorization error.

DRF enforcement primitives live in `backend/apps/catalog/permissions.py`:
`HasPlatformCapability` (delegates to `require_capability`, emits audit on
denial, non-revealing failure) and `TenantScopedCapabilityMixin.get_scoped_object()`
(scopes through `visible_institution_queryset` **before** `.get()`).

## Tenant Isolation Invariants

A Tenant_Admin for one school must **never** observe or infer another tenant's
data through **any** surface.

- A Tenant_Admin sees only Institutions assigned through active memberships/grants.
- Isolation holds across **every** surface: list, detail, search, exports,
  dashboards, documents, payments, audit logs, applications, users, routing
  simulation, and analytics.
- **Scope before lookup.** Always scope a tenant-sensitive queryset through
  `visible_institution_queryset(user)` *before* fetching an object, so an
  out-of-scope identifier cannot be confirmed to exist.
- An out-of-scope object request returns **404** (or a non-revealing **403**)
  that discloses no tenant identifier, name, count, or attribute.
- A mutation carrying another tenant's institution identifier is rejected with
  **no mutation** and no disclosure of the target tenant's data.

## Domain Resolution Lifecycle

`InstitutionDomain` carries `hostname`, `institution`, `is_primary`,
`is_active`, `status`, `verification_token`, `dns_target`, `verified_at`,
`last_checked_at`, `last_error`, `created_by`, `approved_by`.

`status` is one of `pending_dns`, `pending_review`, `verified`, `active`,
`disabled`, `failed`. The `DomainStatusMachine`
(`backend/apps/catalog/services.py`) permits **only** these transitions:

```
pending_dns → pending_review     pending_dns → failed
pending_review → verified        verified → active
active → disabled                failed → pending_dns
disabled → active
```

- **Create** (Super_Admin only): generate a `verification_token` ≥ 32 chars and a
  `dns_target`, set `status=pending_dns`, present the DNS record.
- **Verify** (`verify_institution_domain_task`, 10s DNS timeout): match →
  `pending_dns → pending_review`, set `verified_at`/`last_checked_at`;
  mismatch/timeout → stay `pending_dns`, set descriptive `last_error` (≤ 1000
  chars). Never propagate exceptions.
- **Activate** (Super_Admin only): `verified → active`, record `approved_by`.
  Activating a non-`verified` domain is rejected (`DOMAIN_NOT_VERIFIED`).
- **Disable** (Super_Admin only): active domains move `active → disabled` and
  set `is_active=false`; disabled domains do not resolve tenant context.
- **Duplicate active hostname** for another tenant → `HOSTNAME_CONFLICT` (409).

**Fail-closed `Domain_Resolver`** (`InstitutionContextService.resolve`): resolve
a tenant **only** when exactly one `InstitutionDomain` with `status=active`,
`is_active=true`, and an active institution matches the host. Unknown,
multi-match, or non-active-status hosts resolve to the **Neutral_Beanola_Context**
(neutral Beanola branding only, never MIHAS/KATC), and the event is logged for
operations review. Domain context endpoint: `GET /api/v1/catalog/context/`.

## Program Offering Model

| Concept | Model | Authority |
|---------|-------|-----------|
| Canonical_Program | `CanonicalProgram` (global Beanola definition) | Assigned to tenants **only** by a Super_Admin (`platform.program_assignment.manage`). |
| Institution_Program_Offering | `Program` (a tenant's offering of a canonical program) | A Tenant_Admin may only **request** offering changes (`tenant.program.request_change`); never alter canonical programs. |
| Offering_Requirement | Tenant-specific documents/payment/eligibility/templates | Resolved most-specific-first; never another tenant's profile. |
| Intake_Offering | `ProgramIntake` / intake participation | Platform-managed (`platform.intake.manage`). |

- The shared Beanola portal lists **all** active offerings grouped by canonical
  program; a resolved tenant portal lists **only** that tenant's offerings.

## Student Application Routing

- An application created from a resolved tenant context is attached to that
  tenant's `Institution_Program_Offering`.
- If a create request supplies an `institution_id` different from the resolved
  context, reject with `INSTITUTION_OVERRIDE_NOT_PERMITTED` and retain the
  resolved binding.

## Student Draft Lifecycle

The canonical online draft model is **true multi-draft**:
`Application(status='draft')` is the draft record. The `Application.id` is the
draft id used for resume, uploads, grades, payment protection, and deletion.
`ApplicationDraft` / `/api/v1/applications/draft/` is compatibility/cache
metadata only and must not become a parallel lifecycle.

- Start-new intent is explicit: `/student/application-wizard?mode=new`
  (legacy aliases `?new=true` and `?fresh=1` normalize to this). New mode never
  restores local or server draft data and never attaches to an old application id.
- Resume intent is explicit:
  `/student/application-wizard?mode=resume&draftId=<application_id>`. Resume
  mode loads only that authenticated user's selected `Application(status='draft')`.
- Direct wizard visits with existing drafts must show a choice or follow a
  documented deterministic contract; they must not silently pick an old draft by
  timestamp.
- Duplicate create conflicts must not silently adopt `existing_id`; the student
  chooses to continue the existing draft, pick a different program/intake, or
  cancel.
- Local wizard snapshots are recovery caches keyed by user id plus application
  id once attached to an online draft. They are never authoritative over the
  selected online draft.
- Payment-linked drafts cannot be deleted by cleanup or bulk local-clear flows.

## Tenant Documents, Templates & Branding

- Document requirements resolve by tenant + program + intake context.
- Official PDFs use the backend official-document pipeline and the tenant's
  logo/signature/template/profile when configured. Frontend `@/lib/pdf` renderers
  are legacy/dev-preview only for official-record purposes.
- **Neutral fallback only.** A missing tenant branding asset falls back to the
  neutral Beanola asset (`InstitutionContextService.BEANOLA_BRAND`) — **never**
  to MIHAS or KATC assets.

## Admin Navigation Rules

- Product admin routes live under `/admin/*`. The tenant console is
  `/admin/tenants`; the Super_Admin onboarding wizard is `/admin/tenants/new`.
  The Django operational admin is separate at `/beanola-admin-panel/` and must
  not be treated as a product tenant-management route.
- Navigation and route guards are driven by `can(capability)` (frontend
  `CapabilityContext`), with **identical rules on desktop and mobile**.
- Super_Admins see the platform **"Tenants"** management item and the "New
  institution" control.
- A Tenant_Admin holding `tenant.profile.read` sees a school-specific **"My
  School"** item instead of platform tenant management — and never sees "New
  institution" or global access-grant tooling unless explicitly granted.
- Frontend guards are usability only; a tenant-admin deep-linking a
  super-admin-only route is blocked by the guard **and** denied by the backend.

## Audit Requirements

Every tenant-sensitive write and every failed authorization on a sensitive admin
endpoint emits an `Audit_Event` via `TenantAuditService`
(`backend/apps/catalog/tenant_audit_service.py`) over `audit_logs`.

- Covered writes: tenant create/update/deactivate; domain
  create/verify/activate/disable; asset/template/document-config/program-assignment
  changes; user-invite/membership/grant changes; review/document-verify/payment-verify
  decisions.
- Failed authorization emits `auth.denied` / `scope.denied`.
- Required fields: `actor_user_id`, `actor_role`, `actor_institution_scope`,
  `target_institution_id`, `action`, `object_type`, `object_id`, `request_id`,
  `ip_address`, `user_agent`, `status`, `reason`, `created_at`.
- IP / user-agent are SHA-256 redacted; never write raw PII. Audit-write
  exceptions are swallowed (never break the request path).
- A Tenant_Admin with `tenant.audit.read` reads audit events **only** for their
  own Institution (scoped by `changes.institution_id`).

## Data-Leakage Prevention Rules

- Scope before lookup, everywhere.
- Out-of-scope → 404 / non-revealing 403, never a count, name, or attribute.
- Fail closed on domain resolution and on capability-resolution errors.
- Neutral Beanola branding only on the shared/neutral context — never a legacy
  school's identity.
- Frontend renders a clear no-access state and **no** tenant data on backend 403
  or no-scope.

## No-Legacy-Hardcoding Rule

- Do **not** hardcode MIHAS/KATC as "the platform", as a default tenant, or as a
  branding fallback. They are example tenants only.
- Do **not** reintroduce legacy catalog write bypasses. The institution,
  program, and intake write paths in `backend/apps/catalog/views.py` are
  **capability-gated** (see `tech.md` → "Enterprise Tenant Authority"). Never add
  an endpoint that mutates tenant data without resolving the required capability
  through `AdminCapabilityService` first.
- Canonical IDs are the sole authority for routing/scoping/tagging; the legacy
  `applications.institution/program/intake` strings are display snapshots only
  (see `docs/canonical-truth-map.md` → Multi-Tenant).
