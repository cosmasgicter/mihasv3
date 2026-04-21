# MIHAS Platform

Mukuba Institute of Health and Allied Sciences — multi-application monorepo powering student admissions, AI job operations, and institutional services.

## Repository Structure

```
apps/
  admissions/          React 18 admissions portal (Vercel → apply.mihas.edu.zm)
  jobs-ops/            React 18 operator dashboard for AI job operations
  website/             Future public website (placeholder)
  student-portal/      Future student management system (placeholder)
  librarymanagement/   Reserved app directory (not yet wired)
backend/               Django 5 + DRF API (Koyeb → api.mihas.edu.zm)
shared/                Shared package scaffold (lightly used)
docs/                  Project documentation, runbooks, and reports
.kiro/                 Kiro specs, steering files, hooks, skills, and MCP config
.agents/               Agent skills (accessibility, performance, security, etc.)
```

## Technology Stack

### Admissions Frontend (`apps/admissions/`)

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| UI | React 18 + TypeScript |
| Build | Vite |
| Routing | React Router |
| State | React Query + Zustand |
| Forms | React Hook Form + Zod |
| Styling | Tailwind CSS + Radix UI |
| Testing | Vitest + fast-check + Playwright |
| Hosting | Vercel |

### Jobs Ops Frontend (`apps/jobs-ops/`)

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| UI | React 18 + TypeScript |
| Build | Vite |
| Routing | React Router |
| State | React Query + Zustand |
| Styling | Tailwind CSS + Lucide |
| Hosting | Vercel (planned) |

### Backend (`backend/`)

| Layer | Technology |
|-------|------------|
| Framework | Django 5 + Django REST Framework |
| Runtime | Python 3.12+ |
| App Server | Uvicorn (ASGI) |
| Database | Neon Postgres (serverless) |
| Async Tasks | Celery + Redis |
| Storage | Cloudflare R2 via django-storages |
| Email | Zoho SMTP (primary) + Resend (fallback) |
| Payments | Lenco gateway (mobile money + card widget) |
| API Docs | drf-spectacular (Swagger + ReDoc) |
| Error Monitoring | GlitchTip (Sentry-compatible) via `sentry-sdk` |
| Testing | pytest + hypothesis |

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
python manage.py runserver
```

### Admissions Frontend
```bash
cd apps/admissions
bun install
bun run dev
```

### Jobs Ops Frontend
```bash
cd apps/jobs-ops
bun install
bun run dev
```

### Root Workspace Commands
```bash
bun install                # install all app dependencies
bun run dev:admissions     # start admissions dev server
bun run dev:jobs-ops       # start jobs-ops dev server
bun run build:admissions   # production build (admissions)
bun run build:jobs-ops     # production build (jobs-ops)
bun run test:admissions    # run admissions test suite
bun run lint:admissions    # lint admissions
bun run lint:jobs-ops      # lint jobs-ops
bun run type-check:jobs-ops # type-check jobs-ops
```

## API Surface

All endpoints live under `/api/v1/`. Key route groups:

| Route | Domain |
|-------|--------|
| `/api/v1/auth/` | Authentication, sessions, token refresh |
| `/api/v1/applications/` | Admissions applications, submission, review, withdrawal, waitlist, conditions, enrollment, assignments, amendments |
| `/api/v1/catalog/` | Programs, intakes, subjects |
| `/api/v1/payments/` | Payment lifecycle (mobile money, card widget, deferred), webhooks, fee resolution |
| `/api/v1/documents/` | Document uploads, OCR |
| `/api/v1/jobs/` | Job discovery and scoring |
| `/api/v1/job-applications/` | Job application tracking |
| `/api/v1/outreach/` | CRM contacts and campaigns |
| `/api/v1/automation/` | Rules and automation runs |
| `/api/v1/integrations/` | Telegram, OpenAI, email providers |
| `/api/v1/analytics/` | Analytics and funnel data |
| `/api/v1/reports/` | Report generation |
| `/api/v1/email/` | Email threads |
| `/api/v1/notifications/` | Notification preferences |
| `/api/v1/errors/` | Frontend error reporting |
| `/api/v1/events/` | SSE event streams |
| `/api/v1/admin/` | Admin user management, communication templates |
| `/api/v1/meta/` | Platform metadata |
| `/api/v1/schema/` | OpenAPI schema |
| `/api/v1/docs/` | Swagger UI |

## Testing

| Area | Location | Runner |
|------|----------|--------|
| Admissions frontend | `apps/admissions/tests/` | Vitest + fast-check |
| Jobs Ops validation | `apps/jobs-ops/` | type-check + lint + build |
| Backend unit tests | `backend/tests/unit/` | pytest |
| Backend property tests | `backend/tests/property/` | pytest + hypothesis |
| Backend contract tests | `backend/tests/contract/` | pytest |

```bash
# Backend
cd backend && python3 -m pytest

# Admissions frontend
cd apps/admissions && bun run test

# Jobs Ops quality gates
cd apps/jobs-ops && bun run type-check && bun run lint
```

## Deployment

| Service | Platform | Config |
|---------|----------|--------|
| Backend API | Koyeb (Docker) | `backend/Dockerfile` |
| Celery Worker | Koyeb (Docker) | Same image, different entrypoint |
| Celery Beat | Koyeb (1 instance) | Periodic task scheduler |
| Admissions | Vercel | `apps/admissions/vercel.json` (same-origin API proxy via rewrites) |
| Jobs Ops | Vercel (planned) | Independent deploy |

Each app deploys independently. Backend health checks at `/health/live/` and `/health/ready/`.

## Kiro Configuration

### Steering Files (`.kiro/steering/`)

| File | Purpose |
|------|---------|
| `tech.md` | Technology stack, commands, API contract, and coding conventions |
| `structure.md` | Project structure, placement guidance, and migration-sensitive facts |
| `product.md` | Product context, business rules, user roles, and hard constraints |

### Hooks (`.kiro/hooks/`)

| Hook | Trigger | Action |
|------|---------|--------|
| Update README | Manual (user-triggered) | Reviews codebase and updates README.md |
| Code Quality Analyzer | File edited (`src/**/*.ts`, `src/**/*.tsx`) | Analyzes code for smells, patterns, and best practices |

### Powers

| Power | Status | Purpose |
|-------|--------|---------|
| Neon | Active | Serverless Postgres management — branching, SQL execution, schema migrations |

### MCP Servers

| Server | Status | Purpose |
|--------|--------|---------|
| Neon | Active | Database management via Neon MCP |
| Context7 | Active | Library documentation lookup |
| Memory | Active | Knowledge graph for persistent context |
| Playwright | Available | Browser automation and E2E testing |
| Chrome DevTools | Available | Browser debugging |
| shadcn | Available | UI component scaffolding |
| GitHub | Disabled | GitHub API integration |
| Brave Search | Disabled | Web search |
| Supabase | Disabled | Alternative database (not in use) |

### Specs (`.kiro/specs/`)

Completed and in-progress spec-driven development workflows. Each spec directory contains `requirements.md` or `bugfix.md`, `design.md`, and `tasks.md`. Completed specs have `"status": "completed"` in their `.config.kiro` file.

## Background Tasks (Celery Beat)

| Task | Schedule | Purpose |
|------|----------|---------|
| `keep_alive_task` | Every 4 minutes | Lightweight ping to prevent Koyeb cold starts |
| `check_uptime_task` | Every 15 minutes | Internal health check with alert on failure/recovery |
| `cleanup_audit_logs_task` | Daily at 03:00 UTC | Purge expired audit logs (90d standard, 365d security) |
| `poll_pending_payments_task` | Every 10 minutes | Poll Lenco API for pending payments, expire payments > 24h |
| `intake_manager_task` | Daily at 04:00 UTC | Ensure ≥2 open intakes exist (Jan/Jul pattern) |
| `condition_expiry_task` | Daily at 05:00 UTC | Expire overdue admission conditions, trigger auto-rejection |
| `draft_expiry_reminder_task` | Daily at 06:00 UTC | Remind students about stale drafts, expire at 30 days |
| `review_sla_reminder_task` | Daily at 07:00 UTC | Notify admins about applications exceeding review SLA |
| `document_verification_sla_task` | Daily at 08:00 UTC | Notify admins about documents pending beyond SLA, escalate at 2x |
| `enrollment_confirmation_expiry_task` | Daily at 09:00 UTC | Expire unconfirmed enrollments, release spots to waitlist |
| `waitlist_cascade_task` | Daily at 10:00 UTC | Cascade waitlisted applications to next intake |
| `interview_auto_complete_task` | Every 2 hours | Auto-complete past interviews |
| `interview_reminder_task` | Every hour | Send reminders for interviews within 24 hours |

## Environment

Backend env vars are documented in `.env.example`. Frontend env vars use `VITE_` prefix and are documented in `.env.frontend`. Key integrations requiring configuration:

- Neon Postgres (database)
- Redis (Celery broker + cache)
- Cloudflare R2 (file storage)
- Lenco (payment gateway — mobile money + card widget)
- Zoho SMTP (primary outbound email)
- Resend (fallback transactional email)
- GlitchTip (error monitoring)

## Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| Schema ownership | `docs/schema-ownership.md` | Table-level ownership map for the Neon database |
| Redis dependency tiers | `docs/redis-dependency-tiers.md` | Redis key usage, TTLs, and failure impact tiers |
| Platform contract | `shared/PLATFORM_CONTRACT.md` | Cross-app API and data contract |
| Secrets rotation | `docs/runbooks/secrets-rotation.md` | Production secret rotation runbook |

## License

Private repository. All rights reserved.
