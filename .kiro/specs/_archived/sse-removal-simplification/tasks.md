# Implementation Plan: SSE Removal & Simplification

## Overview

Remove the entire SSE infrastructure (backend + frontend) and replace the two consumed event types with simple React Query polling. The Dashboard already has `useStudentDashboardPolling` — only the notification bell needs a new polling hook. Everything else is pure deletion.

## Tasks

- [x] 1. Remove backend SSE infrastructure
  - [x] 1.1 Delete backend SSE files and remove SSEEvent model
    - Delete `backend/apps/common/sse.py`
    - Delete `backend/apps/common/event_dispatcher.py`
    - Delete `backend/apps/common/event_urls.py`
    - Remove the `SSEEvent` model class from `backend/apps/common/models.py`
    - Remove `cleanup_sse_events_task` from `backend/apps/common/tasks.py`
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 Remove SSE URL route and dispatch_event calls
    - Remove `path("api/v1/events/", include("apps.common.event_urls"))` from `backend/config/urls.py`
    - Remove `from apps.common.event_dispatcher import dispatch_event` and all `dispatch_event(...)` calls from `backend/apps/applications/views.py`
    - Remove `from apps.common.event_dispatcher import dispatch_event` and all `dispatch_event(...)` calls from `backend/apps/common/notification_views.py`
    - _Requirements: 1.2, 1.4, 1.5_

  - [x] 1.3 Delete notification_tasks.py and update Celery Beat schedule
    - Delete `backend/apps/applications/notification_tasks.py`
    - Remove `cleanup-sse-events`, `send-deadline-reminders`, and `send-stale-draft-reminders` entries from `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py`
    - Verify `check_uptime_task`, `cleanup_audit_logs_task`, `poll_pending_payments_task`, and `intake_manager_task` entries remain unchanged
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 1.4 Create SQL drop script for sse_events table
    - Create `backend/scripts/drop_sse_events_table.sql` with `DROP TABLE IF EXISTS sse_events;`
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 2. Checkpoint — Backend SSE removal
  - Run `cd backend && python3 manage.py check` to verify Django system checks pass
  - Run `cd backend && python3 -m pytest` to see current test state (some tests will fail due to missing SSE imports — that's expected, they'll be cleaned up in task 6)
  - Ensure all non-SSE backend code still compiles and the app starts
  - _Requirements: 10.5_

- [x] 3. Remove frontend SSE infrastructure
  - [x] 3.1 Delete frontend SSE files
    - Delete `apps/admissions/src/lib/sseClient.ts`
    - Delete `apps/admissions/src/hooks/useRealtime.ts`
    - Delete `apps/admissions/src/contexts/RealtimeStatusContext.tsx`
    - Delete `apps/admissions/src/stores/realtimeStore.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 3.2 Remove SSE imports from Dashboard.tsx
    - Remove `import { useApplicationUpdates } from '@/hooks/useRealtime'`
    - Remove `import { getDefaultSSEClient } from '@/lib/sseClient'`
    - Remove the `useApplicationUpdates(...)` subscription block
    - Remove the `isSSEAuthFailed` memo that calls `getDefaultSSEClient().isAuthFailed()`
    - Keep `useStudentDashboardPolling` exactly as-is
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 3.3 Remove SSE cleanup from useSessionListener.ts signOut
    - Remove `import { getDefaultSSEClient } from '@/lib/sseClient'`
    - Remove the `try { const sseClient = getDefaultSSEClient(); sseClient.disconnect(); sseClient.resetAuthFailure() } catch {}` block from `signOut`
    - Preserve all other signOut steps: CSRF clear, query nulling, cache clear, secure storage, redirect keys, authSignedOut event, broadcast, navigation
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 3.4 Remove RealtimeStatusProvider from AuthenticatedRouteShell.tsx
    - Remove `import { RealtimeStatusProvider } from '@/contexts/RealtimeStatusContext'`
    - Remove the `<RealtimeStatusProvider>` wrapper from the component tree
    - _Requirements: 4.5_


- [x] 4. Create replacement notification polling hook
  - [x] 4.1 Implement useNotificationPolling hook
    - Create `apps/admissions/src/hooks/useNotificationPolling.ts`
    - Poll `GET /api/v1/notifications/` via React Query with `refetchInterval: 60_000`
    - Enable `refetchOnWindowFocus: true`
    - Pause polling when tab hidden > 5 minutes (same pattern as `useStudentDashboardPolling`)
    - Compute `unreadCount` client-side from `is_read === false` count
    - Expose `markRead`, `markAllRead`, `deleteNotification` mutations that invalidate the query cache
    - Use query key `['student-notifications', userId]`
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [x] 4.2 Wire useNotificationPolling into NotificationBell.tsx
    - Replace `import { useStudentNotifications } from '@/hooks/useStudentNotifications'` with `import { useNotificationPolling } from '@/hooks/useNotificationPolling'`
    - Wire up the new hook's return values (`notifications`, `unreadCount`, `markRead`, `markAllRead`, `deleteNotification`)
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 4.3 Update NotificationSettings if it uses SSE hooks
    - Replace any `useStudentNotifications` import with `useNotificationPolling`
    - Remove any SSE connection status display
    - _Requirements: 6.3_

- [x] 5. Checkpoint — Frontend compiles and builds
  - Run `cd apps/admissions && bun run build` to verify TypeScript compilation succeeds with no SSE references
  - Run `cd apps/admissions && bun run lint` to verify no lint errors
  - Ensure no imports reference `sseClient`, `useRealtime`, `RealtimeStatusContext`, `realtimeStore`, `useApplicationUpdates`, `useNotificationUpdates`, `usePaymentUpdates`, `dispatchSSEStatus`, `triggerSSEReconnect`, `getDefaultSSEClient`, or `resetDefaultSSEClient`
  - _Requirements: 4.5, 10.4_

- [x] 6. Update and remove SSE-related tests
  - [x] 6.1 Delete backend SSE test files
    - Delete `backend/tests/property/test_event_dispatcher.py`
    - Delete `backend/tests/property/test_sse_delivery.py`
    - Delete `backend/tests/property/test_event_cleanup.py`
    - _Requirements: 8.1_

  - [x] 6.2 Remove dispatch_event patches from backend tests
    - Update `backend/tests/unit/test_review_notifications.py` — remove all `@patch` decorators and mock references for `dispatch_event`
    - Update `backend/tests/unit/test_application_student_flow_views.py` — remove all `@patch` decorators and mock references for `dispatch_event`
    - _Requirements: 8.2_

  - [x] 6.3 Delete frontend SSE test files
    - Delete `apps/admissions/tests/property/sseAuthFailureStopsReconnect.property.test.ts`
    - Delete `apps/admissions/tests/property/sseAuthFailureDispatchesEvent.property.test.ts`
    - Delete `apps/admissions/tests/property/sseAuthFailureResetRoundTrip.property.test.ts`
    - Delete `apps/admissions/tests/property/sseMaxRetriesCap.property.test.ts`
    - Delete `apps/admissions/tests/property/sseNoProbeAfterAuthFailed.property.test.ts`
    - Delete `apps/admissions/tests/property/sseBackoff.property.test.ts`
    - Delete `apps/admissions/tests/unit/sse-backoff.test.ts`
    - Delete `apps/admissions/tests/unit/realtimeStatusContext.test.tsx`
    - Delete `apps/admissions/tests/unit/realtime-dispatch.test.ts`
    - Delete `apps/admissions/tests/unit/sseNoProbeAfterAuthFailed.test.ts`
    - _Requirements: 8.3_

  - [x] 6.4 Update audit production fix tests to remove SSE references
    - In `apps/admissions/tests/property/auditProductionBugCondition.property.test.ts`: remove the "Bug 3 — SSE logout cleanup" test block entirely
    - In `apps/admissions/tests/property/auditProductionPreservation.property.test.ts`: remove the SSE reconnection preservation tests that read `sseClient.ts` source code
    - Update `apps/admissions/tests/unit/page-verification/student-dashboard.test.tsx` — remove SSE-related mocks if present
    - _Requirements: 8.3, 8.5_

- [x] 7. Checkpoint — All tests pass after SSE test cleanup
  - Run `cd backend && python3 -m pytest` to verify backend test suite passes with zero failures
  - Run `cd apps/admissions && bun run test` to verify frontend test suite passes with zero failures
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 8.4, 8.5_

- [x] 8. Write property-based tests for new notification polling code
  - [x] 8.1 Write property test: Celery Beat schedule preserves non-SSE entries (hypothesis)
    - Place in `backend/tests/property/test_sse_removal_properties.py`
    - **Property 1: Celery Beat schedule preserves non-SSE entries**
    - Generate random subsets of Celery Beat entries, verify `check_uptime_task`, `cleanup_audit_logs_task`, `poll_pending_payments_task`, `intake_manager_task` (and any other non-SSE entries) are present with unchanged task paths and schedules
    - Tag: `Feature: sse-removal-simplification, Property 1: Celery Beat schedule preserves non-SSE entries`
    - **Validates: Requirements 2.3**

  - [x] 8.2 Write property test: Dashboard fingerprint deduplication (fast-check)
    - Place in `apps/admissions/tests/property/sseRemovalNotificationPolling.property.test.ts`
    - **Property 2: Dashboard fingerprint deduplication prevents redundant updates**
    - Generate random application lists, verify fingerprint comparison logic: identical lists → no callback, different lists → callback fires
    - Tag: `Feature: sse-removal-simplification, Property 2: Dashboard fingerprint deduplication prevents redundant updates`
    - **Validates: Requirements 5.2**

  - [x] 8.3 Write property test: Notification unread count (fast-check)
    - Place in same file as 8.2
    - **Property 3: Notification unread count matches unread notifications**
    - Generate random notification lists with varying `is_read` states, verify `unreadCount` equals count of `is_read === false`
    - Tag: `Feature: sse-removal-simplification, Property 3: Notification unread count matches unread notifications`
    - **Validates: Requirements 6.2**

  - [x] 8.4 Write property test: Notification polling pauses when tab hidden (fast-check)
    - Place in same file as 8.2
    - **Property 4: Notification polling pauses when tab is hidden beyond threshold**
    - Generate random hidden durations, verify: `d >= 300000` → polling paused (`false`), `d < 300000` → polling continues (positive number)
    - Tag: `Feature: sse-removal-simplification, Property 4: Notification polling pauses when tab is hidden beyond threshold`
    - **Validates: Requirements 6.5**

  - [x] 8.5 Write property test: SignOut flow preserves non-SSE cleanup (fast-check)
    - Place in same file as 8.2
    - **Property 5: SignOut flow preserves all non-SSE cleanup steps**
    - Read `useSessionListener.ts` source, verify all required cleanup steps are present: CSRF clear, session query null, profile query null, queryClient.clear, secure storage clear, redirect key removal, authSignedOut dispatch, broadcast logout, navigate to sign-in
    - Tag: `Feature: sse-removal-simplification, Property 5: SignOut flow preserves all non-SSE cleanup steps`
    - **Validates: Requirements 7.2**

- [x] 9. Update steering files
  - [x] 9.1 Update tech.md
    - Remove the SSE bullet from "Conventions For New Code > Frontend" (the one about `sseClient.ts` with rapid-failure detection and polling fallback)
    - Remove `send-deadline-reminders` and `send-stale-draft-reminders` from the Celery Beat table
    - Remove `cleanup-sse-events` from the Celery Beat table if listed
    - Remove the SSE-related verification expectation about `sseClient.ts`
    - Add a note that Dashboard uses `useStudentDashboardPolling` and NotificationBell uses `useNotificationPolling` for data freshness
    - _Requirements: 9.1, 9.4_

  - [x] 9.2 Update structure.md
    - Remove the `sseClient.ts` row from the Important Paths table
    - Remove SSE-related entries from the audit production fixes file listings (Bug 3 SSE logout references)
    - _Requirements: 9.2_

  - [x] 9.3 Update product.md
    - Remove the "SSE connections fall back to polling after 3 rapid QUIC failures" line from Performance Conventions
    - Add a note that data freshness is handled by React Query polling
    - _Requirements: 9.3, 9.4_

- [x] 10. Final checkpoint — Full verification
  - Run `cd backend && python3 manage.py check` — Django system checks pass
  - Run `cd backend && python3 -m pytest` — backend test suite passes with zero failures
  - Run `cd apps/admissions && bun run build` — frontend builds without errors
  - Run `cd apps/admissions && bun run test` — frontend test suite passes with zero failures
  - Run `cd apps/admissions && bun run lint` — no lint errors
  - Verify no remaining imports of `sseClient`, `useRealtime`, `RealtimeStatusContext`, `realtimeStore`, `dispatch_event`, `event_dispatcher`, `SSEEvent`, or `notification_tasks` in the codebase
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 8.4, 8.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The SQL drop script (task 1.4) should be executed via Neon MCP or database console after backend deployment
- The Dashboard requires zero new code — `useStudentDashboardPolling` already handles all data freshness
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at safe boundaries
- Property tests validate universal correctness properties from the design document
