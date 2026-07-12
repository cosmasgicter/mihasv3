# Bugfix Requirements Document

## Introduction

Three related bugs in the MIHAS admissions portal's authentication and navigation system cause stale profile data to persist across user sessions, admin mobile navigation to lack logout functionality, and admin dashboard diagnostics to report profile loading failures. Together these represent a critical security/data integrity issue (cross-user data leakage), a UX gap (admin users cannot log out on mobile), and a reliability problem (admin profile not hydrating in time for dashboard render).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user signs out of account A and signs into account B THEN the system displays profile data from account A (stale cache) because `signOut` clears the profile cache with `queryClient.removeQueries({ queryKey: ['user-profile'] })` and `queryClient.setQueryData(['auth', 'session'], null)` before the logout API call completes, but does not call `queryClient.clear()`, allowing non-auth cached queries and potentially stale profile data keyed by the previous user's ID to persist and be served to the new session.

1.2 WHEN a user signs out THEN the system clears the local auth cache before the server-side logout POST completes, creating a race condition where the profile query for the old user may still be in-flight or resolved from cache when the new user's session begins, because cache invalidation and the logout API call are not sequenced atomically.

1.3 WHEN an admin user views the portal on a mobile device THEN the system does not provide a logout button in the mobile header, because `AdminNavigation.tsx` renders its own mobile navigation via `BaseNavigation` with a mobile footer containing sign-out, but the `AppLayout.tsx` mobile header actions (which include a logout button) are only rendered for student routes (`!isAdmin && isStudentRoute`), leaving admin mobile users without a visible logout affordance in the top header bar.

1.4 WHEN an admin user logs in and the admin dashboard renders THEN the system shows "Profile loaded: no" in diagnostics because the profile query in `useSessionListener.ts` depends on `user?.id` being available from the session query, but the dashboard component renders before the profile query resolves, and `resolveAuthLoadingState` returns `false` (not loading) as soon as `user` is truthy — even though the profile has not yet been fetched.

### Expected Behavior (Correct)

2.1 WHEN a user signs out of account A and signs into account B THEN the system SHALL display only account B's profile data with zero residual data from account A, by calling `queryClient.clear()` after the logout API call succeeds (or fails) and before the sign-in flow seeds new cache entries, ensuring complete cache isolation between sessions.

2.2 WHEN a user signs out THEN the system SHALL complete the server-side logout API call (or timeout gracefully) before clearing the local query cache, ensuring no race condition between in-flight queries and cache invalidation, and SHALL call `queryClient.clear()` to remove all cached data including non-auth queries.

2.3 WHEN an admin user views the portal on a mobile device THEN the system SHALL display a logout button in the mobile header that is consistent with the student mobile header's logout functionality, either by extending the `AppLayout.tsx` mobile header actions to include admin users or by ensuring the admin mobile navigation provides an equally accessible logout control in the top header area.

2.4 WHEN an admin user logs in and the admin dashboard renders THEN the system SHALL either wait for the profile query to resolve before displaying profile-dependent diagnostics, or SHALL show a loading/pending state for profile data until the profile query completes, so that diagnostics never report "Profile loaded: no" when the profile is still being fetched.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user signs in for the first time in a browser session THEN the system SHALL CONTINUE TO seed the auth session cache and profile cache atomically from the login response, providing immediate access to user data without a separate session round-trip.

3.2 WHEN a user navigates between pages while authenticated THEN the system SHALL CONTINUE TO serve cached session and profile data from React Query without re-fetching, respecting the configured `staleTime` (10 minutes for session, 5 minutes for profile).

3.3 WHEN a student user views the portal on mobile THEN the system SHALL CONTINUE TO display the existing mobile header with profile settings, notification bell, and logout button as currently implemented in `AppLayout.tsx`.

3.4 WHEN the logout API call fails due to network error THEN the system SHALL CONTINUE TO clear local auth state and redirect to sign-in (best-effort server logout), ensuring the user is never stuck in a broken authenticated state.

3.5 WHEN a user's access token expires during a session THEN the system SHALL CONTINUE TO trigger the auto-refresh flow via `/api/auth?action=refresh` and rotate both tokens, without disrupting the user's current activity.

3.6 WHEN the `signIn` function is called THEN the system SHALL CONTINUE TO clear stale non-auth queries from previous sessions using the predicate-based `removeQueries` pattern that preserves freshly-seeded auth and profile caches.
