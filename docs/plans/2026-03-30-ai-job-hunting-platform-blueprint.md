# AI Job Hunting Platform Blueprint

Creator: Cosmas Kanchepa  
Developed by: Beanola Technologies (<https://beanola.com>)  
Status: Production-grade v1 scaffold implemented. The document pack still defines the product, system shape, API contracts, and UI design, and now has a linked implementation progress report.

## Purpose

This blueprint defines a production-grade AI job operations platform inside the existing monorepo. The intended outcome is a new operator dashboard, new backend domains, and a controlled automation system for job discovery, qualification, document tailoring, outreach, application submission, tracking, and reporting.

The design assumes the current repo constraints:

- frontend apps live under `apps/*`
- the Django API remains the backend entrypoint
- all new HTTP contracts stay under `/api/v1/...`
- the current admissions platform must continue to work without namespace collisions

## Document Set

1. Product requirements: [docs/requirements/2026-03-30-ai-job-hunting-platform-prd.md](../requirements/2026-03-30-ai-job-hunting-platform-prd.md)
2. System architecture: [docs/design/2026-03-30-ai-job-hunting-platform-architecture.md](../design/2026-03-30-ai-job-hunting-platform-architecture.md)
3. Backend API and data spec: [docs/design/2026-03-30-ai-job-hunting-platform-api-data-spec.md](../design/2026-03-30-ai-job-hunting-platform-api-data-spec.md)
4. Frontend UI and UX spec: [docs/design/2026-03-30-ai-job-hunting-platform-ui-spec.md](../design/2026-03-30-ai-job-hunting-platform-ui-spec.md)
5. Implementation progress report: [docs/reports/2026-03-30-ai-job-hunting-platform-progress.md](../reports/2026-03-30-ai-job-hunting-platform-progress.md)
6. Handoff report: [docs/reports/2026-03-31-ai-job-hunting-platform-handoff.md](../reports/2026-03-31-ai-job-hunting-platform-handoff.md)

## Current Implementation Snapshot

- `apps/jobs-ops` now exists as a Bun + React + TypeScript operator dashboard with polished route-level UI for overview, jobs, applications, automation, outreach, email, documents, integrations, source health, reports, review, and audit.
- `backend/apps/jobs`, `backend/apps/outreach`, `backend/apps/automation`, `backend/apps/integrations`, and `backend/apps/analytics` are scaffolded and wired into `/api/v1/...`.
- The API exposes creator and developer attribution via `/api/v1/meta/platform/`:
  - Creator: Cosmas Kanchepa
  - Developed by Beanola Technologies: <https://beanola.com>
- Read-oriented seeded endpoints are available for the new dashboard so the frontend can render against live repo-local backend responses.
- Shared seeded backend data now lives in `backend/apps/common/jobs_ops_seed.py`.
- Backend regression coverage exists for the new jobs-ops API surface in `backend/tests/unit/test_jobs_ops_endpoints.py`.
- Remaining work is mostly provider-specific and persistence-heavy:
  - authentication inside `apps/jobs-ops`
  - real database models and write flows for the new jobs domains
  - live Zoho, Telegram, OpenAI, Playwright, and storage integrations
  - Celery task execution beyond seeded API responses

## Implementation Guardrails

- Do not create any legacy `/api/...` contracts.
- Do not reuse `/api/v1/applications/` for jobs. That namespace is already owned by the admissions system.
- Do not create a second generic `Application` model in the new jobs domain. Use `JobApplication` and similarly explicit names.
- Reuse existing backend capabilities where they already exist:
  - `apps.accounts` for authentication and sessions
  - `apps.documents` for shared document operations when the boundary is still appropriate
  - Celery and Redis already configured in `backend/config/settings/base.py`
  - `drf-spectacular` for schema generation and API docs
- Every automation path must preserve evidence, auditability, and human approval thresholds.
- The backend API spec must explicitly credit:
  - Creator: Cosmas Kanchepa
  - Developed by Beanola Technologies: <https://beanola.com>

## Recommended Handoff Order For Another AI

1. Read the PRD to understand scope, priorities, and non-goals.
2. Read the architecture doc to understand boundaries and repo fit.
3. Read the API and data spec before implementing any Django models or routes.
4. Read the UI spec before scaffolding `apps/jobs-ops`.

## Primary Decisions Locked By This Blueprint

- The main frontend is `apps/jobs-ops`.
- The backend expands through new Django apps under `backend/apps/`.
- The platform is human-in-the-loop by default for risky actions.
- Browser automation is a later phase and must be isolated from the core Django API process.
- Telemetry, audit, and evidence are first-class product features, not secondary implementation details.
