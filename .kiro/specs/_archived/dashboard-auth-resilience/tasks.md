# Tasks — Dashboard Auth Resilience Bugfix

## Bug 1: DELETE 404 on Stale Draft References

- [x] 1.1 Harden `applicationService.delete` 404 handling in `apps/admissions/src/services/applications.ts`
  - Verify that the existing `.status === 404` catch works with `ApiErrorHandler.enhanceError` output
  - If the enhanced error strips `.status`, add a fallback check (e.g., error message contains "not found" or check before enhancement)
  - Ensure the method returns `{ success: true }` for 404 responses without throwing

- [x] 1.2 Update `deleteDraft` in `apps/admissions/src/lib/applicationSession.ts` to treat 404 rejections as successes
  - After `Promise.allSettled`, filter `failedDeletes` to exclude rejections where the reason indicates a 404 (already-deleted resource)
  - Only count genuinely failed deletes (500, 403, network errors) toward the failure count

- [x] 1.3 Add per-ID stale reference cleanup in `deleteDraft`
  - After the delete loop, call `clearStaleApplicationDraftReference(id)` for each draft ID that was attempted (200 or 404)
  - Move `this.clearAllLocalStorage()` to run after the delete loop when all results are 200 or 404

- [x] 1.4 Write unit tests for DELETE 404 resilience
  - Test `applicationService.delete` with mocked 404 response → returns `{ success: true }`
  - Test `deleteDraft` with all-404 responses → returns `{ success: true }`
  - Test `deleteDraft` with mixed 200/404 responses → returns `{ success: true }`
  - Test `deleteDraft` with mixed 200/500 responses → returns `{ success: false }`
  - Test `deleteDraft` calls `clearStaleApplicationDraftReference` for each attempted ID
  - Place tests in `apps/admissions/tests/unit/`

- [x] 1.5 [PBT] Property test: deleteDraft success iff all responses are 200 or 404
  - Generate random arrays of draft IDs (1–10) with random response codes per ID (200, 404, 500, 403)
  - Assert: `deleteDraft` returns `{ success: true }` iff every response code is 200 or 404
  - Assert: `deleteDraft` returns `{ success: false }` if any response code is not 200 or 404
  - Use fast-check, place in `apps/admissions/tests/property/`

## Bug 2: Auth Refresh 401 Clean Redirect

- [x] 2.1 Reduce console noise on auth refresh failure path in `apps/admissions/src/services/client.ts`
  - Change `logger.warn('[API Client] 401 Unauthorized - attempting token refresh')` to `console.debug` level
  - Ensure the `onAuthFailure` callback path does not produce `console.error` output
  - Verify `performRefresh` failure path remains silent (already catches errors)

- [x] 2.2 Write unit test for clean auth redirect on refresh 401
  - Mock `/api/v1/auth/refresh/` to return 401
  - Verify `onAuthFailure` callback is invoked
  - Verify no `console.error` or `console.warn` calls during the cascade
  - Place test in `apps/admissions/tests/unit/`

## Bug 3: SSE authFailed Flag — No Further Probes

- [x] 3.1 Guard probe dispatch with authFailed check in `apps/admissions/src/lib/sseClient.ts`
  - In the `onerror` handler, add `if (authFailed) return` before the `probeEndpointForAuth()` call
  - This prevents any probe dispatch after auth failure is detected, even if the EventSource fires another error

- [x] 3.2 Write unit test for SSE no-probe-after-authFailed
  - Create SSE client, simulate auth failure detection (set authFailed via probe returning 401)
  - Trigger another `onerror` event
  - Assert `probeEndpointForAuth` is NOT called again
  - Assert `connect()` returns immediately when `authFailed === true`
  - Place test in `apps/admissions/tests/unit/`

- [x] 3.3 [PBT] Property test: SSE client never probes after authFailed
  - Generate random sequences of SSE events (connect, error, auth-failure, error, error)
  - Assert: after any event sets `authFailed = true`, zero subsequent probes are dispatched
  - Use fast-check, place in `apps/admissions/tests/property/`

## Verification

- [x] 4.1 Run `cd apps/admissions && bun run test` to verify all new and existing tests pass
- [x] 4.2 Run `cd apps/admissions && bun run lint` to verify no lint regressions
- [x] 4.3 Run `cd apps/admissions && bun run build` to verify production build succeeds
