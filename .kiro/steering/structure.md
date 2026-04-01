---
inclusion: always
---

# Project Structure And Code Organization

## Top-Level Layout

| Path | Purpose | Guidance |
|------|---------|----------|
| `apps/admissions/` | Admissions React app | Active frontend target |
| `apps/jobs-ops/` | AI job operations dashboard | Active frontend target |
| `apps/website/` | Future public website | Placeholder unless task says otherwise |
| `apps/student-portal/` | Future student portal | Placeholder unless task says otherwise |
| `apps/librarymanagement/` | Incomplete app directory | Treat as reserved unless task explicitly targets it |
| `backend/` | Django 5 + DRF API | Primary backend modification target |
| `shared/` | Shared package scaffold | Use only for code intentionally shared across apps |
| `docs/` | Project documentation | Modify when task requires documentation or handoff updates |
| `.kiro/` | Specs, steering, and Kiro metadata | Keep steering aligned with the real repo state |

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
| `apps/admissions/tests/` | Unit, integration, and property tests |

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
| `apps/jobs-ops/src/app/` | App shell, providers, router |
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
| `backend/apps/catalog/` | Programs, intakes, subjects, institutions |
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

### Files Added During CTO Remediation

| Path | Purpose |
|------|---------|
| `backend/apps/common/error_urls.py` | URL patterns for `/api/v1/errors/` (error report endpoint) |
| `backend/apps/common/error_views.py` | `ErrorReportView` — accepts frontend error reports, creates `ErrorLog` rows, dispatches throttled alerts |
| `apps/admissions/src/lib/errorReporter.ts` | Frontend error reporter — captures `window.onerror` and unhandled rejections, batches and POSTs to `/api/v1/errors/report/` |
| `backend/scripts/create_error_logs_table.sql` | SQL migration script to create the `error_logs` table (used instead of Django migrations because `managed = False`) |
| `docs/runbooks/secrets-rotation.md` | Runbook for rotating production secrets (JWT key, DB credentials, API keys) |

## Testing Layout

| Area | Location | Notes |
|------|----------|-------|
| Admissions frontend tests | `apps/admissions/tests/` | Existing unit/integration/property coverage |
| Jobs Ops frontend validation | `apps/jobs-ops` commands | Type-check, lint, and build are current quality gates |
| Backend unit tests | `backend/tests/unit/` | Includes admissions and jobs-ops endpoint coverage |
| Backend property tests | `backend/tests/property/` | Schema, middleware, validation, migration invariants |

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
