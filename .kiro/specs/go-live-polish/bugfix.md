# Bugfix Requirements — Go-Live Polish

## Introduction

9 remaining issues identified in the pre-go-live audit. Mix of missing business logic, test infrastructure, data gaps, performance, and cleanup.

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

### Unchanged Behavior (Regression Prevention)

3.1 All existing backend unit tests (168) SHALL continue to pass
3.2 All existing E2E tests (10/12) SHALL continue to pass
3.3 The session endpoint SHALL continue to return 200 for unauthenticated requests
3.4 The payment flow SHALL continue to work end-to-end
3.5 The intake enforcement (deadline, capacity, open date) SHALL continue to work
