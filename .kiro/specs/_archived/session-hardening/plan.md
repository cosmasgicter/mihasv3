# Session Hardening — Implementation Plan

## Root Causes (Ranked by Severity)

| # | Severity | Cause | Evidence | Impact |
|---|----------|-------|----------|--------|
| 1 | **CRITICAL** | `AUTH_RECOVERY_TIMEOUT_MS = 1200ms` too aggressive for cross-origin API | Koyeb logs show 200 OK session responses; user redirected to login because frontend gave up after 1.2s | Students logged out on every slow page load |
| 2 | **HIGH** | Student Dashboard all-403 redirect (path #11) treats generic 403 as auth failure | `Dashboard.tsx:374` — navigates to `/auth/signin` after 2s if all endpoints return 403 | Students logged out for permission errors |
| 3 | **HIGH** | Admin Dashboard hard redirect on no user (path #12) | `Dashboard.tsx:288` — `window.location.href = '/auth/signin'` with no recovery attempt | Admin loses all state on slow session check |
| 4 | **HIGH** | `queryClient.clear()` in onAuthFailure wipes ALL cached data | `AuthContext.tsx:75-108` — clears catalog, programs, intakes, profile — not just auth | After re-login, everything must be re-fetched (slow UX) |
| 5 | **MEDIUM** | Cross-tab logout doesn't preserve drafts in other tabs (path #5) | `authBroadcast.ts:161-170` — no `mihas:before-auth-redirect` dispatch before clearing | Draft data lost in background tabs |
| 6 | **MEDIUM** | DashboardRedirect has no recovery timeout (path #9) | `DashboardRedirect.tsx:15` — immediate redirect if user is null | Race with session hydration on cold load |
| 7 | **LOW** | Wizard `WIZARD_SESSION_GRACE_MS` may be too short | Need to verify value — if < 5s, same issue as #1 | Wizard redirect during slow session recovery |

## Fixes (Priority Order)

### Fix 1: ProtectedRoute timeout — ALREADY DONE ✅
- Changed `AUTH_RECOVERY_TIMEOUT_MS` from 1200ms → 5000ms
- Changed `LOADING_TIMEOUT_MS` from 5000ms → 8000ms
- File: `src/components/ProtectedRoute.tsx:12-13`

### Fix 2: Student Dashboard — don't redirect on generic 403
- File: `src/pages/student/Dashboard.tsx:374`
- Change: Remove the navigate-to-signin on all-403. Instead show an error banner: "Unable to load dashboard data. Please try refreshing."
- Only redirect if the session check itself returns 401 (not if data endpoints return 403)

### Fix 3: Admin Dashboard — add recovery timeout before hard redirect
- File: `src/pages/admin/Dashboard.tsx:288`
- Change: Replace `window.location.href = '/auth/signin'` with the same pattern as ProtectedRoute (attempt session recovery, wait 5s, then redirect)

### Fix 4: Selective cache clearing on auth failure
- File: `src/contexts/AuthContext.tsx:75-108` (or wherever onAuthFailure is defined)
- Change: Replace `queryClient.clear()` with selective removal:
  ```typescript
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'auth' || q.queryKey[0] === 'user-profile' })
  ```
  Keep catalog, programs, intakes, subjects cached — they're public data.

### Fix 5: Cross-tab logout — dispatch before-auth-redirect before clearing
- File: `src/lib/authBroadcast.ts:161-170`
- Change: Dispatch `mihas:before-auth-redirect` event BEFORE clearing auth state, so the wizard listener can save drafts

### Fix 6: DashboardRedirect — add loading/recovery state
- File: `src/components/DashboardRedirect.tsx:15`
- Change: Show a skeleton while loading, only redirect after recovery timeout (same pattern as ProtectedRoute)

### Fix 7: Verify Wizard grace period
- File: `src/pages/student/applicationWizard/hooks/useWizardController.ts`
- Check `WIZARD_SESSION_GRACE_MS` value. If < 5000ms, increase to 5000ms.

### Fix 8: Backend — ensure 403 vs 401 distinction is clear
- File: `backend/apps/common/middleware.py` and `backend/apps/accounts/authentication.py`
- Verify: expired JWT → 401 (not 403). Permission denied → 403 with code `INSUFFICIENT_PERMISSIONS`. Only `TOKEN_EXPIRED` code on 403 triggers frontend auth recovery.
- This is already correct based on earlier audit — just verify no regression.

### Fix 9: Add user-facing recovery messages
- File: `src/components/ProtectedRoute.tsx`
- When `showTimeoutMessage` is true, show: "Reconnecting your session…" instead of generic skeleton
- When recovery fails, show: "Your session expired. We saved your progress. Please sign in again."

### Fix 10: Debounce auth-expired dispatch
- File: `src/contexts/AuthContext.tsx` (onAuthFailure)
- Add a debounce: if `mihas:auth-expired` was dispatched in the last 2 seconds, don't dispatch again. Prevents multiple failing requests from triggering repeated logout cascades.

## Verification Plan

| Scenario | Expected | How to verify |
|----------|----------|---------------|
| Slow session check (>2s) | User sees skeleton, NOT redirected | Throttle network to 3G, navigate to protected route |
| Access token expired, refresh succeeds | Transparent retry, no redirect | Wait 15min, click any link |
| Refresh fails (token revoked) | Draft saved, redirect with message | Manually blacklist JTI in Redis, trigger refresh |
| Generic 403 on one endpoint | Error shown inline, NOT logged out | Return 403 from one data endpoint |
| All endpoints 403 | Error banner, NOT logged out | Return 403 from all endpoints |
| Cross-tab logout | Draft preserved before redirect | Sign out in tab A, check tab B |
| Network outage during wizard | Autosave pauses, draft preserved locally | Disconnect network mid-wizard |
| Payment verification during token refresh | Payment state preserved | Expire token during payment polling |

## Files to Modify

1. `src/pages/student/Dashboard.tsx` — remove 403→signin redirect
2. `src/pages/admin/Dashboard.tsx` — add recovery timeout
3. `src/contexts/AuthContext.tsx` — selective cache clearing + debounce
4. `src/lib/authBroadcast.ts` — dispatch before-auth-redirect before clearing
5. `src/components/DashboardRedirect.tsx` — add loading state
6. `src/components/ProtectedRoute.tsx` — better recovery messages (timeout already fixed)
7. `src/pages/student/applicationWizard/hooks/useWizardController.ts` — verify grace period

## NOT Changing (Security Controls Preserved)

- JTI blacklist behavior (fail-closed with retry — already hardened)
- Token rotation atomicity (SET NX lock — already hardened)
- CSRF validation
- Cookie HttpOnly/Secure/SameSite settings
- Role/permission checks
- Ownership validation on endpoints
- Explicit logout behavior
