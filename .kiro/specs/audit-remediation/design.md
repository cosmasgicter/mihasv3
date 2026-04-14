# Design — Audit Remediation

## Overview

This design describes the systematic remediation of all 37 findings from the MIHAS pre-launch audit (`.kiro/specs/pre-launch-audit/audit-report.md`). The remediation spans three layers — database schema (Neon MCP SQL), backend (Django 5 + DRF), and frontend (React + TypeScript) — and is organized into four work streams:

1. **Database migrations** (Neon MCP SQL): One-time data fixes and schema alterations executed directly against Neon Postgres (`wild-bar-37055823`), since all Django models use `managed=False`.
2. **Backend code changes**: Model field fixes, middleware hardening, pagination, retry logic, N+1 elimination, test environment fixes, and code documentation.
3. **Frontend code changes**: Status constant cleanup, UX improvements, admin capacity warnings, and enrollment display.
4. **Optional improvements**: Tracked but not blocking launch.

The remediation does not introduce new tables, new API endpoints, or new Django apps. All changes are modifications to existing components.

## Architecture

The remediation touches existing components across all three layers. No new architectural patterns are introduced.

```mermaid
graph TD
    subgraph "Database Layer (Neon MCP SQL)"
        DB1[One-time enrollment sync]
        DB2[ALTER permissions text[] → jsonb]
        DB3[ALTER ip_address varchar 45 → 64]
        DB4[ADD UNIQUE constraints x3]
        DB5[DELETE invalid status history]
    end

    subgraph "Backend Layer (Django)"
        BE1[IntakeEnforcer.increment_enrollment fix]
        BE2[IntakeEnforcer.sync_enrollment N+1 fix]
        BE3[Profile.role + Payment.status nullability]
        BE4[SecurityHeadersMiddleware + CSP]
        BE5[NotificationListView pagination]
        BE6[send_bulk_notifications_task retry]
        BE7[Test fixes: admin_override + submission_gates]
        BE8[Code comments: legacy columns + patterns]
    end

    subgraph "Frontend Layer (React)"
        FE1[Verify waitlisted status fix]
        FE2[Remove pending_documents status]
        FE3[PaymentStep UX improvements]
        FE4[Admin capacity warning on approval]
        FE5[Admin intakes enrollment display]
    end

    DB1 --> BE1
    BE1 --> BE2
    DB2 --> BE3
    FE1 --> FE2
```

### Execution Order

Database migrations must run first since backend code changes depend on schema alignment. The recommended order:

1. **Phase 1 — Database**: Run all SQL migrations (Req 1, 5, 7, 8, 10)
2. **Phase 2 — Backend**: Apply code changes (Req 1, 3, 4, 6, 9, 11, 12, 13, 15, 16)
3. **Phase 3 — Frontend**: Apply UI changes (Req 2, 14, 17, 18, 19)
4. **Phase 4 — Verification**: Run test suite, verify fixes

## Components and Interfaces

### Database Migrations (Neon MCP)

All SQL is executed via Neon MCP against project `wild-bar-37055823`. No Django migrations are generated.

#### Migration 1: One-Time Enrollment Sync (Req 1, AUDIT-1.6-001)

```sql
UPDATE program_intakes pi
SET current_enrollment = (
  SELECT COUNT(*)
  FROM applications a
  JOIN programs p ON a.program = p.name
  JOIN intakes i ON a.intake = i.name
  WHERE p.id = pi.program_id
    AND i.id = pi.intake_id
    AND a.status IN ('submitted', 'under_review', 'approved', 'waitlisted')
);
```

Verification query (run after):
```sql
SELECT pi.id, p.name AS program, i.name AS intake,
       pi.current_enrollment AS stored,
       COALESCE(actual.cnt, 0) AS actual
FROM program_intakes pi
JOIN programs p ON pi.program_id = p.id
JOIN intakes i ON pi.intake_id = i.id
LEFT JOIN (
  SELECT program, intake, COUNT(*) AS cnt
  FROM applications
  WHERE status IN ('submitted','under_review','approved','waitlisted')
  GROUP BY program, intake
) actual ON p.name = actual.program AND i.name = actual.intake;
```

#### Migration 2: Permissions Column Type (Req 5, AUDIT-1.3-002)

```sql
-- Convert text[] to jsonb, preserving existing array values as JSON arrays
ALTER TABLE user_permission_overrides
  ALTER COLUMN permissions TYPE jsonb
  USING COALESCE(to_jsonb(permissions), '[]'::jsonb);

ALTER TABLE user_permission_overrides
  ALTER COLUMN permissions SET DEFAULT '[]'::jsonb;
```

#### Migration 3: IP Address Column Width (Req 7, AUDIT-1.3-005)

```sql
ALTER TABLE application_status_history
  ALTER COLUMN ip_address TYPE varchar(64);
```

#### Migration 4: Unique Constraints (Req 8, AUDIT-1.4-001/002/003)

Pre-check for duplicates before each constraint:
```sql
-- Check for duplicate public_tracking_codes (excluding NULLs)
SELECT public_tracking_code, COUNT(*)
FROM applications
WHERE public_tracking_code IS NOT NULL
GROUP BY public_tracking_code HAVING COUNT(*) > 1;

-- Check for duplicate subject codes (excluding NULLs)
SELECT code, COUNT(*) FROM subjects
WHERE code IS NOT NULL
GROUP BY code HAVING COUNT(*) > 1;

-- Check for duplicate idempotency_keys (excluding NULLs)
SELECT idempotency_key, COUNT(*) FROM notifications
WHERE idempotency_key IS NOT NULL
GROUP BY idempotency_key HAVING COUNT(*) > 1;
```

If no duplicates exist, apply constraints:
```sql
ALTER TABLE applications
  ADD CONSTRAINT applications_public_tracking_code_key
  UNIQUE (public_tracking_code);

ALTER TABLE subjects
  ADD CONSTRAINT subjects_code_key
  UNIQUE (code);

ALTER TABLE notifications
  ADD CONSTRAINT notifications_idempotency_key_key
  UNIQUE (idempotency_key);
```

#### Migration 5: Invalid Status History Cleanup (Req 10, AUDIT-2.4-001)

```sql
DELETE FROM application_status_history
WHERE application_id = 'a94bffb1-01bb-4a7f-969f-b8fa7ed2d1e8'
  AND (
    (old_status = 'draft' AND new_status = 'approved')
    OR (old_status = 'approved' AND new_status = 'approved')
  );
```


### Backend Code Changes

#### IntakeEnforcer.increment_enrollment() Fix (Req 1, AUDIT-1.6-002)

**File**: `backend/apps/applications/intake_enforcer.py`

The current `increment_enrollment()` only updates `intakes.current_enrollment`. It must also update `program_intakes.current_enrollment` for the specific program+intake combination.

**Change**: After the existing `Intake` update, resolve the program from the application context and atomically increment the matching `ProgramIntake` row using `F()` expression. The method signature changes to accept both `intake_name` and `program_name`:

```python
@staticmethod
def increment_enrollment(intake_name: str, program_name: str = "") -> None:
    from apps.applications.identifier_resolver import IdentifierResolver
    resolved = IdentifierResolver.resolve_intake(intake_name)
    if resolved.source == "not_found" or not resolved.id:
        return
    Intake.objects.filter(id=resolved.id).update(
        current_enrollment=F("current_enrollment") + 1
    )
    if program_name:
        from apps.catalog.models import Program, ProgramIntake
        program = Program.objects.filter(name=program_name).first()
        if program:
            ProgramIntake.objects.filter(
                intake_id=resolved.id, program_id=program.id
            ).update(current_enrollment=F("current_enrollment") + 1)
```

Similarly update `decrement_enrollment()` to accept `program_name` and decrement `ProgramIntake`.

Update the call site in `backend/apps/applications/services.py` (`submit_application()`) to pass `program_name`.

#### IntakeEnforcer.sync_enrollment() N+1 Fix (Req 16, AUDIT-5.6-001)

**File**: `backend/apps/applications/intake_enforcer.py`

The current `sync_enrollment()` loops over each `ProgramIntake` and issues a separate count query per row (N+1 pattern). Replace with a single aggregation query:

```python
@staticmethod
def sync_enrollment(intake_name: str) -> None:
    from apps.applications.identifier_resolver import IdentifierResolver
    from apps.applications.models import Application
    from apps.catalog.models import Program, ProgramIntake

    resolved = IdentifierResolver.resolve_intake(intake_name)
    if resolved.source == "not_found" or not resolved.id:
        return

    # Single query for intake-level count
    live_count = Application.objects.filter(
        intake=intake_name,
        status__in=("submitted", "under_review", "approved", "waitlisted"),
    ).count()
    Intake.objects.filter(id=resolved.id).update(current_enrollment=live_count)

    # Single aggregation query for all program_intakes
    from django.db.models import Count, Q
    counts = (
        Application.objects.filter(
            intake=intake_name,
            status__in=("submitted", "under_review", "approved", "waitlisted"),
        )
        .values("program")
        .annotate(cnt=Count("id"))
    )
    count_map = {row["program"]: row["cnt"] for row in counts}

    for pi in ProgramIntake.objects.filter(intake_id=resolved.id).select_related("program"):
        expected = count_map.get(pi.program.name, 0)
        ProgramIntake.objects.filter(id=pi.id).update(current_enrollment=expected)
```

This reduces N+1 queries to 2 queries (one count aggregation + one ProgramIntake fetch) regardless of the number of program+intake combinations.

#### Profile.role and Payment.status Nullability (Req 4, AUDIT-1.3-001/004)

**File**: `backend/apps/accounts/models.py`

Change `Profile.role`:
```python
# Before
role = models.CharField(max_length=50, choices=ROLE_CHOICES, null=True, blank=True)
# After
role = models.CharField(max_length=50, choices=ROLE_CHOICES, default='student', blank=True)
```

**File**: `backend/apps/documents/models.py`

Change `Payment.status`:
```python
# Before
status = models.CharField(max_length=20, null=True, blank=True, default='pending')
# After
status = models.CharField(max_length=20, default='pending', blank=True)
```

#### SecurityHeadersMiddleware Hardening (Req 12, AUDIT-5.1-001)

**File**: `backend/apps/common/middleware.py`

Add two headers to `SecurityHeadersMiddleware.__call__()`:

```python
response["X-XSS-Protection"] = "1; mode=block"
response["Content-Security-Policy"] = (
    "default-src 'self'; "
    "script-src 'self' https://pay.lenco.co; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "connect-src 'self' https://api.lenco.co; "
    "frame-src https://pay.lenco.co; "
    "font-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'"
)
```

The CSP policy allows the Lenco payment widget scripts and frames while restricting everything else. `'unsafe-inline'` for styles is needed for Tailwind CSS utility classes.

#### NotificationListView Pagination (Req 11, AUDIT-4.4-001)

**File**: `backend/apps/common/notification_views.py`

Replace the unbounded queryset in `NotificationListView.get()` with `StandardPagination`:

```python
class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = StandardPagination

    def get(self, request):
        notifications = (
            Notification.objects.filter(user_id=request.user.pk)
            .order_by("-created_at")
        )
        paginator = StandardPagination()
        page = paginator.paginate_queryset(notifications, request)
        data = NotificationItemSerializer(page, many=True).data
        return paginator.get_paginated_response(data)
```

This uses the same `StandardPagination` (page_size=20) used by other list endpoints.

#### send_bulk_notifications_task Retry Logic (Req 15, AUDIT-5.5-001)

**File**: `backend/apps/common/tasks.py`

The task has `max_retries=3` configured but never calls `self.retry()`. Add retry logic in the exception handler:

```python
@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_bulk_notifications_task(self, notification_ids):
    # ... existing code ...
    try:
        # ... existing per-notification processing ...
    except Exception as exc:
        logger.exception("Failed to process notification %s", notification.id)
        # Retry on transient errors with exponential backoff
        try:
            self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
        except self.MaxRetriesExceededError:
            logger.error(
                "All retries exhausted for bulk notification task. "
                "IDs: %s, last error: %s",
                notification_ids, exc,
            )
```

#### Test Fixes (Req 3, AUDIT-1.1-001/002)

**File**: `backend/tests/property/test_admin_override.py`

Add a conditional skip when local Postgres is unavailable:

```python
import socket

def _pg_available(host="localhost", port=5432):
    try:
        with socket.create_connection((host, port), timeout=1):
            return True
    except OSError:
        return False

@pytest.mark.skipif(not _pg_available(), reason="Local Postgres not available")
class TestAdminPaymentStatusOverride(TransactionTestCase):
    # ... existing tests unchanged ...
```

**File**: `backend/tests/property/test_submission_gates.py`

Mock `IdentifierResolver.resolve_intake()` in the test setup so `SimpleTestCase` tests don't trigger `DatabaseOperationForbidden`:

```python
from unittest.mock import patch, MagicMock
from apps.applications.intake_enforcer import IntakeCheckResult

# Add to each test class or as a module-level fixture
@patch("apps.applications.intake_enforcer.IdentifierResolver.resolve_intake")
def test_...(self, mock_resolve, ...):
    mock_resolve.return_value = MagicMock(source="not_found", id=None)
    # ... existing test logic ...
```

Alternatively, add a class-level `setUp` that patches the resolver for all tests in the affected classes.

#### Code Comments (Req 6, 9, 13)

**Req 6** — `backend/apps/applications/models.py`: Add comment above `Application` class documenting the 7 legacy unmapped columns.

**Req 9** — `backend/apps/applications/models.py` or `backend/apps/documents/payment_service.py`: Add comment documenting the 20 legacy applications with `payment_status` but no `payments` record.

**Req 13** — `backend/apps/documents/payment_service.py`: Add comment on `verify_payment()` documenting the synchronous `requests.post()` call as a known ASGI limitation.

### Frontend Code Changes

#### Waitlisted Status Verification (Req 2, AUDIT-5.3-001/7.4-001)

**Files**: `apps/admissions/src/types/applicationStatus.ts`, `apps/admissions/src/pages/student/ApplicationStatus.tsx`

The `waitlisted` status is already present in `APPLICATION_STATUSES` and `APPLICATION_STATUS_LABELS`. Verify:
- `applicationStatusUi.ts` has badge styles for `waitlisted` (confirmed: `bg-amber-100 text-amber-800`)
- `ApplicationStatus.tsx` timeline renders `waitlisted` entries via `formatStatusLabel()`

If the timeline component has hardcoded status checks that skip `waitlisted`, add it to the timeline rendering logic.

#### Remove pending_documents Status (Req 14, AUDIT-5.3-002)

**Files**: `apps/admissions/src/types/applicationStatus.ts`, `apps/admissions/src/lib/applicationStatusUi.ts`

`pending_documents` is not a valid backend status — it does not appear in `ALLOWED_TRANSITIONS` or anywhere in the backend code. Remove it:

```typescript
// applicationStatus.ts — remove 'pending_documents' from the array
export const APPLICATION_STATUSES = [
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'waitlisted'
] as const

// Remove from APPLICATION_STATUS_LABELS
// Remove from applicationStatusUi.ts badge styles
```

Update the unit test in `apps/admissions/tests/unit/applicationStatusUi.test.ts` to remove `pending_documents` from expected values.

#### PaymentStep UX Improvements (Req 17, AUDIT-7.2-001/7.3-002)

**File**: `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx`

1. **Disabled button tooltip** (AUDIT-7.2-001): When `canPay` is false, wrap the "Pay now" button in a tooltip explaining why it's disabled (e.g., "Complete previous steps first", "Fee is loading", "Payment widget unavailable").

2. **Null applicationId error** (AUDIT-7.3-002): The current code shows `'Application not found. Please go back to step 1.'` when `applicationId` is null. Improve to a more descriptive message: `'Please save your application before proceeding to payment. Go back to Step 1 and ensure your details are saved.'`

#### Admin Capacity Warning (Req 18, AUDIT-7.5-001)

**File**: Admin review page component (the component consuming the review endpoint response)

The review endpoint already returns `intake_capacity` and `intake_enrollment` in the response. Add UI logic:

```typescript
// When intake_enrollment >= 0.8 * intake_capacity
<Alert variant="warning">
  Intake is {Math.round(enrollment/capacity * 100)}% full ({enrollment}/{capacity})
</Alert>

// When intake_enrollment >= intake_capacity
<Alert variant="destructive">
  Intake is at or over capacity ({enrollment}/{capacity}). Approving will exceed the limit.
</Alert>
```

#### Admin Intakes Enrollment Display (Req 19, AUDIT-7.6-001)

**File**: `apps/admissions/src/pages/admin/Intakes.tsx`

1. Add `current_enrollment` to the `Intake` interface
2. Display enrollment alongside capacity in the table/card view
3. Add visual utilization indicator (progress bar or color coding):
   - Green: < 80% capacity
   - Amber: 80-99% capacity
   - Red: >= 100% capacity

## Data Models

No new database tables or models are introduced. All changes modify existing columns, constraints, or model field definitions.

### Schema Changes Summary

| Table | Column | Change | Migration # |
|-------|--------|--------|-------------|
| `program_intakes` | `current_enrollment` | Data update (one-time sync) | 1 |
| `user_permission_overrides` | `permissions` | `text[]` → `jsonb` | 2 |
| `application_status_history` | `ip_address` | `varchar(45)` → `varchar(64)` | 3 |
| `applications` | `public_tracking_code` | Add UNIQUE constraint | 4 |
| `subjects` | `code` | Add UNIQUE constraint | 4 |
| `notifications` | `idempotency_key` | Add UNIQUE constraint | 4 |
| `application_status_history` | — | Delete 3 invalid rows | 5 |

### Django Model Field Changes

| Model | Field | Change |
|-------|-------|--------|
| `Profile` | `role` | Remove `null=True`, add `default='student'` |
| `Payment` | `status` | Remove `null=True` |


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Enrollment increment updates both tables

*For any* valid intake name and program name, calling `IntakeEnforcer.increment_enrollment(intake_name, program_name)` should increase both `intakes.current_enrollment` and `program_intakes.current_enrollment` by exactly 1 for the matching rows.

**Validates: Requirements 1.2**

### Property 2: Enrollment sync produces correct counts

*For any* set of applications across program+intake combinations, after calling `sync_enrollment()`, the `program_intakes.current_enrollment` value for each program+intake pair should equal the count of applications with status in `('submitted', 'under_review', 'approved', 'waitlisted')` for that combination.

**Validates: Requirements 1.4**

### Property 3: Model fields with NOT NULL DB constraints reject None

*For any* Django model field that maps to a database column with a `NOT NULL` constraint and a default value, the model field should not accept `None` and should produce the correct default. Specifically: `Profile.role` defaults to `'student'` and `Payment.status` defaults to `'pending'`.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 4: Permissions JSONField round-trip

*For any* valid permissions list (a JSON array of permission strings), writing it to `UserPermissionOverride.permissions` and reading it back should produce an equivalent value.

**Validates: Requirements 5.2, 5.3**

### Property 5: IP address column accepts SHA-256 hashes

*For any* string of length up to 64 characters, the `application_status_history.ip_address` column should accept the value without truncation or error.

**Validates: Requirements 7.2**

### Property 6: Unique constraints reject duplicates

*For any* column with a UNIQUE constraint (`applications.public_tracking_code`, `subjects.code`, `notifications.idempotency_key`), inserting two records with the same non-null value should result in the second insert being rejected by the database.

**Validates: Requirements 8.4**

### Property 7: Notification list is paginated

*For any* user with N notifications where N exceeds the page size, `GET /api/v1/notifications/` should return at most `pageSize` results and include `page`, `pageSize`, `totalCount`, and `results` in the response envelope.

**Validates: Requirements 11.1, 11.2**

### Property 8: Security headers present on all responses

*For any* HTTP response from the backend, the response should include `X-XSS-Protection: 1; mode=block` and a `Content-Security-Policy` header with a non-empty directive.

**Validates: Requirements 12.1, 12.2, 12.3**

### Property 9: Frontend status set matches backend status set

*For any* status in the frontend `APPLICATION_STATUSES` constant, that status should either appear as a key or value in the backend `ALLOWED_TRANSITIONS` map, or be explicitly documented as a future status with a code comment.

**Validates: Requirements 14.3**

### Property 10: Bulk notification task retries on transient errors

*For any* transient error during `send_bulk_notifications_task` execution, the task should call `self.retry()` with an exponential backoff delay of `60 * 2^attempt` seconds, up to `max_retries=3`.

**Validates: Requirements 15.1, 15.2**

### Property 11: Sync enrollment metamorphic equivalence

*For any* valid set of applications and intakes, the refactored single-query `sync_enrollment()` should produce the same `current_enrollment` values as computing individual counts per program+intake in a loop.

**Validates: Requirements 16.2, 16.3**

### Property 12: Disabled payment button shows explanation

*For any* state where the PaymentStep "Pay now" button is disabled (fee loading, widget unavailable, or payment in progress), the component should render visible helper text or a tooltip explaining why the button is disabled.

**Validates: Requirements 17.1**

### Property 13: Capacity warning at enrollment threshold

*For any* intake where `current_enrollment / max_capacity >= 0.8`, the admin review page should display a capacity warning. When `current_enrollment >= max_capacity`, the warning should escalate to an over-capacity alert.

**Validates: Requirements 18.2, 18.3**

### Property 14: Intake utilization visual indicator

*For any* intake displayed on the admin Intakes page, the visual utilization indicator should reflect the ratio of `current_enrollment` to `capacity` — green below 80%, amber at 80-99%, red at 100%+.

**Validates: Requirements 19.3**

## Error Handling

### Database Migration Errors

- **Duplicate values before UNIQUE constraint**: The migration script checks for duplicates before adding constraints. If duplicates exist, they must be resolved manually before re-running the constraint DDL.
- **Type conversion failure (text[] → jsonb)**: If any `permissions` value cannot be converted to JSON, the `COALESCE(to_jsonb(permissions), '[]'::jsonb)` fallback ensures a safe default. Log any rows that hit the fallback.
- **Concurrent writes during migration**: Run migrations during a maintenance window or low-traffic period. The `ALTER TABLE` statements acquire brief locks but should complete quickly given the small table sizes (< 100 rows each).

### Backend Error Handling

- **IntakeEnforcer.increment_enrollment()**: If the program lookup fails (program not found), the method silently skips the `ProgramIntake` update but still updates the `Intake` row. This matches the existing fail-soft pattern.
- **send_bulk_notifications_task**: After `max_retries=3` exhaustion, the task logs the failure with notification IDs and the last exception. No silent swallowing of errors.
- **SecurityHeadersMiddleware**: The CSP header is set unconditionally. If the Lenco widget URL changes, the CSP `script-src` and `frame-src` directives must be updated.
- **NotificationListView pagination**: If the requested page exceeds available pages, DRF's `PageNumberPagination` returns a 404 with `{"detail": "Invalid page."}`.

### Frontend Error Handling

- **PaymentStep null applicationId**: Displays a user-friendly error message guiding the student to save their application first, instead of a generic error.
- **Capacity warning data missing**: If `intake_capacity` or `intake_enrollment` is null/undefined in the review response, the capacity warning is not rendered (fail-safe).

## Testing Strategy

### Dual Testing Approach

The remediation uses both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, and integration points (e.g., specific SQL migration outcomes, specific UI states)
- **Property tests**: Verify universal properties across randomized inputs (e.g., enrollment sync correctness for any application set, security headers on any response)

### Backend Testing

**Framework**: `pytest` + `hypothesis`

**Property-based tests** (minimum 100 iterations each):

| Property | Test File | Description |
|----------|-----------|-------------|
| P1 | `tests/property/test_enrollment_sync.py` | Increment updates both tables |
| P2 | `tests/property/test_enrollment_sync.py` | Sync produces correct counts |
| P3 | `tests/property/test_model_nullability.py` | Model fields reject None |
| P4 | `tests/property/test_permissions_roundtrip.py` | JSONField round-trip |
| P7 | `tests/property/test_notification_pagination.py` | Pagination limits results |
| P8 | `tests/property/test_security_headers.py` | Headers present on all responses |
| P10 | `tests/property/test_bulk_notification_retry.py` | Retry with exponential backoff |
| P11 | `tests/property/test_enrollment_sync.py` | Metamorphic equivalence |

Each property test must be tagged with a comment:
```python
# Feature: audit-remediation, Property {N}: {property_text}
```

**Unit tests**:
- Verify `test_admin_override.py` skips gracefully without Postgres
- Verify `test_submission_gates.py` passes without Postgres
- Verify one-time SQL migration outcomes (post-migration verification queries)

### Frontend Testing

**Framework**: `vitest` + `fast-check`

**Property-based tests**:

| Property | Test File | Description |
|----------|-----------|-------------|
| P9 | `tests/unit/applicationStatus.test.ts` | Frontend statuses match backend |
| P12 | `tests/unit/paymentStep.test.ts` | Disabled button shows explanation |
| P13 | `tests/unit/capacityWarning.test.ts` | Capacity warning at threshold |
| P14 | `tests/unit/intakeUtilization.test.ts` | Utilization visual indicator |

Each property test must be tagged:
```typescript
// Feature: audit-remediation, Property {N}: {property_text}
```

**Unit tests**:
- Verify `pending_documents` is removed from `APPLICATION_STATUSES`
- Verify `waitlisted` renders correctly in timeline
- Verify PaymentStep shows improved error for null applicationId

### Test Configuration

- Backend property tests: `@settings(max_examples=100)` minimum
- Frontend property tests: `fc.assert(property, { numRuns: 100 })` minimum
- Each correctness property is implemented by a single property-based test
- Property tests reference their design document property number in comments
