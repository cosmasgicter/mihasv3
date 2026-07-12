# Design — Go-Live Polish

## Overview

9 targeted fixes across test infrastructure, data seeding, notification wiring, performance, and cleanup (all completed). Plus 6 new production issues reported 13 Apr 2026 covering slip upload auth, duplicate checker scope, admin activity feed, profile completion reliability, draft deletion resilience, and SSE stability.

## Fix Details

### Fix 1: test_admin_override.py — TransactionTestCase ✅
Change `SimpleTestCase` to `TransactionTestCase` in `backend/tests/property/test_admin_override.py`. Add `databases = ['default']`.

### Fix 2: International program fees ✅
Insert `international` residency fee rows into `program_fees` for all 4 programs via SQL. Amount: K306 (2x local fee of K153).

### Fix 3: Notification on approval/rejection ✅
In the review endpoint (`ApplicationReviewView.post`), after `transition_application_status()`, create a `Notification` record and dispatch an email via the existing `send_email_task`. Use the notification templates already defined in the frontend.

### Fix 4: Deprecate application_drafts table ✅
Add a comment to the `ApplicationDraft` model docstring marking it as deprecated. No code changes needed — the table stays for backward compatibility but is not used.

### Fix 5: Keep-alive ping for Koyeb ✅
Add a `keep_alive_ping_task` to Celery Beat that pings `/health/live/` every 4 minutes. This prevents Koyeb from scaling to zero.

### Fix 6: Intake capacity in review response ✅
Add `intake_capacity` and `intake_enrollment` fields to the review endpoint response so the admin frontend can display warnings.

### Fix 7: Sync program_intakes.current_enrollment ✅
Extend `IntakeEnforcer.sync_enrollment()` to also update the `program_intakes` row for the specific program+intake combination.

### Fix 8: Lazy-load vendor-pdf ✅
Move the jspdf/pdf-lib dynamic import to only trigger on the submission confirmation page, not on initial bundle load.

### Fix 9: CSRF token cleanup task ✅
Add a `cleanup_csrf_tokens_task` to Celery Beat that deletes tokens where `expires_at < now() - interval '48 hours'`. Run daily at 04:00 UTC.

---

## New Issues (13 Apr 2026)

### Fix 10: Slip upload 403 for non-draft applications

**Problem**: `applicationSlipStorage.ts` calls `POST /api/v1/documents/upload/` to persist generated PDF slips. `DocumentUploadView` rejects uploads when `application.status != 'draft'` with 403. Students with approved/submitted applications can't persist or email their slips.

**Solution**: In `DocumentUploadView.post()` in `backend/apps/documents/views.py`, allow `application_slip` document type uploads regardless of application status. The draft-only guard should only apply to student-uploaded documents (NRC, passport, transcripts), not system-generated slips.

```python
# In DocumentUploadView.post(), after ownership check:
if role not in ("admin", "super_admin") and application.status != "draft":
    # Allow application_slip uploads for any status
    if document_type != "application_slip":
        return Response(...)
```

### Fix 11: DuplicateChecker blocks re-application after approval

**Problem**: `DuplicateChecker.check_at_create()` includes `approved` in `NON_TERMINAL_STATUSES`, blocking students from creating new applications for the same program+intake after their previous one was approved. User with KATC202533134 (approved Oct 2025 for "Diploma in Clinical Medicine" / "January 2026 Intake") can't start a new application.

**Solution**: Remove `approved` from `NON_TERMINAL_STATUSES` in `duplicate_checker.py`. An approved application is a terminal state — the student was accepted. Keep `approved` in `SUBMITTED_STATUSES` for `check_at_submit()` to prevent double-submission of concurrent in-flight applications.

```python
# Before:
NON_TERMINAL_STATUSES = {"draft", "submitted", "under_review", "approved", "waitlisted"}

# After:
NON_TERMINAL_STATUSES = {"draft", "submitted", "under_review", "waitlisted"}
```

Also update the frontend `duplicateApplicationCheck.ts` to match:
```typescript
// Before:
const nonTerminalStatuses = new Set(['draft', 'submitted', 'under_review', 'approved', 'waitlisted'])

// After:
const nonTerminalStatuses = new Set(['draft', 'submitted', 'under_review', 'waitlisted'])
```

### Fix 12: Admin activity feed shows raw audit log entries

**Problem**: `DashboardActivityFeed` shows "POST auth", "POST errors", "POST applications" because the `AuditLogSerializer` returns raw `action` (HTTP method) and `entity_type` (URL segment) with no human-readable message. `normalizeRecentActivity()` falls back to `${action} ${entityType}`.

**Solution**: Add a human-readable message mapping in `normalizeRecentActivity()` in `apps/admissions/src/services/admin/dashboard.ts`. Map `action + entity_type` combinations to meaningful descriptions:

```typescript
const ACTIVITY_MESSAGE_MAP: Record<string, Record<string, string>> = {
  POST: {
    auth: 'User logged in',
    applications: 'Application submitted',
    errors: 'Error reported',
    documents: 'Document uploaded',
    payments: 'Payment initiated',
    notifications: 'Notification sent',
  },
  PATCH: {
    applications: 'Application updated',
    auth: 'Profile updated',
  },
  PUT: {
    applications: 'Application reviewed',
    notifications: 'Notification read',
  },
  DELETE: {
    applications: 'Draft deleted',
    sessions: 'Session ended',
  },
}
```

Use this map in the message fallback path instead of raw concatenation.

### Fix 13: Profile completion shows 33% for complete profiles

**Problem**: `useProfileQuery` calls `GET /api/v1/auth/profile/` which fails silently (likely auth timing on page load). The fallback returns `{id, user_id, email, role, full_name}` — only 3/9 required fields resolve (first_name from full_name split, last_name from full_name split, email) = 33%.

**Solution** (two-part):

1. **Backend**: Add `first_name` and `last_name` to `ProfileReadSerializer` fields in `backend/apps/accounts/serializers.py`. This makes the profile response self-sufficient without depending on `full_name` splitting.

2. **Frontend**: Improve the `useProfileQuery` fallback to include more fields from the session user object. The session endpoint already returns `first_name` and `last_name` — pass them through to the fallback profile.

```python
# ProfileReadSerializer — add first_name, last_name:
fields = [
    "id", "email", "role", "first_name", "last_name", "full_name",
    "phone", "date_of_birth", "sex", "residence_town", "country",
    "nrc_number", "address", "nationality", "next_of_kin_name",
    "next_of_kin_phone", "updated_at",
]
```

### Fix 14: Draft deletion 404 for already-deleted applications

**Problem**: `applicationSessionManager.deleteDraft()` lists drafts via API, then calls `DELETE /api/v1/applications/{id}/` for each. If a draft was already deleted (by another tab, session, or previous attempt), the DELETE returns 404 and the whole operation reports failure. Additionally, stale application IDs cause 404s on `GET /applications/{id}/details/` and `GET /applications/{id}/interviews/` when the dashboard references deleted applications.

**Solution**: In `applicationService.delete()` in `apps/admissions/src/services/applications.ts`, catch 404 errors and treat them as successful deletions (the resource is already gone — idempotent delete semantics). Also wrap the `/details/` call in `loadApplicationDetails()` with a 404 catch that returns null instead of throwing.

```typescript
delete: async (id: string) => {
  try {
    await apiClient.request<void>(`/applications/${encodeURIComponent(id)}/`, {
      method: 'DELETE'
    })
  } catch (error) {
    // 404 means already deleted — treat as success (idempotent delete)
    if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
      return { success: true }
    }
    throw error
  }
  return { success: true }
},
```

### Fix 15: SSE QUIC reconnect storm

**Problem**: Koyeb's HTTP/3 QUIC layer kills long-lived SSE connections with `ERR_QUIC_PROTOCOL_ERROR.QUIC_TOO_MANY_RTOS`. The SSE client reconnects, gets another 200, and the cycle repeats — flooding the console with errors.

**Solution**: Add a rapid-failure detection window to the SSE client. If the connection dies within 5 seconds of opening (indicating a transport-level issue, not a normal timeout), increment a rapid-failure counter. After 3 rapid failures in 60 seconds, stop SSE reconnection and fall back to polling-only mode.

```typescript
// In createSSEClient, add rapid-failure tracking:
let rapidFailureCount = 0
let lastConnectTime = 0
const RAPID_FAILURE_THRESHOLD_MS = 5000
const MAX_RAPID_FAILURES = 3

// In eventSource.onopen:
lastConnectTime = Date.now()

// In eventSource.onerror:
const connectionDuration = Date.now() - lastConnectTime
if (lastConnectTime > 0 && connectionDuration < RAPID_FAILURE_THRESHOLD_MS) {
  rapidFailureCount++
  if (rapidFailureCount >= MAX_RAPID_FAILURES) {
    console.warn('[SSEClient] Rapid failure detected (likely QUIC issue), falling back to polling')
    retriesExhausted = true
    dispatchEvent('error', { type: 'rapid_failure_fallback' })
    return
  }
}
```
