# MIHAS Platform

Mukuba Institute of Health and Applied Sciences — multi-application monorepo powering student admissions, AI job operations, and institutional services.

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

## Canonical Truth Map

Every domain concept in the admissions system (application statuses, payment states, role hierarchies, error codes, submission gates) has exactly one source of truth with drift-guard tests that fail CI if any consumer diverges. The master index lives at [`docs/canonical-truth-map.md`](docs/canonical-truth-map.md). Any new domain concept must register in the map before merging.

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
| `/api/v1/documents/` | Document uploads, OCR grade extraction |
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
| Admissions | Vercel | `apps/admissions/vercel.json` |
| Jobs Ops | Vercel (planned) | Independent deploy |

Each app deploys independently. Backend health checks at `/health/live/` and `/health/ready/`.

Staging settings are available at `backend/config/settings/staging.py` for pre-production validation.

## AI Features

| Feature | Endpoint / Location | Model | Notes |
|---------|---------------------|-------|-------|
| OCR grade extraction | `backend/apps/documents/tasks.py::extract_document_text_task` | Tesseract via Celery | Extracts grades from result slips; never overwrites manual entries; 120s soft / 180s hard task limit |
| AI admin review summary | `GET /api/v1/applications/{id}/admin-summary/` | `gpt-4o-mini` | Cached, rate-limited, graceful fallback when API key missing |
| AI preview summary | Review step in wizard | `gpt-4o-mini` | Personalized application summary for students |

AI features use `AI_GATEWAY_API_KEY` (not `OPENAI_API_KEY`) for the Vercel AI Gateway. The gateway supports multiple model tiers: `AI_MODEL_FAST` (gemini-2.5-flash), `AI_MODEL_VISION` (gemini-2.5-flash), `AI_MODEL_ANALYSIS` (gpt-4o-mini), `AI_MODEL_SMART` (deepseek-v3).

## Auth & CSRF

- Cookie-based auth with HTTP-only `access_token` (30 min) and `refresh_token` (7 days, JTI blacklisted via Redis).
- CSRF tokens are validated at the `JWTCookieAuthentication` layer for cookie-sourced requests.
- Frontend bootstrap requests a fresh CSRF token via `?refresh_csrf=1` when the in-memory store is empty (after page refresh).
- CSRF recovery uses query parameters (not custom headers) to avoid CORS preflight issues on cross-origin requests.
- `x-csrf-token`, `x-csrf-recovery`, and `idempotency-key` are in `CORS_ALLOW_HEADERS`.

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
| `cleanup_stale_sessions_task` | Daily at 02:30 UTC | Deactivate expired device sessions |
| `cleanup_audit_logs_task` | Daily at 03:00 UTC | Purge expired audit logs (90d standard, 365d security) |
| `cleanup_idempotency_keys` | Daily at 03:00 UTC | Purge expired idempotency key records |
| `poll_pending_payments_task` | Every 10 minutes | Poll Lenco API for pending payments, expire payments > 24h |
| `process_pending_emails_task` | Every 2 minutes | Sweep stale pending EmailQueue rows |
| `intake_manager_task` | Daily at 04:00 UTC | Ensure ≥2 open intakes exist (Jan/Jul pattern) |
| `condition_expiry_task` | Daily at 05:00 UTC | Expire overdue admission conditions, trigger auto-rejection |
| `draft_expiry_reminder_task` | Daily at 06:00 UTC | Remind students about stale drafts, expire at 30 days |
| `review_sla_reminder_task` | Daily at 07:00 UTC | Notify admins about applications exceeding review SLA |
| `document_verification_sla_task` | Daily at 08:00 UTC | Notify admins about documents pending beyond SLA, escalate at 2x |
| `enrollment_confirmation_expiry_task` | Daily at 09:00 UTC | Expire unconfirmed enrollments, release spots to waitlist |
| `waitlist_cascade_task` | Daily at 10:00 UTC | Cascade waitlisted applications to next intake |
| `deferred_payment_reminder_task` | Daily at 11:00 UTC | Remind students who deferred payment |
| `interview_auto_complete_task` | Every 2 hours | Auto-complete past interviews |
| `interview_reminder_task` | Every hour | Send reminders for interviews within 24 hours |

## Environment

Backend env vars are documented in `.env.example`. Frontend env vars use `VITE_` prefix and are documented in `.env.frontend`. Only `.env.example` and `.env.scripts.example` are tracked in git — all real env files (`.env`, `.env.local`, `.env.vercel.*`) are gitignored.

Key integrations requiring configuration:

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
| Redis recovery | `docs/runbooks/redis-recovery.md` | Redis failure recovery procedures |
| Scaling playbook | `docs/runbooks/scaling-playbook.md` | Scaling playbook for Koyeb workers and Neon |
| Release & rollback | `docs/runbooks/release-and-rollback.md` | Release process and rollback procedures |
| Post-deploy smoke | `docs/runbooks/post-deploy-smoke-check.md` | Post-deployment verification checklist |
| Database backup | `docs/runbooks/database-backup-restore.md` | Neon database backup and restore |
| Local parity | `docs/runbooks/local-parity.md` | Local dev environment parity with production |
| Security audit (Apr 22) | `docs/security-api-audit-2026-04.md` | April 2026 security and API audit report |
| Full audit (Apr 22) | `docs/full-audit-report-2026-04-22.md` | Full codebase audit report (April 22, 2026) |
| Exhaustive audit (Apr 24) | `AUDIT-REPORT-2026-04-24.md` | 335/520 items audited — 18 bugs, 9 zero-day risks, priority action plan |
| Audit file inventory | `all-files.txt` | File-by-file audit status with classification markers |

## Security Hardening (April 2026)

The platform underwent an exhaustive security audit on April 24, 2026 covering 335 of 520 runtime items (100% of security-critical paths). Key hardening applied:

- Admin privilege escalation blocked — admins cannot assign roles higher than their own or modify higher-role users
- Batch user import audit trail — every batch operation creates an `AuditLog` entry with encrypted network context
- Bulk notification retry dedup — retries only process remaining unprocessed notifications, preventing duplicate emails
- Payment review gate aligned — `ApplicationReviewView` now checks the full resolved payment status set
- Tracked env placeholder files removed — only `.env.example` remains as the canonical template
- Self-deactivation guard — admins cannot deactivate their own accounts

See `AUDIT-REPORT-2026-04-24.md` for the full findings and priority action plan.

## License

Private repository. All rights reserved.
