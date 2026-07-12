# Auth, Session, and Profile Hardening Audit

## Status

Open.

## Scope

This audit covers the frontend authentication/session/profile state paths in the admissions app:

- `apps/admissions/src/services/client.ts`
- `apps/admissions/src/services/auth.ts`
- `apps/admissions/src/hooks/auth/useSessionListener.ts`
- `apps/admissions/src/hooks/auth/useProfileQuery.ts`
- `apps/admissions/src/contexts/AuthContext.tsx`
- `apps/admissions/src/lib/authBroadcast.ts`
- `apps/admissions/src/components/ProtectedRoute.tsx`
- `apps/admissions/src/components/StudentRoute.tsx`
- `apps/admissions/src/components/AdminRoute.tsx`
- `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts`

The backend cookie and token behavior is relevant context, but the actionable defects found here are frontend state and request orchestration issues.

## Current Behavior Summary

The app uses HTTP-only JWT cookies:

- `access_token` authenticates normal API requests.
- `refresh_token` rotates via `POST /api/v1/auth/refresh/`.
- `GET /api/v1/auth/session/` validates the active session and returns a minimal user.
- `GET /api/v1/auth/profile/` returns the fuller profile used by dashboard, settings, profile-completeness, and form auto-population.
- CSRF tokens are transported in `X-CSRF-Token` and stored in memory.

React Query currently owns frontend auth state:

- `['auth', 'session']` stores the session user.
- `['user-profile', userId]` stores the profile.
- `useSessionListener()` is intended to be the primary auth state owner.
- `useProfileQuery()` is also used directly by many pages/components.

## Findings

### 1. High: Wizard Auth Recovery Bypasses Deduped Refresh

Location:

- `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts`

The wizard recovery flow directly calls:

```ts
apiClient.request('/auth/refresh/', { method: 'POST' })
```

This bypasses the deduped refresh lock exposed by `apiClient.refreshAuthSession()` and wrapped by `authService.refresh()`.

Impact:

- If another API request gets a 401 at the same time, two refresh calls can be sent.
- Because the refresh token rotates, one call can succeed and the other can fail with 401.
- The failed path can incorrectly redirect the user to sign-in while they still have a valid refreshed session.
- This is especially risky in the application wizard because redirect can interrupt draft save/recovery.

Expected behavior:

- All refresh attempts must go through one shared deduped refresh function.
- Wizard session reads should use the same cache-bypass behavior as `authService.session()`.

### 2. High: Duplicate Profile Query Ownership

Locations:

- `apps/admissions/src/hooks/auth/useSessionListener.ts`
- `apps/admissions/src/hooks/auth/useProfileQuery.ts`

Both hooks define a query for the same key:

```ts
['user-profile', userId]
```

But they use different query functions and different fallback/error behavior.

Impact:

- Whichever observer mounts first can effectively determine the query behavior for the shared key.
- Profile fetch behavior can vary by route and render timing.
- The profile-completeness badge, dashboard, settings, and wizard auto-population can see different fallback outcomes.
- Future changes to one query path may not affect the other path.

Expected behavior:

- There should be one canonical profile fetcher and one canonical fallback policy.
- Multiple hooks may observe profile state, but they must use the same query function and same query options.

### 3. Medium: Profile Update Does Not Synchronize Session User

Location:

- `apps/admissions/src/hooks/auth/useProfileQuery.ts`

Profile updates patch `/auth/profile/`, optimistically update `['user-profile', userId]`, and invalidate the profile query. They do not update `['auth', 'session']`.

Impact:

- Components reading `useProfileQuery()` may show updated fields.
- Components reading `useAuth().user` may continue showing old `full_name`, `first_name`, `last_name`, phone, or related fields.
- Header, navigation, dashboard, wizard, and settings can temporarily disagree.

Expected behavior:

- A successful profile update should merge returned user/profile fields into both profile state and session user state where fields overlap.

### 4. Medium: Profile Fallback Can Hide Persistent API Failures

Locations:

- `apps/admissions/src/hooks/auth/useSessionListener.ts`
- `apps/admissions/src/hooks/auth/useProfileQuery.ts`

The profile fetch falls back to session-derived profile data for most non-auth errors.

Impact:

- Network failures degrade gracefully, which is useful.
- Backend 500s, schema drift, invalid profile envelopes, and persistent server errors can be hidden.
- Users may keep seeing incomplete profile data and a low profile-completeness percentage without a visible reason.

Expected behavior:

- Network/offline/timeout errors may fall back to session-derived data.
- Server/schema errors should be surfaced through query error state and logging, while optionally preserving last known good profile data.

### 5. Medium: Sign-Out Can Race In-Flight Session/Profile Requests

Location:

- `apps/admissions/src/hooks/auth/useSessionListener.ts`

Sign-out sets auth/profile query data to null and clears the query client, but it does not first cancel in-flight auth/profile queries.

Impact:

- A slow session/profile request can resolve after sign-out starts.
- React Query can briefly repopulate auth/profile cache before clear/remount settles.
- This can cause transient stale UI, especially on slow networks or multi-tab sign-out.

Expected behavior:

- Sign-out and global auth-failure cleanup should cancel `['auth']` and `['user-profile']` queries before mutating or clearing auth state.

### 6. Low: Session Recovery Logic Is Duplicated

Locations:

- `apps/admissions/src/hooks/auth/useSessionListener.ts`
- `apps/admissions/src/hooks/auth/useAuthCheck()`
- `apps/admissions/src/components/ProtectedRoute.tsx`
- `apps/admissions/src/components/StudentRoute.tsx`
- `apps/admissions/src/components/AdminRoute.tsx`
- `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts`

The codebase has multiple session recovery paths, each with slightly different rules.

Impact:

- Future fixes can land in one path and miss another.
- Recovery timing and redirect behavior can diverge across dashboard, admin, protected routes, and wizard.

Expected behavior:

- Session recovery should be centralized behind `authService.session()`, `authService.refresh()`, and one auth recovery helper.

## Non-Issues / Things That Look Correct

- `authService.session()` now bypasses the API client's GET cache.
- `/auth/session/` participates in refresh handling instead of immediately returning unauthenticated state when the access cookie expires.
- Refresh requests are deduped in `ApiClient` through a shared promise lock.
- Login/signup seed `['auth', 'session']` before route transition, avoiding the old post-login skeleton hang.
- Login/signup seed `['user-profile', userId]` with `updatedAt: 0`, allowing a real profile fetch to follow.

## User-Visible Symptoms These Findings Can Cause

- Automatic logout or redirect during reload/wizard recovery.
- `/auth/profile/` missing from DevTools because a profile query was seeded or owned by a different observer.
- Profile-completeness badge stuck at a stale percentage.
- Header/dashboard/settings showing different names or profile values.
- Wizard auto-population using old profile data after profile edit.
- Randomness: bug appears or disappears depending on route timing and which component mounts first.

## Priority

1. Fix wizard refresh bypass.
2. Unify profile query ownership.
3. Synchronize profile updates into session state.
4. Cancel auth/profile queries before logout and auth-failure cleanup.
5. Tighten profile fallback policy.
6. Consolidate duplicated route/wizard recovery helpers.
