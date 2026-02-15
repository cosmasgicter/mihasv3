# Requirements Document

## Introduction

This specification addresses the critical issues discovered by the forensic audit of the MIHAS Application System (***REMOVED***). The audit revealed 587 performance issues, 78 API contract mismatches, 42 critical page quality failures, dead code from legacy migrations, fragmented auth state, zero notification idempotency, and 6 unwired SSE features. The remediation is prioritized: (1) Performance/bundle size, (2) Dead code removal, (3) Contract fixes, (4) Page quality, (5) Auth unification, (6) Notification idempotency, (7) SSE wiring.

## Glossary

- **Build_System**: The Vite + Bun build pipeline that produces the production JavaScript bundle
- **Bundle_Analyzer**: A tool or process that measures the total JavaScript bundle size and identifies oversized chunks
- **Frontend_Service_Layer**: The TypeScript service files in `src/services/` that make API calls to backend endpoints
- **Backend_Router**: The Vercel serverless function endpoints in `api-src/` that use query-parameter routing (`?action=xxx`)
- **Page_Component**: A React component in `src/pages/` that represents a routable view
- **Auth_Guard**: A wrapper or hook (`useAuth`, `ProtectedRoute`, `AdminRoute`) that enforces authentication and role checks on page components
- **SSE_Client**: The centralized Server-Sent Events client (`src/lib/sseClient.ts`) that manages real-time event subscriptions
- **Idempotency_Service**: A centralized module that generates unique keys and tracks sent notifications to prevent duplicates
- **Dead_Code**: Unused exports, legacy Supabase/Cloudflare references, commented-out code blocks, and entire unused files remaining from prior migrations
- **Animation_System**: The collection of motion/animation implementations across components, currently dominated by framer-motion

## Requirements

### Requirement 1: Performance and Bundle Size Reduction

**User Story:** As a student on a low-end Android phone with a 3G connection, I want the application to load quickly and run smoothly, so that I can complete my admissions process without frustration.

#### Acceptance Criteria

1. WHEN the Build_System produces a production build, THE Bundle_Analyzer SHALL report a total JavaScript bundle size of 500 KB or less
2. WHEN a Page_Component renders an animation, THE Animation_System SHALL use CSS transitions or Tailwind animate-* classes instead of framer-motion
3. WHEN the Build_System produces a production build, THE Build_System SHALL produce zero chunks exceeding 150 KB individually
4. WHEN framer-motion is removed from all components, THE Build_System SHALL exclude framer-motion from the dependency tree entirely
5. IF a component previously using framer-motion is rendered, THEN THE Page_Component SHALL preserve the same visual transition behavior using CSS equivalents

### Requirement 2: Dead Code Removal

**User Story:** As a developer, I want the codebase free of unused code and legacy references, so that the project is maintainable and the bundle is lean.

#### Acceptance Criteria

1. WHEN the codebase is scanned for imports of `supabase`, THE Build_System SHALL find zero references to Supabase client libraries or configuration files
2. WHEN the codebase is scanned for imports of Cloudflare-specific modules, THE Build_System SHALL find zero references to Cloudflare Workers, Pages, or AI modules
3. WHEN the codebase is scanned for unused exports, THE Build_System SHALL find zero exported symbols that are not imported by any other module in the dependency graph
4. WHEN the codebase is scanned for commented-out code blocks exceeding 5 lines, THE Build_System SHALL find zero such blocks
5. WHEN files such as `regulatoryComplianceChecker`, `workflowAutomation`, `backupRecovery`, `databaseOptimization`, `systemMonitoring`, and `performanceAlerting` are identified as entirely unused, THE Build_System SHALL exclude those files from the source tree

### Requirement 3: API Contract Alignment

**User Story:** As a developer, I want every frontend API call to reach a valid backend endpoint, so that no user action results in a silent 404 or broken feature.

#### Acceptance Criteria

1. WHEN the Frontend_Service_Layer makes an API call using a path-based URL pattern (e.g., `/api/admin/users`), THE Frontend_Service_Layer SHALL rewrite the call to use the consolidated query-parameter routing pattern (e.g., `/api/admin?action=users`)
2. WHEN the Frontend_Service_Layer makes an API call, THE Backend_Router SHALL have a matching endpoint and action handler for that call
3. WHEN a backend endpoint exists but is never called by the Frontend_Service_Layer, THE Backend_Router SHALL either be wired to a frontend consumer or removed
4. IF the Frontend_Service_Layer sends a request without authentication to an endpoint that requires authentication, THEN THE Frontend_Service_Layer SHALL include the appropriate auth credentials (HTTP-only cookie)
5. WHEN the contract alignment is complete, THE Build_System SHALL report zero MISSING_ENDPOINT mismatches and zero AUTH_MISMATCH mismatches

### Requirement 4: Page Quality Remediation

**User Story:** As a student or admin, I want every page to handle errors gracefully, show loading states, and work on my mobile device, so that I have a reliable experience.

#### Acceptance Criteria

1. WHEN an admin Page_Component is rendered, THE Auth_Guard SHALL verify the user is authenticated and has an admin or super_admin role before displaying content
2. WHEN a student Page_Component is rendered, THE Auth_Guard SHALL verify the user is authenticated before displaying content
3. WHEN a Page_Component performs an asynchronous data fetch that fails, THE Page_Component SHALL display a user-friendly error message instead of crashing or showing a blank screen
4. WHEN a Page_Component performs an asynchronous data fetch, THE Page_Component SHALL display a loading indicator until the data is available
5. WHEN a Page_Component uses `useEffect` with async state updates, THE Page_Component SHALL include a cleanup mechanism to prevent state updates on unmounted components
6. WHEN a Page_Component is viewed on a mobile viewport (width less than 768px), THE Page_Component SHALL use responsive Tailwind breakpoints to adapt layout

### Requirement 5: Auth State Unification

**User Story:** As a developer, I want a single source of truth for authentication state, so that auth checks are consistent and maintainable across the application.

#### Acceptance Criteria

1. THE Auth_Guard SHALL read authentication state from a single Zustand auth store rather than from multiple fragmented sources
2. WHEN a user logs in, THE Auth_Guard SHALL populate the unified auth store with user profile, role, and session data
3. WHEN a user logs out, THE Auth_Guard SHALL clear the unified auth store and redirect to the sign-in page
4. WHEN a JWT access token expires, THE Auth_Guard SHALL automatically attempt a token refresh before returning an authentication failure
5. IF a token refresh fails, THEN THE Auth_Guard SHALL clear the auth store and redirect the user to the sign-in page

### Requirement 6: Notification Idempotency

**User Story:** As a student, I want to receive each notification and email exactly once per event, so that I am not confused by duplicate messages.

#### Acceptance Criteria

1. WHEN an email dispatch is triggered, THE Idempotency_Service SHALL generate a unique idempotency key based on user ID, event type, and a content hash
2. WHEN an email dispatch is triggered with an idempotency key that has already been recorded, THE Idempotency_Service SHALL skip the duplicate send
3. WHEN an email dispatch fails due to a transient error, THE Idempotency_Service SHALL retry with exponential backoff up to 3 attempts
4. IF all retry attempts for an email dispatch fail, THEN THE Idempotency_Service SHALL log the failure for manual review without exposing PII
5. WHEN a realtime notification is dispatched to the frontend, THE SSE_Client SHALL deduplicate notifications on the client side using event IDs

### Requirement 7: SSE Feature Wiring

**User Story:** As a student, I want to see real-time updates for my application status, payment confirmations, and document processing, so that I do not need to manually refresh the page.

#### Acceptance Criteria

1. WHEN an application status changes in the backend, THE SSE_Client SHALL receive an `application_update` event and update the relevant Page_Component in real time
2. WHEN a payment status changes in the backend, THE SSE_Client SHALL receive a `payment_update` event and update the relevant Page_Component in real time
3. WHEN a document finishes processing in the backend, THE SSE_Client SHALL receive a `document_processed` event and update the relevant Page_Component in real time
4. WHEN an interview is scheduled in the backend, THE SSE_Client SHALL receive an `interview_scheduled` event and update the relevant Page_Component in real time
5. WHEN a notification is created in the backend, THE SSE_Client SHALL receive a `notification` event and display it to the user in real time
6. IF the SSE connection is lost, THEN THE SSE_Client SHALL reconnect with exponential backoff and resume receiving events
7. IF SSE is unavailable (e.g., browser limitation), THEN THE SSE_Client SHALL fall back to polling at a configurable interval
