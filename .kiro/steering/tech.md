---
inclusion: always
---

# Technology Stack And Development Conventions

## Stack Overview

### Monorepo

| Layer | Technology | Notes |
|-------|------------|-------|
| Workspace root | Bun workspaces | Defined in the root `package.json` |
| JS package scope | `apps/*`, `shared` | Only admissions is currently a live JS app |
| Python backend | Standalone Django package in `backend/` | Not managed by Bun |

### Admissions Frontend

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Bun | Use Bun for install, dev, build, lint, and test |
| UI | React 18 + TypeScript | Vite-based SPA |
| Routing | React Router v6 | Route-level pages live in `apps/admissions/src/pages/` |
| State | React Query and Zustand | Keep server and client state concerns separate |
| Forms | React Hook Form + Zod | Client-side validation remains Zod-based |
| Styling | Tailwind CSS + Radix UI | Existing app conventions still apply |
| Testing | Vitest, fast-check, Playwright | Frontend tests live under `apps/admissions/tests/` |
| Hosting | Vercel | App-local config in `apps/admissions/vercel.json` |

### Backend

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Django 5 + Django REST Framework | Active server implementation |
| Runtime | Python 3.12+ | Repo config targets Python 3.12+ |
| App server | Uvicorn (ASGI) | Deployed backend entrypoint is `config.asgi:application` |
| Data | Neon Postgres | Existing production schema, `managed = False` models |
| Async | Celery + Redis | For background work and retries |
| Storage | Cloudflare R2 via `django-storages` | Signed URL workflow |
| Email | Resend | Async delivery path |
| API docs | drf-spectacular | Schema and docs under `/api/v1/` |
| Testing | pytest + hypothesis | Backend tests live under `backend/tests/` |

## Commands That Reflect The Real Repo

### Root

| Command | Purpose |
|---------|---------|
| `bun run dev:admissions` | Run the admissions app |
| `bun run build:admissions` | Build the admissions app |
| `bun run test:admissions` | Run admissions tests |
| `bun run lint:admissions` | Lint the admissions app |

### Admissions App

| Command | Purpose |
|---------|---------|
| `cd apps/admissions && bun run dev` | Start the Vite dev server |
| `cd apps/admissions && bun run build` | Production build |
| `cd apps/admissions && bun run test` | Vitest suite |
| `cd apps/admissions && bun run lint` | ESLint suite |

### Backend

| Command | Purpose |
|---------|---------|
| `cd backend && python3 -m pytest` | Run backend tests |
| `cd backend && python3 manage.py runserver` | Local Django dev server |
| `cd backend && python3 -m uvicorn config.asgi:application --reload` | Local ASGI runtime parity check |
| `cd backend && python3 scripts/verify_migration.py` | Migration verification helper |

## API Contract Reality

This is the most important technical nuance in the repo right now.

### Current Frontend Assumptions

- `apps/admissions/src/services/client.ts` still builds legacy `/api/...` URLs.
- Many frontend callers still rely on query-parameter actions such as `?action=login`, `?action=dashboard`, or `?action=upload`.
- Several comments and tests still describe the old Vercel function contract.

### Current Backend Reality

- `backend/config/urls.py` only mounts the API under `/api/v1/...`.
- Backend routes are resource-style, for example:
  - `/api/v1/auth/login/`
  - `/api/v1/sessions/`
  - `/api/v1/applications/`
  - `/api/v1/catalog/programs/`
  - `/api/v1/documents/upload/`
  - `/api/v1/admin/dashboard/`
- There is no backend compatibility layer for legacy `/api/...` query-action routes.

### Implication

If you are working on frontend/backend integration, you must do one of these intentionally:

1. Migrate the frontend callers and tests to the Django `/api/v1/...` contract.
2. Add and document an explicit compatibility layer.

Do not leave half-migrated endpoint behavior that mixes both contracts without a clear boundary.

## Response And Auth Conventions

- Browser auth remains cookie-based.
- CSRF remains required for state-changing requests.
- Backend responses still use an envelope shape, so frontend unwrapping logic may remain useful.
- Route shape, request method, and payload semantics are the unstable parts of the migration, not the idea of a response envelope itself.

## Conventions For New Code

### Frontend

- Use the `@/` alias for imports inside `apps/admissions/src/`.
- Prefer `apps/admissions/src/lib/` for new shared frontend helpers.
- Use `apiClient` instead of raw `fetch` unless there is a clear reason not to.
- When touching an existing raw `fetch('/api/...')` call, verify whether it should be migrated to the Django route instead of copied forward.

### Backend

- Keep new API work inside `backend/apps/`.
- Keep routes resource-oriented under `/api/v1/`.
- Validate inputs at the serializer or view boundary.
- Keep models compatible with the existing Neon schema.

## Known Technical Debt To Account For

- Admissions scripts still reference `local-server.js`, which is missing.
- Admissions TypeScript config still references missing files and directories from the pre-monorepo layout.
- Some frontend tests still import deleted Vercel API handler modules.
- `shared/` exists but is not yet a meaningful dependency in the live app.

## Verification Expectations

For migration-sensitive changes:

- Run the relevant backend pytest suite when you change Django code.
- Run admissions tests when you touch frontend API integration, if the targeted tests are still valid.
- If a test still targets deleted legacy modules, update or replace the test instead of treating it as authoritative.
