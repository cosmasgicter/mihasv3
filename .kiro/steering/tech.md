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

## API Contract

The frontend and backend share a single, unified API contract. There is no translation layer or compatibility shim.

- The frontend API client (`apps/admissions/src/services/client.ts`) sends requests directly to `/api/v1/` paths on `api.mihas.edu.zm`.
- `toApiV1Path()` prepends `/api/v1` to service-layer paths that are not already prefixed. This is the only path transformation.
- `backend/config/urls.py` mounts all API routes under `/api/v1/...`.
- Routes are resource-style, for example:
  - `/api/v1/auth/login/`
  - `/api/v1/sessions/`
  - `/api/v1/applications/`
  - `/api/v1/catalog/programs/`
  - `/api/v1/documents/upload/`
  - `/api/v1/admin/dashboard/`
  - `/api/v1/events/stream/` (SSE)
- There are no legacy `/api/{resource}?action=` query-parameter routes in either the frontend or the backend.
- All cross-origin requests from `apply.mihas.edu.zm` to `api.mihas.edu.zm` use `credentials: 'include'` for cookie-based auth.

## Response And Auth Conventions

- Auth is cookie-based. Django sets `access_token` and `refresh_token` as HTTP-only cookies with `Domain=.mihas.edu.zm`, `SameSite=Lax`, `Secure=true`.
- CSRF is required for state-changing requests (POST, PUT, PATCH, DELETE). The token is exchanged via the `X-CSRF-Token` request/response header and stored in memory (`lib/csrfToken.ts`).
- All responses use the `{"success": true, "data": ...}` envelope. The frontend `unwrapApiResponse()` method handles unwrapping.
- Paginated responses use `{page, pageSize, totalCount, results}`. Service methods map `results` to domain-specific field names (e.g., `applications`, `users`).
- On 401, the client attempts a single token refresh via `/api/v1/auth/refresh/` before signing out.

## Conventions For New Code

### Frontend

- Use the `@/` alias for imports inside `apps/admissions/src/`.
- Prefer `apps/admissions/src/lib/` for new shared frontend helpers.
- Use `apiClient` instead of raw `fetch` unless there is a clear reason not to.
- All service methods pass short paths (e.g., `/applications/`, `/auth/login/`) to `apiClient.request()`. The client prepends `/api/v1` via `toApiV1Path()`.
- Do not introduce `?action=` query-parameter patterns. All endpoints use resource-style REST paths.

### Backend

- Keep new API work inside `backend/apps/`.
- Keep routes resource-oriented under `/api/v1/`.
- Validate inputs at the serializer or view boundary.
- Keep models compatible with the existing Neon schema.

## Known Technical Debt To Account For

- Admissions TypeScript config still references missing files and directories from the pre-monorepo layout.
- `shared/` exists but is not yet a meaningful dependency in the live app.

## Verification Expectations

- Run the relevant backend pytest suite when you change Django code.
- Run admissions tests when you touch frontend API integration.
- Property tests in `apps/admissions/tests/property/` validate API client invariants, service URL construction, and dependency hygiene.
