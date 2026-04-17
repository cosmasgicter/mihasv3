# Auth, Session, and Profile Hardening Tasks

## Phase 1: Stop Refresh Races

- [x] Replace direct wizard refresh call in `useWizardController.ts`.
  - Use `authService.refresh()` instead of `apiClient.request('/auth/refresh/', { method: 'POST' })`.
  - Use `authService.session()` or a shared session helper for session rechecks.
  - Ensure session rechecks bypass API cache.

- [ ] Add a regression test for wizard refresh dedupe.
  - Simulate wizard recovery and a concurrent protected API 401.
  - Assert only one `/auth/refresh/` network call occurs.
  - Assert session cache is updated after successful refresh.

- [x] Add a source-level guard test.
  - Fail if app source outside `services/client.ts` or `services/auth.ts` directly calls `/auth/refresh/`.

## Phase 2: Create Canonical Auth/Profile Query Helpers

- [x] Add shared auth query helpers.
  - Suggested file: `apps/admissions/src/hooks/auth/authQueries.ts`.
  - Export `SESSION_QUERY_KEY`.
  - Export `profileQueryKey(userId)`.
  - Export `fetchSessionData()`.
  - Export `fetchCurrentProfile(user)`.
  - Export `buildProfileFromUser(user)`.

- [x] Update `useSessionListener()` to use shared helpers.
  - Keep `['auth', 'session']` as the session key.
  - Keep route bootstrap independent of full profile loading.
  - Use the shared canonical profile fetcher if `useSessionListener()` continues to observe profile.

- [x] Update `useAuthCheck()` to use the shared session helper.
  - Avoid a divergent session query function for the same `['auth', 'session']` key.

- [x] Update `useProfileQuery()` to use shared profile helpers.
  - Same query key.
  - Same query function.
  - Same fallback/error behavior.

- [x] Add a source-level profile ownership test.
  - Assert profile query key is imported from the shared helper.
  - Assert no duplicate `['user-profile', userId]` literal query function ownership remains.

## Phase 3: Synchronize Profile Updates

- [x] Update profile mutation success handling.
  - On successful PATCH, sanitize returned profile.
  - Set `['user-profile', userId]` to sanitized returned profile.
  - Merge overlapping fields into `['auth', 'session']`.
  - Preserve session-only fields not returned by profile endpoint.

- [ ] Add tests for cache synchronization.
  - Patch profile full name and phone.
  - Assert `useProfileQuery()` cache updates.
  - Assert `useAuth().user` cache updates.
  - Assert rollback restores profile cache on mutation failure.

- [ ] Verify dependent screens.
  - Student dashboard.
  - Settings page.
  - Application wizard auto-population.
  - Header/navigation/user menu.

## Phase 4: Make Logout/Auth-Failure Cleanup Deterministic

- [x] Cancel auth/profile queries before explicit sign-out cleanup.
  - `await queryClient.cancelQueries({ queryKey: ['auth'] })`
  - `await queryClient.cancelQueries({ queryKey: ['user-profile'] })`

- [x] Cancel auth/profile queries in `configureApiClientAuthFailure` callback.
  - Keep redirect/event behavior unchanged.
  - Ensure cleanup remains best-effort and does not throw.

- [ ] Add race regression tests.
  - Start a slow profile query.
  - Trigger sign-out.
  - Resolve the slow profile query.
  - Assert auth/profile cache remains unauthenticated.

## Phase 5: Tighten Profile Fallback Policy

- [x] Classify profile fetch failures.
  - Auth failures: throw.
  - Network/timeout/abort failures: fallback to session-derived profile.
  - 5xx/schema/envelope failures: surface error and preserve previous profile data if available.

- [x] Add tests for fallback behavior.
  - Network failure uses session fallback.
  - 401 throws and lets auth cascade handle state.
  - 500 does not silently overwrite full profile with sparse fallback.
  - Invalid profile payload is logged/surfaced.

## Phase 6: Consolidate Recovery Behavior

- [x] Remove duplicated ad hoc recovery paths where possible.
  - Route guards should call `retrySessionCheck()`.
  - Wizard should use the same session/refresh service helpers.
  - No component should own raw refresh transport details.

- [x] Update comments and docs.
  - `AuthContext.tsx` header comments should match `SameSite=None` production behavior or avoid hardcoding SameSite.
  - Document the invariant: API client owns refresh transport and dedupe.

## Verification Commands

Run after implementation:

```bash
cd apps/admissions
bun run type-check
bunx vitest run \
  tests/property/test_bug4_client_refresh.test.ts \
  tests/property/refreshDeduplication.property.test.ts \
  tests/unit/apiClient401Retry.test.ts \
  tests/property/auth-profile-cache-fix-preservation.test.ts \
  tests/property/auth-profile-cache-fix-exploration.test.ts \
  tests/property/loginCacheSeeding.property.test.ts \
  tests/unit/settingsProfileUpdateFields.test.ts
```

Run source guards:

```bash
rg -n "request\\('/auth/refresh/'|request\\(\"/auth/refresh/\"" apps/admissions/src
rg -n "\\['user-profile'" apps/admissions/src
```

Expected:

- Direct `/auth/refresh/` calls only exist inside the auth/client service boundary.
- `['user-profile']` query key ownership is centralized.

## Manual Acceptance Checklist

- [ ] Login shows `/api/v1/auth/session/` and `/api/v1/auth/profile/` in DevTools.
- [ ] Reload with expired access token refreshes once and stays logged in.
- [ ] Wizard recovery does not issue duplicate refresh requests.
- [ ] Save draft does not redirect to sign-in when refresh succeeds.
- [ ] Updating profile changes header/dashboard/settings/wizard auto-population consistently.
- [ ] Sign-out during a slow network request does not repopulate stale auth/profile state.
- [ ] Multi-tab logout still clears the second tab.
