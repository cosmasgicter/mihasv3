# Requirements Document

## Introduction

This spec covers the restructuring of the MIHAS Application System from a flat root-level layout into a clean monorepo, along with two production-critical fixes (P0) and the complete removal of the legacy Node.js backend. The monorepo will separate the Django backend, the admissions React frontend, future frontend apps, shared code, and documentation into distinct top-level directories. The frontend API client and Kiro steering files will be updated to reflect the new structure.

## Glossary

- **Monorepo**: A single Git repository containing multiple independently deployable projects (backend, frontend apps, shared libraries).
- **Backend**: The Django 5 + DRF API deployed to Koyeb at `api.mihas.edu.zm`.
- **Admissions_App**: The React 18 + TypeScript SPA for student admissions, deployed to Vercel at `apply.mihas.edu.zm`.
- **JTI_Blacklist**: The set of revoked JWT token identifiers (jti claims) used to prevent reuse of rotated refresh tokens.
- **Redis_Store**: The Upstash serverless Redis instance used for Celery brokering and shared state (TLS-encrypted, `rediss://` protocol).
- **SSE_Service**: The Server-Sent Events streaming endpoint (`/api/v1/events/stream/`) that pushes real-time notifications to authenticated users.
- **ApiClient**: The canonical frontend HTTP client class in `src/services/client.ts` that handles authentication, CSRF, retries, and envelope unwrapping.
- **Steering_Files**: The Kiro configuration files (`.kiro/steering/tech.md`, `.kiro/steering/structure.md`, `.kiro/steering/product.md`) that guide AI assistants working on the codebase.
- **Legacy_Backend**: The Node.js Vercel Functions backend (`api-src/`, `api/`, `lib/`) being decommissioned in favor of the Django Backend.
- **Workspace_Root**: The top-level directory of the Git repository.

## Requirements

### Requirement 1: Migrate JTI Blacklist to Redis

**User Story:** As a platform operator, I want revoked JWT token identifiers persisted in Redis, so that token revocation survives process restarts and works across multiple gunicorn workers.

#### Acceptance Criteria

1. WHEN a refresh token is rotated, THE Backend SHALL store the old token jti in the Redis_Store with a TTL equal to the refresh token lifetime (7 days).
2. WHEN a token verification request includes a refresh token, THE Backend SHALL check the Redis_Store for the jti and reject the token if the jti exists in the blacklist.
3. WHEN a user logs out or a session is revoked, THE Backend SHALL add the associated refresh token jti to the Redis_Store blacklist.
4. IF the Redis_Store is unreachable during a blacklist write, THEN THE Backend SHALL log the error and still complete the token rotation (fail-open for writes, to avoid blocking auth).
5. IF the Redis_Store is unreachable during a blacklist read, THEN THE Backend SHALL reject the refresh token (fail-closed for reads, to prevent use of potentially revoked tokens).
6. THE Backend SHALL remove the in-memory `_blacklisted_jtis` set and `_blacklist_lock` from `tokens.py` after the Redis migration is complete.
7. THE Backend SHALL use the existing `REDIS_URL` environment variable (Upstash TLS connection) for the JTI blacklist store.

### Requirement 2: Migrate SSE to Async Workers

**User Story:** As a platform operator, I want SSE connections handled by async workers, so that long-lived streaming connections do not block sync gunicorn threads and limit concurrency.

#### Acceptance Criteria

1. THE Backend SHALL switch from gunicorn (WSGI) to uvicorn (ASGI) as the production application server, running the entire Django app under ASGI so that both sync and async views are handled transparently.
2. WHEN an authenticated user connects to the SSE stream endpoint, THE SSE_Service SHALL handle the connection using an `async def` view with `StreamingHttpResponse` and `async for` iteration.
3. THE SSE_Service SHALL use `asyncio.sleep` instead of `time.sleep` for the 8-second keepalive interval.
4. THE SSE_Service SHALL maintain the existing 8-second keepalive ping interval and 30-second maximum connection duration.
5. THE Backend SHALL update `config/asgi.py` to serve as the primary application entry point, and update the Dockerfile CMD and gunicorn.conf.py to use uvicorn with `--workers 3`.
6. WHILE the SSE stream is active, THE SSE_Service SHALL query for unread notifications using `sync_to_async` wrapped ORM calls and emit them as SSE events.
7. THE SSE_Service SHALL preserve the existing polling fallback endpoint (`/api/v1/events/poll/`) as a sync view for clients that do not support SSE.
8. IF the database query for notifications fails during an active SSE stream, THEN THE SSE_Service SHALL log the error and continue sending keepalive pings without crashing the stream.
9. THE Backend `requirements.txt` SHALL include `uvicorn[standard]` as a dependency.

### Requirement 3: Delete Legacy Node.js Backend Artifacts

**User Story:** As a developer, I want all legacy Node.js backend code removed from the repository, so that the codebase only contains the active Django backend and React frontend.

#### Acceptance Criteria

1. THE Workspace_Root SHALL NOT contain the `api-src/` directory after cleanup.
2. THE Workspace_Root SHALL NOT contain the `api/` directory after cleanup.
3. THE Workspace_Root SHALL NOT contain the `lib/` directory (legacy backend utilities) after cleanup.
4. THE Workspace_Root SHALL NOT contain the `local-server.js` file after cleanup.
5. THE Workspace_Root SHALL NOT contain the `_routes.json` file after cleanup.
6. THE Workspace_Root SHALL retain all frontend files: `src/`, `public/`, `index.html`, `package.json`, `vite.config.ts`, `tailwind.config.js`, `tsconfig.json`, `eslint.config.js`, `postcss.config.js`, `components.json`, and `bunfig.toml`.

### Requirement 4: Clean Up Miscellaneous Files

**User Story:** As a developer, I want stale documentation, audit artifacts, and lock files removed, so that the repository contains only relevant project files.

#### Acceptance Criteria

1. THE Workspace_Root SHALL NOT contain the following files after cleanup: `duplicate.md`, `test-results.txt`, `POST_REMEDIATION_AUDIT.md`, `codexCLI.md`, `jules.md`, `Issues`, `skills-lock.json`.
2. THE Workspace_Root SHALL NOT contain the legacy `vercel.json` after cleanup.
3. WHEN the legacy `vercel.json` is deleted, THE Workspace_Root SHALL contain `vercel.frontend-only.json` as the replacement Vercel configuration (to be renamed or relocated during monorepo restructure).


### Requirement 5: Restructure Repository into Monorepo Layout

**User Story:** As a developer, I want the repository organized as a monorepo with clear boundaries between backend, frontend apps, shared code, and documentation, so that each project is independently maintainable and deployable.

#### Acceptance Criteria

1. THE Workspace_Root SHALL contain a `backend/` directory holding the Django API (contents currently in `django_api/`).
2. THE Workspace_Root SHALL contain an `apps/admissions/` directory holding the React admissions frontend (contents currently in `src/`, `public/`, `index.html`, and frontend config files).
3. THE Workspace_Root SHALL contain an `apps/website/` directory as a placeholder for the future MIHAS main website.
4. THE Workspace_Root SHALL contain an `apps/student-portal/` directory as a placeholder for the future student management system.
5. THE Workspace_Root SHALL contain a `shared/` directory for shared types, utilities, and design tokens used across frontend apps.
6. THE Workspace_Root SHALL contain a `docs/` directory for project documentation.
7. THE `.kiro/` directory SHALL remain at the Workspace_Root.
8. WHEN the admissions frontend is moved to `apps/admissions/`, THE Admissions_App SHALL have its own `package.json`, `vercel.json`, and `vite.config.ts` for independent deployment to Vercel.
9. WHEN the backend is moved to `backend/`, THE Backend SHALL remain independently deployable to Koyeb using its existing `Dockerfile` and `gunicorn` configuration.
10. WHEN placeholder app directories (`apps/website/`, `apps/student-portal/`) are created, each SHALL contain a minimal `package.json` and a `README.md` describing the planned purpose.
11. THE Workspace_Root SHALL move the `migrations/` directory (legacy SQL migration files) to `backend/migrations/` since database migrations are backend-owned.
12. THE Workspace_Root SHALL move the `tests/` directory (frontend tests: Vitest, fast-check, Playwright) to `apps/admissions/tests/` and update all import paths accordingly.

### Requirement 8: Root-Level Monorepo Tooling

**User Story:** As a developer, I want root-level workspace configuration so that dependency management and project coordination work across all apps in the monorepo.

#### Acceptance Criteria

1. THE Workspace_Root SHALL contain a root `package.json` with a `workspaces` field listing `["apps/*", "shared"]` so that `bun install` at root installs dependencies for all apps.
2. THE Workspace_Root root `package.json` SHALL include workspace-level scripts: `dev:admissions`, `build:admissions`, `test:admissions`, and `lint:admissions` that delegate to the admissions app.
3. THE Workspace_Root SHALL contain an updated `.gitignore` covering the new monorepo structure (node_modules in all app dirs, Python artifacts in backend/).
4. THE Workspace_Root SHALL contain a root `README.md` describing the monorepo layout, listing all projects, and documenting how to set up, develop, and deploy each one.

### Requirement 9: Frontend Test Migration

**User Story:** As a developer, I want frontend tests relocated to the admissions app directory with updated import paths, so that tests run correctly from the new monorepo location.

#### Acceptance Criteria

1. WHEN the `tests/` directory is moved to `apps/admissions/tests/`, ALL test files SHALL have their import paths updated to reflect the new location relative to `apps/admissions/src/`.
2. THE `apps/admissions/vitest.config.ts` SHALL configure test discovery to find tests in `apps/admissions/tests/`.
3. THE `apps/admissions/playwright.config.ts` SHALL configure E2E test discovery to find specs in `apps/admissions/tests/e2e/`.
4. AFTER the migration, running `bun run test` from `apps/admissions/` SHALL execute all unit, property, UI, and integration tests successfully.
5. THE `apps/admissions/package.json` SHALL include `test`, `test:unit`, `test:property`, and `test:e2e` scripts.

### Requirement 6: Update Frontend API Client for Django Backend

**User Story:** As a frontend developer, I want the ApiClient to point to the Django API at `api.mihas.edu.zm/api/v1/`, so that the frontend communicates exclusively with the production Django backend.

#### Acceptance Criteria

1. THE ApiClient SHALL use `https://api.mihas.edu.zm/api/v1` as the base URL via the `VITE_API_BASE_URL` environment variable.
2. THE ApiClient SHALL NOT contain references to Vercel Functions, `api-src/`, or `lib/` backend utilities.
3. THE Admissions_App SHALL set `VITE_API_BASE_URL=https://api.mihas.edu.zm/api/v1` in its production environment configuration.
4. WHEN the ApiClient constructs request URLs, THE ApiClient SHALL use the Django REST-style path format (e.g., `/auth/login/`) instead of query parameter routing (e.g., `/api/auth?action=login`).
5. THE ApiClient SHALL remove or update the `normalizeEndpoint` method to stop translating REST-style paths into query parameter format.
6. THE Admissions_App `package.json` SHALL NOT include backend-only dependencies: `@arcjet/decorate`, `@arcjet/node`, `@aws-sdk/client-sqs`, `@neondatabase/serverless`, `bcryptjs`, `cors`, `express`, `jose`, `node-fetch`, `pg`, `resend`, `web-push`, and their associated `@types/` packages.
7. ALL frontend service files, hooks, and components that make API calls SHALL be updated to use Django REST-style paths (e.g., `/applications/` instead of `/api/applications?action=details`). This includes files in `services/`, `hooks/queries/`, `hooks/auth/`, and `contexts/AuthContext`.

### Requirement 7: Update Steering Files for Monorepo Structure

**User Story:** As a developer using AI assistants, I want the Kiro steering files to accurately describe the monorepo layout and deployment strategy, so that AI tools provide correct guidance.

#### Acceptance Criteria

1. WHEN the monorepo restructure is complete, THE Steering_Files SHALL describe the new directory layout: `backend/`, `apps/admissions/`, `apps/website/`, `apps/student-portal/`, `shared/`, `docs/`.
2. THE Steering_Files SHALL NOT contain references to Vercel Functions, Arcjet, `api-src/`, or `lib/` as active backend components.
3. THE Steering_Files SHALL document that each app in `apps/` is independently deployable to Vercel with its own `package.json` and `vercel.json`.
4. THE Steering_Files SHALL document that the Backend in `backend/` is independently deployable to Koyeb.
5. THE `tech.md` steering file SHALL remove the "Legacy Backend (Vercel Functions)" section and all Vercel Function patterns, conventions, and endpoint tables.
6. THE `structure.md` steering file SHALL replace the flat directory rules with monorepo directory rules reflecting the new layout.
7. THE `product.md` steering file SHALL update the migration state table to mark the Node.js backend removal as complete and the monorepo restructure as complete.
