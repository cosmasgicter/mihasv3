# Requirements Document

## Introduction

Remove the entire Server-Sent Events (SSE) infrastructure from the MIHAS platform end-to-end and replace it with simple React Query polling. The SSE system causes 503 errors in production on Koyeb, floods the console with retry attempts, and adds significant complexity (1,700+ lines of frontend code, 450+ lines of backend code, a dedicated Postgres table, and Celery tasks) for limited value. Only 2 of 5 dispatched event types are actually consumed by the frontend. The replacement strategy leverages the existing `useStudentDashboardPolling` hook and React Query's built-in `refetchOnWindowFocus` to maintain data freshness without SSE.

## Glossary

- **Dashboard**: The student-facing overview page (`Dashboard.tsx`) that displays applications, intakes, interviews, and quick actions.
- **Notification_Bell**: The header UI component that displays unread notification count and a dropdown list of student notifications.
- **SSE_System**: The complete Server-Sent Events infrastructure spanning backend (`sse.py`, `event_dispatcher.py`, `event_urls.py`, `SSEEvent` model, `notification_tasks.py`) and frontend (`sseClient.ts`, `useRealtime.ts`, `useStudentNotifications.ts`, `RealtimeStatusContext.tsx`, `realtimeStore.ts`).
- **Dashboard_Polling_Hook**: The existing `useStudentDashboardPolling` React Query hook that polls `GET /api/v1/applications/` at configurable intervals with fingerprint-based deduplication.
- **Notification_Polling**: A new React Query polling mechanism for the Notification_Bell that fetches `GET /api/v1/notifications/` on a timer.
- **SSEEvent_Table**: The `sse_events` Postgres table used as a database-backed event queue for the SSE_System.
- **Event_Dispatcher**: The `dispatch_event()` function in `backend/apps/common/event_dispatcher.py` that creates SSEEvent rows.
- **Notification_Tasks**: The Celery tasks `send_deadline_reminders` and `send_stale_draft_reminders` in `backend/apps/applications/notification_tasks.py`.
- **SignOut_Flow**: The `signOut` callback in `useSessionListener.ts` that handles user logout, cache clearing, and SSE cleanup.
- **Steering_Files**: The `.kiro/steering/` markdown files (`tech.md`, `structure.md`, `product.md`) that document project conventions and architecture.

## Requirements

### Requirement 1: Remove Backend SSE Infrastructure

**User Story:** As a platform maintainer, I want to remove all backend SSE infrastructure, so that the codebase is simpler and the 503 errors caused by SSE stream connections on Koyeb are eliminated.

#### Acceptance Criteria

1. WHEN the SSE_System backend files are removed, THE Backend SHALL no longer contain `backend/apps/common/sse.py`, `backend/apps/common/event_dispatcher.py`, or `backend/apps/common/event_urls.py`.
2. WHEN the SSE URL route is removed, THE Backend SHALL no longer mount `/api/v1/events/stream/` or `/api/v1/events/poll/` in `backend/config/urls.py`.
3. WHEN the SSEEvent model is removed, THE Backend SHALL no longer define the `SSEEvent` class in `backend/apps/common/models.py`.
4. WHEN all `dispatch_event()` calls are removed, THE Backend SHALL no longer import or invoke `dispatch_event` in `backend/apps/applications/views.py` or `backend/apps/common/notification_views.py`.
5. IF a request is made to `/api/v1/events/stream/` or `/api/v1/events/poll/` after removal, THEN THE Backend SHALL return a 404 response.

### Requirement 2: Remove Celery Notification Tasks

**User Story:** As a platform maintainer, I want to remove the SSE-dependent Celery notification tasks, so that background workers no longer dispatch events to a system that does not exist.

#### Acceptance Criteria

1. WHEN the Notification_Tasks are removed, THE Backend SHALL no longer contain `backend/apps/applications/notification_tasks.py`.
2. WHEN the Celery Beat schedule is updated, THE Backend SHALL no longer include `send-deadline-reminders` or `send-stale-draft-reminders` entries in `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py`.
3. WHEN the Notification_Tasks are removed, THE Backend SHALL retain all other Celery Beat schedule entries (`check_uptime_task`, `cleanup_audit_logs_task`, `poll_pending_payments_task`, `intake_manager_task`) unchanged.

### Requirement 3: Drop the SSEEvent Database Table

**User Story:** As a platform maintainer, I want to drop the `sse_events` Postgres table, so that the database no longer accumulates unused event rows.

#### Acceptance Criteria

1. WHEN the SSEEvent_Table is dropped, THE Database SHALL no longer contain a table named `sse_events`.
2. WHEN the drop operation is performed, THE Database SHALL preserve all other tables and their data intact.
3. THE Migration_Script SHALL be provided as a SQL file in `backend/scripts/` for execution via the Neon MCP or database console.

### Requirement 4: Remove Frontend SSE Client and Realtime Infrastructure

**User Story:** As a frontend developer, I want to remove all SSE client code and realtime infrastructure, so that the frontend bundle is smaller and the console is no longer flooded with SSE retry errors.

#### Acceptance Criteria

1. WHEN the frontend SSE files are removed, THE Frontend SHALL no longer contain `apps/admissions/src/lib/sseClient.ts`.
2. WHEN the frontend SSE files are removed, THE Frontend SHALL no longer contain `apps/admissions/src/hooks/useRealtime.ts`.
3. WHEN the frontend SSE files are removed, THE Frontend SHALL no longer contain `apps/admissions/src/contexts/RealtimeStatusContext.tsx`.
4. WHEN the frontend SSE files are removed, THE Frontend SHALL no longer contain `apps/admissions/src/stores/realtimeStore.ts`.
5. WHEN the SSE imports are removed, THE Frontend SHALL compile without errors referencing `sseClient`, `useRealtime`, `RealtimeStatusContext`, `realtimeStore`, `useApplicationUpdates`, `useNotificationUpdates`, `usePaymentUpdates`, `dispatchSSEStatus`, `triggerSSEReconnect`, `getDefaultSSEClient`, or `resetDefaultSSEClient`.

### Requirement 5: Replace Dashboard SSE with Enhanced Polling

**User Story:** As a student, I want the Dashboard to auto-refresh when my application data changes, so that I see up-to-date information without manually refreshing the page.

#### Acceptance Criteria

1. THE Dashboard SHALL use the Dashboard_Polling_Hook to poll `GET /api/v1/applications/` for data changes.
2. WHEN the Dashboard_Polling_Hook detects a data change via fingerprint comparison, THE Dashboard SHALL update the displayed applications list.
3. THE Dashboard SHALL no longer import or use `useApplicationUpdates` from `useRealtime.ts`.
4. THE Dashboard SHALL no longer import or use `getDefaultSSEClient` from `sseClient.ts`.
5. THE Dashboard SHALL continue to support manual refresh via the existing `useStudentDashboardRefresh` hook.
6. THE Dashboard SHALL continue to use React Query's `refetchOnWindowFocus` to refresh data when the browser tab regains focus.

### Requirement 6: Replace Notification Bell SSE with Polling

**User Story:** As a student, I want the notification bell to show new notifications without SSE, so that I receive timely notification updates through a simpler polling mechanism.

#### Acceptance Criteria

1. THE Notification_Bell SHALL poll `GET /api/v1/notifications/` using React Query at a default interval of 60 seconds.
2. WHEN the Notification_Bell receives new notifications from polling, THE Notification_Bell SHALL update the unread count and notification list.
3. THE Notification_Bell SHALL no longer depend on `useRealtime` or `subscribe('notification', ...)` for receiving notifications.
4. WHEN the browser tab regains focus, THE Notification_Bell SHALL refetch notifications via React Query's `refetchOnWindowFocus`.
5. WHILE the browser tab is hidden for more than 5 minutes, THE Notification_Bell SHALL pause polling to conserve resources.

### Requirement 7: Update SignOut Flow

**User Story:** As a student, I want the sign-out process to work cleanly without SSE cleanup code, so that logout completes without errors from missing SSE infrastructure.

#### Acceptance Criteria

1. WHEN a user signs out, THE SignOut_Flow SHALL no longer call `getDefaultSSEClient().disconnect()` or `getDefaultSSEClient().resetAuthFailure()`.
2. WHEN a user signs out, THE SignOut_Flow SHALL continue to clear the CSRF token, null out session and profile queries, clear the React Query cache, clear secure storage, remove redirect keys, dispatch the `authSignedOut` event, broadcast logout, and navigate to the sign-in route.
3. THE SignOut_Flow SHALL not import `getDefaultSSEClient` from `sseClient.ts`.

### Requirement 8: Update and Remove SSE-Related Tests

**User Story:** As a developer, I want all SSE-related tests removed or updated, so that the test suite passes without references to deleted SSE infrastructure.

#### Acceptance Criteria

1. WHEN SSE backend tests are removed, THE Backend SHALL no longer contain `backend/tests/property/test_event_dispatcher.py`.
2. WHEN SSE-related test patches are removed, THE Backend test files `test_review_notifications.py` and `test_application_student_flow_views.py` SHALL no longer patch `dispatch_event`.
3. WHEN SSE frontend tests are removed, THE Frontend test suite SHALL no longer contain tests that reference `sseClient`, `useRealtime`, `RealtimeStatusContext`, `realtimeStore`, `SSEClient`, or `getDefaultSSEClient`.
4. THE Backend test suite SHALL pass with zero failures after all SSE-related test changes.
5. THE Frontend test suite SHALL pass with zero failures after all SSE-related test changes.

### Requirement 9: Update Steering Files

**User Story:** As a developer, I want the steering files to accurately reflect the removal of SSE, so that future development follows the correct architecture.

#### Acceptance Criteria

1. WHEN the Steering_Files are updated, THE `tech.md` file SHALL remove all references to SSE connections, `sseClient.ts`, SSE polling fallback, SSE rapid-failure detection, and SSE-related Celery Beat entries (`send_deadline_reminders`, `send_stale_draft_reminders`).
2. WHEN the Steering_Files are updated, THE `structure.md` file SHALL remove the `sseClient.ts` entry from the Important Paths table and remove SSE-related entries from the audit production fixes file listings.
3. WHEN the Steering_Files are updated, THE `product.md` file SHALL remove references to SSE connections falling back to polling and SSE-related performance conventions.
4. WHEN the Steering_Files are updated, THE Steering_Files SHALL document that the Dashboard uses React Query polling via `useStudentDashboardPolling` and the Notification_Bell uses React Query polling for data freshness.

### Requirement 10: Preserve Non-SSE Functionality

**User Story:** As a student, I want all non-SSE features to continue working after the removal, so that the application experience is unaffected.

#### Acceptance Criteria

1. THE Dashboard SHALL continue to display the `beforeunload` guard and dirty-state protection on forms.
2. THE Frontend SHALL continue to use speculative prefetching (`speculativePrefetch.ts`) and route preloading (`routePreload.ts`).
3. THE Backend SHALL continue to create `Notification` model rows in the `notifications` table when admin actions occur (application review, status changes).
4. THE Frontend SHALL continue to compile and build without TypeScript errors after all SSE removals.
5. THE Backend SHALL continue to pass Django system checks (`python3 manage.py check`) after all SSE removals.
6. THE `GET /api/v1/notifications/` endpoint SHALL continue to return notifications for authenticated users in the standard envelope format.
