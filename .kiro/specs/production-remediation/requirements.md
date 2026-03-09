# Requirements Document

## Introduction

Comprehensive production-grade remediation pass for the MIHAS Application System (***REMOVED***), a live admissions portal for Mukuba Institute of Health and Allied Sciences, Zambia. Three prior specs addressed security hardening, UI token consistency, and critical bug fixes (SQL parameterization, CSRF refresh exemption, CSP headers, broken CRUD). This spec covers the remaining remediation tracks: race conditions and state management, auth/session hardening beyond CSRF, API correctness at the integration level, offline/PWA robustness, performance optimization, accessibility depth, admin simplification cleanup, and migration remnant removal. All changes must preserve backward compatibility with 90+ database tables, maintain the 8-second auto-save interval, preserve PWA offline functionality, and never log PII.

## Glossary

- **Application_System**: The MIHAS admissions portal (React 18 + TypeScript + Vite) deployed on Vercel at apply.mihas.edu.zm
- **API_Layer**: Vercel serverless functions in `api-src/` using query-parameter routing with Arcjet protection, bundled to `api/`
- **Auth_Module**: Custom JWT authentication system using jose for tokens and bcrypt for password hashing, in `api-src/auth.ts` and `lib/auth/`
- **Auth_Context**: React context provider in `src/contexts/AuthContext.tsx` wrapping `useSessionListener` hook
- **Session_Listener**: The `useSessionListener` hook in `src/hooks/auth/useSessionListener.ts`, single source of truth for auth state via React Query
- **Auth_Store**: Zustand store in `src/stores/authStore.ts` tracking auth state with exponential backoff
- **Auth_Controller**: The `authController` in `src/services/authController.ts` handling token refresh, CSRF attachment, and logout
- **Auto_Save_Hook**: The `useAutoSave` hook in `src/hooks/useAutoSave.ts` providing 8-second interval form persistence
- **Draft_Manager**: The `useDraftManager` hook in `src/hooks/useDraftManager.ts` for draft deletion and cleanup
- **Application_Wizard**: 4-step student application form (Personal Info, Academic History, Program Selection, Document Upload)
- **Application_Store**: Zustand store in `src/stores/applicationStore.ts` for application state
- **SSE_Client**: Server-Sent Events client in `src/lib/sseClient.ts` with reconnection and battery-friendly behavior
- **Polling_Hook**: The `useStudentDashboardPolling` hook providing 30-second polling with fingerprint deduplication
- **Admin_Polling_Hook**: The `useAdminDashboardPolling` hook for admin dashboard data
- **Offline_Sync_Service**: IndexedDB-based offline queue in `src/services/offlineSync.ts` with FIFO processing
- **Offline_Storage**: IndexedDB abstraction in `src/lib/offlineStorage.ts`
- **Service_Worker**: PWA service worker in `src/service-worker.ts` managed by vite-plugin-pwa
- **API_Client**: The `ApiClient` class in `src/services/client.ts` that unwraps `{ success, data }` envelopes
- **Query_Client**: React Query `QueryClient` configured in `src/App.tsx` with global defaults
- **CSRF_Token_Store**: Module-level in-memory CSRF token in `src/lib/csrfToken.ts`
- **Secure_Storage**: Encrypted localStorage wrapper in `src/lib/secureStorage.ts` using Web Crypto AES-GCM
- **Error_Handler**: Server-side error response utility in `lib/errorHandler.ts` providing `sendSuccess`/`sendError`
- **Audit_Logger**: Logging utility in `lib/auditLogger.ts` for recording state changes without PII
- **Route_Config**: Route definitions in `src/routes/config.tsx` with lazy-loaded page components
- **ECZ_Grading**: Zambian Examinations Council grading scale (1-9, where 1-6 is pass, 7-9 is fail)
- **PII**: Personally Identifiable Information including NRC numbers, passport numbers, medical conditions, phone numbers, and email addresses

## Requirements

### Requirement 1: Eliminate Dual Auth State Sources

**User Story:** As a developer, I want a single source of truth for authentication state, so that the UI never shows stale or contradictory auth information across components.

#### Acceptance Criteria

1. THE Application_System SHALL use the Session_Listener (React Query-based) as the sole source of auth state, removing all direct reads from the Auth_Store for user identity, role, and authentication status in components and hooks
2. WHEN the Session_Listener updates auth state via React Query cache, THE Auth_Store SHALL synchronize its `user` and `isAuthenticated` fields from the same cache entry, not maintain an independent copy
3. THE Auth_Store SHALL retain only retry/backoff state and error state, delegating user identity and authentication status entirely to the Session_Listener
4. WHEN a component needs to check authentication, THE Application_System SHALL use `useAuth()` from Auth_Context or `useAuthCheck()` from Session_Listener, not `useAuthStore()` directly for user identity
5. FOR ALL navigation guards (ProtectedRoute, StudentRoute, AdminRoute), THE Application_System SHALL derive auth state from a single hook call, ensuring consistent loading and authenticated states across all guards

### Requirement 2: Prevent Auto-Save Race Conditions

**User Story:** As a student filling out the application wizard, I want auto-save to never corrupt my data due to overlapping save requests, so that my progress is always accurately preserved.

#### Acceptance Criteria

1. WHEN an auto-save request is in-flight and the 8-second interval triggers again, THE Auto_Save_Hook SHALL skip the new save and wait for the next interval, preventing concurrent save requests for the same form
2. WHEN a manual save (button click) is triggered while an auto-save is in-flight, THE Auto_Save_Hook SHALL queue the manual save to execute after the in-flight request completes, ensuring the latest data is saved
3. THE Auto_Save_Hook SHALL use a ref-based flag (not state) to track in-flight status, avoiding stale closure issues where the interval callback captures an outdated `isSaving` value
4. WHEN the component unmounts while an auto-save is in-flight, THE Auto_Save_Hook SHALL cancel the pending save via AbortController and clear the interval, preventing state updates on unmounted components
5. THE Auto_Save_Hook SHALL attach a monotonically increasing version number to each save payload, and THE API_Layer SHALL reject saves where the version is less than or equal to the stored version (optimistic concurrency)
6. FOR ALL auto-save operations, parsing the saved data then re-serializing it SHALL produce an equivalent object (round-trip property)

### Requirement 3: Prevent Double-Submit on Forms

**User Story:** As a student, I want form submissions to be processed exactly once, so that I do not accidentally create duplicate applications or payments.

#### Acceptance Criteria

1. WHEN a student clicks the submit button on the Application_Wizard final step, THE Application_System SHALL disable the submit button immediately and display a loading indicator until the server responds
2. WHEN a submission request is in-flight, THE Application_System SHALL ignore additional click events on the submit button, preventing duplicate POST requests
3. THE API_Layer SHALL implement idempotency for application submission: WHEN a submission request includes an idempotency key, THE API_Layer SHALL return the original response if the key has been seen within the last 24 hours
4. WHEN a payment confirmation is submitted, THE Application_System SHALL apply the same double-submit prevention (disable button, ignore duplicate clicks, idempotency key)
5. IF a submission request fails with a network error, THEN THE Application_System SHALL re-enable the submit button and display a retry option with the same idempotency key

### Requirement 4: Resolve Multi-Tab Auth Conflicts

**User Story:** As a student with multiple browser tabs open, I want authentication state to stay consistent across tabs, so that logging out in one tab does not leave other tabs in a broken state.

#### Acceptance Criteria

1. WHEN a user logs out in one browser tab, THE Application_System SHALL broadcast a logout event via BroadcastChannel (or storage event fallback) to all other tabs
2. WHEN a tab receives a logout broadcast, THE Application_System SHALL clear the React Query auth cache, clear the Auth_Store, and redirect to the sign-in page without making additional API calls
3. WHEN a user logs in from a different tab while another tab is open, THE Application_System SHALL broadcast a login event so the other tab refreshes its session data
4. WHEN a token refresh occurs in one tab, THE Application_System SHALL broadcast the new CSRF token to other tabs via BroadcastChannel so that state-changing requests from any tab include a valid CSRF token
5. IF BroadcastChannel is unavailable (older browser), THEN THE Application_System SHALL fall back to `storage` events on a dedicated localStorage key for cross-tab communication

### Requirement 5: Clean Up SSE Connection Lifecycle

**User Story:** As a developer, I want SSE connections to be properly managed, so that the application does not leak EventSource connections or accumulate stale reconnection timers.

#### Acceptance Criteria

1. WHEN a React component using `useRealtime` unmounts, THE SSE_Client SHALL call `disconnect()` which closes the EventSource, clears all reconnection timeouts, and removes the visibility change listener
2. WHEN the SSE_Client disconnects due to page visibility change (battery-friendly mode), THE SSE_Client SHALL clear the `handlers` Map entries for that connection to prevent memory accumulation
3. THE SSE_Client SHALL enforce a maximum of one active EventSource connection per client instance, closing any existing connection before creating a new one in the `connect()` method
4. WHEN the SSE_Client reaches `maxRetries`, THE SSE_Client SHALL emit a final error event and stop reconnection attempts, not silently fail
5. THE Application_System SHALL provide a global SSE connection status indicator (connected, reconnecting, disconnected) accessible via the RealtimeStatusContext

### Requirement 6: Prevent Polling Interval Leaks

**User Story:** As a student navigating between pages, I want polling intervals to stop when I leave a page, so that the application does not make unnecessary API calls in the background.

#### Acceptance Criteria

1. WHEN the student navigates away from the dashboard, THE Polling_Hook SHALL stop its React Query refetch interval by setting `enabled: false` when the component unmounts
2. WHEN the admin navigates away from the admin dashboard, THE Admin_Polling_Hook SHALL stop its polling interval
3. THE Application_System SHALL not have more than one active polling interval per data source at any time, preventing duplicate polling when components remount rapidly (e.g., React StrictMode double-mount)
4. WHEN the browser tab is hidden for more than 5 minutes, THE Polling_Hook SHALL pause polling entirely (not just double the interval), resuming when the tab becomes visible
5. THE Polling_Hook SHALL use `refetchInterval` as a function that returns `false` when the component is not mounted or the tab is hidden beyond the threshold, rather than relying solely on `document.visibilityState`

### Requirement 7: Harden Token Refresh Race Condition

**User Story:** As a student using the application, I want token refresh to work reliably even when multiple API calls trigger refresh simultaneously, so that I am not unexpectedly logged out.

#### Acceptance Criteria

1. WHEN multiple API calls receive 401 simultaneously, THE Auth_Controller SHALL deduplicate refresh requests so that only one `POST /api/auth?action=refresh` is sent, and all waiting calls retry with the new token
2. THE Auth_Controller SHALL use a module-level promise lock: the first 401 triggers a refresh, subsequent 401s await the same promise rather than initiating parallel refreshes
3. WHEN the refresh request itself fails with 401 or 403, THE Auth_Controller SHALL clear auth state and redirect to sign-in exactly once, not trigger a refresh loop
4. WHEN the refresh succeeds, THE Auth_Controller SHALL update the in-memory CSRF token before retrying the original requests, ensuring retried requests include the rotated CSRF token
5. THE Auth_Controller SHALL set a maximum of 1 refresh attempt per original request, preventing infinite retry loops if the refreshed token is immediately invalid

### Requirement 8: Validate API Response Envelope Consistency

**User Story:** As a developer, I want all API endpoints to return responses in the standard envelope format, so that the frontend API_Client can reliably unwrap responses without special-case handling.

#### Acceptance Criteria

1. THE API_Layer SHALL return all success responses via `sendSuccess(res, payload)` from `lib/errorHandler.ts`, producing `{ success: true, data: payload }`
2. THE API_Layer SHALL return all error responses via `sendError(res, statusCode, message, code)`, producing `{ success: false, error: message, code: code }`
3. THE API_Client SHALL unwrap the envelope exactly once via `unwrapApiResponse()`, and frontend services SHALL receive the inner payload directly without checking `response.success` or `response.data`
4. WHEN an API endpoint returns a non-JSON response (e.g., file download), THE API_Client SHALL detect the content-type and return the raw response without attempting JSON unwrapping
5. FOR ALL API endpoints, THE API_Layer SHALL never return a bare object without the `{ success, data }` wrapper, and property tests SHALL verify envelope structure for every endpoint action

### Requirement 9: Enforce RBAC Consistency Across All Endpoints

**User Story:** As a system administrator, I want role-based access control to be consistently enforced on every API endpoint, so that students cannot access admin actions and reviewers cannot modify data.

#### Acceptance Criteria

1. THE API_Layer SHALL call `requireAuth(req)` on every action that requires authentication, before any business logic executes
2. THE API_Layer SHALL call `requireRole(req, allowedRoles)` on every admin-only action, using the role embedded in the JWT without database lookup
3. WHEN a student attempts to access an admin action, THE API_Layer SHALL return HTTP 403 with error code `INSUFFICIENT_PERMISSIONS`
4. WHEN a reviewer attempts a write operation (create, update, delete) on applications, THE API_Layer SHALL return HTTP 403, as reviewers have read-only access
5. THE API_Layer SHALL enforce resource ownership checks via `lib/auth/ownership.ts` on all student-scoped endpoints (applications, documents, payments), ensuring students can only access their own resources
6. FOR ALL role-permission combinations, THE RBAC system SHALL produce deterministic results: the same role and action SHALL always produce the same allow/deny decision (idempotence property)

### Requirement 10: Harden Offline Sync Queue

**User Story:** As a student on an unreliable Zambian mobile connection, I want offline-queued operations to sync reliably when connectivity returns, so that my application progress is never lost.

#### Acceptance Criteria

1. WHEN the Offline_Sync_Service processes the queue and encounters a CSRF token mismatch (403), THE Offline_Sync_Service SHALL request a fresh CSRF token before retrying the queued operation
2. WHEN the Offline_Sync_Service processes a queued draft save, THE Offline_Sync_Service SHALL include the version number from the queued item and handle version conflicts (409) by fetching the server version and merging
3. THE Offline_Sync_Service SHALL process queue items in strict FIFO order, never processing item N+1 until item N has succeeded or been moved to the failed queue
4. WHEN the Offline_Sync_Service `init()` is called multiple times (e.g., component remount), THE Offline_Sync_Service SHALL be idempotent: it SHALL not register duplicate `online` event listeners or create duplicate periodic sync intervals
5. THE Offline_Sync_Service SHALL clear the periodic sync interval when the service is destroyed or the page unloads, preventing orphaned intervals
6. WHEN a queued item reaches `maxRetries` (3), THE Offline_Sync_Service SHALL move it to a visible "failed" state in the UI and offer the student a manual retry option


### Requirement 11: Strengthen Service Worker Cache Strategy

**User Story:** As a student using the PWA offline, I want the service worker to cache the right resources and serve them reliably, so that I can continue using the application when my connection drops.

#### Acceptance Criteria

1. THE Service_Worker SHALL use a stale-while-revalidate strategy for static assets (JS, CSS, images) and a network-first strategy for API calls, falling back to cached responses only when offline
2. THE Service_Worker SHALL cache all Application_Wizard page chunks, critical CSS, and the app shell on first visit, ensuring the wizard is usable offline after initial load
3. WHEN the Service_Worker serves a cached API response while offline, THE Application_System SHALL display an "offline data" indicator next to the served content so students know the data may be stale
4. THE Service_Worker SHALL implement cache size limits (maximum 50MB total, maximum 100 entries per cache bucket) and evict least-recently-used entries when limits are reached
5. WHEN a new Service_Worker version is available, THE Application_System SHALL show a non-blocking update prompt (already configured as `registerType: 'prompt'`) and SHALL NOT activate the new worker until the user confirms, preventing mid-session cache invalidation

### Requirement 12: Remove Admin Complexity Remnants

**User Story:** As a developer, I want all code from removed admin features (complex workflow engine, predictive analytics, bulk notifications, AI features except OCR) cleaned out, so that the codebase is lean and maintainable.

#### Acceptance Criteria

1. THE Application_System SHALL remove all components, hooks, services, and types related to the removed complex workflow engine, including any workflow state machine code not used by the simplified application status flow
2. THE Application_System SHALL remove all components and services related to predictive analytics dashboards, including any chart components that are not used by the simplified admin dashboard
3. THE Application_System SHALL remove all components and services related to bulk notification management, retaining only the simple email notification capability
4. THE Application_System SHALL remove all AI-related code except tesseract.js OCR in the document upload step, including any references to Cloudflare AI, smart matching, or predictive features
5. WHEN dead admin code is removed, THE Application_System SHALL verify that no runtime errors are introduced by running the full test suite and a production build
6. THE Application_System SHALL remove the following files if they contain only dead code: `src/utils/smart-features.ts`, `src/utils/smart-matching.ts`, `src/services/mcpService.ts`, `src/lib/regulatoryComplianceChecker.ts`, `src/lib/regulatoryGuidelines.ts`, `src/components/8starlabs/`, `src/components/examples/`, `src/examples/`

### Requirement 13: Clean Up Migration Remnants and Dead Modules

**User Story:** As a developer, I want all remnants from the Supabase-to-Neon migration and Cloudflare-to-Vercel migration removed, so that the codebase contains no confusing dead references.

#### Acceptance Criteria

1. THE Application_System SHALL remove all files and directories that exist solely as migration artifacts, including `src/lib/migration/`, `src/lib/connectionFix.ts`, `src/lib/hardReload.ts`, `src/lib/reloadControl.ts`, `src/lib/devApiProxy.ts`, `src/lib/localApiResolver.ts`, and `src/lib/authDebug.ts` if they are not imported by any active code path
2. THE Application_System SHALL remove all environment variable references to removed services that may still exist in `.env.development`, `.env.production`, or `.env.example` files
3. THE Application_System SHALL remove the `src/data/` directory if it contains only mock/seed data that is not used by any active code path (verify `src/data/applications.ts`, `src/data/catalog.ts`, `src/data/users.ts`, `src/data/index.ts`)
4. THE Application_System SHALL remove `src/v2-improvements-index.ts` if it is not imported by any active module
5. THE Application_System SHALL remove any `@deprecated` JSDoc-tagged exports that have zero consumers, verified by searching all import statements
6. WHEN migration remnants are removed, THE Application_System SHALL pass a full production build and test suite without errors

### Requirement 14: Unify Loading and Skeleton States (CRITICAL — Login Skeleton Hang)

**User Story:** As a student, I want consistent loading indicators across all pages, so that I always know when data is being fetched and the UI does not flash between states. Critically, after logging in, the dashboard must load without getting stuck on a skeleton screen.

#### Acceptance Criteria

1. THE Application_System SHALL use a single loading pattern for page-level data fetching: a skeleton placeholder that matches the layout of the loaded content, not a full-screen spinner
2. WHEN the Session_Listener is checking the auth session on initial load, THE Application_System SHALL show a minimal app shell skeleton (header + content area placeholder), not a blank screen or a full-page loading message
3. WHEN a lazy-loaded page chunk is being fetched, THE Application_System SHALL show the `LoadingFallback` component with a contextual message, and the skeleton SHALL not cause layout shift when the content loads
4. THE Application_System SHALL not show nested loading indicators (e.g., a page skeleton inside a route-level Suspense fallback inside an app-level loading screen), limiting to one visible loading indicator per content area
5. WHEN data fetching fails after loading, THE Application_System SHALL transition from the skeleton to an error state with a retry button, not remain in the skeleton state indefinitely
6. WHEN a user completes login successfully, THE Application_System SHALL transition from the login page to the dashboard within 3 seconds, resolving the known bug where the skeleton loading screen hangs indefinitely until the user manually reloads the page
7. WHEN the post-login auth session check takes longer than 5 seconds, THE Application_System SHALL force a React Query refetch of the session and display a "Still loading..." message with a manual reload link, preventing the infinite skeleton state
8. THE Auth_Context SHALL ensure that the `isAuthenticated` flag and the React Query session cache are updated synchronously after a successful login API response, so that route guards (ProtectedRoute) immediately recognize the authenticated state and render the dashboard content instead of remaining in the loading skeleton

### Requirement 15: Fix React Query Cache Invalidation Patterns

**User Story:** As a developer, I want React Query cache invalidation to be predictable and correct, so that stale data is never shown after mutations and cache is not over-invalidated causing unnecessary refetches.

#### Acceptance Criteria

1. WHEN a student submits an application, THE Application_System SHALL invalidate the `['student-dashboard-polling']` and `['applications']` query keys, ensuring the dashboard reflects the new submission
2. WHEN an admin changes an application status, THE Application_System SHALL invalidate the specific application query key and the admin applications list, not the entire query cache
3. THE API_Client SHALL use the `getInvalidationPatterns()` method to determine which query keys to invalidate based on the endpoint and method, ensuring consistent invalidation across all mutation paths
4. THE Application_System SHALL not call `queryClient.clear()` except during login and logout, preventing unnecessary refetches of unrelated cached data
5. WHEN the auth session is refreshed (token rotation), THE Application_System SHALL not invalidate data query caches (applications, catalog, profile), only the auth session cache if the user identity changed

### Requirement 16: Standardize Error Display and Recovery

**User Story:** As a student, I want error messages to be clear, actionable, and consistent across the application, so that I know what went wrong and how to fix it.

#### Acceptance Criteria

1. THE Application_System SHALL display API errors as toast notifications using the existing `useToastStore`, with the error message from the API response and a dismiss button
2. WHEN an API error includes a `code` field (e.g., `CSRF_VALIDATION_FAILED`, `RATE_LIMIT_EXCEEDED`), THE Application_System SHALL map the code to a user-friendly message rather than displaying the raw code
3. WHEN a network error occurs (no response from server), THE Application_System SHALL display "Connection error. Please check your internet and try again." with a retry button
4. THE Application_System SHALL not display duplicate error toasts for the same error within a 3-second window, preventing toast spam from retry logic
5. WHEN the Application_Wizard encounters a save error, THE Application_System SHALL display the error inline near the save indicator (not as a toast), preserving the student's form context
6. THE Application_System SHALL log all frontend errors to the console in development mode only, never in production (console.log removal is already configured in Vite terser)

### Requirement 17: Harden File Upload Validation End-to-End

**User Story:** As a student uploading documents, I want the upload process to validate files thoroughly on both client and server, so that invalid files are rejected early with clear feedback.

#### Acceptance Criteria

1. THE Application_System SHALL validate file type on the client side before upload, checking the file extension against the allowed list (PDF, JPEG, PNG) and displaying an inline error if the type is not allowed
2. THE Application_System SHALL validate file size on the client side before upload, rejecting files larger than 10MB with a clear message stating the maximum allowed size
3. THE API_Layer SHALL validate uploaded file content using magic byte verification (`lib/fileValidator.ts`) after base64 decoding, rejecting files where the magic bytes do not match the declared MIME type
4. WHEN a file upload is rejected by the server, THE Application_System SHALL display the specific rejection reason (invalid type, size exceeded, content mismatch) to the student, not a generic "upload failed" message
5. THE Application_System SHALL show upload progress for files larger than 1MB, using a progress bar or percentage indicator
6. FOR ALL valid file types (PDF, JPEG, PNG), detecting the MIME type from magic bytes and then validating against the declared type SHALL be idempotent: running the validation twice on the same buffer SHALL produce the same result

### Requirement 18: Fix Profile Completion Calculation

**User Story:** As a student, I want the profile completion indicator to accurately reflect my actual profile completeness, so that I know exactly what information is still needed.

#### Acceptance Criteria

1. THE Application_System SHALL calculate profile completion percentage based on a defined set of required fields: first name, last name, email, phone number, date of birth, gender, NRC number, address, and next of kin
2. WHEN all required profile fields are filled, THE Application_System SHALL display 100% completion, not a lower percentage
3. THE Application_System SHALL update the completion percentage in real-time as the student fills in profile fields, without requiring a page reload
4. THE Application_System SHALL display which specific fields are missing when the completion is below 100%, providing actionable guidance
5. WHEN profile data is auto-populated from registration, THE Application_System SHALL include the auto-populated fields in the completion calculation immediately

### Requirement 19: Fix Application Statistics Accuracy

**User Story:** As a student, I want the dashboard statistics (applications count, time, status) to reflect my actual data, so that I can trust the information displayed.

#### Acceptance Criteria

1. THE Application_System SHALL calculate "applications in progress" by counting applications with status `draft` or `submitted` for the current student, not using hardcoded or stale values
2. THE Application_System SHALL calculate "completed applications" by counting applications with status `approved`, `rejected`, or `waitlisted` for the current student
3. THE Application_System SHALL not display "average time" statistics unless the data is actually tracked and calculated from real timestamps, removing any placeholder or hardcoded time values
4. WHEN the student has zero applications, THE Application_System SHALL display "0" for all counts and a prompt to start a new application, not display misleading non-zero values
5. THE Application_System SHALL derive all dashboard statistics from the same data source (React Query cache from the polling hook), ensuring consistency between the stats cards and the applications list


### Requirement 20: Improve Mobile Responsiveness

**User Story:** As a student on a mobile device (the primary access method in Zambia), I want the application to be fully usable on small screens, so that I can complete my application from my phone.

#### Acceptance Criteria

1. THE Application_System SHALL ensure all interactive elements (buttons, links, form inputs) have a minimum touch target size of 44x44 CSS pixels on mobile viewports
2. THE Application_System SHALL ensure the Application_Wizard step navigation is usable on screens as narrow as 320px, with step indicators that do not overflow or overlap
3. THE Application_System SHALL ensure the admin sidebar collapses cleanly on mobile with a hamburger menu toggle, and the collapsed state does not leave visual artifacts
4. THE Application_System SHALL ensure all modal dialogs are scrollable on mobile when their content exceeds the viewport height, with the close button always visible
5. THE Application_System SHALL ensure form labels and inputs stack vertically on mobile (below `sm:` breakpoint), not side-by-side, preventing horizontal overflow

### Requirement 21: Prevent Memory Leaks in Long-Running Sessions

**User Story:** As a student who keeps the application open for extended periods while filling out forms, I want the application to remain responsive, so that it does not slow down or crash during a long session.

#### Acceptance Criteria

1. THE Application_System SHALL clean up all `setInterval` and `setTimeout` handles in `useEffect` cleanup functions, preventing orphaned timers when components unmount
2. THE Application_System SHALL clean up all event listeners (`addEventListener`) in `useEffect` cleanup functions, including `online`, `offline`, `visibilitychange`, `beforeinstallprompt`, `storage`, and `resize` listeners
3. THE Offline_Sync_Service SHALL clear its `periodicSyncInterval` when the service is no longer needed, and SHALL not accumulate multiple intervals from repeated `init()` calls
4. THE SSE_Client SHALL remove its `visibilitychange` event listener when `disconnect()` is called, preventing listener accumulation across reconnection cycles
5. THE Application_System SHALL not store unbounded data in Zustand stores or module-level variables; the Application_Store `applications` array SHALL be bounded by the pagination limit (50 items)

### Requirement 22: Standardize Date and Time Formatting

**User Story:** As a student, I want all dates and times displayed consistently throughout the application, so that I can easily understand deadlines and timestamps.

#### Acceptance Criteria

1. THE Application_System SHALL format all displayed dates using a consistent pattern: `DD MMM YYYY` (e.g., "15 Jan 2025") for dates and `DD MMM YYYY, HH:mm` for timestamps
2. THE Application_System SHALL parse all ISO 8601 timestamps from the API correctly, handling both `Z` suffix and timezone offset formats
3. WHEN a date input field receives an ISO timestamp with time component (e.g., "1994-09-08T00:00:00.000Z"), THE Application_System SHALL extract only the date portion (`1994-09-08`) for `<input type="date">` fields, preventing format errors
4. THE Application_System SHALL use a single date formatting utility function across all components, not inline `new Date().toLocaleDateString()` calls with varying locale arguments
5. THE Application_System SHALL display relative time (e.g., "2 hours ago", "yesterday") for recent events (within 7 days) in notification lists and activity feeds

### Requirement 23: Ensure Consistent Navigation and Sidebar Behavior

**User Story:** As a user (student or admin), I want the navigation sidebar to behave consistently, so that I can always find my way around the application.

#### Acceptance Criteria

1. THE Application_System SHALL highlight the active route in the sidebar navigation, matching the current URL path to the corresponding menu item
2. WHEN the sidebar is collapsed on desktop, THE Application_System SHALL show icon-only navigation with tooltips on hover, and the main content area SHALL expand to fill the available space without layout jump
3. WHEN the sidebar is expanded on mobile, THE Application_System SHALL display it as an overlay with a backdrop, and clicking the backdrop or pressing Escape SHALL close the sidebar
4. THE Application_System SHALL persist the sidebar collapsed/expanded state in localStorage per user, restoring it on page reload
5. THE Application_System SHALL ensure the sidebar does not render admin menu items for student users and vice versa, using the role from Auth_Context

### Requirement 24: Add Request Timeout and Retry Configuration

**User Story:** As a student on a slow connection, I want API requests to have reasonable timeouts and smart retry behavior, so that I get clear feedback instead of indefinite loading.

#### Acceptance Criteria

1. THE API_Client SHALL enforce a default request timeout of 30 seconds on all API calls, aborting the request and displaying a timeout error if exceeded
2. THE API_Client SHALL use a shorter timeout of 10 seconds for health check and session validation requests
3. WHEN a request times out, THE Application_System SHALL display "Request timed out. Please try again." with a retry button
4. THE API_Client SHALL retry failed requests (network errors and 5xx responses) up to 2 times with exponential backoff (1s, 3s), but SHALL NOT retry 4xx responses (client errors)
5. THE API_Client SHALL not retry requests that were explicitly aborted by the user (e.g., navigating away from a page)

### Requirement 25: Validate Catalog Data Integrity

**User Story:** As a student selecting a programme in the application wizard, I want the programme list to be complete and correctly linked to institutions, so that I can make an informed choice.

#### Acceptance Criteria

1. WHEN the Application_Wizard loads the programme selection step, THE Application_System SHALL fetch programmes from `/api/catalog?type=programs` and display them grouped by institution
2. WHEN a student selects a programme, THE Application_System SHALL auto-populate the institution field from the programme's `institution_id` linkage, not require manual institution selection
3. THE API_Layer SHALL return programme data with institution name included (via JOIN), so the frontend does not need a separate request to resolve institution names
4. WHEN the catalog API returns an empty programme list, THE Application_System SHALL display a clear message ("No programmes available for the current intake") rather than an empty dropdown
5. THE Application_System SHALL cache catalog data (programmes, intakes, subjects) with a stale time of 10 minutes, reducing redundant API calls when navigating between wizard steps

### Requirement 26: Harden Admin Application Review Flow

**User Story:** As an admin reviewing applications, I want the review workflow to be reliable and provide clear feedback, so that I can efficiently process student applications.

#### Acceptance Criteria

1. WHEN an admin changes an application status (approve, reject, waitlist), THE API_Layer SHALL record the status change in the `application_status_history` table with the admin's user ID, timestamp, and optional notes
2. WHEN an admin changes an application status, THE API_Layer SHALL send a notification email to the student via Resend, informing them of the status change
3. THE Application_System SHALL display the complete status history timeline on the application detail page, showing each status change with who made it and when
4. WHEN an admin attempts to approve an application that has not completed payment, THE Application_System SHALL display a warning but allow the admin to override (admin override is always available)
5. THE Application_System SHALL support pagination on the admin applications list, fetching pages from the server rather than loading all applications at once, with correct total count display


### Requirement 27: Fix Notification System End-to-End

**User Story:** As a student, I want to receive and view notifications about my application status, so that I stay informed about important updates.

#### Acceptance Criteria

1. THE Application_System SHALL display in-app notifications in the notification bell component, fetched from `/api/notifications?action=preferences` with the student's user ID
2. WHEN a new notification arrives (detected via polling), THE Application_System SHALL increment the unread badge count on the notification bell without requiring a page reload
3. THE Application_System SHALL display the student's phone number from their profile on the notification settings page, not "No number on file" when a phone number exists
4. WHEN a student marks a notification as read, THE Application_System SHALL update the read status via the API and decrement the unread badge count immediately (optimistic update)
5. THE Application_System SHALL not display push notification settings if the browser does not support the Push API, showing a graceful fallback message instead

### Requirement 28: Ensure Accessibility of Dynamic Content

**User Story:** As a student using assistive technology, I want dynamically loaded content (toasts, modals, status changes) to be announced to my screen reader, so that I do not miss important information.

#### Acceptance Criteria

1. WHEN a toast notification appears, THE Application_System SHALL render it within an `aria-live="assertive"` region for error toasts and `aria-live="polite"` for success/info toasts
2. WHEN the Application_Wizard auto-save completes, THE Application_System SHALL announce "Draft saved" to screen readers via an `aria-live="polite"` region, without visually disrupting the form
3. WHEN an application status changes on the dashboard (detected via polling), THE Application_System SHALL announce the change via an `aria-live="polite"` region
4. THE Application_System SHALL ensure all dynamically inserted content (lazy-loaded components, polling results, SSE updates) is accessible to screen readers without requiring a page reload
5. THE Application_System SHALL provide skip navigation links at the top of the page, allowing keyboard users to jump directly to the main content area

### Requirement 29: Add Comprehensive Integration Tests for Critical Flows

**User Story:** As a developer, I want integration tests that verify end-to-end data flow through the application, so that regressions in critical paths are caught before deployment.

#### Acceptance Criteria

1. THE Application_System SHALL have integration tests verifying the complete auth flow: register → login → session check → token refresh → logout, including CSRF token handling at each step
2. THE Application_System SHALL have integration tests verifying the application submission flow: create draft → auto-save → submit → verify status change → verify dashboard update
3. THE Application_System SHALL have integration tests verifying the admin review flow: list applications → view detail → change status → verify audit log entry → verify student notification
4. THE Application_System SHALL have property-based tests (fast-check) verifying: auto-save version ordering (P1), idempotency key deduplication (P2), RBAC determinism (P3), offline queue FIFO ordering (P4), date formatting round-trip (P5)
5. THE Application_System SHALL have property-based tests verifying: API envelope structure for all endpoints (P6), cache invalidation patterns produce no stale data (P7), multi-tab auth broadcast consistency (P8)
6. THE Application_System SHALL have property-based tests verifying: file upload magic byte detection is idempotent (P9), profile completion calculation is monotonically non-decreasing as fields are added (P10), polling fingerprint deduplication is correct (P11)

### Requirement 30: Ensure Production Build Stability and Live Testing Cadence

**User Story:** As a DevOps engineer, I want the production build to be clean, deterministic, and free of warnings, with periodic deployments and live testing throughout the remediation, so that deployments are reliable and regressions are caught early on the live site.

#### Acceptance Criteria

1. THE Application_System SHALL produce a clean production build (`bun run build`) with zero TypeScript errors and zero Vite build warnings
2. THE Application_System SHALL produce a main bundle under 500KB gzipped after all remediation changes
3. THE Application_System SHALL pass all existing tests (`bun run test`) after remediation, with no test regressions
4. THE Application_System SHALL not introduce any new `@ts-ignore`, `@ts-nocheck`, or `as any` type assertions during remediation
5. WHEN the production build completes, THE Application_System SHALL output a build manifest that can be verified for expected chunk count and sizes, enabling automated size regression detection
6. THE Application_System SHALL be git-pushed and deployed to Vercel after every logical group of changes (at minimum after each major requirement is completed), so that the live site at apply.mihas.edu.zm reflects the current state and can be tested against real conditions
7. WHEN a git push triggers a Vercel deployment, THE Application_System SHALL be manually verified on the live site for the specific changes deployed, not tested only against a local dev server


### Requirement 31: Clean and Minimal Sign-In / Sign-Up Pages (CRITICAL — First Impression)

**User Story:** As a prospective student visiting the MIHAS admissions portal for the first time, I want the sign-in and sign-up pages to look clean, professional, and mobile-friendly, so that I trust the system and can register without confusion.

#### Acceptance Criteria

1. THE Application_System SHALL render the sign-in page with only the essential elements: institution logo/name, email input, password input, sign-in button, "Forgot password?" link, and "Create account" link — no explanatory paragraphs, feature lists, or marketing copy
2. THE Application_System SHALL render the sign-up page with only the essential fields: first name, last name, email, phone number, password, confirm password, and a submit button — no over-explanation or verbose instructions
3. THE Application_System SHALL center-align the auth form card vertically and horizontally on desktop, and full-width with appropriate padding on mobile (below `sm:` breakpoint)
4. THE Application_System SHALL ensure all form labels are concise (one or two words), clearly associated with their inputs via `htmlFor`/`id` pairing, and visible (not placeholder-only labels)
5. THE Application_System SHALL ensure the auth pages render correctly on screens as narrow as 320px, with no horizontal overflow, no overlapping elements, and a minimum touch target of 44x44px on all interactive elements
6. THE Application_System SHALL remove any verbose helper text, info callouts, or multi-paragraph explanations from the sign-in and sign-up pages, keeping only essential inline validation messages (e.g., "Email is required", "Password must be at least 8 characters")
7. THE Application_System SHALL display the institution name "Mukuba Institute of Health and Allied Sciences" and the word "Admissions" as the page heading, establishing context without additional explanation

### Requirement 32: Remove Redundant Nationality/Citizenship Field

**User Story:** As a student filling out my profile, I want a single clear field for my nationality, so that I am not confused by redundant nationality and citizenship dropdowns asking for the same information.

#### Acceptance Criteria

1. THE Application_System SHALL present a single "Nationality" dropdown on the profile form, removing the separate "Citizenship" field that duplicates the same information
2. WHEN a student selects a nationality, THE Application_System SHALL store the value in the `nationality` column in the database, and the `citizenship` column (if it exists) SHALL be derived from or kept in sync with the nationality value
3. THE Application_System SHALL migrate existing profile records where `citizenship` has a value but `nationality` is null, copying the citizenship value to nationality to normalize the data
4. THE Application_System SHALL ensure the nationality dropdown includes "Zambian" as the default/first option, followed by other nationalities in alphabetical order, reflecting the primary user base
5. IF the database schema has both `nationality` and `citizenship` columns, THEN THE Application_System SHALL treat `nationality` as the canonical field and either drop the `citizenship` column or populate it automatically from `nationality`, ensuring no form displays both fields

### Requirement 33: Database Data Normalization and Alignment (CRITICAL)

**User Story:** As a developer, I want all existing database records to be normalized and aligned with the current application requirements, so that the frontend, backend, and database are fully in sync and no stale or inconsistent data causes runtime errors.

#### Acceptance Criteria

1. THE Application_System SHALL provide a database normalization migration that cleans up all test/development data in the existing tables, ensuring every record conforms to the current schema expectations
2. THE Application_System SHALL normalize all `profiles` records: filling null required fields with sensible defaults, normalizing phone numbers to the +260 format where applicable, and ensuring `nationality` is populated from `citizenship` where only citizenship exists
3. THE Application_System SHALL normalize all `applications` records: ensuring every application has a valid `status` from the allowed enum (`draft`, `submitted`, `under_review`, `approved`, `rejected`, `waitlisted`), a valid `user_id` reference, and consistent `created_at`/`updated_at` timestamps
4. THE Application_System SHALL remove or archive orphaned records: applications without a valid user, documents without a valid application, and payments without a valid application
5. THE Application_System SHALL normalize all `programs` and `intakes` records: ensuring every program has a valid `institution_id`, a non-empty `name`, and correct `is_active` status, and every intake has valid `start_date`/`end_date` with `start_date` before `end_date`
6. THE Application_System SHALL ensure that all foreign key references across tables are valid (no dangling references), and any orphaned rows are cleaned up in the normalization migration
7. WHEN the normalization migration runs, THE Application_System SHALL be idempotent: running the migration multiple times SHALL produce the same result as running it once, using `UPDATE ... WHERE` conditions that check current state before modifying
8. THE Application_System SHALL log a summary of all normalization changes (row counts per table, types of fixes applied) without logging any PII, so developers can verify the migration ran correctly

### Requirement 34: Fix Post-Login Dashboard Transition (CRITICAL — User-Reported Bug)

**User Story:** As a student, I want to be taken directly to my dashboard after logging in without the page getting stuck on a loading screen, so that I can start using the application immediately.

#### Acceptance Criteria

1. WHEN the login API returns a successful response, THE Auth_Controller SHALL immediately update the React Query session cache with the authenticated user data from the login response, not wait for a separate session check round-trip
2. WHEN the login API returns a successful response, THE Application_System SHALL navigate to the appropriate dashboard (student or admin based on role) within 2 seconds, without requiring a manual page reload
3. THE Application_System SHALL not enter an infinite skeleton loading state after login under any circumstances — IF the session check has not resolved within 5 seconds post-login, THEN THE Application_System SHALL force-refetch the session and display a "Taking longer than expected" message with a reload button
4. WHEN the login response includes the user's role, THE Application_System SHALL use the role from the login response for initial routing (student dashboard vs admin dashboard), not wait for a separate session endpoint to confirm the role
5. THE Application_System SHALL ensure that the login flow does not trigger multiple competing session checks (e.g., one from the login success handler and another from the Auth_Context mount), which can cause race conditions that leave the UI in a loading state
6. THE Application_System SHALL reduce the total login-to-dashboard time to under 3 seconds on a 3G connection, by combining the login response with session initialization rather than making sequential API calls

### Requirement 35: Periodic Deployment and Live Site Verification

**User Story:** As the project owner, I want changes to be deployed and tested on the live site frequently throughout the remediation process, so that issues are caught early against real production conditions rather than only in local development.

#### Acceptance Criteria

1. THE Application_System SHALL be git-committed and pushed after completing each major requirement or logical group of related changes, ensuring the live site at apply.mihas.edu.zm stays current
2. WHEN a deployment completes on Vercel, THE Application_System SHALL be verified on the live site for the specific changes deployed, including testing on a mobile device or mobile emulator
3. THE Application_System SHALL not accumulate more than 3 major requirements worth of changes without a git push and live deployment, preventing large untested change batches
4. WHEN a live site verification reveals a regression, THE Application_System SHALL prioritize fixing the regression before continuing with new requirements
5. THE Application_System SHALL maintain a working production build at all times during the remediation — no intermediate commit SHALL break the build or leave the live site in a non-functional state
