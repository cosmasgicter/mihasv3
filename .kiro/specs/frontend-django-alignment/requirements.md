# Requirements Document

## Introduction

The admissions frontend (`apps/admissions/`) was originally built against a Node.js/Supabase backend and has not been fully aligned with the Django REST API that now serves as the production backend. While the Django API works correctly (verified via curl), the frontend exhibits broken routing for admin users, silent dashboard data loading failures, and mismatched response shape expectations across multiple pages. This spec covers a systematic, page-by-page audit and fix of every frontend page so that data flows correctly end-to-end: Django API response → `apiClient` envelope unwrapping → service layer → React Query hook → component rendering.

## Glossary

- **Frontend**: The React 18 + TypeScript SPA located at `apps/admissions/`, built with Vite and deployed on Vercel
- **Backend**: The Django 5 + DRF API located at `backend/`, serving endpoints under `***REMOVED***/api/v1/`
- **ApiClient**: The HTTP client singleton in `apps/admissions/src/services/client.ts` that handles request construction, envelope unwrapping (`{success, data}`), CSRF token management, cookie credentials, 401 refresh retry, and timeout/retry logic
- **Service_Layer**: The collection of modules in `apps/admissions/src/services/` that call ApiClient methods and transform raw API responses into frontend-consumable shapes
- **Route_Guard**: React components (`ProtectedRoute`, `StudentRoute`, `AdminRoute`) that check auth state and role before rendering child routes
- **Auth_Context**: The React context provider (`AuthContext.tsx`) backed by `useSessionListener` that holds the current user, profile, loading state, and `isAdmin` flag
- **Session_Endpoint**: `GET /api/v1/auth/session/` — returns the authenticated user object from the HTTP-only cookie
- **Login_Endpoint**: `POST /api/v1/auth/login/` — authenticates credentials and returns a user object with role
- **Envelope**: The standard Django API response wrapper `{success: boolean, data: T}` that ApiClient unwraps before returning to callers
- **Role_Resolution**: The process of extracting the user's role string from the API response and determining `isAdmin` via `isAdminRole()` in `lib/auth/roles.ts`
- **Dashboard_Redirect**: The component at `/dashboard` that inspects `isAdmin` and redirects to either `/admin/dashboard` or `/student/dashboard`
- **Silent_Failure**: A frontend error condition where the user sees a generic error message but no diagnostic information appears in the browser console

## Requirements

### Requirement 1: Auth Flow and Role Resolution Alignment

**User Story:** As a user (student or admin), I want the login and session restoration flows to correctly resolve my role from the Django API response, so that I am routed to the correct dashboard after authentication.

#### Acceptance Criteria

1. WHEN a user signs in via Login_Endpoint, THE Auth_Context SHALL extract the `role` field from the unwrapped Django response and store it on the `user` object
2. WHEN a user's session is restored via Session_Endpoint, THE Auth_Context SHALL resolve the role using the same extraction logic as the login flow
3. WHEN the resolved role matches any value in the `ADMIN_ROLES` list, THE Route_Guard SHALL set `isAdmin` to `true`. NOTE: The Django backend `ROLE_CHOICES` defines 4 roles (`student`, `admin`, `reviewer`, `super_admin`). The frontend `ADMIN_ROLES` list includes additional forward-looking roles (`admissions_officer`, `registrar`, `finance_officer`, `academic_head`) that the backend does not currently assign. The implementation SHALL reconcile these lists — either by adding the extra roles to the backend `ROLE_CHOICES` or by removing them from the frontend `ADMIN_ROLES` and documenting them as future placeholders
4. WHEN `isAdmin` is `true` after login, THE Frontend SHALL navigate the user to `/admin/dashboard`
5. WHEN `isAdmin` is `false` after login, THE Frontend SHALL navigate the user to `/student/dashboard`
6. WHEN an admin user navigates to a student route, THE StudentRoute guard SHALL redirect to `/admin/dashboard`
7. WHEN a non-admin user navigates to an admin route, THE AdminRoute guard SHALL redirect to `/student/dashboard`
8. IF the Login_Endpoint response shape differs from the expected `{user: {id, email, role, ...}}` structure, THEN THE Auth_Context SHALL log a descriptive warning and treat the user as unauthenticated
9. IF the Session_Endpoint returns a `401` status, THEN THE Auth_Context SHALL clear cached auth state and set `user` to `null` without throwing an unhandled error
10. WHEN the Login_Endpoint or Session_Endpoint returns a response with `X-CSRF-Token` header, THE Auth_Context SHALL capture and store the CSRF token so that subsequent state-changing requests (POST, PUT, PATCH, DELETE) include it in the `X-CSRF-Token` request header
11. WHEN the token refresh endpoint (`POST /api/v1/auth/refresh/`) returns a rotated `X-CSRF-Token` header, THE ApiClient SHALL update the stored CSRF token

### Requirement 2: Student Dashboard Data Loading

**User Story:** As a student, I want the student dashboard to load my applications, intakes, and interview data from the Django API, so that I can see my current application status and next steps.

#### Acceptance Criteria

1. WHEN the student dashboard mounts, THE Service_Layer SHALL call the applications, catalog, and interviews endpoints and map the Django response shapes to the frontend `Application`, `Intake`, and `ApplicationInterview` types
2. WHEN any dashboard data endpoint returns an error, THE Frontend SHALL display a specific, actionable error message that includes the failing endpoint name
3. WHEN any dashboard data endpoint returns an error, THE Frontend SHALL log the error details (status code, endpoint, error message) to the browser console
4. IF a dashboard data endpoint returns an empty array, THEN THE Frontend SHALL render the appropriate empty state UI instead of an error
5. WHEN the Django API returns paginated application data using `{results, totalCount, page, pageSize}`, THE Service_Layer SHALL correctly extract the `results` array as the applications list
6. IF a network error occurs during dashboard data loading, THEN THE Frontend SHALL display a retry-capable error state with a "Retry" button

### Requirement 3: Admin Dashboard Data Loading

**User Story:** As an admin, I want the admin dashboard to load statistics, recent activity, and operational metrics from the Django API, so that I can monitor admissions operations.

#### Acceptance Criteria

1. WHEN the admin dashboard mounts, THE Service_Layer SHALL call `GET /api/v1/admin/dashboard/` and map the Django response to the `AdminDashboardStats` and `AdminDashboardActivity` types
2. WHEN the admin dashboard endpoint returns an error, THE Frontend SHALL display a specific error message that includes the HTTP status code and endpoint
3. WHEN the admin dashboard endpoint returns an error, THE Frontend SHALL log the full error details to the browser console
4. IF the admin dashboard endpoint returns a response shape that does not match `AdminDashboardStats`, THEN THE Service_Layer SHALL log a shape mismatch warning and fall back to default zero values
5. WHEN the admin dashboard data loads successfully, THE Frontend SHALL update the `lastUpdated` timestamp and render the metrics cards, activity feed, and quick actions

### Requirement 4: Service Layer Response Shape Alignment

**User Story:** As a developer, I want every service module to correctly handle the Django API response shapes after ApiClient envelope unwrapping, so that components receive correctly typed data.

#### Acceptance Criteria

1. THE Service_Layer SHALL assume that ApiClient has already unwrapped the `{success, data}` envelope, and SHALL NOT attempt to unwrap it a second time
2. WHEN the catalog service fetches programs, THE Service_Layer SHALL map Django snake_case fields (`application_fee`, `duration_years`, `institution_id`) to the frontend `Program` type
3. WHEN the catalog service fetches intakes, THE Service_Layer SHALL map Django snake_case fields (`application_deadline`, `start_date`, `end_date`, `max_capacity`) to the frontend `Intake` type
4. WHEN the applications service fetches a paginated list, THE Service_Layer SHALL handle both `{results: [...]}` and `{applications: [...]}` response shapes from the Django API
5. WHEN the documents service uploads or fetches documents, THE Service_Layer SHALL use the Django endpoint paths (`/api/v1/documents/`) and handle the Django response shape
6. WHEN the interviews service fetches interview data, THE Service_Layer SHALL map Django response fields to the frontend `ApplicationInterview` type
7. IF a service receives `null` or `undefined` from ApiClient (indicating a 204 or empty response), THEN THE Service_Layer SHALL return an appropriate default value (empty array, null object) instead of throwing
8. WHEN a page's service layer receives a response, THE Service_Layer SHALL validate that required fields are present before passing data to components — IF a required field is missing, THE Service_Layer SHALL log a warning identifying the missing field and endpoint, and provide a safe fallback value
9. THE Service_Layer SHALL handle both camelCase and snake_case field names from the Django API, normalizing to the frontend convention at the service boundary
10. WHEN a page loads data from multiple endpoints, THE Frontend SHALL handle partial failures gracefully — displaying available data and showing errors only for the failed sections

### Requirement 5: Auth Pages Alignment

**User Story:** As a user, I want the sign-in, sign-up, password reset, and email verification pages to work correctly with the Django auth endpoints, so that I can authenticate and manage my account.

#### Acceptance Criteria

1. WHEN a user submits the sign-in form, THE Frontend SHALL send `{email, password}` to `POST /api/v1/auth/login/` and handle the Django response containing the user object with role
2. WHEN a user submits the sign-up form, THE Frontend SHALL send `{email, password, first_name, last_name}` to `POST /api/v1/auth/register/` and handle the Django response
3. WHEN a user requests a password reset, THE Frontend SHALL send `{email}` to `POST /api/v1/auth/password-reset/` and display a confirmation message on success
4. WHEN a user submits a new password with a reset token, THE Frontend SHALL send `{token, newPassword}` to `POST /api/v1/auth/password-reset/confirm/` and handle success or token-expired errors
5. IF the Django login endpoint returns a field-level validation error (e.g., `{fieldErrors: {email: "..."} }`), THEN THE Frontend SHALL display the field-specific error next to the relevant form input
6. IF the Django register endpoint returns a `409` or duplicate-email error, THEN THE Frontend SHALL display a clear message indicating the email is already registered

### Requirement 6: Application Wizard Alignment

**User Story:** As a student, I want the multi-step application wizard to correctly load programs and intakes from the Django API and submit application data in the format the Django backend expects, so that I can complete my application.

#### Acceptance Criteria

1. WHEN the application wizard loads, THE Service_Layer SHALL fetch active programs and open intakes from the Django catalog endpoints
2. WHEN the student submits an application step, THE Service_Layer SHALL send the payload in the format expected by `POST /api/v1/applications/` or `PATCH /api/v1/applications/{id}/`
3. WHEN the Django API returns validation errors on application submission, THE Frontend SHALL map the error response to the corresponding wizard step and display field-level errors
4. WHEN the student saves a draft, THE Frontend SHALL persist draft data locally and sync with the Django API using the correct endpoint and payload shape
5. IF the Django API returns a `404` for a program or intake that was previously available, THEN THE Frontend SHALL display a message indicating the program or intake is no longer available

### Requirement 7: Payment Page Alignment

**User Story:** As a student, I want the payment page to correctly display payment status and handle payment submissions using the Django API, so that I can complete my application fee payment.

#### Acceptance Criteria

1. WHEN the payment page loads, THE Service_Layer SHALL fetch the student's payment status from the Application model via `GET /api/v1/applications/?mine=true` (payment fields are on the Application serializer: `payment_status`, `payment_method`, `amount`, `paid_at`, `momo_ref`, `pop_url`) and optionally from `GET /api/v1/payments/` for detailed payment records
2. WHEN the student initiates a payment, THE Frontend SHALL send the payment request to `POST /api/v1/payments/{id}/verify/` with the expected payload shape
3. WHEN the Django API confirms a payment, THE Frontend SHALL update the local payment status and navigate the student to the next step
4. IF the Django API returns a payment error (insufficient funds, gateway timeout), THEN THE Frontend SHALL display a specific, actionable error message
5. WHEN the student views a payment receipt, THE Service_Layer SHALL fetch receipt data from `GET /api/v1/payments/{id}/receipt/` and map the response to the frontend receipt display

### Requirement 8: Admin Application Review Alignment

**User Story:** As an admin, I want the application review pages to correctly load application details, update statuses, and manage reviews using the Django API, so that I can process student applications.

#### Acceptance Criteria

1. WHEN the admin applications list loads, THE Service_Layer SHALL fetch paginated applications from `GET /api/v1/applications/` (the same endpoint as students — the backend returns all applications when the user's role is `admin` or `super_admin`) and map the Django response to the frontend table format
2. WHEN an admin views an application detail, THE Service_Layer SHALL fetch the full application from the Django API including documents, grades, status history, and interview data
3. WHEN an admin updates an application status (approve, reject, request info), THE Service_Layer SHALL send the status change to the correct Django endpoint with the expected payload
4. WHEN the Django API returns the updated application after a status change, THE Frontend SHALL update the local cache and reflect the new status in the UI
5. IF the Django API returns a `409` conflict (concurrent edit), THEN THE Frontend SHALL display a conflict resolution message and offer to reload the latest data

### Requirement 9: Error Handling and Diagnostic Visibility

**User Story:** As a developer, I want all API errors to be logged to the browser console with full diagnostic details, so that I can debug issues in development and production.

#### Acceptance Criteria

1. WHEN any API call fails, THE Frontend SHALL log the error to the browser console including: HTTP method, endpoint URL, status code, and error message
2. THE Frontend SHALL NOT swallow errors silently — every caught error in a service call, hook, or component SHALL either be re-thrown, displayed to the user, or logged to the console
3. WHEN a component catches an error and displays a user-facing message, THE Frontend SHALL also log the original error object to the console at `console.error` level
4. IF an error occurs during React Query's `queryFn` execution, THEN THE Frontend SHALL allow React Query to handle the error state and render the appropriate error UI
5. WHEN the ApiClient receives a non-JSON response from an endpoint that normally returns JSON, THE Frontend SHALL log a warning with the endpoint and content-type received

### Requirement 10: Navigation and Shared Component Alignment

**User Story:** As a user, I want the navigation sidebar, route guards, and error boundaries to work correctly with the Django auth state, so that I can navigate the application without encountering broken states.

#### Acceptance Criteria

1. WHEN the user's auth state changes (login, logout, session expiry), THE Frontend SHALL update the navigation sidebar to reflect the current user's role and available routes
2. WHEN a route guard detects that auth loading has exceeded 5 seconds, THE Route_Guard SHALL display a recovery UI with a "Retry session" button instead of showing an infinite skeleton
3. WHEN the user clicks "Retry session" in the recovery UI, THE Route_Guard SHALL re-fetch the session from Session_Endpoint and re-evaluate the guard condition
4. WHEN an error boundary catches a rendering error, THE Frontend SHALL log the error to the console and display a user-friendly fallback with a reload option
5. WHILE the user is offline, THE Frontend SHALL display an offline indicator and queue state-changing requests for retry when connectivity is restored
6. WHEN the user's session expires during an active session, THE Frontend SHALL dispatch the `mihas:auth-expired` event and preserve the current route for post-login redirect

### Requirement 11: SSE and Realtime Connection Alignment

**User Story:** As a user, I want the real-time notification stream and polling fallback to work correctly with the Django SSE endpoint, so that I receive live updates without seeing "connection lost" errors.

#### Acceptance Criteria

1. WHEN the student dashboard mounts, THE Frontend SHALL attempt to connect to `GET /api/v1/events/stream/` with `Accept: text/event-stream` and proper credentials
2. IF the SSE connection fails or returns a non-200 status, THEN THE Frontend SHALL fall back to polling via `GET /api/v1/events/poll/` without displaying a persistent error banner
3. WHEN the SSE connection is established, THE Frontend SHALL process incoming events (notifications, keepalive pings) and update the UI accordingly
4. WHEN the SSE connection drops (network change, server restart), THE Frontend SHALL attempt reconnection with exponential backoff and display a transient "reconnecting" indicator rather than a permanent "connection lost" banner
5. THE Frontend SSE client SHALL send the `Last-Event-ID` header on reconnection to resume from the last received event

### Requirement 12: End-to-End Page Verification Test Suite

**User Story:** As a developer, I want a verification test suite that confirms every frontend page correctly processes Django API responses, so that regressions are caught automatically.

#### Acceptance Criteria

1. THE Frontend SHALL include a test file per page that verifies the service layer correctly maps the actual Django API response shape to the frontend types
2. EACH page verification test SHALL mock the ApiClient response with the actual Django response shape (captured from production or the DRF schema) and assert the component renders without errors
3. THE verification tests SHALL cover: student dashboard, admin dashboard, application wizard step 1 (program/intake loading), payment page, application detail, and sign-in page
4. WHEN a Django API response shape changes (e.g., field renamed or added), THE corresponding verification test SHALL fail, alerting the developer to update the service layer mapping
5. THE verification test suite SHALL be runnable via `cd apps/admissions && bun run test` and SHALL be included in the CI pipeline
