# MIHAS Platform

Multi-application monorepo for the Mukuba Institute of Health and Allied Sciences. Two active product surfaces backed by a shared Django API.

## Architecture

| Layer | Technology | Hosting |
|-------|------------|---------|
| Admissions frontend | React 18 + TypeScript + Vite | Vercel |
| Jobs-Ops frontend | React 18 + TypeScript + Vite | Vercel |
| Backend API | Django 5 + DRF + Uvicorn (ASGI) | Koyeb |
| Database | Neon Postgres | Neon |
| Task queue | Celery + Redis | Koyeb worker |
| Object storage | Cloudflare R2 | Cloudflare |
| Email | Zoho SMTP (primary) + Resend (fallback) | — |
| Error monitoring | GlitchTip (Sentry-compatible) | app.glitchtip.com |
| Uptime monitoring | Internal Celery task + UptimeRobot | — |
| Package manager | Bun (frontend) / pip (backend) | — |

## Products

### Admissions (`apps/admissions/`)

Student-facing application portal and admin review dashboard.

- Multi-step application wizard with auto-save
- Lenco payment gateway (mobile money primary, card secondary, defer option)
- AI-powered OCR grade extraction from result slips
- AI admin review summaries (gpt-4o-mini)
- Document upload with magic-byte validation
- Interview scheduling with conflict detection
- Waitlist management with auto-promotion
- Conditional admission lifecycle
- Communication templates with variable substitution

Live at: `https://apply.mihas.edu.zm`

### Jobs-Ops (`apps/jobs-ops/`)

AI job hunting and outreach operations dashboard.

- Job discovery, scoring, and review
- Resume/document tailoring
- Outreach CRM and email operations
- Human-in-the-loop automation
- Analytics and reporting

## Quick Start

### Frontend

```bash
# Install dependencies (from monorepo root)
bun install

# Admissions
bun run dev:admissions      # Dev server
bun run build:admissions    # Production build
bun run test:admissions     # Vitest suite
bun run lint:admissions     # ESLint

# Jobs-Ops
bun run dev:jobs-ops        # Dev server
bun run build:jobs-ops      # Production build
bun run type-check:jobs-ops # TypeScript check
bun run lint:jobs-ops       # ESLint
```

### Backend

```bash
cd backend

# Development
python3 manage.py runserver
python3 -m uvicorn config.asgi:application --reload  # ASGI parity

# Testing
python3 -m pytest
python3 manage.py check
python3 manage.py spectacular --file /tmp/schema.yaml

# Celery (separate terminal)
celery -A config worker -l info
celery -A config beat -l info
```

## Project Structure

```
├── apps/
│   ├── admissions/          # Admissions React app (Vercel)
│   ├── jobs-ops/            # Jobs-Ops React app (Vercel)
│   ├── website/             # Future public website (placeholder)
│   └── student-portal/      # Future student portal (placeholder)
├── backend/
│   ├── apps/
│   │   ├── accounts/        # Auth, sessions, profiles
│   │   ├── applications/    # Admissions domain (split views)
│   │   ├── catalog/         # Programs, intakes, subjects
│   │   ├── documents/       # Documents, OCR, payments
│   │   ├── common/          # Middleware, health, notifications
│   │   ├── jobs/            # Jobs-ops job APIs
│   │   ├── outreach/        # CRM and campaigns
│   │   ├── automation/      # Rules and runs
│   │   ├── integrations/    # Telegram, OpenAI, email
│   │   └── analytics/       # Reports and analytics
│   ├── config/              # Django settings and URLs
│   └── tests/               # Unit and property tests
├── shared/                  # Cross-app shared code
├── docs/                    # Documentation and runbooks
└── .kiro/                   # Specs, steering, hooks
```

## API

All routes under `/api/v1/`. Resource-style REST. Response envelope: `{"success": true, "data": ...}`.

Auth: HTTP-only cookies (access_token 30min, refresh_token 7 days). CSRF required on state-changing requests. Cross-origin from `apply.mihas.edu.zm` to `api.mihas.edu.zm`.

API docs: `https://api.mihas.edu.zm/api/v1/docs/`

## Environment

Backend env vars are documented in `.env.example`. Frontend env vars use `VITE_` prefix and are in `.env.frontend`.

Key variables:
- `DATABASE_URL` — Neon Postgres connection string
- `REDIS_URL` — Redis for Celery, JTI blacklist, caching
- `LENCO_API_SECRET_KEY` / `LENCO_PUBLIC_KEY` — Payment gateway
- `AI_GATEWAY_API_KEY` — LLM gateway for AI features
- `GLITCHTIP_DSN` / `VITE_GLITCHTIP_DSN` — Error monitoring
- `ZOHO_EMAIL_HOST_PASSWORD` — SMTP credentials

## Deployment

- Frontend: Push to `main` triggers Vercel auto-deploy
- Backend: Push to `main` triggers Koyeb auto-deploy (Dockerfile)
- Celery Beat: Dedicated Koyeb worker (exactly 1 instance)
- Database migrations: Manual SQL scripts in `backend/scripts/`

## Runbooks

- `docs/runbooks/secrets-rotation.md` — Rotate production secrets
- `docs/runbooks/redis-recovery.md` — Redis failure recovery
- `docs/runbooks/scaling-playbook.md` — Scaling Koyeb and Neon

## Key Documentation

- `.kiro/steering/tech.md` — Technology stack and conventions
- `.kiro/steering/structure.md` — Code organization and placement
- `.kiro/steering/product.md` — Product context and business rules
- `docs/schema-ownership.md` — Database table ownership
- `docs/redis-dependency-tiers.md` — Redis key usage and TTLs
- `docs/security-api-audit-2026-04.md` — Security audit report

---

Developed by [Beanola Technologies](https://beanola.com) · Creator: Cosmas Kanchepa
