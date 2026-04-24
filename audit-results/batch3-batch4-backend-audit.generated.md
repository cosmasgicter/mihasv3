# MIHAS Backend Audit — BATCH 3 (Applications) + BATCH 4 (Documents/Payments)

**Auditor**: Kiro automated security & correctness audit
**Date**: 2026-04-23
**Scope**: 38 files across `backend/apps/applications/` and `backend/apps/documents/`

---

## Executive Summary

The Applications and Documents/Payments domains are well-architected with strong payment security fundamentals: HMAC-SHA512 webhook validation, forward-only payment transitions with row-level locking, amount mismatch detection, and idempotent webhook processing. However, the audit identified **2 confirmed bugs**, **4 zero-day-class risks**, **5 improvement items**, and **1 suspicious stale path**. The most critical finding is a dead-code unreachable return in `student_views.py` and missing rate limiting on payment-sensitive endpoints.

---

## File-by-File Findings

### 1. `backend/apps/documents/payment_service.py`
**Classification**: `improve`

| # | Severity | Finding |
|---|----------|---------|
| PS-1 | Medium | **`initiate_payment` returns `payment_id=None` for already-paid applications** — When `application.payment_status in ('successful', 'verified', 'force_approved')`, the method returns `PaymentInitiationResult(payment_id=None, ...)`. Callers (e.g., `MobileMoneyInitiateView`) check `if not result.payment_id` to detect this, but the `PaymentInitiateView` does NOT check — it returns the `None` payment_id to the frontend as `"payment_id": "None"` (string). The frontend then has a UUID that is the string `"None"`. |
| PS-2 | Low | **`review_application_payment` saves `verified_by` field but `update_fields` references `'verified_by'`** — The Payment model defines `verified_by` as a FK with `db_column='verified_by'`. Django internally stores this as `verified_by_id`. The `save(update_fields=[...'verified_by'...])` works because Django resolves FK field names, but it's inconsistent with the `verified_by_id` assignment pattern used elsewhere. Not a runtime bug but a maintenance hazard. |
| PS-3 | Low | **`_PAYMENT_TO_APP_STATUS` defined inside `_update_payment_status` on every call** — This dict is re-created on every status transition. Should be a module-level constant. Negligible perf impact but poor practice. |

### 2. `backend/apps/documents/webhook_processor.py`
**Classification**: `ignore-as-correct`

Solid implementation. HMAC-SHA512 validation uses `hmac.compare_digest` for constant-time comparison. Dedup check prevents replay. All events logged regardless of validity. Known event types are properly gated. Reference extraction is defensive.

### 3. `backend/apps/documents/views.py`
**Classification**: `zero-day-class-risk`

| # | Severity | Finding |
|---|----------|---------|
| DV-1 | **HIGH** | **`PaymentVerifyView` has no rate limiting** — Any authenticated user can call `POST /api/v1/payments/{id}/verify/` in a tight loop, hammering the Lenco API. This is an amplification vector: one authenticated request triggers one outbound Lenco API call. No throttle class is applied. The `poll_pending_payments_task` caps at 50/run, but the verify endpoint has no such limit. |
| DV-2 | **HIGH** | **`PaymentInitiateView` has no rate limiting** — Similar to DV-1. Each call creates a Payment record and could be used to exhaust the 5-attempt limit maliciously or to create many pending records. The MAX_PAYMENT_ATTEMPTS check mitigates record creation but not the request volume. |
| DV-3 | Medium | **`MobileMoneyInitiateView` stores raw phone number in payment metadata** — `metadata.phone` contains the student's phone number in cleartext. This is PII stored in a JSON field that may be logged, exported, or exposed via admin APIs. The platform convention says "Never log PII". |
| DV-4 | Medium | **`PaymentDevBypassView` bypasses forward-only transitions** — When `DEBUG=True` and `PAYMENT_DEV_BYPASS=True`, this endpoint directly sets `payment.status = "successful"` without going through `PaymentService._update_payment_status()`. It also writes to the deprecated `application.payment_verified_by` and `payment_verified_at` columns. While gated by DEBUG, if these settings leak to staging/production, it's a full payment bypass. |
| DV-5 | Low | **`PaymentReceiptView.get` does not use the `{"success": true, "data": ...}` envelope** — Returns raw `receipt` dict without the standard envelope. Contract drift from documented convention. |
| DV-6 | Low | **`PaymentListView.get` returns raw serializer data when pagination is not triggered** — The non-paginated fallback path returns `Response(serializer.data)` without the `{"success": true, "data": ...}` envelope. |
| DV-7 | Low | **`DocumentExtractView.post` returns raw dict without envelope** — Returns `{"task_id": ..., "document_id": ..., "status": "queued"}` without `{"success": true, "data": ...}` wrapper. |

### 4. `backend/apps/documents/fee_resolver.py`
**Classification**: `ignore-as-correct`

Clean implementation. Residency classification is straightforward. Fallback chain (ProgramFee → program.application_fee → default K150) is well-documented. The `_DEFAULT_APPLICATION_FEE = Decimal('150.00')` vs the comment "defaults to 153.00" is a minor doc inconsistency but the code is authoritative.

### 5. `backend/apps/documents/fee_waiver_service.py`
**Classification**: `ignore-as-correct`

Proper validation of waiver types and reason codes. Effective fee computation correctly handles full/partial/scholarship waivers. History recording is present.

### 6. `backend/apps/documents/models.py`
**Classification**: `ignore-as-correct`

All models use `managed = False` (mapping to existing Neon tables). Payment model has all required Lenco fields. WebhookEventLog provides proper audit trail.

### 7. `backend/apps/documents/serializers.py`
**Classification**: `improve`

| # | Severity | Finding |
|---|----------|---------|
| DS-1 | Low | **`ProgramFeeSerializer.validate_fee_type` rejects `late_application`** — The validator only allows `"application"` or `"tuition"`, but `services.py` references `ProgramFee` records with `fee_type="late_application"` for late fee enforcement. Creating a late_application fee via the API would fail validation. |

### 8. `backend/apps/documents/validators.py`
**Classification**: `ignore-as-correct`

Magic byte validation is solid. Covers PDF, JPEG, PNG, GIF. Resets file pointer after reading.

### 9. `backend/apps/documents/tasks.py`
**Classification**: `improve`

| # | Severity | Finding |
|---|----------|---------|
| DT-1 | Medium | **`poll_pending_payments_task` expires payments without checking forward-only transitions** — The task directly sets `locked_payment.status = 'expired'` without going through `PaymentService._update_payment_status()`. While `pending → expired` is in `_ALLOWED_TRANSITIONS`, bypassing the service means no application payment_status sync occurs. A payment that expires won't update `application.payment_status`. |
| DT-2 | Low | **`document_verification_sla_task` references undefined `overdue_docs_with_age` before it's defined** — The function `overdue_docs_with_age` is defined at module level at the bottom of the file, but it's called inside the task. Python resolves this at call time (not import time), so it works, but the code also builds `standard_docs` and `escalation_docs` lists that are never used for the HTML — it calls `overdue_docs_with_age(overdue_docs, now)` instead. The `standard_docs`/`escalation_docs` split is dead code within the notification path. |

### 10. `backend/apps/documents/webhook_processor.py`
**Classification**: `ignore-as-correct` (already covered above)

### 11. `backend/apps/documents/apps.py`
**Classification**: `ignore-as-correct`

Standard Django app config.

### 12. `backend/apps/documents/job_views.py`
**Classification**: `suspicious-stale-path`

| # | Severity | Finding |
|---|----------|---------|
| JV-1 | Low | **All views return hardcoded scaffold data** — `ResumeListView`, `CoverLetterGenerateView`, `QuestionBankAnswerView`, and `DocumentVersionListView` return static placeholder data. These are registered in `urls.py` and accessible to any authenticated user. They don't use the `{"success": true, "data": ...}` envelope. If these are intentional scaffolds for the jobs-ops domain, they should be documented as such. If not, they're dead endpoints. |

### 13. `backend/apps/documents/urls.py`
**Classification**: `ignore-as-correct`

Clean URL routing with proper separation of document, payment, and program fee patterns.

---

### 14. `backend/apps/applications/student_views.py`
**Classification**: `confirmed-bug`

| # | Severity | Finding |
|---|----------|---------|
| SV-1 | **HIGH** | **`ApplicationPreviewSummaryView.get` has duplicate unreachable return statement** — Lines ~617-618 contain two consecutive `return Response({"success": True, "data": {"summary": summary}})` statements. The second return is dead code. While not a runtime crash (Python simply never reaches it), this indicates a copy-paste error and the method may be missing logic that should have been between the two returns (e.g., caching, metrics). |
| SV-2 | Medium | **`ApplicationDetailView.delete` deletes Payment records** — `_delete_application_graph` calls `Payment.objects.filter(application_id=application_id).delete()`. This permanently destroys payment ledger records for draft applications. While only drafts can be deleted, a draft could have pending/failed payment records that should be preserved for financial audit. |

### 15. `backend/apps/applications/admin_views.py`
**Classification**: `improve`

| # | Severity | Finding |
|---|----------|---------|
| AV-1 | Medium | **`ApplicationReviewView` allows any admin to set payment status without additional authorization** — The payment review path (`paymentStatus` in request data) only requires `IsAdmin` permission. There's no check that the admin has finance/payment review privileges. A regular admin can force-approve payments. |
| AV-2 | Medium | **`ApplicationBulkStatusView` confirmation token is predictable** — The SHA-256 token is computed from `sorted(application_ids) + new_status`. An attacker who knows the application IDs and target status can compute the token. This is a CSRF-like protection, not a true authorization check. The CSRF token already protects against cross-site attacks, so this is defense-in-depth, but the token provides no additional security beyond what CSRF already gives. |
| AV-3 | Low | **`ApplicationExportView` caps at 10,000 rows but doesn't inform the user** — If more than 10,000 applications match the filter, the export silently truncates. No header or footer indicates the truncation. |
| AV-4 | Low | **`ApplicationListCreateView.post` catches all exceptions from fee resolution silently** — The `try/except Exception` around fee resolution means if the fee resolver raises (e.g., program not found), the application is created with `application_fee=None`. This is by design (fee is advisory at creation), but the broad exception catch could mask real errors. |

### 16. `backend/apps/applications/services.py`
**Classification**: `ignore-as-correct`

The state machine is well-defined. `ALLOWED_TRANSITIONS` is the single source of truth. `submit_application` properly uses `select_for_update()` with TOCTOU re-checks. Duplicate checking at submit time is correct. Late fee enforcement is present.

### 17. `backend/apps/applications/serializers.py`
**Classification**: `ignore-as-correct`

Proper validation with `IdentifierResolver` canonicalization. Minimum age validation. Program-intake compatibility check. Payment summary mixin with proper caching.

### 18. `backend/apps/applications/models.py`
**Classification**: `ignore-as-correct`

All models use `managed = False`. Legacy payment columns are properly documented as deprecated. The `assigned_reviewer_id` FK naming creates the Django internal name `assigned_reviewer_id_id` which is awkward but functional.

### 19. `backend/apps/applications/views.py`
**Classification**: `ignore-as-correct`

Pure re-export module for backward compatibility. Wildcard imports are intentional and documented.

### 20. `backend/apps/applications/urls.py`
**Classification**: `ignore-as-correct`

All routes use UUID path parameters (no SQL injection risk). Clean structure.

### 21. `backend/apps/applications/interview_service.py`
**Classification**: `ignore-as-correct`

48-hour notice enforcement, conflict detection, mode validation, and notification dispatch are all correct. The `hashlib` import is unused (stale import from a previous version).

| # | Severity | Finding |
|---|----------|---------|
| IS-1 | Trivial | **Unused `hashlib` import** — Line 3 imports `hashlib` but it's never used in this module. |

### 22. `backend/apps/applications/interview_views.py`
**Classification**: `improve`

| # | Severity | Finding |
|---|----------|---------|
| IV-1 | Medium | **`ApplicationInterviewView._update_latest_interview` allows arbitrary status values** — When `new_status` is not `"rescheduled"` or `"cancelled"`, the method falls through to a generic update path that sets `interview.status = new_status` without validation against a whitelist. An admin could set status to any arbitrary string (e.g., `"hacked"`, `"deleted"`). The `InterviewService` validates modes but the direct update path bypasses it. |
| IV-2 | Low | **`ApplicationInterviewListView.get` returns raw serializer data without envelope** — Returns `Response(ApplicationInterviewSerializer(interviews, many=True).data)` without `{"success": true, "data": ...}` wrapper. Same for `ApplicationInterviewView.get`. Contract drift. |

### 23. `backend/apps/applications/withdrawal_service.py`
**Classification**: `ignore-as-correct`

Proper status validation, reason length enforcement, `select_for_update()` locking, IP hashing, enrollment decrement, and waitlist promotion. Well-structured.

### 24. `backend/apps/applications/waitlist_manager.py`
**Classification**: `ignore-as-correct`

Position assignment with row-level locking, auto-promotion with state machine enforcement, reindexing, and override logging are all correct.

### 25. `backend/apps/applications/condition_manager.py`
**Classification**: `ignore-as-correct`

Full lifecycle management with proper locking. Auto-promote/reject logic correctly handles the expired-conditions case.

### 26. `backend/apps/applications/enrollment_service.py`
**Classification**: `ignore-as-correct`

Deadline computation from academic calendar with 14-day fallback. Proper status validation and locking.

### 27. `backend/apps/applications/amendment_service.py`
**Classification**: `ignore-as-correct`

Field whitelist enforcement, pending count limit, admin review workflow, and history recording are all correct.

### 28. `backend/apps/applications/intake_enforcer.py`
**Classification**: `ignore-as-correct`

Grace period support, capacity checking with live count, atomic enrollment increment/decrement with `F()` expressions. The `sync_enrollment` method was properly refactored to avoid N+1 queries.

### 29. `backend/apps/applications/duplicate_checker.py`
**Classification**: `ignore-as-correct`

Identity-aware duplicate detection with proper terminal status exclusion. Multi-intake policy support.

### 30. `backend/apps/applications/eligibility_engine.py`
**Classification**: `ignore-as-correct`

Advisory-only evaluation with weighted scoring. Properly handles missing grades and requirements.

### 31. `backend/apps/applications/identifier_resolver.py`
**Classification**: `ignore-as-correct`

Multi-strategy resolution (UUID → name → code → partial match). Defensive against invalid UUIDs.

### 32. `backend/apps/applications/document_intelligence.py`
**Classification**: `ignore-as-correct`

Completeness scoring with document/consistency/grade weights. NRC pattern matching in extracted text.

### 33. `backend/apps/applications/review_queue.py`
**Classification**: `ignore-as-correct`

Deterministic priority scoring with proper classification.

### 34. `backend/apps/applications/filters.py`
**Classification**: `ignore-as-correct`

No SQL injection risk — all filters use Django ORM. Proper timezone handling for date filters.

### 35. `backend/apps/applications/tasks.py`
**Classification**: `ignore-as-correct`

All tasks use distributed locks via `cache.add()`. PDF generation with reportlab is straightforward. Waitlist cascade respects multi-intake policy.

### 36. `backend/apps/applications/public_views.py`
**Classification**: `ignore-as-correct`

Tracking code format validation with regex. Uses `OptionalJWTCookieAuthentication` + `AllowAny` correctly.

### 37. `backend/apps/applications/history_views.py`
**Classification**: `ignore-as-correct`

Proper pagination with manual offset/limit. Admin can view other users' history.

### 38. `backend/apps/applications/_view_helpers.py`
**Classification**: `ignore-as-correct`

Payment summary annotations use proper subqueries. Application number generation has collision retry logic.

### 39. `backend/apps/applications/document_views.py`
**Classification**: `ignore-as-correct`

Document verification with audit logging. Acceptance letter and finance receipt generation with idempotency.

---

## Priority-Ordered Action Items

### P0 — Fix Immediately

| ID | File | Finding | Impact |
|----|------|---------|--------|
| DV-1 | `documents/views.py` | `PaymentVerifyView` has no rate limiting | Lenco API amplification; potential account lockout or rate-limit ban from Lenco |
| DV-2 | `documents/views.py` | `PaymentInitiateView` has no rate limiting | Payment record flooding; 5-attempt limit exhaustion |

**Recommended fix**: Add `UserRateThrottle` classes (e.g., `'10/min'` for verify, `'5/min'` for initiate) matching the existing `SubmitRateThrottle` pattern.

### P1 — Fix This Sprint

| ID | File | Finding | Impact |
|----|------|---------|--------|
| SV-1 | `student_views.py` | Duplicate return in `ApplicationPreviewSummaryView` | Dead code; possible missing logic between returns |
| DV-3 | `documents/views.py` | Raw phone number stored in payment metadata | PII in JSON field violates platform convention |
| IV-1 | `interview_views.py` | Arbitrary interview status values accepted | Data integrity risk; no status whitelist on generic update path |
| DT-1 | `documents/tasks.py` | Payment expiry bypasses `PaymentService` | Application payment_status not synced on expiry |
| PS-1 | `payment_service.py` | `payment_id=None` returned for already-paid apps | Frontend receives string `"None"` as payment ID |

### P2 — Fix Next Sprint

| ID | File | Finding | Impact |
|----|------|---------|--------|
| DS-1 | `documents/serializers.py` | `ProgramFeeSerializer` rejects `late_application` fee type | Cannot create late fees via admin API |
| DV-5 | `documents/views.py` | `PaymentReceiptView` missing envelope | Contract drift |
| DV-6 | `documents/views.py` | `PaymentListView` non-paginated path missing envelope | Contract drift |
| DV-7 | `documents/views.py` | `DocumentExtractView` missing envelope | Contract drift |
| IV-2 | `interview_views.py` | Interview list endpoints missing envelope | Contract drift |
| SV-2 | `student_views.py` | Draft deletion destroys payment records | Financial audit trail loss |
| AV-3 | `admin_views.py` | Export truncation not communicated | Silent data loss for large exports |

### P3 — Track / Low Priority

| ID | File | Finding | Impact |
|----|------|---------|--------|
| JV-1 | `documents/job_views.py` | Scaffold endpoints return hardcoded data | Stale paths; no envelope |
| IS-1 | `interview_service.py` | Unused `hashlib` import | Dead import |
| DV-4 | `documents/views.py` | Dev bypass skips forward-only transitions | Risk if DEBUG leaks to production |
| AV-2 | `admin_views.py` | Bulk status confirmation token is predictable | Defense-in-depth only; CSRF already protects |
| PS-3 | `payment_service.py` | `_PAYMENT_TO_APP_STATUS` recreated per call | Minor inefficiency |

---

## Summary Statistics

| Classification | Count |
|----------------|-------|
| `confirmed-bug` | 2 (SV-1 duplicate return, PS-1 None payment_id) |
| `zero-day-class-risk` | 4 (DV-1 verify rate limit, DV-2 initiate rate limit, DV-3 PII in metadata, IV-1 arbitrary status) |
| `improve` | 5 files (payment_service, documents/views, documents/serializers, documents/tasks, interview_views) |
| `suspicious-stale-path` | 1 (job_views.py scaffold endpoints) |
| `ignore-as-correct` | 26 files |
| `needs-human-decision` | 0 |
| `remove` | 0 |

---

## Positive Observations

1. **Payment security is strong**: HMAC-SHA512 with constant-time comparison, forward-only transitions with row-level locking, amount mismatch detection at three layers (verify, webhook, _update_payment_status).
2. **Webhook processing is idempotent**: Dedup check, event logging regardless of signature validity, proper error isolation.
3. **State machine is well-enforced**: Single `ALLOWED_TRANSITIONS` map, `select_for_update()` used consistently, TOCTOU re-checks in critical paths.
4. **Submission gates are comprehensive**: Payment check, identity document check, intake capacity with atomic increment, duplicate detection, late fee enforcement.
5. **All URL parameters use UUID types**: No SQL injection vectors through URL routing.
6. **Business logic services follow consistent patterns**: Custom error classes, static methods, locking, notification helpers.
