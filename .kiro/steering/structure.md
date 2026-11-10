---
inclusion: always
---

# Project Structure And Code Organization

## Top-Level Layout

| Path | Purpose | Guidance |
|------|---------|----------|
| `apps/admissions/` | Admissions React app | Active frontend target |
| `apps/jobs-ops/` | AI job operations dashboard | Active frontend target; its backend routes are off unless `ENABLE_JOBS_OPS_ROUTES` is on (D1) |
| `apps/website/` | Future public website | Placeholder unless task says otherwise |
| `apps/student-portal/` | Future student portal | Placeholder unless task says otherwise |
| `backend/` | Django 5 + DRF API | Primary backend modification target |
| `shared/` | Shared package scaffold | Use only for code intentionally shared across apps |
| `docs/` | Project documentation | Modify when task requires documentation or handoff updates |
| `.kiro/` | Specs, steering, and Kiro metadata | Keep steering aligned with the real repo state |

## Canonical Truth Map

The master index of canonical sources of truth lives at `docs/canonical-truth-map.md`. It names the single authoritative location for every domain concept (application statuses, payment states, role hierarchies, error codes, etc.) and lists every consumer that mirrors or depends on it.

**Rule:** Any new domain concept added to the platform must register in the canonical truth map before merging. If the concept has a frontend mirror, a drift-guard test is required.

## Enterprise Tenant Authority Layout

Where the Beanola multi-tenant authority code lives. Model and rules:
`.kiro/steering/enterprise-tenancy.md`. Spec of record:
`.kiro/specs/_archived/enterprise-tenant-authority/`.

| Concern | Location |
|---------|----------|
| Admin capability logic + catalogue | `backend/apps/catalog/services.py` — `AdminCapabilityService` (`PLATFORM_CAPABILITIES`, `TENANT_CAPABILITIES`, `CapabilitySet`, `CapabilityResolutionError`), `DomainStatusMachine`, `InstitutionContextService.resolve` |
| Tenant services / audit | `backend/apps/catalog/tenant_audit_service.py` (`TenantAuditService`); domain verification `backend/apps/catalog/tasks.py` (`verify_institution_domain_task`) |
| DRF permission primitives | `backend/apps/catalog/permissions.py` — `HasPlatformCapability`, `TenantScopedCapabilityMixin` |
| Capability + scope endpoints | `backend/apps/accounts/admin_user_views.py` — `GET /api/v1/admin/capabilities/`, extended `GET /api/v1/admin/scope/` |
| Admin tenant API routing | `backend/apps/catalog/admin_urls.py` (mounted at `/api/v1/admin/`); views in `backend/apps/catalog/admin_views.py` |
| Capability-gated legacy catalog writes | `backend/apps/catalog/views.py` (institution/program/intake write methods) |
| Domain context endpoint | `backend/apps/catalog/views.py` — `CatalogContextView` → `GET /api/v1/catalog/context/` |
| Frontend capability hooks | `apps/admissions/src/contexts/CapabilityContext.tsx` (`useCapabilities`), `apps/admissions/src/services/admin/capabilities.ts` (`adminCapabilityService`) |
| Capability-driven navigation | `apps/admissions/src/components/navigation/tenantNav.ts` (`resolveTenantNavItem`, `useTenantNavItem`); consumed by `DesktopSidebar` and `AppLayout`, which owns the mobile surface by injecting capability-filtered items into `components/ui/BottomNavigation.tsx`. (Task 12.4 removed a third consumer, `MobileBottomNav.tsx`: it had zero importers and was never rendered, so it was a second copy of the mobile bar that no user could reach.) The student `Application Status` entry (`student.status`) is `desktop: true` (SJR task 3.18, R5-c), so the documents card is one activation from the dashboard on desktop as on mobile. |
| Super-admin route guard | `apps/admissions/src/components/AdminRoute.tsx` (`RequireSuperAdmin`); route config `apps/admissions/src/routes/config.tsx` |
| Tenant console + panels | `apps/admissions/src/pages/admin/Tenants.tsx` (capability switcher) → `apps/admissions/src/pages/admin/tenants/` (`SuperAdminTenantConsole`, `TenantAdminSchoolConsole`, panels) |
| Tenant onboarding wizard | `apps/admissions/src/pages/admin/tenants/TenantOnboardingWizard.tsx` (super-admin-only stepper) |
| Permission matrix / canonical routes | `docs/canonical-truth-map.md` → "Enterprise Tenant Authority (Capabilities & Routes)" |

## Spec Completion Markers

Each spec directory under `.kiro/specs/` has a `.config.kiro` JSON file. When a spec's work is fully completed (all tasks done), add `"status": "completed"` to its `.config.kiro` file. This makes the status of past work immediately visible without reading every task file.

- Completed specs: `{"specId": "...", "workflowType": "...", "specType": "...", "status": "completed"}`
- In-progress specs: no `status` field (or omit it until done)
- New specs should follow this convention when all tasks are finished.

## Monorepo Rules

- Do not assume a root-level `src/` directory exists.
- Do not assume `django_api/`, `api-src/`, or `api/` are real runtime directories in this repo.
- Pick the package first, then work inside that package's conventions.
- Prefer app-local code over premature `shared/` extraction.

## Admissions Frontend Structure

### Important Paths

| Path | Purpose |
|------|---------|
| `apps/admissions/src/components/` | UI and feature components |
| `apps/admissions/src/pages/` | Route-level screens |
| `apps/admissions/src/hooks/` | React hooks |
| `apps/admissions/src/services/` | API-facing and domain services |
| `apps/admissions/src/lib/` | Canonical frontend helpers and infrastructure |
| `apps/admissions/src/lib/api/` | API-specific helpers still used by some flows |
| `apps/admissions/src/lib/speculativePrefetch.ts` | Instagram-style predictive data loading (login, dashboard, wizard) |
| `apps/admissions/src/lib/routePreload.ts` | Route chunk preloading (auth, student, admin workspaces) |
| `apps/admissions/tests/` | Unit, integration, and property tests |

### Admissions High-Risk Flow Paths

| Path | Purpose |
|------|---------|
| `apps/admissions/src/pages/student/applicationWizard/` | Core student application and payment flow |
| `apps/admissions/src/pages/student/Dashboard.tsx` | Student overview and recovery entry point |
| `apps/admissions/src/pages/student/Payment.tsx` | Post-submission payment ownership: deferred/failed/expired/pending recovery plus history (task 8.3, R12.3) |
| `apps/admissions/src/components/student/payment/PaymentApplicationCard.tsx` | One submitted application's payment state, its single recovery action, and its ledger history |
| `apps/admissions/src/pages/student/Interview.tsx` | Student interview schedule and join actions |
| `apps/admissions/src/pages/student/ApplicationStatus.tsx` | Student status tracking and next actions |
| `apps/admissions/src/pages/student/DocumentOpen.tsx` | The one opener for every student View/Open control (`/student/documents/open`); signs at click time and only reads (SJR task 3.17, R5-a) |
| `apps/admissions/src/pages/student/Settings.tsx` | Student profile/settings form with dirty-state risk |
| `backend/apps/applications/views.py` | Legacy re-exports for URL compatibility (imports from split modules) |
| `backend/apps/applications/student_views.py` | Student-facing endpoints: submit, withdraw, email-slip, enrollment, amendments |
| `backend/apps/applications/admin_views.py` | Admin endpoints: review, assign, bulk status, fee waiver, conditions |
| `backend/apps/applications/public_views.py` | Unauthenticated endpoints: track application |
| `backend/apps/applications/document_views.py` | Document list and detail endpoints per application |
| `backend/apps/applications/interview_views.py` | Interview scheduling and list endpoints |
| `backend/apps/applications/history_views.py` | Application history/timeline endpoints |
| `backend/apps/applications/_view_helpers.py` | Shared helpers: permission checks, queryset builders |
| `backend/apps/applications/services.py` | Submission and transition enforcement |
| `backend/apps/documents/payment_service.py` | Lenco payment lifecycle and state transitions |

### Placement Guidance

| Adding | Place It In | Notes |
|--------|-------------|-------|
| Page or route screen | `apps/admissions/src/pages/` | Register with the existing routing setup |
| Reusable component | `apps/admissions/src/components/{domain}/` | Follow existing domain organization |
| App-specific service | `apps/admissions/src/services/` | Prefer `apiClient` over ad hoc fetch logic |
| Shared frontend helper | `apps/admissions/src/lib/` | Prefer this over `src/utils/` for new code |
| Tests | `apps/admissions/tests/` | Keep coverage close to changed behavior |

## Jobs Ops Frontend Structure

### Important Paths

| Path | Purpose |
|------|---------|
| `apps/jobs-ops/src/app/` | App shell, providers, router, and `FeatureGate` / `JobsOpsNotEnabled` (the flag-off state, task 12.2) |
| `apps/jobs-ops/src/app/layout/` | Shell layout and navigation |
| `apps/jobs-ops/src/components/ui/` | Shared UI primitives |
| `apps/jobs-ops/src/features/` | Route-level feature slices |
| `apps/jobs-ops/src/lib/` | Formatting, env, and helpers |
| `apps/jobs-ops/src/services/api/` | Backend-facing API services |
| `apps/jobs-ops/src/stores/` | Zustand stores |

### Feature Areas

| Path | Purpose |
|------|---------|
| `apps/jobs-ops/src/features/overview/` | Command-center dashboard |
| `apps/jobs-ops/src/features/jobs/` | Jobs inbox and job detail |
| `apps/jobs-ops/src/features/job-applications/` | Pursuit queue |
| `apps/jobs-ops/src/features/automation/` | Rules and runs |
| `apps/jobs-ops/src/features/outreach/` | CRM and campaigns |
| `apps/jobs-ops/src/features/email/` | Threads and reply intelligence |
| `apps/jobs-ops/src/features/documents/` | Resume lab |
| `apps/jobs-ops/src/features/integrations/` | Provider/configuration view |
| `apps/jobs-ops/src/features/sources/` | Discovery source health |
| `apps/jobs-ops/src/features/analytics/` | Reports and digest views |
| `apps/jobs-ops/src/features/review/` | Human-in-the-loop workbench |
| `apps/jobs-ops/src/features/audit/` | Operational timeline |

### Jobs Ops Placement Guidance

| Adding | Place It In | Notes |
|--------|-------------|-------|
| New operator page | Matching folder in `apps/jobs-ops/src/features/` | Keep pages domain-scoped |
| Shared dashboard UI primitive | `apps/jobs-ops/src/components/ui/` | Reuse instead of page-local duplication |
| Backend service mapping | `apps/jobs-ops/src/services/api/` | Keep response mapping close to API surface |
| App shell behavior | `apps/jobs-ops/src/app/` | Router, providers, layout only |

## Backend Structure

### Important Paths

| Path | Purpose |
|------|---------|
| `backend/apps/accounts/` | Auth, sessions, admin user management |
| `backend/apps/applications/` | Admissions application domain |
| `backend/apps/catalog/` | Programs, intakes, subjects, institutions, intake automation |
| `backend/apps/documents/` | Documents, OCR, payment-related endpoints |
| `backend/apps/common/` | Shared middleware, renderers, health, notifications, error monitoring, shared jobs-ops seed data |
| `backend/apps/jobs/` | Jobs and job-application APIs |
| `backend/apps/outreach/` | Contacts, campaigns, messaging |
| `backend/apps/automation/` | Rules and runs |
| `backend/apps/integrations/` | Telegram, OpenAI, email integration views |
| `backend/apps/analytics/` | Analytics and report endpoints |
| `backend/config/` | Django settings and URL routing |
| `backend/tests/unit/` | Unit and regression tests |
| `backend/tests/property/` | Hypothesis property tests |

### Backend Placement Guidance

| Adding | Place It In | Notes |
|--------|-------------|-------|
| Jobs-ops API view or serializer | Matching domain app under `backend/apps/` | Keep domains explicit |
| Shared jobs-ops seeded state | `backend/apps/common/jobs_ops_seed.py` | Keep sample state centralized |
| Shared middleware or renderer | `backend/apps/common/` | Reuse before creating new cross-cutting modules |
| New route | App `urls.py` plus `backend/config/urls.py` include if needed | Backend routes are resource-style under `/api/v1/` |
| Tests | `backend/tests/{unit,property,contract}/` | Match the behavior and risk level |

### Documentation Files

| Path | Purpose |
|------|---------|
| `docs/schema-ownership.md` | Table-level ownership map for the Neon database |
| `docs/redis-dependency-tiers.md` | Redis key usage, TTLs, and failure impact tiers |
| `shared/PLATFORM_CONTRACT.md` | Cross-app API and data contract |
| `docs/runbooks/secrets-rotation.md` | Production secret rotation runbook |
| `docs/runbooks/redis-recovery.md` | Redis failure recovery procedures |
| `docs/runbooks/scaling-playbook.md` | Scaling playbook: the self-hosted EC2 stack (Koyeb and Vercel sections are marked historical) |
| `docs/runbooks/release-and-rollback.md` | Release process and rollback procedures |
| `docs/runbooks/post-deploy-smoke-check.md` | Post-deployment verification checklist |
| `docs/runbooks/database-backup-restore.md` | Neon database backup and restore |
| `docs/runbooks/local-parity.md` | Local dev environment parity with production |
| `docs/runbooks/redis-incident-response.md` | Redis incident response playbook |
| `docs/runbooks/multi-tenant-operations.md` | Tenant onboarding, domains, documents, draft support, migrations, backup/restore, rollback, disk cleanup, and service health |
| `docs/security-api-audit-2026-04.md` | April 2026 security and API audit report |
| `docs/full-audit-report-2026-04-22.md` | Full codebase audit report (April 22, 2026) |
| `AUDIT-REPORT-2026-04-24.md` | April 24 exhaustive repository audit — 335/520 items, 18 bugs, 9 zero-day risks |
| `all-files.txt` | File-by-file audit status inventory with classification markers |

## History Of Files Added And Removed

The per-spec "Files Added During ..." and "Files Removed During ..." tables moved to `docs/archive/steering-history-2026.md`. They describe what earlier specs created and deleted, not the current tree. Read them for provenance; do not copy paths from them without checking that the file exists.

## Testing Layout

| Area | Location | Notes |
|------|----------|-------|
| Admissions frontend tests | `apps/admissions/tests/` | Unit, integration, and property coverage including audit fix validation |
| Admissions property tests | `apps/admissions/tests/property/` | fast-check property-based tests for bug conditions, preservation, and fix validation |
| Jobs Ops frontend validation | `apps/jobs-ops` commands | Type-check, lint, and build are current quality gates |
| Backend unit tests | `backend/tests/unit/` | Includes admissions, jobs-ops, and audit production fix coverage |
| Backend property tests | `backend/tests/property/` | Schema, middleware, validation, migration invariants, audit fix validation (hypothesis) |
| Browser automation tests | Monorepo root or app-local | Playwright for deterministic E2E flows |
| Student journey gate | `apps/admissions/tests/harness-e2e/journey-gate/` | The blocking CI journey (SJR task 4): config `apps/admissions/playwright.journey-gate.config.ts`, command `bash harness/bin/harness journey-gate`, workflow `.github/workflows/student-journey-gate.yml`. Runs on the harness stack with the limiter on, a private bucket and 20 s signed URLs. Evidence is run-scoped under `apps/admissions/test-results/harness-evidence/`, never `docs/v2-evidence/` |

## Current Migration-Sensitive Facts

- Admissions frontend calls Django `/api/v1/...` routes directly.
- Jobs-ops frontend also calls Django `/api/v1/...` routes directly.
- Jobs must use `/api/v1/job-applications/`, not admissions `/api/v1/applications/`.
- Backend only exposes `/api/v1/...` routes; there is no legacy compatibility router.
- `apps/jobs-ops` is now part of the real repo structure and must not be treated as a placeholder.
- Several legacy admissions test files still reference old paths; do not copy those assumptions into new code.

## What Not To Copy Forward

- Do not add code that assumes root `api/` or `api-src/` bundles exist.
- Do not introduce query-parameter action routes.
- Do not describe the backend as `django_api/`; the real package is `backend/`.
- Do not describe the frontend as a single root `src/`; the real apps are under `apps/`.
- Do not re-duplicate jobs-ops seeded state across multiple backend view modules.
