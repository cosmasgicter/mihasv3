---
inclusion: always
---

# Project Structure And Code Organization

## Top-Level Layout

| Path | Purpose | Guidance |
|------|---------|----------|
| `apps/admissions/` | Live React admissions app | Primary frontend modification target |
| `apps/website/` | Future public website | Placeholder unless task says otherwise |
| `apps/student-portal/` | Future student portal | Placeholder unless task says otherwise |
| `apps/librarymanagement/` | Incomplete app directory | Treat as reserved unless task explicitly targets it |
| `backend/` | Django 5 + DRF API | Primary backend modification target |
| `shared/` | Shared package scaffold | Use only for code intentionally shared across apps |
| `docs/` | Project documentation | Modify only when the task requires documentation updates |
| `.kiro/` | Specs, steering, and Kiro metadata | Keep steering aligned with the real repo state |

## Monorepo Rules

- Do not assume a root-level `src/` directory exists.
- Do not assume `django_api/`, `api-src/`, or `api/` are real runtime directories in this repo.
- Pick the package first, then work inside that package's conventions.
- Prefer changes that keep app-only code inside its app instead of prematurely pushing it into `shared/`.

## Admissions Frontend Structure

All active frontend code lives under `apps/admissions/`.

### Important Paths

| Path | Purpose |
|------|---------|
| `apps/admissions/src/components/` | UI and feature components |
| `apps/admissions/src/pages/` | Route-level screens |
| `apps/admissions/src/hooks/` | React hooks |
| `apps/admissions/src/services/` | API-facing and domain services |
| `apps/admissions/src/lib/` | Canonical frontend helpers and infrastructure |
| `apps/admissions/src/lib/api/` | API-specific helpers still used by some flows |
| `apps/admissions/src/utils/` | Legacy helper area; touch only when updating existing consumers |
| `apps/admissions/src/types/` | Shared TypeScript types for the app |
| `apps/admissions/tests/` | Vitest and property/integration tests |
| `apps/admissions/public/` | Static assets |

### Frontend Placement Guidance

| Adding | Place It In | Notes |
|--------|-------------|-------|
| Page or route screen | `apps/admissions/src/pages/` | Register with the existing routing setup |
| Reusable component | `apps/admissions/src/components/{domain}/` | Follow existing domain organization |
| App-specific service | `apps/admissions/src/services/` | Prefer `apiClient` over ad hoc fetch logic |
| Shared frontend helper | `apps/admissions/src/lib/` | Prefer this over `src/utils/` for new code |
| Legacy helper update | Existing file in `src/utils/` | Do not duplicate it into `src/lib/` unless doing a real consolidation |
| Tests | `apps/admissions/tests/` | Keep unit, integration, and property coverage close to the behavior being changed |

### Frontend Import Rules

```ts
// Preferred within admissions
import { Button } from '@/components/ui/Button'
import { apiClient } from '@/services/client'

// Same-directory only
import { helper } from './helper'
```

- Use the `@/` alias for `apps/admissions/src/` imports.
- Avoid long relative traversals across feature boundaries.
- Use `@mihas/shared` only when code is intentionally cross-app, not just because a helper looks generic.

## Backend Structure

All active backend code lives under `backend/`.

### Important Paths

| Path | Purpose |
|------|---------|
| `backend/apps/accounts/` | Auth, sessions, admin user management |
| `backend/apps/applications/` | Application domain views and models |
| `backend/apps/catalog/` | Programs, intakes, subjects, institutions |
| `backend/apps/documents/` | Documents, OCR, payment-related endpoints |
| `backend/apps/common/` | Shared middleware, renderers, health, notifications |
| `backend/config/` | Django settings and URL routing |
| `backend/tests/unit/` | Unit tests |
| `backend/tests/property/` | Hypothesis property tests |
| `backend/tests/contract/` | Contract and parity-oriented tests |
| `backend/scripts/` | Verification and support scripts |

### Backend Placement Guidance

| Adding | Place It In | Notes |
|--------|-------------|-------|
| API view or serializer | Matching app under `backend/apps/` | Keep domains explicit |
| Shared middleware or renderer | `backend/apps/common/` | Reuse before creating new cross-cutting modules |
| New route | App `urls.py` plus `backend/config/urls.py` include if needed | Backend routes are resource-style under `/api/v1/` |
| Tests | `backend/tests/{unit,property,contract}/` | Match the behavior and risk level |
| Migration verification tooling | `backend/scripts/` | Avoid ad hoc scripts in random directories |

## Testing Layout

| Area | Location | Notes |
|------|----------|-------|
| Frontend unit/integration/property tests | `apps/admissions/tests/` | Some tests still reference removed legacy API modules |
| Backend unit tests | `backend/tests/unit/` | Fast structural and behavior checks |
| Backend property tests | `backend/tests/property/` | Schema, middleware, validation, migration invariants |
| Backend contract tests | `backend/tests/contract/` | Response-shape and parity focused |

## Known Migration-Sensitive Areas

These are current repo facts, not aspirational rules:

- `apps/admissions/src/services/client.ts` still normalizes requests into legacy `/api/{resource}?action=...` paths.
- Many admissions services, hooks, and pages still call `/api/...` endpoints directly.
- The backend only exposes `/api/v1/...` routes; it does not ship a legacy compatibility router.
- `apps/admissions/package.json` contains `dev:api`, but `apps/admissions/local-server.js` does not exist.
- `apps/admissions/tsconfig.json` still includes missing paths: `netlify`, `vite.config.local.ts`, and `vite.config.production.ts`.
- Several admissions tests import from `../../../api/...`, but there is no `apps/admissions/api/` directory.

## What Not To Copy Forward

- Do not add new code that assumes root `api/` or `api-src/` bundles exist.
- Do not add new frontend calls using the legacy query-parameter action pattern unless the task is explicitly about maintaining a legacy path.
- Do not describe the backend as `django_api/`; the real package is `backend/`.
- Do not describe the frontend as root `src/`; the real package is `apps/admissions/src/`.
