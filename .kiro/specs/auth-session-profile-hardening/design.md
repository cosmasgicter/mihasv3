# Auth, Session, and Profile Hardening Design

## Goals

- Prevent false logout and false sign-in redirects when access tokens expire but refresh tokens are still valid.
- Ensure exactly one refresh attempt is active at a time across the whole frontend.
- Ensure profile data has one canonical fetch path and one fallback policy.
- Keep `useAuth().user` and `useProfileQuery().profile` synchronized after profile updates.
- Make auth/profile cleanup deterministic during logout and global auth failure.
- Preserve current UX improvements: no post-login skeleton hang and no hard redirects from the API client.

## Non-Goals

- Change backend token lifetime or cookie settings.
- Add localStorage auth tokens.
- Reintroduce PWA/offline auth behavior.
- Block route rendering on full profile loading.
- Replace React Query as the auth state cache.

## Target Invariants

1. All refresh calls go through one shared promise lock.
2. `GET /auth/session/` always bypasses the API client cache.
3. `GET /auth/profile/` always bypasses the API client cache.
4. There is exactly one canonical profile query function for `['user-profile', userId]`.
5. Profile updates update both `['user-profile', userId]` and overlapping fields in `['auth', 'session']`.
6. Logout/auth-failure cleanup cancels auth/profile queries before clearing cache state.
7. Passive session bootstrap failure returns unauthenticated state without forcing a hard redirect on public pages.
8. Protected route redirects remain route-level decisions, not API-client side effects.

## Proposed Architecture

### Auth Service Boundary

`authService` should be the only public frontend auth API used by components/hooks:

- `authService.login()`
- `authService.logout()`
- `authService.session()`
- `authService.refresh()`
- `authService.profile()`
- `authService.updateProfile()`

Implementation rules:

- `session()` calls `apiClient.request('/auth/session/', { method: 'GET', skipCache: true })`.
- `refresh()` calls `apiClient.refreshAuthSession()` and throws `AuthenticationError` when the deduped refresh fails.
- `profile()` calls `apiClient.request('/auth/profile/', { method: 'GET', skipCache: true })`.
- `updateProfile()` calls `PATCH /auth/profile/`.

### Refresh Ownership

`ApiClient` remains the refresh owner:

- Keep `refreshPromise` private.
- Keep `refreshAuthSession()` public.
- Do not call `/auth/refresh/` directly outside `ApiClient`.

All callers, including wizard recovery, should call `authService.refresh()` or `apiClient.refreshAuthSession()`.

### Session Query Ownership

`useSessionListener()` remains the primary owner of:

```ts
['auth', 'session']
```

`useAuthCheck()` may subscribe to the same key, but its query function should not diverge from the canonical session query. Prefer extracting:

```ts
async function fetchSessionUser(): Promise<SessionQueryData>
```

Both hooks should call the same function.

### Profile Query Ownership

Create a shared canonical profile query helper:

```ts
export const profileQueryKey = (userId?: string | null) => ['user-profile', userId] as const

export async function fetchCurrentProfile(user: User): Promise<UserProfile>
```

Rules:

- `useSessionListener()` and `useProfileQuery()` must use the same `profileQueryKey` and `fetchCurrentProfile`.
- The fallback policy must be centralized.
- If profile fetch fails due to auth, rethrow.
- If profile fetch fails due to network/timeout, return a session-derived fallback.
- If profile fetch fails due to server/schema error, surface the error while keeping previous data where React Query supports it.

### Profile Update Synchronization

After a successful profile update:

1. Sanitize returned profile data.
2. Set `['user-profile', userId]` to the sanitized profile.
3. Merge overlapping fields into `['auth', 'session']`.
4. Invalidate `['user-profile', userId]` only if the backend response is partial or uncertain.

Overlapping fields include:

- `email`
- `role`
- `full_name`
- `first_name`
- `last_name`
- `phone`
- profile metadata used by profile-completeness and auto-population.

### Logout and Auth-Failure Cleanup

Before clearing auth state:

```ts
await queryClient.cancelQueries({ queryKey: ['auth'] })
await queryClient.cancelQueries({ queryKey: ['user-profile'] })
```

Then:

- Set `['auth', 'session']` to null.
- Remove or null profile queries.
- Clear CSRF token.
- Clear secure storage.
- Clear React Query cache if this is explicit sign-out/global auth failure.

### Wizard Recovery

Wizard recovery should not implement its own refresh transport.

Replace direct calls:

```ts
apiClient.request('/auth/refresh/', { method: 'POST' })
```

with:

```ts
await authService.refresh()
```

Session rechecks should use:

```ts
await authService.session()
```

or an extracted shared `fetchSessionUser()` helper.

### Route Guard Behavior

Route guards should not own token refresh directly. They should:

- Observe `['auth', 'session']`.
- Trigger `retrySessionCheck()` only as a recovery from prolonged loading.
- Redirect only after session query settles unauthenticated after recovery.

## Test Strategy

### Unit / Property Tests

Add or update tests for:

- Wizard recovery uses `authService.refresh()` and never calls `/auth/refresh/` directly.
- Concurrent wizard recovery plus API 401 produces exactly one refresh request.
- `useSessionListener` and `useProfileQuery` use the same profile query key and shared fetcher.
- Profile PATCH updates both `['user-profile', userId]` and `['auth', 'session']`.
- Logout cancels auth/profile queries before clearing cache.
- Profile network error falls back to session-derived profile.
- Profile 500/schema error is surfaced and does not silently replace known good profile with sparse fallback.

### Manual Verification

Use browser DevTools on deployed app:

1. Login as student.
2. Confirm `/api/v1/auth/session/` and `/api/v1/auth/profile/` appear after login/dashboard load.
3. Let access token expire or simulate expired access cookie.
4. Reload dashboard.
5. Confirm network shows session -> one refresh -> retried session, with no forced logout.
6. Open application wizard and trigger save/recovery while another API request is pending.
7. Confirm no duplicate refresh requests.
8. Update profile in settings.
9. Confirm header/dashboard/wizard auto-population all reflect updated values.

## Rollout Risk

Main risk is changing auth behavior in route guards or wizard recovery. Keep the implementation incremental:

1. Replace direct refresh call first.
2. Add tests around refresh dedupe.
3. Unify profile query helpers without changing UI.
4. Add profile update synchronization.
5. Tighten fallback behavior last.

## Acceptance Criteria

- No source outside `ApiClient` directly calls `/auth/refresh/`.
- `rg "request\\('/auth/refresh/'|request\\(\"/auth/refresh/\"" apps/admissions/src` returns no component/hook callers outside the auth/client service boundary.
- Profile query key and fetcher are defined once.
- Profile PATCH keeps AuthContext user and profile query cache consistent.
- Logout cancels in-flight auth/profile queries before cache clearing.
- Targeted auth/profile tests pass.
- `bun run type-check` passes.
