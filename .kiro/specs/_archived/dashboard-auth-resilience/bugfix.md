# Bugfix Requirements Document

## Introduction

Three related production resilience issues on the MIHAS admissions dashboard affect the student experience when stale state (localStorage references, expired auth tokens) collides with backend reality. Bug 1 is the primary fix: the "Clear Draft" flow can surface a user-visible error when deleting an application that no longer exists on the server. Bugs 2 and 3 are verification/hardening tasks for the auth refresh cascade and SSE reconnection behavior.

**Affected surface:** `apps/admissions/` — student Dashboard, auth cascade (`services/client.ts`, `contexts/AuthContext.tsx`), SSE client (`lib/sseClient.ts`), draft management (`lib/applicationSession.ts`, `lib/draftManager.ts`).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a student clicks "Clear All Drafts" on the dashboard AND localStorage holds a stale `applicationId` referencing a server-side application that was already deleted or cleaned up THEN the `deleteDraft` flow in `applicationSession.ts` lists draft applications from the server, may receive the stale ID in the list response (from cache or race condition), attempts `DELETE /api/v1/applications/{id}/`, and if the 404 is not caught at every layer the frontend shows an error toast to the user despite the intended outcome (removal) already being achieved.

1.2 WHEN `applicationService.delete` receives a 404 response from the backend for a draft deletion AND the error passes through `ApiErrorHandler.enhanceError` which rewrites the error message THEN the `deleteDraft` method in `applicationSession.ts` counts the result as a failed delete via `Promise.allSettled`, returns `{ success: false }`, and the Dashboard's `handleClearAllDrafts` displays an error toast and sets `applicationsError`.

1.3 WHEN a draft application is successfully deleted on the server (or was already gone) but `clearAllDrafts` returns a failure result THEN the stale `applicationId` reference in localStorage may not be cleaned up, causing the "draft exists" indicator to reappear on the next dashboard load.

1.4 WHEN the `/api/v1/auth/refresh/` endpoint returns 401 because the refresh token's JTI was blacklisted from a previous session rotation THEN the auth cascade in `services/client.ts` invokes `onAuthFailure` which dispatches `mihas:auth-expired` and clears caches, but console errors from the failed refresh fetch and downstream SSE probe failures are logged visibly, creating noise in production debugging.

1.5 WHEN the SSE client detects an auth failure (401/403 via HEAD probe) and sets `authFailed = true` THEN the SSE client correctly stops reconnecting, but if the auth cascade redirect is slow or the page remains mounted, additional HEAD probes may fire before the cooldown takes effect, producing repeated network requests in the browser's network log.

### Expected Behavior (Correct)

2.1 WHEN a student clicks "Clear All Drafts" on the dashboard AND `applicationService.delete` receives a 404 response for any draft application ID THEN the system SHALL treat the 404 as a successful delete (the goal was removal and the resource is already gone), clear the stale localStorage reference, and return `{ success: true }` from the `deleteDraft` flow without showing an error toast.

2.2 WHEN `deleteDraft` in `applicationSession.ts` iterates over draft IDs and calls `applicationService.delete` for each THEN the system SHALL treat any individual 404 result from `Promise.allSettled` as a fulfilled (successful) outcome when counting failed deletes, so that a mix of 200 and 404 responses does not produce a failure result.

2.3 WHEN a draft deletion completes (whether via 200 or 404) THEN the system SHALL call `clearStaleApplicationDraftReference` for each deleted/missing application ID and remove all localStorage entries referencing that ID, ensuring the "draft exists" indicator does not reappear on subsequent dashboard loads.

2.4 WHEN the `/api/v1/auth/refresh/` endpoint returns 401 (blacklisted JTI from a previous session) THEN the auth cascade SHALL redirect to sign-in cleanly, clearing all caches and dispatching `mihas:auth-expired`, without logging console errors that would be visible in production monitoring.

2.5 WHEN the SSE client is in `authFailed` state THEN the SSE client SHALL NOT attempt any further HEAD probes or reconnection attempts, and the `connect()` method SHALL return immediately without scheduling any network requests.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a student clicks "Clear All Drafts" AND all draft applications exist on the server and are successfully deleted (200 responses) THEN the system SHALL CONTINUE TO delete them, clear localStorage, show a success toast, and update the dashboard to remove draft entries.

3.2 WHEN `applicationService.delete` receives a non-404 error (e.g., 500, 403, network failure) THEN the system SHALL CONTINUE TO treat it as a genuine failure, propagate the error, and show an appropriate error message to the user.

3.3 WHEN the auth refresh succeeds (200 response with rotated tokens) THEN the system SHALL CONTINUE TO retry the original failed request with the new credentials and complete the operation transparently.

3.4 WHEN the SSE client encounters a non-auth connection error (network timeout, QUIC failure) THEN the system SHALL CONTINUE TO apply exponential backoff reconnection and rapid-failure detection leading to polling fallback after 3 rapid failures.

3.5 WHEN the SSE client is in `retriesExhausted` state (from rapid failures, not auth) and the page becomes visible again THEN the system SHALL CONTINUE TO NOT reconnect, preserving the polling fallback behavior.

3.6 WHEN a student has a valid draft application on the server and in localStorage THEN the dashboard SHALL CONTINUE TO show the "Continue Application" card and "Clear All Drafts" button, and the draft auto-save behavior SHALL remain intact.

3.7 WHEN the auth cascade redirects to sign-in after refresh failure THEN the system SHALL CONTINUE TO preserve the `mihas:post-auth-redirect` sessionStorage entry so the user returns to their previous page after re-authentication.
