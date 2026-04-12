# Design — Go-Live Polish

## Overview

9 targeted fixes across test infrastructure, data seeding, notification wiring, performance, and cleanup. Each fix is independent and low-risk.

## Fix Details

### Fix 1: test_admin_override.py — TransactionTestCase
Change `SimpleTestCase` to `TransactionTestCase` in `backend/tests/property/test_admin_override.py`. Add `databases = ['default']`.

### Fix 2: International program fees
Insert `international` residency fee rows into `program_fees` for all 4 programs via SQL. Amount: K306 (2x local fee of K153).

### Fix 3: Notification on approval/rejection
In the review endpoint (`ApplicationReviewView.post`), after `transition_application_status()`, create a `Notification` record and dispatch an email via the existing `send_email_task`. Use the notification templates already defined in the frontend.

### Fix 4: Deprecate application_drafts table
Add a comment to the `ApplicationDraft` model docstring marking it as deprecated. No code changes needed — the table stays for backward compatibility but is not used.

### Fix 5: Keep-alive ping for Koyeb
Add a `keep_alive_ping_task` to Celery Beat that pings `/health/live/` every 4 minutes. This prevents Koyeb from scaling to zero.

### Fix 6: Intake capacity in review response
Add `intake_capacity` and `intake_enrollment` fields to the review endpoint response so the admin frontend can display warnings.

### Fix 7: Sync program_intakes.current_enrollment
Extend `IntakeEnforcer.sync_enrollment()` to also update the `program_intakes` row for the specific program+intake combination.

### Fix 8: Lazy-load vendor-pdf
Move the jspdf/pdf-lib dynamic import to only trigger on the submission confirmation page, not on initial bundle load.

### Fix 9: CSRF token cleanup task
Add a `cleanup_csrf_tokens_task` to Celery Beat that deletes tokens where `expires_at < now() - interval '48 hours'`. Run daily at 04:00 UTC.
