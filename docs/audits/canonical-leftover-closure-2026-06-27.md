# Canonical Alignment Leftover Closure - 2026-06-27

This note closes the earlier unchecked items in the canonical multi-tenant task list after the final release gate exposed partial checklist drift.

## Authorization

- Tenant-sensitive write authority is centralized through `AdminCapabilityService` for tenant configuration, program/intake/institution writes, membership/grant operations, document profiles, domains, and tenant assets.
- Tenant-sensitive read scope is centralized through `AccessScopeService` for applications, payments, documents, analytics, notifications, dashboard scope, and audit views.
- Raw role checks remain where they are not the sole tenant authority: student ownership checks, super-admin short-circuit helpers, serializer presentation, role labels in audit metadata, and compatibility tests.
- Evidence:
  - `backend/tests/property/test_capability_gated_writes.py`
  - `backend/tests/unit/test_tenant_config_authorization_boundaries.py`
  - `backend/tests/property/test_cross_tenant_invisibility.py`
  - `backend/tests/property/test_domain_resolution_fail_closed.py`

## Student Draft Lifecycle

- Explicit new mode: `/student/application-wizard?mode=new`.
- Explicit server resume mode: `/student/application-wizard?mode=resume&draftId=<id>`.
- Explicit local resume mode: `/student/application-wizard?localDraft=true`, now parsed as `mode: "local"` instead of falling through to automatic server-draft choice.
- Dashboard refreshes after draft mutation through:
  - `draftCleared`
  - `applicationCreated`
  - `applicationUpdated`
  - `useDraftRevision()`
  - React Query application cache invalidation/removal
- Back-navigation risk is bounded by replace-navigation when abandoning draft choice for a new application.
- Evidence:
  - `apps/admissions/tests/unit/wizardDraftIntent.test.ts`
  - `apps/admissions/tests/unit/applicationWizardUxGuard.test.ts`
  - `apps/admissions/tests/unit/student-dashboard-load-path.test.ts`
  - `apps/admissions/tests/unit/studentNextActionRoutes.test.tsx`

## Backend Draft API

- `GET /api/v1/applications/drafts/` lists canonical draft applications.
- `POST /api/v1/applications/drafts/` now delegates to canonical application creation, preserving tenant-domain binding, offering assignment, duplicate checks, intake enforcement, and fee resolution.
- `GET/PATCH/DELETE /api/v1/applications/drafts/{id}/` operate on owned draft applications only.
- `POST /api/v1/applications/draft/` remains a deprecated wizard-snapshot compatibility endpoint with size and depth caps.
- Evidence:
  - `backend/tests/unit/test_application_student_flow_views.py::TestApplicationDraftListView`
  - `backend/tests/unit/test_application_student_flow_views.py::TestApplicationDraftView`
  - `backend/tests/unit/test_launch_verification_spectacular.py::LaunchVerificationSpectacularTests::test_schema_generation_emits_zero_warnings`

## Compatibility/Re-Export Drift

- Remaining backend re-export modules are bounded compatibility layers, not active implementation owners:
  - `backend/apps/applications/views.py`
  - `backend/apps/applications/student_views.py`
  - `backend/apps/applications/tasks/__init__.py`
  - admin view aliases used by existing patch-based tests
- They still have active test or compatibility callers, so deleting them now would be a breaking change rather than cleanup.
- Drift is controlled by import-boundary and dead-code tests, and architecture docs identify canonical module owners.
- Evidence:
  - `backend/tests/unit/test_canonical_import_boundaries.py`
  - `backend/tests/property/test_production_readiness_views.py`
  - `apps/admissions/tests/property/consolidation-dead-files.test.ts`

## Student Dashboard/Wizard UX

- Mobile and narrow viewport guards are covered by route overflow and wizard UX guard tests.
- Draft cards distinguish start-new from continue/resume.
- Draft delete is confirmed and payment-linked drafts are blocked with a specific message.
- Autosave state and wizard mode state are visible without layout jumps.
- Evidence:
  - `apps/admissions/tests/unit/applicationWizardUxGuard.test.ts`
  - `apps/admissions/tests/unit/routeMobileOverflowGuard.test.tsx`
  - `apps/admissions/tests/ui/application-wizard-accessibility.test.tsx`

## Remaining Intentional Risk

- Compatibility shims still exist because callers still exist. They should only be removed in a future breaking cleanup once all tests and external integrations stop importing the old paths.
- Local verification proves the code path and tests. It does not prove EC2 deployment/database state.
