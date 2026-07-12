# Bugfix Requirements — Go-Live Polish

## Introduction

9 remaining issues identified in the pre-go-live audit plus 6 new production issues reported 13 Apr 2026. Mix of missing business logic, test infrastructure, data gaps, performance, cleanup, auth/profile reliability, draft lifecycle, SSE stability, and UX polish.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `test_admin_override.py` runs THEN it fails with `DatabaseOperationForbidden` because it subclasses `SimpleTestCase` but needs DB transactions

1.2 WHEN an international student applies THEN `FeeResolver` returns no fee because `program_fees` only has `local` residency entries — no `international` rows exist

1.3 WHEN an admin approves or rejects an application THEN no email or in-app notification is sent to the student

1.4 WHEN the `application_drafts` table is queried THEN it returns data that is never used — the system uses `applications.status='draft'` instead, creating confusion

1.5 WHEN the Koyeb backend cold-starts THEN the first request takes 3-4 seconds, making the dashboard feel broken

1.6 WHEN an admin approves an application THEN no warning is shown about intake capacity

1.7 WHEN `program_intakes.current_enrollment` is checked THEN it shows 0 for all rows because only `intakes.current_enrollment` is synced

1.8 WHEN the landing page loads THEN the 600KB vendor-pdf chunk is eagerly loaded even though PDF generation is only used on the submission confirmation page

1.9 WHEN expired CSRF tokens accumulate THEN they are never cleaned up (11 stale rows currently)

### Expected Behavior (Correct)

2.1 WHEN `test_admin_override.py` runs THEN it uses `TransactionTestCase` and passes without DB errors

2.2 WHEN an international student applies THEN `program_fees` has `international` residency entries and `FeeResolver` returns the correct fee

2.3 WHEN an admin approves or rejects an application THEN the student receives an in-app notification and an email via the existing notification pipeline

2.4 WHEN the system manages drafts THEN it uses only `applications.status='draft'` and the `application_drafts` table is documented as deprecated

2.5 WHEN the backend is idle THEN a periodic health ping keeps at least one Koyeb instance warm, reducing cold-start latency to <500ms

2.6 WHEN an admin reviews an application THEN the review response includes intake capacity info (current/max) so the admin UI can display warnings

2.7 WHEN `IntakeEnforcer.sync_enrollment()` runs THEN it also updates `program_intakes.current_enrollment` for the specific program+intake combination

2.8 WHEN the landing page loads THEN the vendor-pdf chunk is lazy-loaded only when the user reaches the submission confirmation page

2.9 WHEN a cleanup task runs THEN expired CSRF tokens older than 48 hours are deleted

### New Issues (Reported 13 Apr 2026)

1.10 WHEN a student generates or emails an application slip for a non-draft (e.g. approved) application THEN `applicationSlipStorage.ts` calls `POST /api/v1/documents/upload/` which returns 403 because `DocumentUploadView` rejects uploads when `application.status != 'draft'` — the slip persist path should not go through the general document upload endpoint for non-draft applications, or the upload endpoint should allow `application_slip` document type regardless of application status

1.11 WHEN a student with an approved application for a past intake (e.g. KATC202533134, "Diploma in Clinical Medicine" / "January 2026 Intake", approved Oct 2025) tries to create a new application for the same program and intake THEN `DuplicateChecker.check_at_create()` blocks them because `approved` is in `NON_TERMINAL_STATUSES` — approved applications should be treated as terminal for the purpose of creating new applications (the student was already accepted; blocking re-application for the same program+intake after approval is overly restrictive, especially for past intakes)

1.12 WHEN the admin dashboard loads recent activity THEN the `DashboardActivityFeed` shows raw audit log entries like "POST auth", "POST errors", "POST applications" because the `AuditLogSerializer` returns `action` (HTTP method) and `entity_type` (URL path segment) with no human-readable message, and `normalizeRecentActivity()` in `dashboard.ts` falls back to `${action} ${entityType}` — the backend should return a human-readable description or the frontend normalizer should map action+entity_type combinations to meaningful messages

1.13 WHEN the student dashboard calculates profile completion THEN it shows 33% for a user whose profile is 100% complete in the database (all 9 required fields filled) because the `GET /api/v1/auth/profile/` call is failing (likely due to auth/CSRF issues on page load) and `useProfileQuery` falls back to `{id, user_id, email, role, full_name}` — with only `email` and `full_name` available, `resolveRequiredFieldValues` resolves 3/9 fields (first_name from full_name split, last_name from full_name split, email) = 33%. Root cause: the profile API call is failing silently; the fallback should include more fields from the session data, or the profile query error should be surfaced

1.14 WHEN a student clicks "Delete Draft" on the dashboard for a draft application that has already been deleted (or never existed in the database) THEN `applicationSessionManager.deleteDraft()` lists drafts via `applicationService.list({mine: true, status: 'draft'})`, finds stale draft IDs from a previous session or cached state, and calls `DELETE /api/v1/applications/{id}/` which returns 404 because the application `d8463176-55d3-4279-8417-5795cb460ddd` no longer exists in the database — the delete flow should handle 404 gracefully as a successful deletion (the draft is already gone). Additionally, stale application IDs trigger 404s on `GET /applications/{id}/details/` and `GET /applications/{id}/interviews/` when the dashboard or detail views reference applications that no longer exist (e.g. `c9b87caa-b159-4303-92c9-0a5959a1320e`)

1.15 WHEN the SSE client connects to `GET /api/v1/events/stream/` on the Koyeb-hosted backend THEN the connection receives a 200 OK but immediately dies with `ERR_QUIC_PROTOCOL_ERROR.QUIC_TOO_MANY_RTOS` because HTTP/3 QUIC retransmission timeouts kill the long-lived SSE connection — the client reconnects, gets another 200, and the cycle repeats, flooding the console with 4+ error entries per burst. The SSE client's reconnect logic is correct but the repeated QUIC failures create a noisy reconnect storm. Root cause is infrastructure-level: Koyeb's HTTP/3 layer is incompatible with long-lived SSE streams

### Expected Behavior (New Issues)

2.10 WHEN a student generates or emails an application slip for any application status THEN the slip is persisted successfully — either by allowing `application_slip` document type uploads regardless of status, or by using a dedicated slip storage endpoint

2.11 WHEN a student has an approved application THEN they can create a new application for the same program and intake — `approved` should be removed from `NON_TERMINAL_STATUSES` in `DuplicateChecker.check_at_create()` (it should remain in `SUBMITTED_STATUSES` for `check_at_submit()` to prevent double-submission of in-flight applications)

2.12 WHEN the admin dashboard loads recent activity THEN it shows human-readable messages like "User logged in", "Application submitted", "Error reported" instead of raw HTTP method + URL segment

2.13 WHEN the student dashboard calculates profile completion THEN it accurately reflects the user's actual profile data — the `ProfileReadSerializer` should include `first_name` and `last_name` fields so the frontend doesn't depend solely on `full_name` splitting, and the profile query fallback should preserve more fields from the session response

2.14 WHEN a student deletes a draft that no longer exists in the database THEN the delete call should treat a 404 response as a successful deletion (the resource is already gone) — `applicationService.delete()` should catch 404 errors and return success, or `deleteDraft()` should filter out IDs that fail with 404 without reporting them as errors. Additionally, `loadApplicationDetails()` should handle 404 on `/details/` and `/interviews/` gracefully instead of letting errors propagate to the console

2.15 WHEN the SSE client encounters repeated `ERR_QUIC_PROTOCOL_ERROR` failures THEN it should cap reconnection attempts within a time window (e.g. max 3 reconnects per 60 seconds for QUIC-specific failures) and fall back to polling mode instead of continuing the reconnect storm — additionally, the backend should consider adding `Alt-Svc: clear` or equivalent headers on the SSE endpoint to hint browsers to downgrade from HTTP/3 to HTTP/2 for long-lived connections

### Unchanged Behavior (Regression Prevention)

3.1 All existing backend unit tests (168) SHALL continue to pass
3.2 All existing E2E tests (10/12) SHALL continue to pass
3.3 The session endpoint SHALL continue to return 200 for unauthenticated requests
3.4 The payment flow SHALL continue to work end-to-end
3.5 The intake enforcement (deadline, capacity, open date) SHALL continue to work
3.6 The duplicate check at submit time SHALL continue to prevent double-submission of in-flight applications (check_at_submit with SUBMITTED_STATUSES unchanged)
3.7 The SSE client SHALL continue to detect auth failures (401/403) via HEAD probe and stop reconnecting
3.8 Draft deletion of existing draft applications SHALL continue to work (DELETE returns 204)
