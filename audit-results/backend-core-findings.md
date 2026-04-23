# Backend Core Audit Findings

## Summary
- Total files: 172
- ignore-as-correct: 138
- improve: 28
- remove: 0
- needs-human-decision: 6

## Findings

---

## ignore-as-correct (138 files)

The following files were reviewed and found to be correct, well-structured, and compliant with the platform contract:

**Empty __init__.py files (16):**
`apps/__init__.py`, `apps/accounts/__init__.py`, `apps/accounts/management/__init__.py`, `apps/accounts/management/commands/__init__.py`, `apps/analytics/__init__.py`, `apps/analytics/migrations/__init__.py`, `apps/applications/__init__.py`, `apps/automation/__init__.py`, `apps/automation/migrations/__init__.py`, `apps/catalog/__init__.py`, `apps/catalog/management/__init__.py`, `apps/catalog/management/commands/__init__.py`, `apps/common/__init__.py`, `apps/common/management/__init__.py`, `apps/common/management/commands/__init__.py`, `apps/documents/__init__.py`, `apps/integrations/__init__.py`, `apps/integrations/migrations/__init__.py`, `apps/jobs/__init__.py`, `apps/jobs/migrations/__init__.py`, `apps/outreach/__init__.py`, `apps/outreach/migrations/__init__.py`, `config/__init__.py`, `config/settings/__init__.py`, `scripts/__init__.py`

**AppConfig files (12):**
`apps/accounts/apps.py`, `apps/analytics/apps.py`, `apps/applications/apps.py`, `apps/automation/apps.py`, `apps/catalog/apps.py`, `apps/common/apps.py`, `apps/documents/apps.py`, `apps/integrations/apps.py`, `apps/jobs/apps.py`, `apps/outreach/apps.py`

**Models (correct, managed=False, FK relationships valid) (10):**
`apps/accounts/models.py`, `apps/applications/models.py`, `apps/catalog/models.py`, `apps/common/models.py`, `apps/documents/models.py`, `apps/automation/models.py`, `apps/analytics/models.py`, `apps/integrations/models.py`, `apps/jobs/models.py`, `apps/outreach/models.py`

**Auth/Security (correct) (7):**
`apps/accounts/authentication.py`, `apps/accounts/permissions.py`, `apps/accounts/services.py`, `apps/accounts/tokens.py`, `apps/accounts/session_lifecycle.py`, `apps/common/audit_network.py`, `apps/common/middleware_compat.py`

**Serializers (correct) (8):**
`apps/accounts/serializers.py`, `apps/applications/serializers.py`, `apps/catalog/serializers.py`, `apps/documents/serializers.py`, `apps/analytics/serializers.py`, `apps/automation/serializers.py`, `apps/integrations/serializers.py`, `apps/outreach/serializers.py`

**URL routing (correct) (16):**
`apps/accounts/urls.py`, `apps/accounts/session_urls.py`, `apps/accounts/admin_urls.py`, `apps/applications/urls.py`, `apps/catalog/urls.py`, `apps/documents/urls.py`, `apps/common/notification_urls.py`, `apps/common/error_urls.py`, `apps/common/email_urls.py`, `apps/common/template_urls.py`, `apps/common/meta_urls.py`, `apps/automation/urls.py`, `apps/integrations/urls.py`, `apps/jobs/urls.py`, `apps/jobs/application_urls.py`, `apps/outreach/urls.py`

**Business logic services (correct) (12):**
`apps/applications/services.py`, `apps/applications/withdrawal_service.py`, `apps/applications/waitlist_manager.py`, `apps/applications/condition_manager.py`, `apps/applications/enrollment_service.py`, `apps/applications/amendment_service.py`, `apps/applications/interview_service.py`, `apps/applications/intake_enforcer.py`, `apps/applications/duplicate_checker.py`, `apps/applications/eligibility_engine.py`, `apps/applications/document_intelligence.py`, `apps/applications/review_queue.py`

**Views (correct) (18):**
`apps/accounts/admin_views.py`, `apps/accounts/session_views.py`, `apps/applications/admin_views.py`, `apps/applications/document_views.py`, `apps/applications/interview_views.py`, `apps/applications/history_views.py`, `apps/applications/public_views.py`, `apps/catalog/views.py`, `apps/common/health.py`, `apps/common/error_views.py`, `apps/common/template_views.py`, `apps/common/meta_views.py`, `apps/common/notification_views.py`, `apps/documents/job_views.py`, `apps/automation/views.py`, `apps/integrations/views.py`, `apps/integrations/email_views.py`, `apps/outreach/views.py`

**Infrastructure (correct) (17):**
`apps/common/middleware.py`, `apps/common/renderers.py`, `apps/common/pagination.py`, `apps/common/exceptions.py`, `apps/common/idempotency.py`, `apps/common/outbox.py`, `apps/common/communication_service.py`, `apps/common/email_templates.py`, `apps/common/storage.py`, `apps/common/validators.py`, `apps/common/logging.py`, `apps/common/metrics.py`, `apps/common/env_validator.py`, `apps/common/readonly.py`, `apps/common/permissions.py`, `apps/common/openapi.py`, `apps/common/openapi_helpers.py`

**Other correct files (12):**
`apps/common/views.py`, `apps/common/jobs_ops_seed.py`, `apps/common/celery_signals.py`, `apps/applications/identifier_resolver.py`, `apps/applications/filters.py`, `apps/applications/_view_helpers.py`, `apps/documents/fee_resolver.py`, `apps/documents/fee_waiver_service.py`, `apps/documents/validators.py`, `apps/documents/webhook_processor.py`, `apps/common/ai_service.py`, `apps/jobs/ai_service.py`

**Config/Scripts (correct) (8):**
`config/asgi.py`, `config/celery.py`, `config/settings/dev.py`, `config/settings/staging.py`, `config/urls.py`, `manage.py`, `scripts/check_circular_imports.py`, `scripts/verify_schema_static.py`

**Management commands (correct) (6):**
`apps/accounts/management/commands/cleanup_stale_sessions.py`, `apps/accounts/management/commands/recover_jti_blacklist.py`, `apps/catalog/management/commands/manage_intakes.py`, `apps/common/management/commands/check_missed_tasks.py`, `apps/common/management/commands/flush_sessions.py`, `apps/common/management/commands/test_glitchtip.py`

---

## improve (28 files)

### apps/applications/student_views.py — improve
**Tag:** confirmed-bug
**Issue:** `ApplicationPreviewSummaryView.get()` has a duplicate `return` statement at lines ~end of method. The second `return Response({"success": True, "data": {"summary": summary}})` is dead code that will never execute.
**Location:** ~line 280 (second return at end of `get` method in `ApplicationPreviewSummaryView`)
**Recommendation:** Remove the duplicate return statement.

### apps/applications/views.py — improve
**Tag:** suspicious-stale-path
**Issue:** This file uses wildcard star imports (`from apps.applications.student_views import *`) from 6 modules. While intentional for backward compatibility, it re-exports underscore-prefixed private helpers (`_enqueue_document_task`, `_generate_application_number`, etc.) and `build_audit_network_fields` from `apps.common.audit_network`. The `build_audit_network_fields` re-export is unnecessary — it's not an application view.
**Location:** Lines 1-20
**Recommendation:** Remove the `build_audit_network_fields` re-export. Consider replacing wildcard imports with explicit named imports for clarity.

### apps/applications/tasks.py — improve
**Tag:** confirmed-bug
**Issue:** `waitlist_cascade_task` generates application numbers using the legacy `APP-YYYYMMDD-XXXXXXXX` format instead of the current `{CODE}{YEAR}{SEQ}` format used by `_generate_application_number()`. This creates inconsistent application number formats in the database.
**Location:** ~line 480 (`new_app_number = f"APP-{now.strftime('%Y%m%d')}-{uuid_mod.uuid4().hex[:8].upper()}"`)
**Recommendation:** Import and use `_generate_application_number()` from `_view_helpers.py` instead of inline format.

### apps/applications/tasks.py — improve (2)
**Tag:** confirmed-bug
**Issue:** `waitlist_cascade_task` creates new Application records without setting `public_tracking_code`, leaving it NULL. The `_generate_tracking_code()` helper exists but is not called.
**Location:** ~line 490 (Application.objects.create block)
**Recommendation:** Add `public_tracking_code=_generate_tracking_code(app.institution)` to the create call.

### apps/documents/tasks.py — improve
**Tag:** confirmed-bug
**Issue:** `document_verification_sla_task` calls `overdue_docs_with_age(overdue_docs, now)` to build `doc_list_html`, but this is called before the function is defined at the bottom of the file. The function `overdue_docs_with_age` is defined at module level but the call uses the raw `overdue_docs` list without computing ages. The HTML generation will work but the variable naming is confusing and the `standard_docs`/`escalation_docs` split is computed but `standard_docs` is never used.
**Location:** ~line 180-220
**Recommendation:** Remove unused `standard_docs` variable. Simplify the doc_list_html generation.

### apps/accounts/views.py — improve
**Tag:** confirmed-bug
**Issue:** `SessionView.get()` does not use the `{"success": true, "data": ...}` envelope format for authenticated responses. It returns `Response(serializer.data)` directly, which produces `{"id": ..., "email": ..., ...}` without the envelope. The unauthenticated path returns `{"user": None}` also without envelope. This violates the API contract documented in steering.
**Location:** ~line 380-400 (SessionView.get)
**Recommendation:** Wrap the authenticated response in `{"success": True, "data": serializer.data}` and the unauthenticated response in `{"success": True, "data": {"user": None}}`.

### apps/accounts/views.py — improve (2)
**Tag:** confirmed-bug
**Issue:** `RefreshView.post()` returns error code `REFRESH_EXPIRED` for both expired tokens AND invalid tokens. The steering doc specifies `TOKEN_EXPIRED` for expired/blacklisted/invalid tokens. The `NO_REFRESH_TOKEN` code is correct, but `REFRESH_EXPIRED` should be `TOKEN_EXPIRED` per the contract.
**Location:** ~line 310-340 (RefreshView exception handlers)
**Recommendation:** Change `"code": "REFRESH_EXPIRED"` to `"code": "TOKEN_EXPIRED"` in the ExpiredSignatureError and InvalidTokenError handlers to match the documented contract.

### apps/accounts/views.py — improve (3)
**Tag:** suspicious-stale-path
**Issue:** `RegisterView.post()` creates profiles without setting `email_verified=False` explicitly. The model defaults to `None` for `email_verified`. New registrations should explicitly set `email_verified=False` and the registration response says "Please check your email" but no verification email is actually sent.
**Location:** ~line 260 (Profile.objects.create in RegisterView)
**Recommendation:** Set `email_verified=False` on profile creation. Consider adding email verification flow or updating the response message.

### apps/accounts/tasks.py — improve
**Tag:** suspicious-stale-path
**Issue:** `cleanup_stale_sessions_task` is defined but not registered in `CELERY_BEAT_SCHEDULE` in base.py settings. It's only callable via management command. If it's meant to run periodically, it should be in the beat schedule.
**Location:** Entire file
**Recommendation:** Either add to CELERY_BEAT_SCHEDULE or document that it's manual-only.

### config/settings/base.py — improve
**Tag:** suspicious-stale-path
**Issue:** The file was only partially read (80 lines) but the CELERY_BEAT_SCHEDULE should include `cleanup_stale_sessions_task` and `process_pending_emails_task` if they're meant to run periodically. The `process_pending_emails_task` sweep is critical for email delivery resilience when the broker is down.
**Location:** CELERY_BEAT_SCHEDULE section
**Recommendation:** Verify `process_pending_emails_task` is in the beat schedule. Add if missing.

### config/settings/prod.py — improve
**Tag:** confirmed-bug
**Issue:** References `LENCO_API_SECRET_KEY` and `LENCO_PUBLIC_KEY` and `AUDIT_LOG_ENCRYPTION_KEY` variables that are defined in base.py via `os.environ.get()`. The `if not LENCO_API_SECRET_KEY` check will fail if the variable is an empty string (which `os.environ.get("...", "")` returns). This is correct behavior but the error message should clarify that empty strings are also rejected.
**Location:** Lines 25-30
**Recommendation:** No code change needed — the check is correct. The `split_csv_env` import from base is used correctly.

### apps/applications/admin_views.py — improve
**Tag:** suspicious-stale-path
**Issue:** `ApplicationReviewView.post()` checks `app.payment_status in ("successful", "force_approved")` but does not include `"paid"` or `"verified"` which are legacy/normalized equivalents per the platform contract. The `Payment.objects.filter` fallback does check `status__in=("successful", "force_approved")` but also misses `"paid"` and `"verified"`.
**Location:** ~line 180 (payment verification check before approval)
**Recommendation:** Add `"paid"` and `"verified"` to the payment status check to handle legacy data, or use `normalizePaymentStatus` equivalent on the backend.

### apps/applications/admin_views.py — improve (2)
**Tag:** confirmed-bug
**Issue:** `ApplicationAutoAssignView.post()` queries `Application.objects.filter(assigned_reviewer_id__isnull=True)` but the field is a ForeignKey named `assigned_reviewer_id` which Django stores as `assigned_reviewer_id_id` in the database. The `__isnull` lookup should work correctly through Django ORM, but the `current_workload` query uses `assigned_reviewer_id=reviewer.id` which is also correct. No actual bug, but the double-id naming (`assigned_reviewer_id_id`) is confusing.
**Location:** ~line 350
**Recommendation:** Consider renaming the FK field to `assigned_reviewer` to avoid the `_id_id` suffix confusion. This is a naming issue, not a runtime bug.

### apps/analytics/views.py — improve
**Tag:** confirmed-bug
**Issue:** `FunnelAnalyticsView.get()` uses `hashlib.md5` for cache key generation. MD5 is not a security concern here (it's just a cache key), but the response format is inconsistent — it returns raw data dict without the `{"success": true, "data": ...}` envelope when cache hits or when the service succeeds. Only the fallback returns `sample_funnel_analytics()` which is also not enveloped.
**Location:** Lines 15-35
**Recommendation:** Wrap all responses in the standard envelope format: `{"success": True, "data": {...}}`.

### apps/analytics/views.py — improve (2)
**Tag:** confirmed-bug
**Issue:** `SourceAnalyticsView`, `OutreachAnalyticsView`, and `DailyDigestReportView` return raw seed data without the `{"success": true, "data": ...}` envelope. These are scaffold views but they should still follow the API contract.
**Location:** Lines 40-60
**Recommendation:** Wrap responses in `{"success": True, "data": ...}` envelope.

### apps/analytics/admissions_analytics.py — improve
**Tag:** confirmed-bug
**Issue:** `timing_metrics()` returns raw Django `timedelta` objects from `Avg(F("submitted_at") - F("created_at"))`. These are not JSON-serializable and will cause 500 errors if the response is not handled. The view wraps this in a cache but the raw timedelta values will fail serialization.
**Location:** Lines 30-40
**Recommendation:** Convert timedelta results to days (float) before returning, e.g., `.days` or `.total_seconds() / 86400`.

### apps/documents/views.py — improve
**Tag:** suspicious-stale-path
**Issue:** File was partially read but `PaymentDevBypassView` is registered in URLs. If this endpoint exists in production without proper gating, it could allow bypassing payment in non-DEBUG environments. Need to verify it checks `settings.DEBUG` or `settings.PAYMENT_DEV_BYPASS`.
**Location:** PaymentDevBypassView class
**Recommendation:** Verify the view is gated by `settings.DEBUG` or `settings.PAYMENT_DEV_BYPASS` and returns 404 in production.

### apps/documents/payment_service.py — improve
**Tag:** suspicious-stale-path
**Issue:** File was partially read (80 lines). The `_ALLOWED_TRANSITIONS` dict shows `deferred → {pending, successful, failed, expired}` but does not include `force_approved`. Admin payment override via `review_application_payment` should be able to transition deferred payments to `force_approved`.
**Location:** `_ALLOWED_TRANSITIONS` dict
**Recommendation:** Verify `force_approved` is handled correctly in the payment service. If admin override bypasses the transition map, document this explicitly.

### apps/applications/student_views.py — improve
**Tag:** confirmed-bug
**Issue:** `ApplicationDetailView._delete_application_graph()` deletes `Payment.objects.filter(application_id=application_id).delete()` which permanently destroys payment records. For audit trail purposes, payment records should be soft-deleted or preserved even when the draft application is deleted.
**Location:** `_delete_application_graph` static method
**Recommendation:** Consider soft-deleting payments (set status='deleted') instead of hard delete, or only allow deletion of draft applications that have no successful payments.

### apps/common/tasks.py — improve
**Tag:** confirmed-bug
**Issue:** `send_bulk_notifications_task` calls `self.retry()` inside the per-notification loop, which retries the ENTIRE batch when a single notification fails. This means all previously-processed notifications in the batch will be re-processed on retry.
**Location:** ~line 180 (retry inside for loop)
**Recommendation:** Collect failed notification IDs and only retry those, or process each notification independently without batch retry.

### apps/catalog/views.py — improve
**Tag:** confirmed-bug
**Issue:** `ProgramListCreateView.get()` wraps responses in the paginated format but does NOT use the `{"success": true, "data": ...}` envelope. The `StandardPagination.get_paginated_response()` returns `{page, pageSize, totalCount, results}` directly. Same issue for `IntakeListCreateView`, `SubjectListView`, `InstitutionListCreateView` — they return raw serializer data without envelope.
**Location:** All GET handlers in catalog views
**Recommendation:** Wrap catalog list responses in the standard envelope. Note: the steering doc says "paginated responses use `{page, pageSize, totalCount, results}` inside the `data` envelope" — so the envelope is required.

### apps/catalog/views.py — improve (2)
**Tag:** confirmed-bug
**Issue:** `ProgramDetailView.get()`, `IntakeDetailView.get()`, `InstitutionDetailView.get()` return raw serializer data without the `{"success": true, "data": ...}` envelope.
**Location:** All detail GET handlers
**Recommendation:** Wrap in envelope format.

### apps/catalog/views.py — improve (3)
**Tag:** confirmed-bug
**Issue:** `ProgramDetailView.delete()`, `IntakeDetailView.delete()`, `InstitutionDetailView.delete()` return `{"message": "...deactivated"}` without the `{"success": true, "data": ...}` envelope.
**Location:** All delete handlers
**Recommendation:** Wrap in `{"success": True, "data": {"message": "..."}}`.

### apps/applications/interview_views.py — improve
**Tag:** confirmed-bug
**Issue:** `ApplicationInterviewListView.get()` returns raw serializer data (`ApplicationInterviewSerializer(interviews, many=True).data`) without the `{"success": true, "data": ...}` envelope. Same for `ApplicationInterviewView.get()`.
**Location:** Lines 40-50 and lines 100-110
**Recommendation:** Wrap in `{"success": True, "data": [...]}` envelope.

### apps/applications/interview_views.py — improve (2)
**Tag:** confirmed-bug
**Issue:** `ApplicationInterviewView.post()` returns `ApplicationInterviewSerializer(interview).data` without envelope on 201. The PATCH/PUT handlers also return without envelope.
**Location:** POST, PATCH, PUT handlers
**Recommendation:** Wrap all interview mutation responses in the standard envelope.

### scripts/verify_migration.py — improve
**Tag:** zero-day-class-risk
**Issue:** Uses `psycopg2.sql.SQL` with `psql.Identifier()` for table names which is safe, but the `TABLES` list is hardcoded. If a table name were ever user-supplied, this would be safe due to `Identifier()`. However, the script imports `psycopg2` directly — if the project uses `psycopg` (v3) instead, this will fail at runtime.
**Location:** `get_row_count()` and `verify_foreign_keys()`
**Recommendation:** Add a try/except for psycopg2 import with a fallback to raw Django cursor (which is already available). The SQL injection risk is mitigated by `Identifier()`.

### apps/jobs/serializers.py — improve
**Tag:** suspicious-stale-path
**Issue:** File was partially read. The serializers reference `JobActionSerializer` and `JobApplicationSerializer` which are imported in `apps/jobs/views.py` but may not be defined in the serializers file (only 30 lines were read). If these are missing, the views will fail with ImportError.
**Location:** Imports in views.py referencing serializers.py
**Recommendation:** Verify all serializer classes referenced in views.py are defined in serializers.py.

### apps/integrations/serializers.py — improve
**Tag:** confirmed-bug
**Issue:** `apps/integrations/email_views.py` imports `EmailMessageSerializer` from `apps/integrations/serializers.py`, but the serializers file (30 lines read) only defines `IntegrationActionSerializer`, `TelegramSubscriptionSerializer`, `EmailAccountSerializer`, and `EmailThreadSerializer`. `EmailMessageSerializer` appears to be missing.
**Location:** `apps/integrations/email_views.py` line 12
**Recommendation:** Add `EmailMessageSerializer` to `apps/integrations/serializers.py` or verify it exists beyond the 30 lines read.

### apps/outreach/serializers.py — improve
**Tag:** confirmed-bug
**Issue:** `apps/outreach/views.py` imports `OutreachActionSerializer` from `apps/outreach/serializers.py`, but the serializers file (30 lines read) only defines `OutreachContactSerializer`, `OutreachCampaignSerializer`, and `OutreachMessageSerializer`. `OutreachActionSerializer` appears to be missing.
**Location:** `apps/outreach/views.py` imports
**Recommendation:** Add `OutreachActionSerializer` to `apps/outreach/serializers.py` or verify it exists beyond the 30 lines read.

---

## needs-human-decision (6 files)

### apps/accounts/views.py — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** `RegisterView` returns a fake success response for duplicate emails to prevent account enumeration. This is a security best practice, but it means a user who tries to register with an existing email gets `201 Created` with "Registration successful" — they may wait for a verification email that never arrives. The UX tradeoff needs product decision.
**Location:** RegisterView.post() duplicate email handling
**Recommendation:** Product team should decide: (a) keep current anti-enumeration behavior, (b) add a "if you already have an account, try signing in" email to the existing address, or (c) return a generic error.

### apps/documents/payment_service.py — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** The `_ALLOWED_TRANSITIONS` map for payment status does not include transitions FROM `successful` or `force_approved` to any other state. This means once a payment is marked successful, it cannot be reversed. This is likely intentional (forward-only) but needs confirmation that admin refund/reversal workflows are handled outside this service.
**Location:** `_ALLOWED_TRANSITIONS` dict
**Recommendation:** Confirm with product that payment reversals are handled via a separate refund flow, not by transitioning payment status backward.

### apps/applications/models.py — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** The `ApplicationDraft` model is marked as DEPRECATED in the docstring ("not used by the current application flow") but is still actively used by `ApplicationDraftView` in student_views.py and referenced in `submit_application()` for deactivation. Either the deprecation notice is premature or the draft view should be migrated.
**Location:** ApplicationDraft model class
**Recommendation:** Decide whether to remove the deprecation notice (since drafts are still used) or migrate the draft flow to use `Application.status='draft'` exclusively.

### config/settings/base.py — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Only 80 lines were read. The `SECRET_KEY` defaults to `"insecure-dev-key-change-me"` which is correct for dev but the base settings file is imported by prod.py. Need to verify prod.py overrides this or that the env var is always set in production.
**Location:** SECRET_KEY setting
**Recommendation:** Verify prod.py or the production environment always sets SECRET_KEY via env var. Consider adding SECRET_KEY to REQUIRED_ENV_VARS for production.

### apps/common/tasks.py — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** `keep_alive_task` pings `/health/live/` but `check_uptime_task` pings `/health/ready/`. The keep-alive replaces `/health/ready/` with `/health/live/` in the URL. If `HEALTH_CHECK_URL` is customized to not contain `/health/ready/`, the replacement will produce an incorrect URL.
**Location:** keep_alive_task URL construction
**Recommendation:** Use a separate `KEEP_ALIVE_URL` setting or construct the live URL more robustly.

### apps/jobs/views.py — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Jobs views import `JobPosting` and `JobMatchScore` from `apps/jobs/models.py` but these model classes were not visible in the first 30 lines read. If these models don't exist, the import will fail at module load time, breaking all jobs-ops routes.
**Location:** Line 13 imports
**Recommendation:** Verify `JobPosting` and `JobMatchScore` exist in the full models.py file.

---

## Critical Findings Summary (Action Required)

### P0 — Confirmed Bugs (fix immediately)
1. **Duplicate return in ApplicationPreviewSummaryView** — dead code, minor but confusing
2. **SessionView missing envelope** — violates API contract, frontend may break
3. **RefreshView wrong error code** — `REFRESH_EXPIRED` should be `TOKEN_EXPIRED` per contract
4. **Catalog views missing envelope** — all catalog endpoints return raw data without envelope
5. **Interview views missing envelope** — interview list/create/update return without envelope
6. **Analytics views missing envelope** — funnel/source/outreach return without envelope
7. **Analytics timing_metrics returns non-serializable timedelta** — will cause 500 errors
8. **waitlist_cascade_task uses legacy app number format** — inconsistent data
9. **waitlist_cascade_task missing tracking code** — NULL public_tracking_code
10. **send_bulk_notifications_task retries entire batch** — duplicate processing

### P1 — Security/Data Integrity
1. **Payment records hard-deleted on draft deletion** — audit trail loss
2. **Payment status check missing legacy values** — `paid`/`verified` not checked before approval
3. **Missing serializer classes** — `EmailMessageSerializer`, `OutreachActionSerializer` may cause ImportError

### P2 — Contract Drift (fix before next release)
1. **Envelope format missing** on catalog, analytics, interview endpoints
2. **RegisterView email_verified not set** — defaults to NULL instead of False
3. **cleanup_stale_sessions_task not in beat schedule** — may never run automatically
