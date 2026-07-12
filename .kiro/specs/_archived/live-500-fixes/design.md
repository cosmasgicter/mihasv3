# Design Document: live-500-fixes

## Overview

This design addresses the remaining HTTP 500 errors and frontend rendering failures on the live MIHAS platform. The root cause is a mismatch between the backend API response shapes and the frontend service layer's expectations, compounded by nullable `created_at` fields in Django models that map to NOT NULL Postgres columns.

The primary fix strategy is **frontend-side normalization** — the backend response shapes are already live, stable, and correct. Changing the backend would risk breaking other consumers and require redeployment. The frontend dashboard service already has extensive normalization code; it just maps the wrong fields.

### Scope

1. **Admin Dashboard response mapping** — Fix `normalizeStats()` and `normalizeRecentActivity()` in `apps/admissions/src/services/admin/dashboard.ts` to correctly map the backend's `{ applications, users, recent_activity }` shape.
2. **Recent activity timestamp handling** — The backend sends `created_at: null` on AuditLog entries because the model defines `created_at` as nullable. The frontend filters out items without timestamps, dropping all activity. Fix both sides: add `auto_now_add=True` on the model and make the frontend tolerate null timestamps.
3. **SSE reconnection backoff** — The SSE client already has exponential backoff, but the `useAdminDashboardPolling` hook and direct EventSource usage in some components flood the console on 500 errors. Add error suppression and backoff.
4. **Model `created_at` alignment** — Set `auto_now_add=True` on `AuditLog.created_at` and `ApplicationStatusHistory.created_at` so INSERTs don't violate NOT NULL constraints.
5. **Verification of already-fixed endpoints** — SSE sync conversion and application review `db_column` fix are already in place; design includes verification steps.

### Out of Scope

- Changing the backend dashboard API response shape (it's live and working)
- Rewriting the entire frontend service layer
- Adding new backend endpoints

## Architecture

### Fix Strategy: Frontend Normalization

The backend `AdminDashboardView` returns:

```json
{
  "success": true,
  "data": {
    "applications": {
      "by_status": { "draft": 5, "submitted": 10, "approved": 8, "rejected": 3 },
      "today": 2,
      "this_week": 7,
      "this_month": 15,
      "total": 29
    },
    "users": {
      "total": 26,
      "active": 25
    },
    "recent_activity": [
      { "id": "...", "action": "POST", "entity_type": "applications", "created_at": null, ... }
    ]
  }
}
```

After `apiClient.request()` unwraps the `{ success, data }` envelope, the frontend receives the inner `data` object. The dashboard service's `getOverviewWithDiagnostics()` already reads `raw.applications` and `raw.users` and maps them into `normalizeStats()` — this mapping is partially correct but has gaps.

```
┌─────────────────────────────────────────────────────────────┐
│ Backend AdminDashboardView                                  │
│ Response: { applications: {...}, users: {...},              │
│            recent_activity: [...] }                         │
└──────────────────────┬──────────────────────────────────────┘
                       │ (envelope unwrapped by apiClient)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ adminDashboardService.getOverviewWithDiagnostics()          │
│                                                             │
│ 1. raw.applications → extract by_status, today, this_week, │
│    this_month, total                                        │
│ 2. raw.users → extract total, active                        │
│ 3. raw.recent_activity → normalizeRecentActivity()          │
│                                                             │
│ Maps to: AdminDashboardStats, statusBreakdown,              │
│          periodTotals, recentActivity                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ useAdminDashboardPolling → fetchDashboardStats()            │
│ Reads: overview.stats.totalApplications, etc.               │
│ Feeds: Dashboard.tsx state                                  │
└─────────────────────────────────────────────────────────────┘
```

### Current Bug Analysis

**Bug 1: `normalizeStats()` field mapping gaps**

The `getOverviewWithDiagnostics()` method already extracts `raw.applications` and passes fields like `total_applications: applications?.total` into `normalizeStats()`. This part works. However, `normalizeStats()` looks for `stats?.active_users` — and the value is passed correctly from `users?.active`. The mapping is actually mostly correct in the current code. The real issue is that `normalizeStats()` receives a merged object and the field names align. Let me trace the exact flow:

```typescript
// In getOverviewWithDiagnostics():
const rawStats = normalizeStats({
  ...(raw.stats ?? {}),                    // empty — backend has no `stats` key
  total_applications: applications?.total,  // 29
  pending_applications: applicationStatusBreakdown?.pending ?? applicationStatusBreakdown?.draft,
  approved_applications: applicationStatusBreakdown?.approved,
  rejected_applications: applicationStatusBreakdown?.rejected,
  today_applications: applications?.today,
  week_applications: applications?.this_week,
  month_applications: applications?.this_month,
  total_students: users?.total,
  active_users: users?.active,
})
```

This mapping is correct — the values flow through. The `normalizeStats()` function reads `stats?.total_applications` which matches. So the stats mapping actually works.

**Bug 2: `normalizeRecentActivity()` drops all items**

This is the real dashboard data loss. The backend sends AuditLog entries with `created_at: null` because `AuditLog.created_at` is defined as `models.DateTimeField(null=True, blank=True)` — no `auto_now_add`. The `AuditLogSerializer` serializes this as `"created_at": null`.

In `normalizeRecentActivity()`, the timestamp resolution chain is:
```typescript
const timestamp = 'timestamp' in item ? item.timestamp
  : 'updatedAt' in item ? item.updatedAt
  : 'createdAt' in item ? item.createdAt
  : 'created_at' in item ? item.created_at  // ← null
  : ''
```

Since `created_at` is `null` (not a string), the `typeof item.created_at === 'string'` check fails, so `timestamp` becomes `''`. Then the filter `if (!id || !message || !timestamp)` drops the item.

**Fix**: Two-pronged:
1. Backend: Add `auto_now_add=True` to `AuditLog.created_at` so new entries get timestamps
2. Frontend: When `created_at` is null, use the current time as a fallback instead of dropping the item

**Bug 3: SSE console flooding**

The `sseClient.ts` already implements exponential backoff correctly. The issue is that when the SSE endpoint returns 500, the `EventSource` `onerror` fires and `console.log('[SSEClient] Connection error')` is logged on every retry. This is noisy but not a crash. The fix is to reduce log verbosity on repeated failures.

## Components and Interfaces

### Component 1: Dashboard Service Fix (`apps/admissions/src/services/admin/dashboard.ts`)

**Changes to `normalizeRecentActivity()`:**
- When `created_at` is null, fall back to current ISO timestamp instead of empty string
- This prevents all activity items from being filtered out

**Changes to `normalizeStats()` (if needed):**
- Verify the existing mapping works end-to-end with the actual backend response
- The current code appears correct based on trace analysis

### Component 2: AuditLog Model Fix (`backend/apps/common/models.py`)

**Change:**
```python
# Before
created_at = models.DateTimeField(null=True, blank=True)

# After  
created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
```

This ensures new AuditLog entries get a timestamp. Existing null entries in the DB are unaffected (the column is nullable in Neon).

### Component 3: ApplicationStatusHistory Model Fix (`backend/apps/applications/models.py`)

**Change:**
```python
# Before
created_at = models.DateTimeField(null=True, blank=True)

# After
created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
```

### Component 4: SSE Client Log Suppression (`apps/admissions/src/lib/sseClient.ts`)

**Change:**
- Suppress repeated error logs after the first failure
- Only log on first error and on recovery
- Use `console.debug` instead of `console.log` for reconnection attempts

### Component 5: Verification Tests

- Verify SSE stream endpoint returns 200 with `text/event-stream`
- Verify admin dashboard endpoint returns 200 with correct shape
- Verify application review endpoint returns 200 on valid status transition
- Verify AuditLog and ApplicationStatusHistory INSERTs succeed with auto-populated `created_at`

## Data Models

### AuditLog (modified)

| Field | Type | Change |
|-------|------|--------|
| `created_at` | `DateTimeField` | Add `auto_now_add=True` — Django auto-populates on INSERT |

### ApplicationStatusHistory (modified)

| Field | Type | Change |
|-------|------|--------|
| `created_at` | `DateTimeField` | Add `auto_now_add=True` — Django auto-populates on INSERT |

### Backend → Frontend Field Mapping (Admin Dashboard)

| Backend Path | Frontend Field | Status |
|---|---|---|
| `applications.total` | `totalApplications` | ✅ Already mapped via `total_applications` |
| `applications.by_status.pending` | `pendingApplications` | ✅ Already mapped via `pending_applications` |
| `applications.by_status.approved` | `approvedApplications` | ✅ Already mapped |
| `applications.by_status.rejected` | `rejectedApplications` | ✅ Already mapped |
| `applications.today` | `todayApplications` | ✅ Already mapped via `today_applications` |
| `applications.this_week` | `weekApplications` | ✅ Already mapped via `week_applications` |
| `applications.this_month` | `monthApplications` | ✅ Already mapped via `month_applications` |
| `users.total` | `totalStudents` | ✅ Already mapped via `total_students` |
| `users.active` | `activeUsers` | ✅ Already mapped via `active_users` |
| `recent_activity[].created_at` | `recentActivity[].timestamp` | ❌ Broken — null values cause items to be dropped |

### No Schema Migrations Required

All models use `managed = False`. The `auto_now_add` change is Django-side only — it tells Django to set the value before INSERT. The Neon Postgres columns already accept timestamps. No DDL changes needed.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Dashboard normalizer maps backend response to valid stats

*For any* valid backend dashboard response containing `applications` (with `by_status`, `today`, `this_week`, `this_month`, `total`) and `users` (with `total`, `active`) and `recent_activity` (array of audit log entries with potentially null `created_at`), the `normalizeStats()` function combined with the field extraction in `getOverviewWithDiagnostics()` should produce an `AdminDashboardStats` object where `totalApplications` equals `applications.total`, `pendingApplications` equals `applications.by_status.pending`, `approvedApplications` equals `applications.by_status.approved`, `rejectedApplications` equals `applications.by_status.rejected`, `todayApplications` equals `applications.today`, `weekApplications` equals `applications.this_week`, `monthApplications` equals `applications.this_month`, `activeUsers` equals `users.active`, and all numeric fields are finite numbers (never NaN or undefined). When any field is null or missing, the corresponding stat should default to 0.

**Validates: Requirements 8.1, 8.7**

### Property 2: Recent activity normalizer preserves items with null timestamps

*For any* array of audit log entries where each entry has an `id`, `action`, `entity_type`, and a `created_at` that may be null, a string, or undefined, the `normalizeRecentActivity()` function should return an array where no valid entry is dropped solely because `created_at` is null. Entries with null `created_at` should receive a fallback timestamp. The output array length should be greater than or equal to the count of input entries that have both a non-empty `id` and a non-empty `action`.

**Validates: Requirements 2.3, 8.1**

### Property 3: Timestamp auto-population on model creation

*For any* new `AuditLog` or `ApplicationStatusHistory` instance created via Django ORM `objects.create()`, the `created_at` field should be automatically populated with a non-null datetime value by Django's `auto_now_add=True` mechanism, without requiring explicit assignment by the caller.

**Validates: Requirements 3.2, 4.1, 4.3, 4.4, 6.2**

### Property 4: SHA-256 hash values fit in model CharField max_length

*For any* string input (IP address or user agent), the SHA-256 hex digest is exactly 64 characters. All model `CharField` fields that store SHA-256 hashes (`AuditLog.ip_address`, `ApplicationStatusHistory.ip_address`) must have `max_length >= 64` so that no hash value is truncated on INSERT.

**Validates: Requirements 5.2, 5.3, 6.4**

### Property 5: AuditMiddleware error resilience

*For any* HTTP request that produces a successful (2xx) response, if the `AuditMiddleware._create_audit_entry()` method raises an exception, the middleware should catch the exception, log it, and return the original response unmodified. The response status code and body should be identical to what they would be without the middleware failure.

**Validates: Requirements 6.3**

### Property 6: SSE notification serialization completeness

*For any* `Notification` object with non-null `id`, `title`, `message`, and `type` fields, the SSE event serialization in `_sync_event_stream()` should produce a JSON object containing all four fields plus `created_at`. No serialization error should be raised regardless of whether `created_at` is null or a valid datetime.

**Validates: Requirements 1.4**

### Property 7: No traceback strings in error responses

*For any* API error response returned by the platform (4xx or 5xx), the response body should not contain Python traceback patterns such as `Traceback (most recent call last)`, `File "`, or line number references like `line \d+`. All error responses should be JSON objects with `success`, `error`, and optionally `code` fields.

**Validates: Requirements 7.3, 9.6**

### Property 8: Application list normalizer handles all response shapes

*For any* backend paginated response that is either an array of applications, an object with `results` array, or an object with `applications` array, the `normalizePaginatedApplications()` function should return a valid `PaginatedApplicationsResponse` with a non-negative `totalCount` and a `page >= 1`. The `applications` array in the output should contain exactly the application records from the input.

**Validates: Requirements 8.3**

### Property 9: Session service normalizer handles both array and object responses

*For any* backend session response that is either a direct array of `DeviceSession` objects or an object with a `sessions` array, the `listActiveSessions()` function should return a `ListSessionsResult` where `sessions` contains all session records from the input and `count` matches the number of sessions.

**Validates: Requirements 8.5**

### Property 10: AuditMiddleware sets entity_id to NULL for paths without entity identifiers

*For any* request path that does not contain a UUID or numeric entity identifier segment (e.g., `/api/v1/auth/login/`, `/api/v1/admin/dashboard/`), the `AuditMiddleware` should create an `AuditLog` entry with `entity_id = None` rather than omitting the field or raising an error.

**Validates: Requirements 6.1**

## Error Handling

### Backend Error Handling

1. **AuditMiddleware failures**: Already wrapped in try/except with `logger.exception()`. The original response passes through unmodified. No change needed — just verify.

2. **Dashboard view errors**: The `AdminDashboardView` should catch query errors and return a structured JSON error response instead of letting Django's default 500 handler produce HTML. The current implementation doesn't have explicit error handling, but the `envelope_exception_handler` in DRF settings catches unhandled exceptions globally.

3. **SSE stream errors**: Already handled — the `_sync_event_stream` generator catches exceptions in the DB query block and continues with keepalive pings.

4. **Application review errors**: The debug wrapper has been removed. Errors now flow through the standard DRF exception handler.

### Frontend Error Handling

1. **Dashboard service**: `getOverviewWithDiagnostics()` already wraps the entire flow in try/catch and returns diagnostics on failure. The fix is in the normalizer functions, not the error handling.

2. **SSE client**: Already has exponential backoff (1s → 2s → 4s → 8s → max 30s). The fix is to reduce console noise on repeated failures.

3. **Null field handling**: All normalizer functions should use `toNumber()` for numeric fields (already done) and provide fallback values for null timestamps (the fix for `normalizeRecentActivity()`).

## Testing Strategy

### Property-Based Tests

Use `fast-check` (frontend, already in project) and `hypothesis` (backend, already in project) for property-based testing. Each property test should run a minimum of 100 iterations.

**Frontend property tests** (`apps/admissions/tests/property/`):
- **Property 1 & 2**: Test `normalizeStats()` and `normalizeRecentActivity()` with generated backend response shapes including null fields, missing fields, and extra fields
- **Property 8**: Test `normalizePaginatedApplications()` with generated paginated responses in all three shapes (array, `results`, `applications`)
- **Property 9**: Test `listActiveSessions()` normalizer with generated session responses

**Backend property tests** (`backend/tests/property/`):
- **Property 3**: Test that `AuditLog.objects.create()` and `ApplicationStatusHistory.objects.create()` always produce non-null `created_at`
- **Property 4**: Test that `hashlib.sha256(input).hexdigest()` output length fits in model field `max_length` for all string inputs
- **Property 5**: Test that `AuditMiddleware` passes through the original response when `_create_audit_entry` raises
- **Property 6**: Test SSE notification serialization with generated Notification objects
- **Property 7**: Test that DRF exception handler responses never contain traceback patterns
- **Property 10**: Test `AuditMiddleware._extract_entity_type()` and entity_id extraction for paths without identifiers

### Unit Tests

- Verify SSE endpoint returns 200 with correct content type (Req 1.1)
- Verify poll endpoint returns 200 with JSON envelope (Req 1.2)
- Verify admin dashboard returns 200 with expected fields (Req 2.1, 2.2)
- Verify application review returns 200 on valid transition (Req 3.1)
- Verify application review returns 404 for missing application (Req 3.3)
- Verify debug wrapper is absent from review view code (Req 7.1)

### Integration / E2E Verification

- Hit each endpoint listed in Requirement 9 against the live deployment
- Verify no raw Django 500 HTML pages are returned
- Verify AuditLog and ApplicationStatusHistory rows in Neon have non-null `created_at` after the fix

### Test Configuration

- Frontend: `vitest` with `fast-check` — tag each property test with `Feature: live-500-fixes, Property N: {title}`
- Backend: `pytest` with `hypothesis` — tag each property test with `Feature: live-500-fixes, Property N: {title}`
- Minimum 100 iterations per property test
- Each correctness property is implemented by a single property-based test
