# Implementation Plan: Admin Dashboard Overhaul

## Overview

Incremental bug-fix and UX-improvement pass across the admin surface. Priority order: auth refresh flood fix (critical), dashboard metrics/activity, then admin page fixes. Each task builds on previous work. Backend and frontend changes are grouped by area to keep context tight.

## Tasks

- [ ] 1. Fix auth refresh flood in ApiClient
  - [x] 1.1 Add failure cooldown to `attemptRefresh()` in `apps/admissions/src/services/client.ts`
    - Add `lastRefreshFailureTime: number = 0` instance field
    - Add `REFRESH_FAILURE_COOLDOWN_MS = 2000` static constant
    - Before starting a new refresh, check if within failure cooldown window — if so, return `false` immediately
    - On refresh failure (result `false` or caught exception), set `lastRefreshFailureTime = Date.now()` and `lastRefreshResult = false`
    - Ensure `refreshPromise` serialization is preserved so concurrent callers share one in-flight request
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [ ] 1.2 Write property test for concurrent refresh serialization
    - **Property 1: Concurrent refresh serialization**
    - **Validates: Requirements 1.1, 1.3**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - Generate arbitrary number of concurrent `attemptRefresh()` calls, assert `performRefresh()` invoked at most once and all callers get same result

  - [ ] 1.3 Write property test for refresh failure cooldown
    - **Property 2: Refresh failure cooldown**
    - **Validates: Requirements 1.2**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - After a failed refresh, generate calls within 2s window, assert all return `false` without invoking `performRefresh()`

- [ ] 2. Add visibility debounce to AuthContext
  - [-] 2.1 Debounce session invalidation in `apps/admissions/src/contexts/AuthContext.tsx`
    - Add `lastSessionInvalidationRef = useRef<number>(0)` and `VISIBILITY_DEBOUNCE_MS = 3000`
    - In `handleVisibilityChange`, skip `queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })` if less than 3 seconds since last invalidation
    - Update `lastSessionInvalidationRef.current` on each actual invalidation
    - _Requirements: 1.4, 1.6_

  - [ ] 2.2 Write property test for visibility debounce interval
    - **Property 3: Visibility debounce interval**
    - **Validates: Requirements 1.4**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - Generate arbitrary sequence of visibility event timestamps, assert invalidation count ≤ ceil(timeSpan / 3000)

- [ ] 3. Checkpoint — Auth refresh fix
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Dashboard metrics deduplication and recent activity replacement
  - [ ] 4.1 Remove DashboardMetricsCards from `apps/admissions/src/pages/admin/Dashboard.tsx`
    - Remove the `DashboardMetricsCards` import
    - Remove the `<DashboardMetricsCards>` JSX element and its wrapper `<div>`
    - Remove the `dashboardMetrics` useMemo that computes `DashboardMetricsSummary`
    - Keep `RealtimeMetricsDisplay` as the single metrics section at the top
    - The `DashboardMetricsCards` component file can remain in the codebase (unused)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 4.2 Replace AuditLog query with ApplicationStatusHistory + Payment in `backend/apps/accounts/admin_views.py`
    - In `AdminDashboardView.get()`, replace the `AuditLog.objects.order_by("-created_at")[:10]` query
    - Query `ApplicationStatusHistory.objects.select_related('application', 'changed_by').order_by('-created_at')[:10]`
    - Query `Payment.objects.filter(status__in=['paid', 'successful', 'verified']).select_related('application').order_by('-updated_at')[:5]`
    - Build `recent_activity` list with fields: `id`, `type`, `application_number`, `old_status`, `new_status`, `timestamp`, `actor_name`, `message`
    - Merge and sort by timestamp descending, limit to 10 entries
    - Wrap queries in try/except — on failure, log warning and return `recent_activity: []`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 4.3 Update DashboardActivityFeed for new activity shape in `apps/admissions/src/components/admin/dashboard/DashboardActivityFeed.tsx`
    - Add `application_number`, `old_status`, `new_status`, `actor_name` optional fields to `DashboardActivityItem` interface
    - Update rendering to show application number and actor name when available
    - Ensure empty state message displays when no recent activity exists
    - _Requirements: 3.5, 3.6_

  - [ ] 4.4 Update `normalizeRecentActivity` in `apps/admissions/src/services/admin/dashboard.ts`
    - Map new backend fields (`application_number`, `old_status`, `new_status`, `actor_name`) through to the `AdminDashboardActivity` type
    - Preserve backward compatibility with existing fallback logic
    - _Requirements: 3.1, 3.5_

  - [ ] 4.5 Write property test for activity feed rendering completeness
    - **Property 7: Activity feed rendering completeness**
    - **Validates: Requirements 3.5**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - Generate arbitrary `DashboardActivityItem` with all fields populated, assert rendered output contains message, timestamp, and actor name

  - [ ] 4.6 Write unit tests for dashboard metrics deduplication and activity feed
    - Test in `apps/admissions/tests/unit/adminDashboardOverhaul.test.ts`
    - Test: RealtimeMetricsDisplay renders on dashboard
    - Test: DashboardMetricsCards is absent from dashboard
    - Test: Activity feed empty state shows "No recent activity" message
    - _Requirements: 2.1, 2.2, 3.6_

- [ ] 5. Backend property tests for recent activity
  - [ ] 5.1 Write property test for recent activity entry completeness
    - **Property 4: Recent activity entry completeness**
    - **Validates: Requirements 3.1, 3.3**
    - Test in `backend/tests/property/test_admin_dashboard_overhaul.py` using hypothesis
    - For any ApplicationStatusHistory record, assert the activity entry contains non-null `id`, `application_number`, `old_status`, `new_status`, `timestamp`, `message` and no AuditLog-specific fields

  - [ ] 5.2 Write property test for recent activity ordering and limiting
    - **Property 5: Recent activity ordering and limiting**
    - **Validates: Requirements 3.2**
    - Test in `backend/tests/property/test_admin_dashboard_overhaul.py` using hypothesis
    - Generate arbitrary sets of status history and payment records, assert `recent_activity` is ordered by timestamp descending and has at most 10 entries

  - [ ] 5.3 Write property test for payment events in activity feed
    - **Property 6: Payment events in activity feed**
    - **Validates: Requirements 3.4**
    - Test in `backend/tests/property/test_admin_dashboard_overhaul.py` using hypothesis
    - For any Payment with status in ['paid', 'successful', 'verified'], assert it appears in recent_activity (subject to 10-entry limit)

- [ ] 6. Checkpoint — Dashboard metrics and activity
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Admin Applications page fixes
  - [ ] 7.1 Verify and fix Applications page error handling in `apps/admissions/src/pages/admin/Applications.tsx`
    - Ensure API failure state uses `ErrorDisplay` component with retry action
    - Verify status filter sends parameter correctly to backend via `useApplicationFilters`
    - Verify search by name/application number works via `searchTerm` filter
    - Verify pagination controls function correctly
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ] 7.2 Write property test for application filter forwarding
    - **Property 8: Application filter forwarding**
    - **Validates: Requirements 4.2, 4.3**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - Generate arbitrary non-empty filter values, assert API request includes each as a query parameter

  - [ ] 7.3 Write unit test for Applications page error state
    - Test in `apps/admissions/tests/unit/adminDashboardOverhaul.test.ts`
    - Test: API failure shows error with retry action
    - _Requirements: 4.5_

- [ ] 8. User Management mobile improvements
  - [ ] 8.1 Verify and fix mobile layout in `apps/admissions/src/pages/admin/Users.tsx`
    - Verify `UserMobileCard` renders below `lg` breakpoint with card-based layout
    - Ensure search and filter controls stack vertically on mobile (full-width inputs)
    - Ensure all interactive elements meet 44x44px minimum tap targets — add `min-h-[44px] min-w-[44px]` where needed
    - Verify create user dialog renders as full-screen sheet on mobile (no horizontal scrolling)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 9. Intakes page end-to-end fixes
  - [ ] 9.1 Add mutation error handling to `apps/admissions/src/pages/admin/Intakes.tsx`
    - Add `onError` handlers to create, edit, and delete mutations that surface error messages inline
    - Preserve form state on error for retry
    - Verify `ResponsiveTable` handles mobile card layout correctly
    - _Requirements: 6.1, 6.4, 6.5, 6.7_

  - [ ] 9.2 Write property test for intake form validation
    - **Property 9: Intake form validation**
    - **Validates: Requirements 6.2**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - Generate intake data where start_date > end_date, or capacity ≤ 0, or name is empty — assert Zod schema rejects with at least one error

  - [ ] 9.3 Write property test for intake form pre-population round trip
    - **Property 10: Intake form pre-population round trip**
    - **Validates: Requirements 6.3**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - Generate valid intake records, assert edit form values match original intake fields

  - [ ] 9.4 Write property test for utilization color mapping
    - **Property 11: Utilization color mapping**
    - **Validates: Requirements 6.6**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - Generate arbitrary enrollment/capacity pairs, assert correct color category returned

- [ ] 10. Program Fees page fixes
  - [ ] 10.1 Verify and fix ProgramFees page in `apps/admissions/src/pages/admin/ProgramFees.tsx`
    - Verify CRUD operations work with proper error handling and form state preservation
    - Verify currency formatting displays `{currency} {amount.toFixed(2)}`
    - Verify amount validation rejects non-positive numbers
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ] 10.2 Write property test for fee amount validation
    - **Property 12: Fee amount validation**
    - **Validates: Requirements 7.3**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - Generate fee data where amount ≤ 0 or not a valid number, assert rejection with error message

  - [ ] 10.3 Write property test for fee currency formatting
    - **Property 13: Fee currency formatting**
    - **Validates: Requirements 7.7**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - Generate arbitrary amount/currency pairs, assert rendered output shows currency code + amount to 2 decimal places

- [ ] 11. Checkpoint — Admin page fixes (Applications, Users, Intakes, Program Fees)
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Audit Trail page XSS sanitization
  - [ ] 12.1 Add XSS sanitization to `apps/admissions/src/pages/admin/AuditTrail.tsx`
    - Apply `sanitizeForDisplay` from `@/lib/sanitize` to `entry.action`, `entry.targetTable`, and any user-generated content fields before rendering
    - Verify `stringifyPayload` uses `JSON.stringify` (safe) and `<pre>` blocks use text content (not `dangerouslySetInnerHTML`)
    - Verify pagination, filters, expandable entries, and empty state all work correctly
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [ ] 12.2 Write property test for audit XSS sanitization
    - **Property 14: Audit XSS sanitization**
    - **Validates: Requirements 8.8**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - Generate audit entries with HTML tags and script elements in action/targetTable/changes, assert rendered output contains no unescaped executable HTML

- [ ] 13. Admin Settings page fixes
  - [ ] 13.1 Verify and fix Settings page in `apps/admissions/src/pages/admin/Settings.tsx`
    - Verify responsive layout on mobile (stacks correctly below 768px, no horizontal scrolling)
    - Verify error preservation on form retry
    - Verify guided configuration, import/export, and reset to defaults all function correctly
    - Verify setting type validation (string, number, boolean, JSON)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ] 13.2 Write property test for setting validation by type
    - **Property 15: Setting validation by type**
    - **Validates: Requirements 9.2, 9.3**
    - Test in `apps/admissions/tests/property/adminDashboardOverhaul.property.test.ts` using fast-check
    - For boolean type: reject values not 'true'/'false'. For integer: reject non-integer strings. For decimal: reject non-numeric strings. For all types: reject empty keys and empty values.

  - [ ] 13.3 Write unit tests for settings validation edge cases
    - Test in `apps/admissions/tests/unit/adminDashboardOverhaul.test.ts`
    - Test: Boolean "TRUE" (uppercase) handling
    - Test: Empty key rejection
    - Test: Whitespace-only value rejection
    - _Requirements: 9.2, 9.3_

- [ ] 14. Backend unit tests for dashboard endpoint
  - [ ] 14.1 Write unit tests for AdminDashboardView
    - Test in `backend/tests/unit/test_admin_dashboard_overhaul.py`
    - Test: Response shape includes `recent_activity` with correct fields
    - Test: Empty database returns `recent_activity: []`
    - Test: Payment completion events appear in activity feed
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 15. Final checkpoint — All admin dashboard overhaul changes complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major area
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Priority order: auth fix (tasks 1–3) → dashboard UX (tasks 4–6) → page fixes (tasks 7–13) → remaining tests (task 14)
