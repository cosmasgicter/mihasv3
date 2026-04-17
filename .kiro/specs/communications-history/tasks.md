# Implementation Plan: Communications History

## Overview

Incremental implementation of the communications history feature: backend endpoints first (timeline API, admin notification history, pagination enhancement), then frontend service and hooks, then student pages, admin panel, route registration, and finally tests. Each task builds on the previous, with checkpoints to validate progress.

## Tasks

- [x] 1. Backend: Add pagination and filtering to NotificationListView
  - [x] 1.1 Enhance `NotificationListView.get` in `backend/apps/common/notification_views.py` with pagination and filtering
    - Add `page` and `pageSize` query params (default page=1, pageSize=20, max pageSize=100)
    - Add `type` query param filter (info, success, warning, error)
    - Add `is_read` query param filter (true/false)
    - Return paginated envelope: `{"success": true, "data": {"page", "pageSize", "totalCount", "results"}}`
    - Backward compatible: without params, still returns all notifications in the envelope
    - Update `NotificationItemSerializer` to include `action_url` field
    - _Requirements: 1.1, 1.7, 3.5, 5.1_

  - [x] 1.2 Write unit tests for NotificationListView pagination and filtering
    - Test default pagination (no params returns page 1 with all results)
    - Test type filter returns only matching notifications
    - Test is_read filter returns only matching notifications
    - Test combined filters
    - Test pageSize clamping to max 100
    - Test file: `backend/tests/unit/test_communications_history.py`
    - _Requirements: 1.1, 1.7_

- [x] 2. Backend: Create TimelineHistoryView endpoint
  - [x] 2.1 Create `backend/apps/applications/history_views.py` with `TimelineHistoryView`
    - `GET /api/v1/applications/history/` with `IsAuthenticated` permission
    - For students: query `ApplicationStatusHistory` where `application__user_id == request.user.pk`
    - For admins: accept `?user_id=<uuid>` query param to filter by specific user
    - Include `application_number` from related `Application` via select_related
    - Order by `created_at` descending
    - Support pagination: `page`, `pageSize` params (default 1/20, max 100)
    - Return standard paginated envelope with `application_id`, `application_number`, `old_status`, `new_status`, `notes`, `changed_by_name`, `created_at`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 2.2 Register the timeline history URL in `backend/apps/applications/urls.py`
    - Add `path("history/", TimelineHistoryView.as_view(), name="application-history")` before the `<uuid:application_id>/` catch-all
    - _Requirements: 3.1_

  - [x] 2.3 Write unit tests for TimelineHistoryView
    - Test 401 for unauthenticated requests
    - Test student sees only their own application history
    - Test admin with `user_id` param sees that user's history
    - Test ordering by `created_at` descending
    - Test pagination envelope structure
    - Test file: `backend/tests/unit/test_communications_history.py`
    - _Requirements: 3.1, 3.2, 3.6, 3.7_

- [x] 3. Backend: Create AdminNotificationHistoryView endpoint
  - [x] 3.1 Add `AdminNotificationHistoryView` to `backend/apps/common/notification_views.py`
    - `GET /api/v1/notifications/user/<uuid:user_id>/` with `IsAuthenticated, IsAdmin` permissions
    - Query `Notification` records for the specified `user_id`
    - Order by `created_at` descending
    - Support pagination (page/pageSize)
    - Return 404 if user_id doesn't exist (check Profile model)
    - Return 403 for non-admin users (handled by permission classes)
    - Return standard paginated envelope
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 3.2 Register the admin notification history URL in `backend/apps/common/notification_urls.py`
    - Add `path("user/<uuid:user_id>/", AdminNotificationHistoryView.as_view(), name="notification-user-history")` before the catch-all empty path
    - _Requirements: 7.1_

  - [x] 3.3 Write unit tests for AdminNotificationHistoryView
    - Test 403 for non-admin users
    - Test 404 for non-existent user_id
    - Test admin sees only the specified user's notifications
    - Test ordering and pagination
    - Test file: `backend/tests/unit/test_communications_history.py`
    - _Requirements: 7.2, 7.6, 7.7_

- [x] 4. Checkpoint — Backend endpoints complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Frontend: Create communicationsService and TypeScript types
  - [x] 5.1 Create `apps/admissions/src/services/communications.ts`
    - Import `apiClient` from `./client`
    - Define TypeScript interfaces: `TimelineEntry`, `PaginatedResponse<T>`, `NotificationFilters`, `PaginationParams`
    - Implement `listNotifications(params: PaginationParams & NotificationFilters)` → `GET /notifications/` with query params
    - Implement `listHistory(params: PaginationParams & { userId?: string })` → `GET /applications/history/` with query params
    - Implement `listUserNotifications(userId: string, params: PaginationParams)` → `GET /notifications/user/${userId}/`
    - Follow the `notificationService` pattern in `apps/admissions/src/services/notifications.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 6. Frontend: Create React Query hooks
  - [x] 6.1 Create `apps/admissions/src/hooks/useCommunications.ts`
    - React Query wrapper for `communicationsService.listNotifications`
    - Query key: `['communications', filters]` where filters includes page, type, is_read
    - Expose: `notifications`, `isLoading`, `error`, `pagination`, `refetch`
    - _Requirements: 5.1, 1.1_

  - [x] 6.2 Create `apps/admissions/src/hooks/useTimeline.ts`
    - React Query wrapper for `communicationsService.listHistory`
    - Query key: `['timeline', userId, page]`
    - Implement `groupedEntries` computed value that groups entries by `application_number`
    - Expose: `entries`, `groupedEntries`, `isLoading`, `error`, `pagination`
    - _Requirements: 5.2, 2.1, 2.4_

- [x] 7. Frontend: Create CommunicationsPage
  - [x] 7.1 Create `apps/admissions/src/pages/student/Communications.tsx`
    - Use `PageShell`, `SectionCard`, `EmptyState`, `ErrorDisplay` UI primitives
    - Use `useCommunications` hook for data fetching
    - Render notification list with title, message, type indicator, read/unread status, formatted timestamp
    - Render `action_url` as navigable link when present
    - Filter controls: type dropdown (all/info/success/warning/error), read status (all/unread/read)
    - Actions: mark read on click, mark all read button, delete button per notification
    - Use `notificationService.markRead`, `notificationService.markAllRead`, `notificationService.delete` for mutations
    - Show `EmptyState` when no notifications, `ErrorDisplay` on fetch failure
    - Pagination controls (next/prev page)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

- [x] 8. Frontend: Create ActivityTimeline page
  - [x] 8.1 Create `apps/admissions/src/pages/student/History.tsx`
    - Use `PageShell`, `SectionCard`, `EmptyState`, `ErrorDisplay` UI primitives
    - Use `useTimeline` hook for data fetching
    - Render timeline entries grouped by `application_number` with section headers
    - Each entry shows: old_status → new_status, notes (when present), changed_by_name, formatted timestamp
    - Color-coded status indicators using a status-to-color mapping function
    - Show `EmptyState` when no history, `ErrorDisplay` on fetch failure
    - Pagination controls
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 9. Frontend: Register routes and add navigation links
  - [x] 9.1 Update `apps/admissions/src/routes/config.tsx`
    - Add lazy import for `Communications` page from `@/pages/student/Communications`
    - Add lazy import for `History` page from `@/pages/student/History`
    - Register `{ path: '/student/communications', element: StudentCommunications, guard: 'student', lazy: true, skeletonType: 'detail' }`
    - Register `{ path: '/student/history', element: StudentHistory, guard: 'student', lazy: true, skeletonType: 'detail' }`
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 9.2 Add navigation links to `/student/communications` and `/student/history` in the student navigation
    - Add links visible from student dashboard and student pages
    - _Requirements: 4.4_

- [x] 10. Checkpoint — Student pages complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Frontend: Create AdminCommunicationsPanel
  - [x] 11.1 Create `apps/admissions/src/components/admin/AdminCommunicationsPanel.tsx`
    - Props: `userId: string`, `studentName: string`
    - Fetch notification history via `communicationsService.listUserNotifications(userId, ...)`
    - Fetch timeline via `communicationsService.listHistory({ userId, ... })`
    - Render notification history list ordered by created_at descending
    - Send message form: title, message, type fields
    - On submit: call `notificationService.send({ to: userId, subject, message })` with optimistic update
    - Show inline error on send failure, preserve form content for retry
    - Display inline timeline view alongside notification history
    - Pagination for both notification list and timeline
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 12. Checkpoint — All components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Property-based tests: Frontend (fast-check)
  - [x] 13.1 Write property test for chronological ordering (frontend)
    - **Property 1: Chronological ordering**
    - Generate random notification/timeline arrays, verify sort invariant (created_at descending)
    - Test file: `apps/admissions/tests/property/communicationsHistory.property.test.ts`
    - **Validates: Requirements 1.1, 2.1, 6.1**

  - [x] 13.2 Write property test for notification display completeness
    - **Property 2: Notification display completeness**
    - Generate random notification objects, verify rendered output contains title, message, type, read indicator, timestamp
    - Test file: `apps/admissions/tests/property/communicationsHistory.property.test.ts`
    - **Validates: Requirements 1.2**

  - [x] 13.3 Write property test for filter correctness
    - **Property 4: Filter correctness**
    - Generate random notification arrays + filter combos, verify filtered set is subset and matches filter criteria
    - Test file: `apps/admissions/tests/property/communicationsHistory.property.test.ts`
    - **Validates: Requirements 1.7**

  - [x] 13.4 Write property test for action URL conditional rendering
    - **Property 5: Action URL conditional rendering**
    - Generate notifications with/without action_url, verify link presence/absence
    - Test file: `apps/admissions/tests/property/communicationsHistory.property.test.ts`
    - **Validates: Requirements 1.8**

  - [x] 13.5 Write property test for status color mapping totality
    - **Property 6: Status color mapping totality**
    - Generate random status strings including known and unknown values, verify mapping returns defined non-empty CSS class
    - Test file: `apps/admissions/tests/property/communicationsHistory.property.test.ts`
    - **Validates: Requirements 2.3**

  - [x] 13.6 Write property test for timeline grouping correctness
    - **Property 7: Timeline grouping correctness**
    - Generate random timeline entries with mixed application_numbers, verify grouping invariants (same app_number per group, every entry in exactly one group)
    - Test file: `apps/admissions/tests/property/communicationsHistory.property.test.ts`
    - **Validates: Requirements 2.4**

- [x] 14. Property-based tests: Backend (hypothesis)
  - [x] 14.1 Write property test for chronological ordering (backend)
    - **Property 1: Chronological ordering**
    - Generate random history records, verify API returns them sorted by created_at descending
    - Test file: `backend/tests/property/test_communications_history_properties.py`
    - **Validates: Requirements 1.1, 2.1, 3.2, 7.3**

  - [x] 14.2 Write property test for student ownership scoping
    - **Property 8: Student ownership scoping**
    - Generate records for multiple users, verify API filters correctly to authenticated user only
    - Test file: `backend/tests/property/test_communications_history_properties.py`
    - **Validates: Requirements 3.1, 3.6**

  - [x] 14.3 Write property test for response envelope format
    - **Property 9: Response envelope format**
    - Verify response structure matches `{"success": true, "data": {page, pageSize, totalCount, results}}`
    - Test file: `backend/tests/property/test_communications_history_properties.py`
    - **Validates: Requirements 3.4, 7.4**

  - [x] 14.4 Write property test for pagination invariants
    - **Property 10: Pagination invariants**
    - Generate varying page/pageSize params, verify `results.length <= pageSize` and `totalCount >= results.length`
    - Test file: `backend/tests/property/test_communications_history_properties.py`
    - **Validates: Requirements 3.5, 7.5**

  - [x] 14.5 Write property test for admin-only access enforcement
    - **Property 11: Admin-only access enforcement**
    - Verify 403 for non-admin users with generated user_ids, response contains no notification data
    - Test file: `backend/tests/property/test_communications_history_properties.py`
    - **Validates: Requirements 6.7, 7.2**

  - [x] 14.6 Write property test for admin user-scoped notification retrieval
    - **Property 12: Admin user-scoped notification retrieval**
    - Generate notifications for multiple users, verify admin endpoint returns only the specified user's notifications
    - Test file: `backend/tests/property/test_communications_history_properties.py`
    - **Validates: Requirements 3.8, 7.1**

- [x] 15. Frontend unit tests
  - [x] 15.1 Write unit tests for CommunicationsPage and ActivityTimeline
    - Test empty state rendering for both pages
    - Test error display on fetch failure
    - Test mark-read API call on notification click
    - Test mark-all-read action
    - Test delete action
    - Test route registration verification (routes exist in config)
    - Test navigation link presence
    - Test file: `apps/admissions/tests/unit/communicationsHistory.test.ts`
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.10, 4.1, 4.2, 4.3, 4.4_

- [x] 16. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Backend uses Python/Django with pytest + hypothesis; frontend uses TypeScript with vitest + fast-check
- All API responses follow the `{"success": true, "data": ...}` envelope convention
- Paginated responses use `{page, pageSize, totalCount, results}` inside the data envelope
