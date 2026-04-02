# Post-Migration Production QA Bugfix Design

## Overview

After migrating the MIHAS admissions backend from Node.js to Django, the production frontend at apply.mihas.edu.zm exhibits 9 distinct bug conditions spanning SSE connectivity, service worker cache staleness, update prompt UX, catalog API shape mismatches, payment page failures, logout CSRF errors, admin routing mismatches, admin dashboard refresh failures, and legacy endpoint/method incompatibilities. This design formalizes each bug condition, hypothesizes root causes, and plans a systematic fix-then-verify approach. Per CTO review: Bug 1.5 (payment) is treated as a discovery/investigation task, Bugs 1.2+1.3 (SW staleness + version prompt) are addressed as a single coupled fix surface, Bug 1.6 (logout 403) includes security analysis of CSRF exemption trade-offs, Bug 1.7 (admin routing) requires QA narrowing before fixing, and a deploy sequencing plan is included. ErrorLog records should be checked as evidence before relying solely on browser reproduction.

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger one of the 9 production bugs — each formalized as a predicate over request/state inputs
- **Property (P)**: The desired correct behavior when a bug condition holds — the system should respond correctly instead of erroring
- **Preservation**: Existing behaviors that must remain unchanged — stable SSE streams, cached assets when no deploy occurred, student routing, CSRF enforcement on non-exempt endpoints, existing PATCH/POST API contracts
- **SSEStreamView**: The Django view in `backend/apps/common/sse.py` that serves `GET /api/v1/events/stream/` with `ServerSentEventRenderer`
- **CSRFEnforcementMiddleware**: Custom middleware in `backend/apps/common/middleware.py` that validates `X-CSRF-Token` header on state-changing requests
- **apiClient**: The frontend HTTP client in `apps/admissions/src/services/client.ts` that handles envelope unwrapping, CSRF attachment, and 401/403 retry
- **normalizeCollection**: The catalog response normalizer in `apps/admissions/src/services/catalog.ts` that handles array, paginated, and keyed-object response shapes
- **EnvelopeRenderer**: DRF renderer in `DEFAULT_RENDERER_CLASSES` that wraps responses in `{success, data}` — the only renderer in the global default list

## Bug Details

### Bug Condition 1: SSE 406/CORS Errors (Requirement 1.1)

The SSE stream fails when the browser sends `Accept: text/event-stream` but DRF content negotiation rejects it because `ServerSentEventRenderer` is only set on the `SSEStreamView.renderer_classes`, not in `DEFAULT_RENDERER_CLASSES`. DRF's content negotiation may fail before reaching the view's renderer list if the global renderer cannot satisfy the `Accept` header. Additionally, CORS may not allow `Last-Event-ID` in request headers for SSE reconnection.

**Formal Specification:**
```
FUNCTION isBugCondition_SSE(request)
  INPUT: request of type HTTPRequest to /api/v1/events/stream/
  OUTPUT: boolean

  RETURN request.headers['Accept'] == 'text/event-stream'
         AND globalRendererClasses == [EnvelopeRenderer]
         AND 'text/event-stream' NOT IN EnvelopeRenderer.media_types
         AND (response.status == 406 OR response.headers lacks CORS headers)
END FUNCTION
```

### Bug Condition 2+3: Service Worker Staleness + Version Prompt (Requirements 1.2, 1.3) — Coupled Fix Surface

These two bugs share a root cause surface: the service worker caching strategy and version resolution logic.

**Staleness**: After a new deploy, `runOneTimeRuntimeCacheReset` may not execute if `localStorage` already contains the current `CACHE_RESET_VERSION` value. The SW's `StaleWhileRevalidate` strategy for static assets and `NetworkFirst` for same-origin API routes may serve outdated content. Cross-origin API traffic to `api.mihas.edu.zm` may be intercepted.

**Version Prompt**: `APP_VERSION` is derived from `VITE_APP_VERSION` + manifest fingerprint hash. If `VITE_APP_VERSION` is not bumped, the fingerprint may collide, causing `applyDiscoveredVersion` to suppress the update when `version === currentVersionRef.current`. On mobile, the prompt at `bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]` may be obscured by the bottom navigation bar.

**Formal Specification:**
```
FUNCTION isBugCondition_SWStale(context)
  INPUT: context of type {deployVersion, cachedVersion, localStorage, swCaches}
  OUTPUT: boolean

  RETURN (context.localStorage['mihas_runtime_cache_reset'] == CACHE_RESET_VERSION
          AND newBuildDeployed(context.deployVersion, context.cachedVersion))
         OR (crossOriginApiRequest(context.request)
             AND swCacheInterceptsRequest(context.swCaches, context.request))
END FUNCTION

FUNCTION isBugCondition_VersionPrompt(context)
  INPUT: context of type {currentSWVersion, newSWVersion, viewport}
  OUTPUT: boolean

  RETURN (context.currentSWVersion == context.newSWVersion
          AND actualBuildDiffers(context))
         OR (context.viewport.isMobile
             AND promptObscuredByNavBar(context.viewport))
END FUNCTION
```

### Bug Condition 4: Catalog API Shape Mismatches (Requirement 1.4)

After envelope unwrapping by `apiClient.unwrapApiResponse`, the catalog normalizer receives `{results: [...], count: N}` from Django's paginated response. The `normalizeCollection` function handles this shape via `response?.results`, so this may work correctly. The bug condition is that the Django catalog views return a shape that `normalizeCollection` does not handle.

**Formal Specification:**
```
FUNCTION isBugCondition_Catalog(response)
  INPUT: response of type unwrapped API response for /catalog/programs/ or /catalog/intakes/
  OUTPUT: boolean

  LET unwrapped = apiClient.unwrapApiResponse(rawResponse)
  RETURN NOT (Array.isArray(unwrapped)
              OR Array.isArray(unwrapped?.results)
              OR Array.isArray(unwrapped?.programs)
              OR Array.isArray(unwrapped?.intakes))
END FUNCTION
```

### Bug Condition 5: Payment Page Failure — Discovery Task (Requirement 1.5)

**CTO Note**: This is a discovery task, not a predetermined fix. The exact failing endpoint, status code, and response body are unknown. The design treats this as an investigation phase: capture ErrorLog records, reproduce in browser, identify the specific failure, then design the fix.

**Formal Specification:**
```
FUNCTION isBugCondition_Payment(context)
  INPUT: context of type {user, applicationId, paymentEndpoint}
  OUTPUT: boolean

  -- Discovery: the exact condition is unknown until investigation
  RETURN userNavigatesToPaymentPage(context.user, context.applicationId)
         AND paymentApiCallFails(context.paymentEndpoint)
         -- Possible causes to investigate:
         --   missing endpoint, auth failure, response shape mismatch,
         --   CSRF token issue, or backend exception
END FUNCTION
```

### Bug Condition 6: Logout 403 CSRF Error (Requirement 1.6)

`POST /api/v1/auth/logout/` returns 403 because `CSRFEnforcementMiddleware` requires `X-CSRF-Token` for all POST requests, and `/api/v1/auth/logout/` is NOT in `EXEMPT_PATTERNS`. The CSRF token may be stale after session idle.

**Security Analysis (CTO-requested)**:
- **Option A: CSRF Exemption** — Add `/api/v1/auth/logout/` to `EXEMPT_PATTERNS`. Risk: any cross-origin page could trigger logout via CSRF attack (low severity — logout is not destructive, but could be used for session disruption).
- **Option B: Ensure Fresh Token** — Ensure the frontend always has a valid CSRF token before logout. The `apiClient` already has a 403 CSRF retry mechanism (`handleCsrf403`), but it checks for `errorCode === 'CSRF_INVALID' || errorCode === 'CSRF_MISSING'` while the middleware returns `code: 'CSRF_VALIDATION_FAILED'`. This code mismatch means the retry never triggers.
- **Recommended**: Fix the error code mismatch in the frontend CSRF retry logic so it catches `CSRF_VALIDATION_FAILED`, AND add logout to CSRF exempt patterns as defense-in-depth (logout should always succeed to avoid trapping users in a broken session state).

**Formal Specification:**
```
FUNCTION isBugCondition_Logout(request)
  INPUT: request of type POST /api/v1/auth/logout/
  OUTPUT: boolean

  RETURN request.method == 'POST'
         AND request.path == '/api/v1/auth/logout/'
         AND (request.headers['X-CSRF-Token'] IS NULL
              OR csrfTokenIsStale(request.headers['X-CSRF-Token']))
         AND '/api/v1/auth/logout/' NOT IN EXEMPT_PATTERNS
END FUNCTION
```

### Bug Condition 7: Admin Routing Mismatch — QA Narrowing Required (Requirement 1.7)

**CTO Note**: There are 4 possible causes — QA phase should narrow before fixing.

Possible causes:
1. **Stale SW cache**: Service worker serves a cached redirect or route guard response from a previous student session
2. **React Query session cache**: `queryClient` retains old role from a previous student login; `extractAuthUser` reads stale cache
3. **Login response missing role**: Django login response may not include `role` field, or it's nested differently than `normalizeAuthUser` expects (the function defaults to `role: 'student'` when role is missing)
4. **Route guard timing**: `StudentRoute` guard's `isAdmin` check may render before role is resolved from the session query

**Formal Specification:**
```
FUNCTION isBugCondition_AdminRouting(context)
  INPUT: context of type {user, loginResponse, swCache, queryCache}
  OUTPUT: boolean

  RETURN context.user.role == 'admin'
         AND (swCacheServesStaleRedirect(context.swCache)
              OR queryCacheRetainsOldRole(context.queryCache)
              OR loginResponseMissingRole(context.loginResponse)
              OR routeGuardRendersBeforeRoleResolved(context))
         AND currentRoute != '/admin/dashboard'
END FUNCTION
```

### Bug Condition 8: Admin Dashboard Refresh Failures (Requirement 1.8)

When an admin refreshes on `/admin/dashboard`, the system may return 500, 403, or a generic error. Possible causes: Django admin dashboard endpoint throws an unhandled exception, CSRF token is missing on initial page load causing session check to fail, or the SPA route falls through to a Django URL returning HTML instead of JSON.

**Formal Specification:**
```
FUNCTION isBugCondition_AdminRefresh(context)
  INPUT: context of type {route, csrfToken, backendEndpoint}
  OUTPUT: boolean

  RETURN context.route == '/admin/dashboard'
         AND context.isPageRefresh == true
         AND (backendThrowsException(context.backendEndpoint)
              OR csrfTokenMissingOnLoad(context.csrfToken)
              OR spaRouteFallsThroughToDjango(context.route))
END FUNCTION
```

### Bug Condition 9: Legacy Endpoint/Method Incompatibilities (Requirement 1.9)

Frontend code may use HTTP methods or endpoint paths from the Node-era codebase. Analysis of the Django backend shows:
- `ApplicationDetailView` handles both `PUT` and `PATCH` ✓
- `/details/` suffix path alias exists in `urls.py` ✓
- `ApplicationReviewView` handles both `POST` and `PATCH`, with `_normalize_legacy_review_payload` converting `status` → `new_status` ✓
- Other endpoints or payload shapes may not be fully compatible

**Formal Specification:**
```
FUNCTION isBugCondition_LegacyEndpoints(request)
  INPUT: request of type HTTPRequest
  OUTPUT: boolean

  RETURN (request.method NOT IN backendSupportedMethods(request.path)
          OR request.path NOT IN backendRegisteredPaths
          OR payloadFieldNames(request.body) NOT IN backendExpectedFields(request.path))
         AND request.originatesFromLegacyFrontendCode == true
END FUNCTION
```

### Examples

- **SSE**: Student dashboard loads → `GET /api/v1/events/stream/` with `Accept: text/event-stream` → 406 Not Acceptable because `EnvelopeRenderer` cannot satisfy the accept header
- **SW Staleness**: New build deployed → returning user visits app → service worker serves stale JS bundle from `static-v1` cache → app crashes or shows old UI
- **Version Prompt**: SW update detected → prompt shows "Current: v1.0.0-abc123 → New: v1.0.0-abc123" because `VITE_APP_VERSION` was not bumped and manifest fingerprint collided
- **Catalog**: Student opens application wizard → `GET /api/v1/catalog/programs/` → Django returns paginated envelope → after unwrapping, normalizer receives unexpected shape → empty dropdown
- **Payment**: Student navigates to payment page → API call fails → "Failed to load payment information" (exact cause TBD via investigation)
- **Logout**: User clicks logout → `POST /api/v1/auth/logout/` → 403 because CSRF token is stale and logout is not CSRF-exempt → user cannot log out
- **Admin Routing**: Admin logs in → `normalizeAuthUser` defaults role to `'student'` because login response nests role differently → navigates to `/student/dashboard`
- **Admin Refresh**: Admin on `/admin/dashboard` → browser refresh → session check returns 403 (CSRF missing on fresh page load) → generic error screen
- **Legacy Endpoints**: Frontend sends review with `{status: 'approved'}` → `_normalize_legacy_review_payload` converts to `{new_status: 'approved'}` ✓ (this one may already work)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Stable SSE connections must continue delivering real-time notifications and keepalive pings (Req 3.1)
- Service worker must continue serving cached assets normally when no new build is deployed (Req 3.2)
- Genuine SW updates with different builds must continue showing the update prompt correctly (Req 3.3)
- Catalog API normalization must continue working for all existing response shapes (Req 3.4)
- Payment display must continue working when payment data and endpoint respond correctly (Req 3.5)
- CSRF enforcement must remain active on all non-exempt state-changing endpoints (Req 3.6)
- Student login must continue navigating to `/student/dashboard` with correct route guards (Req 3.7)
- Admin dashboard must continue displaying statistics and activity when data loads successfully (Req 3.8)
- Existing `PATCH` for application updates and `POST` for reviews with `new_status` must continue working (Req 3.9)

**Scope:**
All inputs that do NOT trigger one of the 9 bug conditions should be completely unaffected by these fixes. This includes:
- Normal authenticated API requests with valid CSRF tokens
- SSE polling fallback endpoint (`/api/v1/events/poll/`)
- Mouse/touch interactions on all pages
- Non-admin user login and routing flows
- All existing test suites (backend pytest, frontend vitest)

## Hypothesized Root Cause

### Bug 1 — SSE 406/CORS

1. **Content Negotiation Failure**: `DEFAULT_RENDERER_CLASSES` only contains `EnvelopeRenderer` (media type `application/json`). When the browser sends `Accept: text/event-stream`, DRF's content negotiation may reject the request before the view's `renderer_classes = [ServerSentEventRenderer]` is consulted. The `SSEStreamView.get()` method bypasses DRF's response pipeline by returning a raw `StreamingHttpResponse`, but the permission check and content negotiation happen before `get()` is called.
2. **CORS Missing Headers**: `CORS_ALLOW_HEADERS` in `base.py` includes `cache-control` and `last-event-id` (added to `default_headers`), so `Last-Event-ID` should be allowed. However, the SSE endpoint may need `Access-Control-Expose-Headers` to include SSE-specific headers, and the `text/event-stream` content type may need explicit CORS handling.
3. **Evidence Check**: Query `ErrorLog` for entries with `entity_type='events'` or `endpoint LIKE '%/events/stream%'` to confirm the 406 status code and CORS error details.

### Bug 2+3 — SW Staleness + Version Prompt (Coupled)

1. **Cache Reset Version Collision**: `CACHE_RESET_VERSION = 'django-cutover-2026-04-02'` is a static string. Once set in `localStorage`, subsequent deploys will not trigger `runOneTimeRuntimeCacheReset`. This is by design (one-time reset), but means post-cutover deploys rely entirely on the SW's normal update cycle.
2. **Cross-Origin API Caching**: The SW's API route handler only matches `url.origin === self.location.origin`. Since production API is at `api.mihas.edu.zm` (different origin from `apply.mihas.edu.zm`), cross-origin API requests should NOT be cached. This is likely correct.
3. **Static Cache Persistence**: The `static-v1` cache is explicitly preserved across SW activations (`!isStaticCache`). Stale JS/CSS bundles in `static-v1` with `StaleWhileRevalidate` strategy will serve old content until the revalidation completes. If the old bundle URLs no longer exist on the CDN, the revalidation silently fails and stale content persists.
4. **Version Fingerprint Collision**: `APP_VERSION = [VITE_APP_VERSION, MANIFEST_FINGERPRINT].join('-')`. If `VITE_APP_VERSION` is static and the manifest fingerprint collides (unlikely but possible with hash truncation), `applyDiscoveredVersion` suppresses the update.
5. **Mobile Prompt Positioning**: `bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]` may place the prompt behind the bottom navigation bar on devices where `safe-area-inset-bottom` is 0 but a bottom nav exists.

### Bug 4 — Catalog API Shape

1. **Likely Non-Issue**: After `apiClient.unwrapApiResponse` strips `{success, data}`, the catalog normalizer receives `{results: [...], count: N}`. The `normalizeCollection` function checks `Array.isArray(response?.results)` which should match. However, if the Django catalog view returns a non-paginated response (e.g., a raw list), the unwrapper may return the list directly, which `normalizeCollection` also handles.
2. **Edge Case**: If the catalog view returns an empty `{results: [], count: 0}`, the normalizer should return an empty array. Verify this path.
3. **Evidence Check**: Query `ErrorLog` for entries with `endpoint LIKE '%/catalog/%'` to see if there are actual 500s or shape errors.

### Bug 5 — Payment Page (Discovery)

1. **Unknown Root Cause**: The exact failing endpoint, status code, and response body are not yet captured. Possible causes:
   - Missing payment endpoint in Django backend
   - Auth failure (401/403) on payment-related API call
   - Response shape mismatch after envelope unwrapping
   - Backend exception (500) in payment view
2. **Evidence Check**: Query `ErrorLog` for entries with `entity_type='payments'` or `endpoint LIKE '%/payment%'`. Check browser network tab on the live deployment.

### Bug 6 — Logout 403

1. **CSRF Exempt Patterns Gap**: `EXEMPT_PATTERNS` includes login, register, password-reset, and error report — but NOT logout. Logout is a POST, so CSRF is enforced.
2. **Frontend CSRF Retry Code Mismatch**: The `apiClient` checks for `errorCode === 'CSRF_INVALID' || errorCode === 'CSRF_MISSING'` but the middleware returns `code: 'CSRF_VALIDATION_FAILED'`. The retry logic never triggers for logout 403s.
3. **Token Staleness**: After session idle, the CSRF token in the frontend store may reference a deleted `CSRFToken` row in the database, causing validation to fail even when the token is present in the header.

### Bug 7 — Admin Routing (4 Possible Causes)

1. **Role Default**: `normalizeAuthUser` in `useSessionListener.ts` defaults `role: payload.role || 'student'`. If the Django login response doesn't include `role` at the top level, or nests it under `user_metadata` or `app_metadata`, the fallback to `'student'` triggers.
2. **Cache Persistence**: `signIn` calls `queryClient.removeQueries` with a predicate that keeps `auth` and `user-profile` caches, then `queryClient.invalidateQueries()`. But if the session query returns before the invalidation completes, stale role data may persist.
3. **SW Cache**: Less likely given cross-origin API routing, but a stale cached session response from a same-origin path could cause this.
4. **Route Guard Timing**: `checkIsAdmin` reads `user.role || user.user_metadata?.role || user.app_metadata?.role`. If the session query hasn't resolved yet, `user` is null and `isAdmin` is false, causing the student route to render.

### Bug 8 — Admin Dashboard Refresh

1. **CSRF on Session Check**: On page refresh, the frontend calls `GET /api/v1/auth/session/`. GET requests are not subject to CSRF enforcement, so this should work. However, if the session check triggers a token refresh (POST), the refresh may fail due to CSRF.
2. **SPA Fallback**: If the Vercel deployment doesn't have proper SPA fallback routing, a refresh on `/admin/dashboard` may hit the Django backend directly, which returns HTML (404 or admin panel) instead of the SPA shell.
3. **Backend Exception**: The admin dashboard API endpoint may throw an unhandled exception. Check `ErrorLog` for 500s on admin endpoints.

### Bug 9 — Legacy Endpoint/Method Incompatibilities

1. **Already Handled**: `ApplicationDetailView` supports PUT+PATCH, `/details/` alias exists, `ApplicationReviewView` normalizes `status` → `new_status`. Most legacy patterns appear to be covered.
2. **Remaining Gaps**: Other frontend code may use endpoints or methods not yet audited. A systematic grep of frontend API calls against backend URL patterns is needed.

## Correctness Properties

Property 1: Bug Condition — SSE Stream Returns Valid Event Stream

_For any_ authenticated GET request to `/api/v1/events/stream/` with `Accept: text/event-stream`, the fixed backend SHALL return a 200 response with `Content-Type: text/event-stream`, valid CORS headers, and begin streaming SSE events without triggering a 406 or CORS error.

**Validates: Requirements 2.1**

Property 2: Bug Condition — Service Worker Serves Fresh Assets After Deploy

_For any_ returning user visit after a new frontend build is deployed, the fixed service worker SHALL serve the latest JavaScript bundles and HTML shell by purging stale entries from `static-v1` on activation, and SHALL NOT cache or intercept cross-origin API traffic to `api.mihas.edu.zm`.

**Validates: Requirements 2.2**

Property 3: Bug Condition — Version Prompt Shows Distinct Versions

_For any_ service worker update where the actual build content differs, the fixed version resolution logic SHALL produce distinct `currentVersion` and `newVersion` strings, and on mobile viewports the update prompt SHALL be fully visible and tappable above the bottom navigation bar.

**Validates: Requirements 2.3**

Property 4: Bug Condition — Catalog Dropdowns Populate Correctly

_For any_ Django catalog API response (paginated, raw array, or keyed object) after envelope unwrapping, the fixed `normalizeCollection` function SHALL extract the items array and return a non-empty collection when items exist in the response.

**Validates: Requirements 2.4**

Property 5: Bug Condition — Payment Page Shows Diagnostic Information

_For any_ payment page load that fails, the fixed system SHALL either load payment information successfully or display a specific diagnostic error message identifying the exact failure (endpoint, status code, error code) rather than a generic message. (Discovery task: fix determined after investigation.)

**Validates: Requirements 2.5**

Property 6: Bug Condition — Logout Completes Successfully

_For any_ logout request (`POST /api/v1/auth/logout/`), the fixed system SHALL complete the request successfully by ensuring CSRF validation does not block logout, then clear auth cookies and local state.

**Validates: Requirements 2.6**

Property 7: Bug Condition — Admin Login Routes to Admin Dashboard

_For any_ admin user login, the fixed system SHALL navigate to `/admin/dashboard` by ensuring the login response includes the `role` field, `extractAuthUser` correctly resolves the admin role, and stale session caches are cleared before route resolution.

**Validates: Requirements 2.7**

Property 8: Bug Condition — Admin Dashboard Refresh Returns Valid Data

_For any_ browser refresh on `/admin/dashboard` by an authenticated admin user, the fixed system SHALL return valid dashboard JSON data with a 200 status, or a structured error response with a diagnostic status code (not a generic 500 or HTML error page).

**Validates: Requirements 2.8**

Property 9: Bug Condition — Legacy API Calls Use Compatible Methods and Paths

_For any_ frontend API call using legacy endpoint paths or HTTP methods, the fixed system SHALL either support the legacy pattern directly or normalize the request to the Django-compatible format, returning a valid response instead of 404/405.

**Validates: Requirements 2.9**

Property 10: Preservation — Existing Functionality Unchanged

_For any_ input where none of the 9 bug conditions hold (stable SSE connections, no new deploy, student login, valid CSRF tokens, existing PATCH/POST contracts), the fixed system SHALL produce the same behavior as the original system, preserving all existing functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**

## Fix Implementation

### Deploy Sequencing Plan (CTO-Requested)

The 9 fixes touch both backend and frontend. Deploy order matters because some frontend fixes depend on backend changes being live first.

**Phase 1 — Backend First:**
1. Bug 1 (SSE): Add `ServerSentEventRenderer` handling to content negotiation — backend-only
2. Bug 6 (Logout CSRF): Add `/api/v1/auth/logout/` to `EXEMPT_PATTERNS` — backend-only
3. Bug 9 (Legacy endpoints): Verify and add any missing endpoint aliases — backend-only
4. Bug 8 (Admin refresh): Fix any backend exceptions on admin dashboard endpoints — backend-only

**Phase 2 — Frontend (after backend is live):**
5. Bug 2+3 (SW + Version): Update cache reset version, fix `static-v1` purge on activation, fix version resolution, fix mobile prompt positioning — frontend-only
6. Bug 4 (Catalog): Verify normalizer handles all shapes; add defensive fallback if needed — frontend-only
7. Bug 6 (Logout CSRF — frontend side): Fix CSRF error code mismatch in `apiClient` (`CSRF_VALIDATION_FAILED`) — frontend-only
8. Bug 7 (Admin routing): Fix role resolution in `normalizeAuthUser`, ensure cache clearing — frontend-only

**Phase 3 — Investigation (can run in parallel):**
9. Bug 5 (Payment): Capture ErrorLog records, reproduce, identify root cause, then fix

### Changes Required

**Bug 1 — SSE 406/CORS**

**File**: `backend/apps/common/sse.py`
**Changes**:
1. Ensure `SSEStreamView` content negotiation works by adding `ServerSentEventRenderer` to the view's renderer list (already present) and verifying DRF doesn't reject the request before reaching the view. May need to add a `content_negotiation_class` override or add `ServerSentEventRenderer` to `DEFAULT_RENDERER_CLASSES` conditionally.
2. Alternatively, override `perform_content_negotiation` on `SSEStreamView` to always select `ServerSentEventRenderer` for SSE requests.

**File**: `backend/config/settings/base.py`
**Changes**:
1. Verify `CORS_ALLOW_HEADERS` includes `last-event-id` (already present via `default_headers` extension).
2. Verify `CORS_EXPOSE_HEADERS` includes any SSE-specific response headers if needed.

**Bug 2+3 — SW Staleness + Version Prompt (Coupled Fix)**

**File**: `apps/admissions/src/main.tsx`
**Changes**:
1. Bump `CACHE_RESET_VERSION` to a new value (e.g., `'post-qa-2026-04-XX'`) to trigger a fresh one-time cache reset for all users.

**File**: `apps/admissions/src/service-worker.ts`
**Changes**:
1. On activation, also purge `static-v1` cache entries for JS/CSS bundles that are no longer in the current precache manifest (stale bundle cleanup).
2. Ensure cross-origin API requests to `api.mihas.edu.zm` are explicitly excluded from all caching strategies (add a `NetworkOnly` route for cross-origin API).

**File**: `apps/admissions/src/hooks/useServiceWorkerUpdate.ts`
**Changes**:
1. Fix version comparison in `applyDiscoveredVersion` to use a more robust comparison that accounts for manifest fingerprint changes even when `VITE_APP_VERSION` is static.

**File**: `apps/admissions/src/components/ServiceWorkerUpdatePrompt.tsx`
**Changes**:
1. Adjust mobile positioning to ensure the prompt is above the bottom navigation bar: change `bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]` to account for the actual nav bar height.

**Bug 4 — Catalog API Shape**

**File**: `apps/admissions/src/services/catalog.ts`
**Changes**:
1. Add defensive logging in `normalizeCollection` to capture the actual response shape when items array is empty but response is non-null.
2. Verify the Django catalog views return the expected paginated shape. If they return a non-paginated list, the normalizer already handles it.

**Bug 5 — Payment Page (Discovery Task)**

**Investigation Steps**:
1. Query `ErrorLog` table for entries with `entity_type='payments'` or `endpoint LIKE '%payment%'` or `endpoint LIKE '%finance%'`
2. Reproduce in browser: navigate to payment page, capture network tab (endpoint, status, response body)
3. Check if the payment endpoint exists in Django URL patterns
4. Check if the frontend payment service uses the correct endpoint path and method
5. Design fix based on findings

**Bug 6 — Logout 403 CSRF**

**File**: `backend/apps/common/middleware.py`
**Changes**:
1. Add `re.compile(r"^/api/v1/auth/logout/?$")` to `EXEMPT_PATTERNS` in `CSRFEnforcementMiddleware`

**File**: `apps/admissions/src/services/client.ts`
**Changes**:
1. Update the CSRF 403 retry condition from `errorCode === 'CSRF_INVALID' || errorCode === 'CSRF_MISSING'` to also include `errorCode === 'CSRF_VALIDATION_FAILED'` to match the actual middleware error code

**Bug 7 — Admin Routing (QA Narrowing First)**

**QA Steps** (before fixing):
1. Check Django login response shape: does it include `role` at top level? Check `LoginView` serializer.
2. Check `normalizeAuthUser`: does it correctly extract role from the Django response?
3. Check `signIn` cache seeding: does it properly clear stale role data?
4. Check route guard timing: does `isAdmin` resolve before route renders?

**File**: `apps/admissions/src/hooks/auth/useSessionListener.ts`
**Likely Changes** (after QA narrows the cause):
1. Ensure `normalizeAuthUser` extracts `role` from the correct location in the Django response
2. Ensure `signIn` atomically seeds the correct role before navigation

**Bug 8 — Admin Dashboard Refresh**

**Investigation Steps**:
1. Query `ErrorLog` for 500s on admin dashboard endpoints
2. Check Vercel SPA fallback configuration for `/admin/*` routes
3. Verify the admin dashboard API endpoint handles all edge cases

**Bug 9 — Legacy Endpoint/Method Audit**

**Investigation Steps**:
1. Grep frontend code for all `apiClient.request` calls with `PUT`, `PATCH`, `DELETE` methods
2. Cross-reference against `backend/apps/applications/urls.py` and other URL patterns
3. Identify any mismatches and add backend support or frontend normalization

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug on unfixed code (using ErrorLog evidence where available per CTO guidance), then verify the fix works correctly and preserves existing behavior. Given 9 interleaved bugs touching both backend and frontend, tests are organized by bug condition with a shared preservation suite.

### Evidence Collection (CTO-Requested: ErrorLog Before Browser Reproduction)

Before writing exploratory tests, query the `ErrorLog` table for production evidence:
```sql
-- SSE errors
SELECT * FROM error_logs WHERE endpoint LIKE '%/events/stream%' OR message LIKE '%406%' OR message LIKE '%text/event-stream%' ORDER BY created_at DESC LIMIT 20;

-- Payment errors
SELECT * FROM error_logs WHERE entity_type = 'payments' OR endpoint LIKE '%payment%' OR endpoint LIKE '%finance%' ORDER BY created_at DESC LIMIT 20;

-- Admin dashboard errors
SELECT * FROM error_logs WHERE endpoint LIKE '%/admin/dashboard%' OR (source = 'backend' AND entity_type = 'admin') ORDER BY created_at DESC LIMIT 20;

-- CSRF/logout errors
SELECT * FROM error_logs WHERE message LIKE '%CSRF%' OR endpoint LIKE '%/auth/logout%' ORDER BY created_at DESC LIMIT 20;

-- Catalog errors
SELECT * FROM error_logs WHERE endpoint LIKE '%/catalog/%' ORDER BY created_at DESC LIMIT 20;
```

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that reproduce each bug condition on the unfixed code. Run these tests to observe failures and confirm root causes.

**Test Cases**:
1. **SSE Content Negotiation Test**: Send GET to `/api/v1/events/stream/` with `Accept: text/event-stream` header — expect 406 on unfixed code (confirms DRF content negotiation rejects before view)
2. **SW Static Cache Staleness Test**: Verify `static-v1` cache retains old bundle URLs after SW activation with new manifest (confirms stale bundles persist)
3. **Version Fingerprint Collision Test**: Generate two manifests with same `VITE_APP_VERSION` but different content — verify `APP_VERSION` produces same string (confirms collision)
4. **Catalog Normalizer Shape Test**: Pass Django paginated response `{results: [...], count: N}` to `normalizeCollection` — verify it extracts items (may pass, confirming non-issue)
5. **Logout CSRF Test**: Send POST to `/api/v1/auth/logout/` without CSRF token — expect 403 (confirms CSRF enforcement blocks logout)
6. **CSRF Error Code Mismatch Test**: Verify frontend CSRF retry checks for `CSRF_INVALID`/`CSRF_MISSING` but middleware returns `CSRF_VALIDATION_FAILED` (confirms retry never triggers)
7. **Admin Role Resolution Test**: Pass Django login response without top-level `role` to `normalizeAuthUser` — verify it defaults to `'student'` (confirms role default issue)
8. **Admin Dashboard Refresh Test**: Simulate page refresh on `/admin/dashboard` — check if SPA fallback serves index.html or Django returns HTML error

**Expected Counterexamples**:
- SSE: 406 Not Acceptable response from DRF content negotiation
- Logout: 403 Forbidden with `code: 'CSRF_VALIDATION_FAILED'`
- Admin routing: `normalizeAuthUser` returns `role: 'student'` for admin user
- CSRF retry: frontend checks wrong error codes, retry never fires

### Fix Checking

**Goal**: Verify that for all inputs where each bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL request WHERE isBugCondition_SSE(request) DO
  result := SSEStreamView_fixed.get(request)
  ASSERT result.status == 200
  ASSERT result.content_type == 'text/event-stream'
  ASSERT result.headers['Access-Control-Allow-Origin'] IS NOT NULL
END FOR

FOR ALL context WHERE isBugCondition_Logout(context) DO
  result := CSRFEnforcementMiddleware_fixed(context.request)
  ASSERT result.status != 403 OR logoutExempt(context.request.path)
END FOR

FOR ALL context WHERE isBugCondition_AdminRouting(context) DO
  result := normalizeAuthUser_fixed(context.loginResponse)
  ASSERT result.role == context.actualUserRole
END FOR

FOR ALL response WHERE isBugCondition_Catalog(response) DO
  result := normalizeCollection_fixed(response, key, normalizer)
  ASSERT result.length > 0 WHEN response contains items
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where none of the 9 bug conditions hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL request WHERE NOT isBugCondition_any(request) DO
  ASSERT originalFunction(request) == fixedFunction(request)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for normal operations, then write property-based tests capturing that behavior.

**Test Cases**:
1. **SSE Polling Preservation**: Verify `GET /api/v1/events/poll/` continues to return JSON notifications correctly after SSE fix
2. **CSRF Enforcement Preservation**: Verify CSRF is still enforced on all non-exempt POST/PUT/PATCH/DELETE endpoints after adding logout exemption
3. **Student Routing Preservation**: Verify student login still navigates to `/student/dashboard` after admin routing fix
4. **Catalog Normalizer Preservation**: Verify existing response shapes (raw array, keyed object, paginated) continue to normalize correctly
5. **API Client Preservation**: Verify envelope unwrapping, 401 retry, and cache invalidation continue working after CSRF error code fix
6. **SW Cache Preservation**: Verify service worker still caches same-origin static assets and serves offline fallback after staleness fix

### Unit Tests

- Test `SSEStreamView` content negotiation with `Accept: text/event-stream` header
- Test `CSRFEnforcementMiddleware` with logout path in exempt patterns
- Test `normalizeAuthUser` with various Django login response shapes (role at top level, nested, missing)
- Test `normalizeCollection` with all known response shapes from Django catalog views
- Test `apiClient` CSRF retry with `CSRF_VALIDATION_FAILED` error code
- Test service worker version resolution with various `VITE_APP_VERSION` and manifest combinations
- Test mobile prompt positioning calculation

### Property-Based Tests

- Generate random HTTP requests and verify CSRF enforcement is correct (exempt paths pass, non-exempt paths require token) — backend hypothesis test
- Generate random catalog API response shapes and verify `normalizeCollection` always returns an array — frontend fast-check test
- Generate random user payloads and verify `normalizeAuthUser` always returns a valid user with correct role — frontend fast-check test
- Generate random service worker manifests and verify `APP_VERSION` produces unique strings for different content — frontend fast-check test

### Integration Tests

- Full SSE connection lifecycle: connect → receive keepalive → receive notification → reconnect after timeout
- Full logout flow: authenticated user → click logout → POST succeeds → cookies cleared → redirected to sign-in
- Full admin login flow: admin credentials → login → role resolved → navigated to `/admin/dashboard`
- Full admin refresh flow: on `/admin/dashboard` → browser refresh → SPA shell loads → session validated → dashboard renders
- Full catalog flow: open application wizard → programs and intakes load → dropdowns populated
- Full payment flow (after discovery): navigate to payment page → payment info loads or diagnostic error shown
