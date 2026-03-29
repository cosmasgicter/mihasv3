# Implementation Plan: Monorepo Restructure

## Overview

This plan implements the monorepo restructure in strict priority order: P0 production fixes first (Redis JTI blacklist, async SSE/ASGI migration), then legacy cleanup (delete Node.js backend, stale files), then monorepo restructure (directory moves, frontend API client update, steering files, root tooling, test migration). Each tier ends with a checkpoint.

## Tasks

- [x] 1. P0: Migrate JTI blacklist from in-memory set to Redis
  - [x] 1.1 Implement Redis-backed `blacklist_jti()` and `is_jti_blacklisted()` in `django_api/apps/accounts/tokens.py`
    - Replace `_blacklisted_jtis` set and `_blacklist_lock` with Redis operations
    - Add `_get_redis()` lazy-init helper using `CELERY_BROKER_URL` (same Upstash Redis)
    - `blacklist_jti(jti, ttl_seconds=604800)` — SETEX with 7-day TTL, fail-open on write errors (log and continue)
    - `is_jti_blacklisted(jti)` — EXISTS check, fail-closed on read errors (return True)
    - Use `jti:` key prefix to namespace away from Celery broker keys
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.2 Update `rotate_tokens()` and `verify_token()` to use Redis-backed functions
    - `rotate_tokens()` — call `blacklist_jti(old_jti)` instead of `_blacklisted_jtis.add()`
    - `verify_token()` — call `is_jti_blacklisted(jti)` instead of checking `_blacklisted_jtis`
    - Remove `_blacklisted_jtis` set and `_blacklist_lock` globals entirely
    - _Requirements: 1.1, 1.2, 1.6_

  - [x]* 1.3 Write property test for JTI blacklist round-trip
    - **Property 1: JTI Blacklist Round-Trip**
    - Generate random UUID strings with hypothesis, blacklist them via `blacklist_jti()`, verify `is_jti_blacklisted()` returns True
    - Generate non-blacklisted UUIDs, verify `is_jti_blacklisted()` returns False
    - Use `fakeredis` for test isolation
    - File: `django_api/tests/property/test_jti_blacklist_properties.py`
    - Tag: `# Feature: monorepo-restructure, Property 1: JTI Blacklist Round-Trip`
    - `@settings(max_examples=100)`
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [x]* 1.4 Write unit tests for Redis failure modes
    - Test fail-open write: mock Redis to raise `RedisError` on `setex`, verify `blacklist_jti()` does not raise
    - Test fail-closed read: mock Redis to raise `RedisError` on `exists`, verify `is_jti_blacklisted()` returns True
    - Test TTL correctness: blacklist a JTI, verify Redis key has TTL ≈ 604800s
    - File: `django_api/tests/unit/test_jti_blacklist.py`
    - _Requirements: 1.4, 1.5_

- [x] 2. P0: Migrate SSE to async views and switch from gunicorn to uvicorn
  - [x] 2.1 Convert `SSEStreamView` and `_event_stream` to async in `django_api/apps/common/sse.py`
    - Convert `_event_stream()` to `async def _async_event_stream()` using `asyncio.sleep` instead of `time.sleep`
    - Wrap ORM notification query in `sync_to_async` (new `_fetch_notifications()` helper)
    - Convert `SSEStreamView.get()` to `async def get()`
    - Add try/except around DB query — log error and continue sending keepalive pings on failure
    - Preserve `SSEPollView` as a sync view (polling fallback)
    - Maintain 8-second keepalive interval and 30-second max duration
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 2.7, 2.8_

  - [x] 2.2 Switch from gunicorn to uvicorn in Dockerfile and dependencies
    - Update `django_api/Dockerfile` CMD from `gunicorn config.wsgi:application --config gunicorn.conf.py` to `uvicorn config.asgi:application --host 0.0.0.0 --port $PORT --workers 3`
    - Add `uvicorn[standard]` to `django_api/requirements.txt`
    - Delete `django_api/gunicorn.conf.py`
    - Verify `django_api/config/asgi.py` exists and serves as the ASGI entry point
    - _Requirements: 2.1, 2.5, 2.9_

  - [x]* 2.3 Write property test for SSE keepalive timing and duration
    - **Property 2: SSE Keepalive Timing and Duration**
    - Create async SSE stream for a test user, collect events with timestamps
    - Verify keepalive intervals ≈ 8s and total duration ≤ 30s
    - File: `django_api/tests/property/test_sse_properties.py`
    - Tag: `# Feature: monorepo-restructure, Property 2: SSE Keepalive Timing and Duration`
    - `@settings(max_examples=100)`
    - **Validates: Requirements 2.4**

  - [x]* 2.4 Write property test for SSE notification emission
    - **Property 3: SSE Notification Emission**
    - Generate random Notification objects, create SSE stream, verify each notification appears as a properly formatted SSE event with id, title, message, type, created_at fields
    - File: `django_api/tests/property/test_sse_properties.py`
    - Tag: `# Feature: monorepo-restructure, Property 3: SSE Notification Emission`
    - `@settings(max_examples=100)`
    - **Validates: Requirements 2.6**

  - [x]* 2.5 Write unit tests for async SSE error handling
    - Test DB failure resilience: mock DB to raise, verify stream continues with keepalive pings
    - Test poll fallback preserved: verify `SSEPollView` returns unread notifications as sync response
    - File: `django_api/tests/unit/test_sse_async.py`
    - _Requirements: 2.7, 2.8_

- [x] 3. Checkpoint — P0 fixes complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify Redis JTI blacklist works with `fakeredis` in tests
  - Verify async SSE stream yields events correctly
  - Verify Dockerfile CMD uses uvicorn, gunicorn.conf.py is deleted, uvicorn[standard] is in requirements.txt

- [x] 4. Delete legacy Node.js backend artifacts
  - Delete `api-src/` directory entirely
  - Delete `api/` directory entirely
  - Delete `lib/` directory entirely
  - Delete `local-server.js`
  - Delete `_routes.json`
  - Verify retained frontend files are untouched: `src/`, `public/`, `index.html`, `package.json`, `vite.config.ts`, `tailwind.config.js`, `tsconfig.json`, `eslint.config.js`, `postcss.config.js`, `components.json`, `bunfig.toml`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 5. Clean up miscellaneous stale files
  - Delete: `duplicate.md`, `test-results.txt`, `POST_REMEDIATION_AUDIT.md`, `codexCLI.md`, `jules.md`, `Issues`, `skills-lock.json`
  - Delete `vercel.json` (legacy Vercel config)
  - Verify `vercel.frontend-only.json` still exists (will be relocated during restructure)
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Checkpoint — Cleanup complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify no legacy Node.js files remain at workspace root
  - Verify no stale documentation files remain

- [x] 7. Restructure repository into monorepo layout
  - [x] 7.1 Move Django backend to `backend/`
    - Move `django_api/` → `backend/`
    - Move `migrations/` (legacy SQL files) → `backend/migrations/`
    - Verify `backend/Dockerfile`, `backend/manage.py`, `backend/requirements.txt` exist
    - Backend remains independently deployable to Koyeb
    - _Requirements: 5.1, 5.9, 5.11_

  - [x] 7.2 Move admissions frontend to `apps/admissions/`
    - Move `src/` → `apps/admissions/src/`
    - Move `public/` → `apps/admissions/public/`
    - Move `index.html` → `apps/admissions/index.html`
    - Move frontend config files to `apps/admissions/`: `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `eslint.config.js`, `components.json`, `bunfig.toml`, `playwright.config.ts`
    - Rename `vercel.frontend-only.json` → `apps/admissions/vercel.json`
    - Create `apps/admissions/package.json` with only frontend dependencies (strip backend-only deps)
    - Update `apps/admissions/vite.config.ts` paths for new directory structure
    - _Requirements: 5.2, 5.8_

  - [x] 7.3 Create placeholder app directories
    - Create `apps/website/package.json` and `apps/website/README.md` (future MIHAS main website)
    - Create `apps/student-portal/package.json` and `apps/student-portal/README.md` (future student management system)
    - Create `shared/package.json` (shared types, utilities, design tokens)
    - Ensure `docs/` directory exists at workspace root
    - _Requirements: 5.3, 5.4, 5.5, 5.6_

- [ ] 8. Update frontend API client for Django REST paths
  - [ ] 8.1 Rewrite `normalizeEndpoint()` in `apps/admissions/src/services/client.ts`
    - Remove the query-parameter translation logic entirely
    - The client should pass Django REST-style paths directly (e.g., `/auth/login/`)
    - Ensure `API_BASE` reads from `VITE_API_BASE_URL` pointing to `***REMOVED***/api/v1`
    - _Requirements: 6.1, 6.4, 6.5_

  - [ ] 8.2 Update all frontend service files, hooks, and components to use Django REST-style paths
    - Update files in `apps/admissions/src/services/`, `apps/admissions/src/hooks/queries/`, `apps/admissions/src/hooks/auth/`, `apps/admissions/src/contexts/AuthContext`
    - Replace all query-parameter-style paths (e.g., `/api/auth?action=login`) with REST-style paths (e.g., `/auth/login/`)
    - Follow the path mapping table in the design document
    - Remove any references to Vercel Functions, `api-src/`, or `lib/` backend utilities
    - _Requirements: 6.2, 6.4, 6.7_

  - [ ] 8.3 Remove backend-only dependencies from `apps/admissions/package.json`
    - Remove: `@arcjet/decorate`, `@arcjet/node`, `@aws-sdk/client-sqs`, `@neondatabase/serverless`, `bcryptjs`, `cors`, `express`, `jose`, `node-fetch`, `pg`, `resend`, `web-push`, and their `@types/` packages
    - Set `VITE_API_BASE_URL=***REMOVED***/api/v1` in production env config
    - _Requirements: 6.3, 6.6_

  - [ ]* 8.4 Write property test for API client REST-style path format
    - **Property 4: API Client REST-Style Path Format**
    - Generate random endpoint paths from the known endpoint set using fast-check
    - Verify constructed URLs use REST-style paths with trailing slashes and no `?action=` parameters
    - File: `apps/admissions/tests/property/test_api_client_paths.property.ts`
    - Tag: `// Feature: monorepo-restructure, Property 4: API Client REST-Style Path Format`
    - `{ numRuns: 100 }`
    - **Validates: Requirements 6.4**

  - [ ]* 8.5 Write unit tests for API client and package deps
    - Test `normalizeEndpoint` removal: verify no query-parameter translation occurs
    - Test no backend deps in admissions `package.json`: parse and verify excluded deps are absent
    - Files: `apps/admissions/tests/unit/test_api_client.test.ts`, `apps/admissions/tests/unit/test_package_deps.test.ts`
    - _Requirements: 6.5, 6.6_

- [ ] 9. Checkpoint — Restructure and API client update complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify monorepo directory structure matches target state in design document
  - Verify frontend API client uses Django REST-style paths exclusively

- [ ] 10. Migrate frontend tests to `apps/admissions/tests/`
  - [ ] 10.1 Move `tests/` directory to `apps/admissions/tests/` and update import paths
    - Move all test files from `tests/` → `apps/admissions/tests/`
    - Update all import paths in test files to reflect new location relative to `apps/admissions/src/`
    - _Requirements: 9.1_

  - [ ] 10.2 Update test configuration files for new monorepo location
    - Update `apps/admissions/vitest.config.ts` to discover tests in `apps/admissions/tests/`
    - Update `apps/admissions/playwright.config.ts` to discover E2E specs in `apps/admissions/tests/e2e/`
    - Add `test`, `test:unit`, `test:property`, and `test:e2e` scripts to `apps/admissions/package.json`
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

- [x] 11. Set up root monorepo tooling
  - [x] 11.1 Create root `package.json` with workspace configuration
    - Set `"workspaces": ["apps/*", "shared"]` for bun workspace support
    - Add workspace scripts: `dev:admissions`, `build:admissions`, `test:admissions`, `lint:admissions` delegating to `apps/admissions/`
    - _Requirements: 8.1, 8.2_

  - [x] 11.2 Update root `.gitignore` and create root `README.md`
    - Update `.gitignore` for monorepo structure (node_modules in all app dirs, Python artifacts in backend/, etc.)
    - Create root `README.md` describing monorepo layout, listing all projects, and documenting setup/dev/deploy for each
    - _Requirements: 8.3, 8.4_

- [ ] 12. Update steering files for monorepo structure
  - [ ] 12.1 Update `.kiro/steering/tech.md`
    - Remove "Legacy Backend (Vercel Functions)" section and all Vercel Function patterns/conventions/endpoint tables
    - Update directory table to reflect `backend/`, `apps/admissions/`, etc.
    - Update commands table for monorepo layout
    - _Requirements: 7.5_

  - [ ] 12.2 Update `.kiro/steering/structure.md`
    - Replace flat directory rules with monorepo directory rules reflecting new layout
    - Update import paths, test locations, API development workflow
    - _Requirements: 7.6_

  - [ ] 12.3 Update `.kiro/steering/product.md`
    - Update migration state table: mark Node.js backend removal as complete, monorepo restructure as complete
    - _Requirements: 7.7_

  - [ ] 12.4 Verify all steering files reflect monorepo layout
    - Ensure no references to Vercel Functions, Arcjet, `api-src/`, or `lib/` as active backend components
    - Ensure each app in `apps/` documented as independently deployable to Vercel
    - Ensure `backend/` documented as independently deployable to Koyeb
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 13. Final checkpoint — All tasks complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify monorepo directory structure matches target state
  - Verify backend deploys independently (Dockerfile uses uvicorn, no gunicorn.conf.py)
  - Verify frontend builds from `apps/admissions/` with `bun run build`
  - Verify all frontend tests pass from `apps/admissions/` with `bun run test`

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between tiers
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples, edge cases, and error conditions
- P0 fixes (tasks 1-2) are production blockers and must be completed first
- Cleanup (tasks 4-5) removes dead code before restructuring to avoid moving unnecessary files
- The `.kiro/` directory stays at workspace root throughout all moves
