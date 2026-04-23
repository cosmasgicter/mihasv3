# AI Job Hunting Platform Handoff

Date: 2026-03-31  
Creator: Cosmas Kanchepa  
Developed by: Beanola Technologies (<https://beanola.com>)

## Current State

The platform is in a strong v1.1 handoff state.

- `apps/jobs-ops` exists as a Bun + React + TypeScript operator dashboard.
- The backend jobs-ops domains are wired under `/api/v1/...`.
- Shared seeded backend data is centralized in `backend/apps/common/jobs_ops_seed.py`.
- The jobs inbox supports search and recommendation filtering.
- Major frontend views now have loading states.
- Read routes for the jobs-ops dashboard are live in the repo-local backend scaffold.
- Schema generation is currently clean.

## Key Entry Points

- Frontend shell: `apps/jobs-ops/src/app/layout/JobsOpsShell.tsx`
- Frontend routes: `apps/jobs-ops/src/app/router.tsx`
- Jobs inbox: `apps/jobs-ops/src/features/jobs/pages/JobsInboxPage.tsx`
- Shared frontend loading state: `apps/jobs-ops/src/components/ui/LoadingState.tsx`
- Backend seed source: `backend/apps/common/jobs_ops_seed.py`
- Jobs domain API: `backend/apps/jobs/views.py`
- Outreach domain API: `backend/apps/outreach/views.py`
- Automation domain API: `backend/apps/automation/views.py`
- Email domain API: `backend/apps/integrations/email_views.py`
- Analytics domain API: `backend/apps/analytics/views.py`
- Platform attribution endpoint: `backend/apps/common/meta_views.py`

## Validation Status

These commands passed at handoff time:

- `bun run type-check` in `apps/jobs-ops`
- `bun run lint` in `apps/jobs-ops`
- `./node_modules/.bin/vite build` in `apps/jobs-ops`
- `python3 manage.py check` in `backend`
- `pytest tests/unit/test_application_endpoints.py tests/unit/test_notification_endpoints.py tests/unit/test_jobs_ops_endpoints.py` in `backend`
- `python3 manage.py spectacular --file /tmp/jobs-ops-schema.yaml` in `backend`

## Highest-Value Next Steps

1. Add authentication and protected routing to `apps/jobs-ops`.
2. Replace seeded backend responses with persistent Django models for jobs-ops domains.
3. Move the jobs-ops execution layer into Celery tasks:
   - discovery runs
   - document tailoring
   - outreach sending
   - application automation
4. Wire first real providers:
   - Telegram
   - Zoho
   - OpenAI
   - R2/object storage
   - Playwright worker
5. Add write-capable frontend actions with success/error feedback for approvals, watch, dismiss, and automation controls.

## Constraints To Preserve

- Do not use `/api/v1/applications/` for jobs. Keep jobs under `/api/v1/job-applications/`.
- Keep creator/developer attribution in `/api/v1/meta/platform/`.
- Preserve the human-in-the-loop model for risky actions.
- Do not revert unrelated user changes in the worktree.
- Keep the API under `/api/v1/...`; do not introduce legacy `/api/...`.

## Remaining Reality

This is not yet a fully provider-backed production system. It is a production-grade continuation scaffold with validated contracts, UI flows, tests, and clean schema metadata. The next AI should treat external integrations and persistence as the main remaining implementation frontier.
