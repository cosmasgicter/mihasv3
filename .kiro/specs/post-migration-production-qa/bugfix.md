# Bugfix Requirements Document

## Introduction

After migrating the MIHAS admissions backend from Node.js to Django, the production frontend at apply.mihas.edu.zm exhibits multiple critical failures across 9 distinct bug conditions. These span SSE connectivity, service worker cache staleness, update prompt UX, catalog API shape mismatches, payment page failures, logout CSRF errors, admin routing mismatches, admin dashboard refresh failures, and legacy endpoint/method usage. The root cause is a combination of stale cached assets, missing CORS/content-negotiation configuration for cross-origin SSE, frontend code expecting Node-era response shapes, CSRF enforcement gaps on the logout endpoint, and service worker caching of cross-origin API traffic.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a student dashboard loads and the frontend opens an SSE connection to `***REMOVED***/api/v1/events/stream/` THEN the system returns a 406 Not Acceptable or CORS error because the browser sends `Accept: text/event-stream` but DRF content negotiation may reject it when the `ServerSentEventRenderer` is only set on the view class and not in `DEFAULT_RENDERER_CLASSES`, and CORS headers may not include `text/event-stream` or `Last-Event-ID` in allowed headers, causing an SSE reconnect loop on the student dashboard.

1.2 WHEN a new frontend build is deployed to production and a returning user visits apply.mihas.edu.zm THEN the system may serve stale cached JavaScript bundles, HTML shell, or API responses from a previous service worker because the one-time runtime cache reset (`runOneTimeRuntimeCacheReset`) may not execute if `localStorage` already contains the current `CACHE_RESET_VERSION` value, or the service worker's `StaleWhileRevalidate` strategy for static assets and `NetworkFirst` strategy for same-origin API routes may serve outdated content from the `static-v1` or `mihas-app-api-*` caches.

1.3 WHEN the service worker update prompt appears and both `currentVersion` and `newVersion` are resolved via `GET_VERSION` postMessage THEN the system displays the same version string for both "Current" and "New" because `APP_VERSION` is derived from `VITE_APP_VERSION` combined with a manifest fingerprint hash, and if `VITE_APP_VERSION` is not bumped between deploys the fingerprint may collide, causing `applyDiscoveredVersion` to suppress the update (line: `if (currentVersionRef.current && version === currentVersionRef.current)`). Additionally, on mobile viewports the prompt is positioned at `bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]` which may be obscured by the bottom navigation bar or fall outside the tappable safe area.

1.4 WHEN a student reaches Step 1 of the application wizard and the frontend calls `GET /api/v1/catalog/programs/` and `GET /api/v1/catalog/intakes/` THEN the system may fail to populate the program and intake dropdowns because the Django backend returns a paginated envelope `{success: true, data: {results: [...], count: N, ...}}` while the frontend `normalizeCollection` function in `catalog.ts` expects either a raw array, a `{programs: [...]}` / `{intakes: [...]}` keyed object, or a `{results: [...]}` shape — but the `apiClient.unwrapApiResponse` already strips the `{success, data}` envelope, so the catalog normalizer receives `{results: [...], count: N}` which should work, unless the Django catalog views return a different shape than expected.

1.5 WHEN a student navigates to the payment page THEN the system shows "Failed to load payment information" because the payment API request fails — the exact failing endpoint, status code, and response body need to be captured from the live deployment to identify whether this is a missing endpoint, auth failure, or response shape mismatch.

1.6 WHEN a user clicks logout and the frontend sends `POST /api/v1/auth/logout/` THEN the system returns 403 Forbidden because the `CSRFEnforcementMiddleware` requires a valid `X-CSRF-Token` header for all POST requests, the logout endpoint is NOT in the CSRF exempt patterns list, and the CSRF token may be stale or missing if the user's session has been idle or the token was not refreshed after a prior 403 recovery cycle.

1.7 WHEN an admin user logs in and the auth flow completes THEN the system may land on the student dashboard (`/student/dashboard`) instead of `/admin/dashboard` because: (a) a stale service worker may serve a cached redirect or cached route guard response, (b) React Query session cache from a previous student login may persist the old role, (c) the session payload from the Django login response may not include the `role` field or it may be nested differently than the frontend `extractAuthUser` / `normalizeAuthUser` expects, or (d) the `StudentRoute` guard's `isAdmin` check may not trigger correctly if the role is not yet resolved when the route renders.

1.8 WHEN an admin user refreshes the browser on `/admin/dashboard` THEN the system may return a 500 Internal Server Error, 403 Forbidden, or a generic "unexpected error" instead of valid dashboard data because: (a) the Django admin dashboard endpoint may throw an unhandled exception, (b) the CSRF token may be missing on the initial page load causing the session check to fail, or (c) the SPA route falls through to a Django URL that doesn't exist, returning an HTML error page instead of JSON.

1.9 WHEN the frontend makes API calls using HTTP methods or endpoint paths from the Node-era codebase THEN the system may return 404 or 405 because the Django backend may not support `PUT` on all endpoints (though `ApplicationDetailView` does handle both `PUT` and `PATCH`), the `/details/` suffix path alias exists in `urls.py`, and `ApplicationReviewView` handles both `POST` and `PATCH` — but other endpoints or payload shapes (e.g., review payloads with `status` instead of `new_status`) may not be fully compatible.

### Expected Behavior (Correct)

2.1 WHEN a student dashboard loads and the frontend opens an SSE connection to the events stream endpoint THEN the system SHALL return a 200 response with `Content-Type: text/event-stream`, proper CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials`), and begin streaming keepalive pings and notification events without triggering a reconnect loop.

2.2 WHEN a new frontend build is deployed to production and a returning user visits the app THEN the system SHALL serve the latest JavaScript bundles and HTML shell by ensuring the service worker's precache manifest is updated, old caches are purged on activation, and the one-time runtime cache reset executes correctly for the current migration version. Cross-origin API traffic to `api.mihas.edu.zm` SHALL NOT be cached or intercepted by the service worker.

2.3 WHEN the service worker update prompt appears THEN the system SHALL display distinct version strings for "Current" and "New" that accurately reflect the build difference. On mobile viewports, the prompt SHALL be fully visible and tappable above the bottom navigation bar and within the device safe area.

2.4 WHEN a student reaches Step 1 of the application wizard THEN the system SHALL successfully load and display programs and intakes in the dropdown selectors, with the frontend catalog normalizer correctly handling the Django response shape after envelope unwrapping.

2.5 WHEN a student navigates to the payment page THEN the system SHALL load payment information successfully, or display a specific diagnostic error message identifying the exact failure (endpoint, status code, error code) rather than a generic "Failed to load payment information" message.

2.6 WHEN a user clicks logout THEN the system SHALL successfully complete the `POST /api/v1/auth/logout/` request by either adding the logout endpoint to the CSRF exempt patterns or ensuring a valid CSRF token is always available for the logout request, then clear auth cookies and local state.

2.7 WHEN an admin user logs in THEN the system SHALL navigate to `/admin/dashboard` by ensuring the login response includes the `role` field, the frontend `extractAuthUser` correctly resolves the admin role, stale session/route caches are cleared, and the route guard redirects admins away from student routes.

2.8 WHEN an admin user refreshes the browser on `/admin/dashboard` THEN the system SHALL either return valid dashboard JSON data with a 200 status, or return a structured error response with a diagnostic status code (not a generic 500 or HTML error page), allowing the SPA to render an appropriate error state.

2.9 WHEN the frontend makes API calls THEN the system SHALL use endpoint paths and HTTP methods that the Django backend supports, with backward-compatible payload normalization for legacy field names (e.g., `status` → `new_status` in review payloads) already handled by `ApplicationReviewView._normalize_legacy_review_payload`.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a student is on a stable network and the SSE connection is healthy THEN the system SHALL CONTINUE TO deliver real-time notification events and keepalive pings through the SSE stream, and the polling fallback SHALL CONTINUE TO work when SSE is unavailable.

3.2 WHEN a user visits the app and no new build has been deployed THEN the system SHALL CONTINUE TO serve cached assets normally via the service worker's precache and runtime cache strategies without unnecessary cache purges or forced reloads.

3.3 WHEN a genuine service worker update is available with a different build THEN the system SHALL CONTINUE TO show the update prompt with correct version information and allow the user to update or dismiss.

3.4 WHEN the catalog API returns programs and intakes in the expected Django paginated format THEN the system SHALL CONTINUE TO normalize and display them correctly in the application wizard, admin catalog management, and all other catalog consumers.

3.5 WHEN a student has valid payment data and the payment endpoint responds correctly THEN the system SHALL CONTINUE TO display payment information, verification status, and receipt functionality without regression.

3.6 WHEN a user performs any authenticated POST/PUT/PATCH/DELETE operation with a valid CSRF token THEN the system SHALL CONTINUE TO enforce CSRF validation on all non-exempt state-changing endpoints.

3.7 WHEN a student user logs in THEN the system SHALL CONTINUE TO navigate to `/student/dashboard` and the student route guards SHALL CONTINUE TO function correctly.

3.8 WHEN the admin dashboard loads fresh data from the API THEN the system SHALL CONTINUE TO display application statistics, recent activity, and quick actions correctly.

3.9 WHEN the frontend uses `PATCH` for application updates and `POST` for reviews with the `new_status` field THEN the system SHALL CONTINUE TO process these requests correctly through the existing Django views.
