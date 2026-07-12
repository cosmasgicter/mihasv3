# Requirements Document

## Introduction

The MIHAS platform currently has four overlapping authentication layers that conflict with each other: a JWT middleware that sets `request.user` on raw `HttpRequest`, a DRF `JWTCookieAuthentication` class that overwrites the middleware's user, a CSRF enforcement middleware, and a complex frontend auth state machine with debounce timers, cooldowns, and recovery flags. This feature simplifies the auth architecture by removing the redundant middleware layer, making every view's auth choice explicit, enforcing an unambiguous 401/403 status contract, and reducing frontend auth complexity to a single predictable flow.

## Glossary

- **API_Client**: The frontend `ApiClient` class in `apps/admissions/src/services/client.ts` that handles all HTTP requests to the backend, including retry logic and token refresh.
- **JWTAuthenticationMiddleware**: The Django middleware in `backend/apps/common/middleware.py` that decodes JWT tokens from cookies/headers and sets `request.user` on the raw `HttpRequest` before DRF runs.
- **JWTCookieAuthentication**: The DRF authentication class in `backend/apps/accounts/authentication.py` that extracts JWT from cookies/headers and raises `AuthenticationFailed` on invalid tokens.
- **OptionalJWTCookieAuthentication**: A subclass of `JWTCookieAuthentication` that returns `None` instead of raising on missing or invalid tokens, used for public endpoints that may personalize content for authenticated users.
- **CSRFEnforcementMiddleware**: The Django middleware that validates `X-CSRF-Token` headers on state-changing requests using SHA-256 hashed tokens stored in the database.
- **Auth_Exempt_Endpoint**: An endpoint that genuinely requires no authentication: login, register, refresh, password reset, webhooks, health checks, error reporting, and platform metadata.
- **Public_Personalizable_Endpoint**: An endpoint that serves public content but may personalize responses when an authenticated user is present (e.g., catalog views, session check, application tracking).
- **Protected_Endpoint**: An endpoint that requires a valid authenticated user to access.
- **Auth_Context**: The React context provider (`AuthContext.tsx`) that wraps the application and provides auth state and actions to all components.
- **Session_Listener**: The `useSessionListener` hook that manages session validation, profile fetching, and auth actions (sign in, sign up, sign out).
- **Status_Contract**: The mapping of HTTP status codes to authentication/authorization meanings: 401 for unauthenticated, 403 for forbidden, with CSRF errors using a distinct error code within 403.

## Requirements

### Requirement 1: Remove JWTAuthenticationMiddleware

**User Story:** As a backend developer, I want a single authentication path per request, so that `request.user` is set exactly once and its value is predictable.

#### Acceptance Criteria

1. WHEN the Django application starts, THE MIDDLEWARE list in `backend/config/settings/base.py` SHALL NOT contain `apps.common.middleware.JWTAuthenticationMiddleware`.
2. WHEN a request reaches a DRF view, THE DRF authentication class configured on that view SHALL be the sole mechanism that sets `request.user`.
3. WHEN the `JWTAuthenticationMiddleware` class is removed from the MIDDLEWARE list, THE `CSRFEnforcementMiddleware` SHALL continue to function because it reads `request.user` set by DRF authentication (which runs before the view but after middleware).
4. IF a request arrives without a valid access token and the view uses `JWTCookieAuthentication`, THEN THE DRF_Framework SHALL return a 401 response with `WWW-Authenticate: Bearer realm="api"` header.

### Requirement 2: Classify Every View's Authentication Explicitly

**User Story:** As a backend developer, I want every view to declare its authentication strategy explicitly, so that no view silently inherits a default that may conflict with its permission model.

#### Acceptance Criteria

1. THE Auth_Exempt_Endpoints (login, register, refresh, password-reset, password-reset/confirm, webhooks, health checks, error report, platform metadata) SHALL use `authentication_classes = []` with `permission_classes = [AllowAny]`.
2. THE Public_Personalizable_Endpoints (catalog programs, catalog intakes, catalog subjects, catalog institutions, session check, application tracking, public job listings) SHALL use `authentication_classes = [OptionalJWTCookieAuthentication]` with `permission_classes = [AllowAny]`.
3. THE Protected_Endpoints SHALL use the DRF default `authentication_classes = [JWTCookieAuthentication]` with appropriate permission classes.
4. WHEN a Public_Personalizable_Endpoint receives a request with an expired or invalid token, THE OptionalJWTCookieAuthentication SHALL return `None` instead of raising `AuthenticationFailed`, and `request.user` SHALL be `AnonymousUser`.
5. WHEN a Public_Personalizable_Endpoint receives a request with a valid token, THE OptionalJWTCookieAuthentication SHALL return the authenticated `JWTUser`.

### Requirement 3: Enforce Unambiguous 401/403 Status Contract

**User Story:** As a frontend developer, I want every 401 to mean "unauthenticated" and every 403 to mean "forbidden but authenticated", so that the API client can make correct retry decisions without parsing error codes.

#### Acceptance Criteria

1. WHEN a request fails authentication (missing token, expired token, invalid token, revoked token), THE Backend SHALL return HTTP 401 with an error code from the set {`AUTHENTICATION_REQUIRED`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `NO_REFRESH_TOKEN`, `REFRESH_EXPIRED`, `TOKEN_BLACKLISTED`}.
2. WHEN an authenticated user lacks permission for a resource, THE Backend SHALL return HTTP 403 with error code `INSUFFICIENT_PERMISSIONS`.
3. WHEN CSRF validation fails on a state-changing request, THE CSRFEnforcementMiddleware SHALL return HTTP 403 with error code `CSRF_INVALID`.
4. THE Backend SHALL NOT return HTTP 403 for expired or missing JWT tokens on any endpoint.
5. THE `JWTCookieAuthentication` class SHALL include an `authenticate_header` method that returns `Bearer realm="api"` so DRF returns 401 instead of 403 for authentication failures.
6. THE `envelope_exception_handler` SHALL map `AuthenticationFailed` and `NotAuthenticated` exceptions to HTTP 401 with the appropriate error code from the exception.

### Requirement 4: Remove the Middleware 403-to-401 Conversion Hack

**User Story:** As a backend developer, I want to remove the response-rewriting logic in `JWTAuthenticationMiddleware` that converts 403 responses to 401 when `_jwt_expired` is flagged, so that status codes are set correctly at the source rather than patched after the fact.

#### Acceptance Criteria

1. WHEN the `JWTAuthenticationMiddleware` is removed, THE Backend SHALL NOT contain any middleware that inspects response status codes and converts 403 to 401.
2. WHEN a DRF view using `JWTCookieAuthentication` encounters an expired token, THE `JWTCookieAuthentication` class SHALL raise `AuthenticationFailed` with code `TOKEN_EXPIRED`, and DRF SHALL return 401 directly.
3. THE `_jwt_expired` request attribute SHALL NOT exist in any remaining middleware or authentication code.

### Requirement 5: Simplify Frontend 401 Handling

**User Story:** As a frontend developer, I want a single, predictable retry flow for 401 responses, so that the auth recovery logic is simple and debuggable.

#### Acceptance Criteria

1. WHEN the API_Client receives a 401 response on a non-auth endpoint, THE API_Client SHALL attempt a single token refresh via `POST /api/v1/auth/refresh/`.
2. WHEN the token refresh succeeds, THE API_Client SHALL retry the original request exactly once with the refreshed credentials.
3. WHEN the retried request returns 401 again, THE API_Client SHALL dispatch the auth failure callback and throw `AuthenticationError`.
4. WHEN the token refresh fails, THE API_Client SHALL dispatch the auth failure callback and throw `AuthenticationError`.
5. THE API_Client SHALL NOT retry on 403 responses regardless of error code.
6. WHEN the API_Client receives a 403 with error code `CSRF_INVALID`, `CSRF_MISSING`, or `CSRF_VALIDATION_FAILED`, THE API_Client SHALL re-fetch the CSRF token and retry the original request once.

### Requirement 6: Remove Redundant Frontend Auth Complexity

**User Story:** As a frontend developer, I want to remove the refresh cooldown timers, failure cooldowns, and cached refresh results from the API client, so that the token refresh logic is a simple promise-lock without time-based heuristics.

#### Acceptance Criteria

1. THE API_Client `attemptRefresh` method SHALL use a promise-lock to deduplicate concurrent refresh requests (only one in-flight refresh at a time).
2. THE API_Client SHALL NOT maintain `lastRefreshSuccessTime`, `lastRefreshFailureTime`, `lastRefreshResult`, `REFRESH_COOLDOWN_MS`, or `REFRESH_FAILURE_COOLDOWN_MS` properties.
3. WHEN a refresh request completes (success or failure), THE API_Client SHALL clear the promise-lock so the next 401 can trigger a fresh refresh attempt.
4. THE API_Client SHALL dispatch `mihas:auth-recovered` custom event when a refresh succeeds, so that dependent systems (autosave) can resume.

### Requirement 7: Simplify Auth Context Visibility Handling

**User Story:** As a frontend developer, I want the Auth_Context visibility-change handler to be a simple session revalidation without payment-in-progress guards or complex debounce state, so that the auth layer does not depend on unrelated business logic.

#### Acceptance Criteria

1. WHEN the browser tab regains visibility, THE Auth_Context SHALL invalidate the session query to trigger a background revalidation.
2. THE Auth_Context SHALL debounce visibility-change revalidation with a minimum interval of 3 seconds between invalidations.
3. THE Auth_Context SHALL NOT import or check payment-in-progress state for session revalidation decisions.
4. THE Auth_Context SHALL NOT import or check payment-in-progress state for auth failure dispatch decisions.

### Requirement 8: Preserve CSRF Handling

**User Story:** As a security engineer, I want the CSRF protection to remain unchanged during the auth simplification, so that state-changing requests continue to be protected against cross-site request forgery.

#### Acceptance Criteria

1. THE CSRFEnforcementMiddleware SHALL continue to validate `X-CSRF-Token` headers on POST, PUT, PATCH, and DELETE requests for authenticated users.
2. THE CSRFEnforcementMiddleware SHALL continue to exempt auth endpoints (login, register, password-reset, logout, refresh), error reporting, and webhook endpoints.
3. THE API_Client SHALL continue to attach the `X-CSRF-Token` header on state-changing requests.
4. THE API_Client SHALL continue to capture and store CSRF tokens from response headers on login, refresh, and session check responses.

### Requirement 9: Preserve Cookie-Based Authentication

**User Story:** As a platform operator, I want the authentication to remain cookie-based with HTTP-only cookies, so that the existing cross-subdomain cookie strategy between `apply.mihas.edu.zm` and `api.mihas.edu.zm` continues to work.

#### Acceptance Criteria

1. THE Backend SHALL continue to set `access_token` and `refresh_token` as HTTP-only cookies with the `Domain=.mihas.edu.zm` attribute on login and refresh responses.
2. THE API_Client SHALL continue to use `credentials: 'include'` on all fetch requests.
3. THE Backend SHALL NOT require `Authorization: Bearer` headers for browser-based authentication.
4. THE `JWTCookieAuthentication` and `OptionalJWTCookieAuthentication` classes SHALL continue to check cookies first, then fall back to the `Authorization: Bearer` header for API testing tools.

### Requirement 10: Maintain Session Listener as Single Source of Truth

**User Story:** As a frontend developer, I want `useSessionListener` to remain the single source of truth for auth state, so that there is exactly one place that manages session validation, profile fetching, and auth actions.

#### Acceptance Criteria

1. THE Session_Listener SHALL validate the session on mount by calling `GET /api/v1/auth/session/`.
2. THE Session_Listener SHALL provide `user`, `profile`, `loading`, `isAdmin`, `signIn`, `signUp`, and `signOut` to consumers via the Auth_Context.
3. THE Session_Listener SHALL seed the React Query cache with user data from login/register responses to avoid a separate session round-trip after authentication.
4. WHEN the session check returns a transient network error and cached session data exists, THE Session_Listener SHALL return the cached session data instead of clearing auth state.

### Requirement 11: Backward Compatibility for Existing Consumers

**User Story:** As a developer working on other features, I want the auth simplification to be transparent to existing API consumers, so that no frontend components or backend views break during the migration.

#### Acceptance Criteria

1. WHEN the `JWTAuthenticationMiddleware` is removed, THE Backend SHALL continue to return identical response shapes for all existing endpoints.
2. THE `useAuth` hook SHALL continue to expose the same interface (`user`, `profile`, `loading`, `isAdmin`, `signIn`, `signUp`, `signOut`, `requestPasswordReset`, `updatePassword`).
3. THE `useAuthCheck` hook SHALL continue to return `isAuthenticated`, `isLoading`, `user`, and `retrySessionCheck`.
4. WHEN a protected endpoint receives an unauthenticated request, THE Backend SHALL return 401 with the `{"success": false, "error": "...", "code": "..."}` envelope format.
