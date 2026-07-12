# Implementation Plan: Production Stability Hardening

## Overview

Four-phase implementation covering intake date automation (backend), PWA artifact cleanup (frontend), session & auth hardening (frontend + backend verification), and final cross-cutting verification. Each phase builds incrementally and ends with a checkpoint.

## Tasks

- [x] 1. Phase 1 — Intake Date Automation (Backend)
  - [x] 1.1 Create `IntakeDateComputer` pure function module
    - Create `backend/apps/catalog/intake_date_computer.py`
    - Implement `ComputedIntakeDates` frozen dataclass with fields: `name`, `year`, `start_date`, `application_start_date`, `application_deadline`
    - Implement `compute_intake_dates(intake_month, intake_year)` — validates month is 1 or 7, computes `application_start_date` as 11 months before `start_date`, `application_deadline` as 2 months after `start_date`
    - Implement `get_next_intake_month_year(after: date)` — returns next (month, year) in the Jan/Jul pattern after the given date
    - Implement `ensure_minimum_open_intakes(today, existing_intakes, min_open=2)` — returns list of `ComputedIntakeDates` to create, skipping any that match existing intake `name`+`year`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.5_

  - [x] 1.2 Write property test: intake date computation invariants
    - Create `backend/tests/property/test_intake_date_computation_properties.py`
    - **Property 1: Intake date computation invariants**
    - For any valid intake month (1 or 7) and year in [2024, 2100], verify `application_start_date` is exactly 11 months before `start_date`, `application_deadline` is exactly 2 months after `start_date`, ordering holds, and `name`/`year` are correct
    - Use `@settings(max_examples=100)`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.3**

  - [x] 1.3 Write property test: always 2 open intakes
    - Create `backend/tests/property/test_intake_open_count_properties.py`
    - **Property 2: Always 2 open intakes**
    - For any date and any set of existing intakes (including empty), after `ensure_minimum_open_intakes`, combined set has >= 2 open intakes. Running again produces zero additional intakes (idempotency).
    - Use `@settings(max_examples=100)`
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.5, 3.3**

  - [x] 1.4 Create `intake_manager_task` Celery task
    - Create `backend/apps/catalog/tasks.py`
    - Implement `intake_manager_task` as `@shared_task(bind=True, max_retries=2, default_retry_delay=300)`
    - Task queries existing active intakes, calls `ensure_minimum_open_intakes`, creates new `Intake` rows with `is_active=True` and `current_enrollment=0`
    - On duplicate (same `name`+`year`), skip and log warning
    - On failure, log to `ErrorLog` pipeline and dispatch alert email
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.4_

  - [x] 1.5 Register task in Celery Beat and create management command
    - Add `"manage-intakes"` entry to `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py` with `crontab(hour=4, minute=0)`
    - Create `backend/apps/catalog/management/commands/manage_intakes.py` that calls `intake_manager_task.apply()`
    - _Requirements: 3.1, 3.2, 3.5_

  - [x] 1.6 Write unit tests for intake manager task
    - Create `backend/tests/unit/test_intake_manager_task.py`
    - Test task registration in `CELERY_BEAT_SCHEDULE`
    - Test management command invocation
    - Test error logging on failure
    - Test idempotency — running twice produces same result
    - Test duplicate skip with warning log
    - _Requirements: 3.1, 3.3, 3.4, 3.5_

- [x] 2. Checkpoint — Phase 1 complete
  - Ensure all backend tests pass with `cd backend && python3 -m pytest`
  - Ask the user if questions arise.

- [x] 3. Phase 2 — PWA Cleanup (Frontend)
  - [x] 3.1 Remove PWA dependencies from `package.json`
    - Remove `vite-plugin-pwa` from dependencies in `apps/admissions/package.json`
    - Remove all `workbox-*` packages from devDependencies
    - Remove `generate:pwa-assets` script if present
    - _Requirements: 4.1_

  - [x] 3.2 Remove PWA type references
    - Remove `/// <reference types="vite-plugin-pwa/client" />` from `apps/admissions/src/vite-env.d.ts`
    - Remove `"vite-plugin-pwa/client"` from `types` array in `apps/admissions/tsconfig.build.json`
    - Verify `vite.config.ts` does not reference `vite-plugin-pwa` in its plugin array
    - _Requirements: 4.2, 4.5_

  - [x] 3.3 Delete dead PWA test files
    - Delete `apps/admissions/tests/unit/serviceWorkerCache.test.ts`
    - Delete `apps/admissions/tests/property/swAuthEndpointsNeverCached.property.test.ts`
    - _Requirements: 5.1, 5.2_

  - [x] 3.4 Update surviving test files to remove SW references
    - In `apps/admissions/tests/property/postMigrationQaBugs.property.test.ts`: remove service worker activation and cache purge test cases, keep non-SW cases
    - In `apps/admissions/tests/unit/appGlobalLazyLoading.test.ts`: remove assertions referencing `ServiceWorkerUpdatePrompt` or `OfflineIndicator`
    - _Requirements: 5.3, 5.4_

  - [x] 3.5 Clean up runtime PWA dead code
    - In `apps/admissions/src/services/pushNotificationManager.ts`: add `@deprecated` JSDoc annotation and TODO comment explaining push notifications depend on a removed service worker
    - Verify `apps/admissions/src/lib/lazyImportRecovery.ts` retains its SW unregistration logic (defensive cleanup)
    - Verify `apps/admissions/src/lib/hardReload.ts` retains its SW unregistration logic (defensive cleanup)
    - Verify `apps/admissions/src/main.tsx` retains the one-time SW unregistration block (90-day rollover)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 3.6 Write property test: no PWA artifacts in build output
    - Create `apps/admissions/tests/property/pwaArtifactAbsence.property.test.ts`
    - **Property 3: No PWA artifacts in build output**
    - For any file in `dist/`, filename must not match `sw.js`, `service-worker.js`, `workbox-*.js`, or `manifest.webmanifest`. No JS file in build output shall contain `workbox` or `serviceWorker.register`.
    - Use `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 4.3, 4.4**

  - [x] 3.7 Write unit tests for PWA cleanup verification
    - Create `apps/admissions/tests/unit/pwaPackageRemoval.test.ts`
    - Verify `package.json` has no PWA deps
    - Verify `vite-env.d.ts` has no PWA reference
    - Verify `tsconfig.build.json` has no PWA type
    - Verify deleted test files don't exist
    - Verify `pushNotificationManager.ts` has `@deprecated` annotation
    - Verify `main.tsx` still contains SW unregistration block
    - _Requirements: 4.1, 4.2, 5.1, 5.2, 5.5, 6.2, 6.5_

- [x] 4. Checkpoint — Phase 2 complete
  - Ensure all frontend tests pass with `cd apps/admissions && bun run test`
  - Ensure build succeeds with `cd apps/admissions && bun run build`
  - Ask the user if questions arise.

- [x] 5. Phase 3 — Session & Auth Hardening (Frontend + Backend Verification)
  - [x] 5.1 Verify and harden `useSessionListener` deduplication
    - In `apps/admissions/src/hooks/auth/useSessionListener.ts`: verify `refetchOnMount: true` and `refetchOnWindowFocus: false` on the session query
    - Verify `useAuthCheck` configures its observer with `refetchOnMount: false`
    - Fix if any config deviates from the design
    - _Requirements: 7.1, 7.2, 7.4_

  - [x] 5.2 Verify and harden `AuthContext` visibility guard
    - In `apps/admissions/src/contexts/AuthContext.tsx`: verify `hasHiddenOnce` flag is set to `true` only on `hidden` transition
    - Verify visibility handler only invalidates `['auth', 'session']` when `hasHiddenOnce === true` and transitioning to `visible`
    - Verify `pageshow` handler with `event.persisted === true` sets `pendingValidation: true` and invalidates session query
    - Fix if any behavior deviates from the design
    - _Requirements: 7.3, 7.5, 9.1, 9.2, 9.3, 9.4_

  - [x] 5.3 Verify and harden `ApiClient` 401 intercept-refresh-retry
    - In `apps/admissions/src/services/client.ts`: verify single refresh attempt via `attemptRefresh()` with promise-lock dedup
    - Verify retry of original request on successful refresh
    - Verify `onAuthFailure` callback invoked on refresh failure
    - Fix if any behavior deviates from the design
    - _Requirements: 8.7, 8.8_

  - [x] 5.4 Verify and harden `onAuthFailure` cascade
    - In `apps/admissions/src/contexts/AuthContext.tsx`: verify the callback clears React Query cache, CSRF token store, and secure storage
    - Verify `mihas:auth-expired` CustomEvent dispatched with `from` and `signInPath` in detail
    - Verify current URL stored in `sessionStorage` under `mihas:post-auth-redirect`
    - Verify no `window.location` hard redirect
    - Fix if any behavior deviates from the design
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 5.5 Verify backend `RefreshView` and JTI blacklist behavior
    - In `backend/apps/accounts/views.py`: verify `RefreshView` returns 200 with rotated cookies on valid refresh, 401 with `INVALID_TOKEN` on missing cookie, 401 with `TOKEN_EXPIRED` on expired/blacklisted token
    - In `backend/apps/accounts/tokens.py`: verify `is_jti_blacklisted` fails-closed (returns `True`) when Redis is unreachable
    - Verify rotated `X-CSRF-Token` header in 200 response
    - Fix if any behavior deviates from the design
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 5.6 Write property test: exactly 1 session call on page load
    - Create `apps/admissions/tests/property/sessionDeduplication.property.test.ts`
    - **Property 4: Exactly 1 session call on page load**
    - Mock fetch, mount `useSessionListener` and `useAuthCheck` concurrently, assert exactly one `GET /api/v1/auth/session/` call
    - Use `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 7.1, 7.2, 7.4**

  - [x] 5.7 Write property test: token refresh succeeds with valid refresh token
    - Create `backend/tests/property/test_token_refresh_properties.py`
    - **Property 5: Token refresh succeeds with valid refresh token**
    - For any valid, non-expired, non-blacklisted refresh token, `rotate_tokens` returns new valid pair, old JTI is blacklisted, new tokens have same `user_id`/`role`
    - Use `@settings(max_examples=100)`
    - **Validates: Requirements 8.1, 8.6**

  - [x] 5.8 Write property test: visibility guard prevents initial-load revalidation
    - Create `apps/admissions/tests/property/visibilityGuard.property.test.ts`
    - **Property 6: Visibility guard prevents initial-load revalidation**
    - For any sequence of visibility events, handler only invalidates when `hidden→visible` AND `hasHiddenOnce === true`. Flag only set on `hidden` transition. Initial `visible` does not trigger revalidation.
    - Use `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 7.3, 7.5, 9.1, 9.2, 9.4**

  - [x] 5.9 Write property test: API client single-refresh-then-cascade on 401
    - Create `apps/admissions/tests/property/apiClient401Cascade.property.test.ts`
    - **Property 7: API client single-refresh-then-cascade on 401**
    - For any non-auth 401, exactly one refresh attempt. On success, retry once. On failure, `onAuthFailure` invoked exactly once.
    - Use `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 8.7, 8.8**

  - [x] 5.10 Write property test: auth failure cascade clears all state
    - Create `apps/admissions/tests/property/authFailureCascade.property.test.ts`
    - **Property 8: Auth failure cascade clears all state**
    - For any `onAuthFailure` invocation: session query set to null, `queryClient.clear()` called, CSRF cleared, secure storage cleared, `mihas:auth-expired` dispatched with correct detail, URL stored in sessionStorage. No `window.location` assignment.
    - Use `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

- [x] 6. Checkpoint — Phase 3 complete
  - Ensure all backend tests pass with `cd backend && python3 -m pytest`
  - Ensure all frontend tests pass with `cd apps/admissions && bun run test`
  - Ask the user if questions arise.

- [x] 7. Phase 4 — Final Verification
  - [x] 7.1 Run full backend test suite and fix any failures
    - Run `cd backend && python3 -m pytest` and resolve any regressions
    - Verify `manage_intakes` management command is callable
    - _Requirements: 3.3, 3.5_

  - [x] 7.2 Run full frontend test suite and build, fix any failures
    - Run `cd apps/admissions && bun run test` and resolve any regressions
    - Run `cd apps/admissions && bun run build` and verify no PWA artifacts in `dist/`
    - Run `cd apps/admissions && bun run lint` and resolve any lint errors
    - _Requirements: 4.3, 4.4, 5.5_

- [x] 8. Final checkpoint — All phases complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between phases
- Property tests validate universal correctness properties from the design document
- Backend property tests use pytest + hypothesis with `@settings(max_examples=100)`
- Frontend property tests use vitest + fast-check with `{ numRuns: 100 }`
- Backend tests go in `backend/tests/property/`
- Frontend tests go in `apps/admissions/tests/property/` and `apps/admissions/tests/unit/`
