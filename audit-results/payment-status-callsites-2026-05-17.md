# Payment Status Callsite Audit — 2026-05-17

Audit of raw payment status string usage across `backend/apps/applications/` and `backend/apps/documents/`.

**Legend:**
- ✅ = Uses a named constant/tuple (`PAYMENT_TO_APP_MAP`, `PAYMENT_READY_STATUSES`, `_RESOLVED_PAYMENT_STATUSES`, `CanonicalStatus` type, or `_FORWARD_ONLY_TRANSITIONS`)
- ⚠️ = Raw string but contextually correct (state machine definition, ORM filter on Payment.status column, or dev-bypass code)
- 🚩 = Raw string branching on payment status without using a named constant — flag for follow-up

---

## backend/apps/documents/payment_service.py

| Line | Usage | Verdict |
|------|-------|---------|
| 53–58 | `CanonicalStatus` Literal definition | ✅ Canonical source |
| 172–194 | `_FORWARD_ONLY_TRANSITIONS` keys | ✅ State machine definition |
| 201–207 | `PAYMENT_TO_APP_MAP` definition | ✅ Canonical source |
| 935 | `if new_status == "successful"` | ⚠️ Internal transition logic within PaymentService |
| 1064 | `status__in=("pending", "deferred")` | ⚠️ ORM filter on Payment.status (correct column) |
| 1088 | `.exclude(status="expired", ...)` | ⚠️ ORM filter on Payment.status |
| 1113 | `"successful", "verified", "force_approved"` | ⚠️ Already-paid guard in `initiate_payment` |
| 1210 | `status="pending"` | ⚠️ ORM filter on Payment.status |
| 1238 | `status__in=("pending", "deferred")` | ⚠️ ORM filter on Payment.status |

---

## backend/apps/documents/views.py

| Line | Usage | Verdict |
|------|-------|---------|
| 323 | `verification_status="pending"` | ⚠️ Document verification status, not payment |
| 458 | `payment.status not in ("successful", "force_approved")` | ⚠️ Receipt eligibility guard on Payment.status |
| 493 | `payment.status == "force_approved"` | ⚠️ Response flag for override indicator |
| 614–619 | Status choices list in validation | ⚠️ Input validation for allowed status values |
| 956 | `"status": "deferred"` | ⚠️ Response payload for deferred payment creation |
| 1044 | `application.payment_status in ("successful", "verified", "force_approved")` | 🚩 Already-paid check on `application.payment_status` — should use `PAYMENT_TO_APP_MAP` values or a named constant |
| 1237–1278 | `"status": "pending"` | ⚠️ Payment creation (setting initial status) |
| 1383 | `status="successful"` | ⚠️ Dev-bypass: creating Payment with status |
| 1397 | `payment.status = "successful"` | ⚠️ Dev-bypass: setting Payment.status |
| 1416 | `application.payment_status = "successful"` | 🚩 Dev-bypass sets `application.payment_status` to raw "successful" instead of using `PAYMENT_TO_APP_MAP["successful"]` ("verified") |
| 1431–1432 | Response payload `"status": "successful"` | ⚠️ API response (informational) |

---

## backend/apps/documents/fee_waiver_service.py

| Line | Usage | Verdict |
|------|-------|---------|
| 93 | `application.payment_status = "force_approved"` | 🚩 Sets `application.payment_status` to raw "force_approved" — should use `PAYMENT_TO_APP_MAP["force_approved"]` ("verified") or document why it uses the canonical status directly |

---

## backend/apps/documents/tasks.py

| Line | Usage | Verdict |
|------|-------|---------|
| 450 | `verification_status="pending"` | ⚠️ Document verification status, not payment |

---

## backend/apps/documents/payment_metrics.py

| Line | Usage | Verdict |
|------|-------|---------|
| 161 | `"expired"` | ⚠️ Metric label value |

---

## backend/apps/applications/admin_views.py

| Line | Usage | Verdict |
|------|-------|---------|
| 380 | `payment_status == "verified"` | ⚠️ Checking derived app status (correct value from PAYMENT_TO_APP_MAP) |
| 493 | `_RESOLVED_PAYMENT_STATUSES = ("successful", "force_approved", "verified", "paid", "deferred")` | ✅ Named constant |

---

## backend/apps/applications/review_queue.py

| Line | Usage | Verdict |
|------|-------|---------|
| 17 | `PAYMENT_READY_STATUSES = {"verified", "paid", "force_approved", "deferred"}` | ✅ Named constant |

---

## backend/apps/applications/services.py

| Line | Usage | Verdict |
|------|-------|---------|
| 163 | `Payment.objects.filter(..., status="successful")` | ⚠️ ORM filter on Payment.status — but misses `force_approved` |
| 200 | `application.payment_status in ("verified", "paid", "force_approved", "deferred")` | 🚩 Inline tuple — should reference a named constant |
| 240 | `Payment.objects.filter(..., status="successful", metadata__fee_type="late_application")` | ⚠️ ORM filter on Payment.status for late fee check |
| 243 | `application.payment_status != "force_approved"` | ⚠️ Force-approved bypass for late fee — contextually correct |

---

## backend/apps/applications/serializers.py

| Line | Usage | Verdict |
|------|-------|---------|
| 223 | `.filter(..., status="successful")` | ⚠️ ORM filter on Payment.status — but misses `force_approved` |
| 610 | `("verified", "Verified")` | ⚠️ Choice field definition for display |
| 612 | `("deferred", "Deferred")` | ⚠️ Choice field definition for display |

---

## backend/apps/applications/_view_helpers.py

| Line | Usage | Verdict |
|------|-------|---------|
| 57 | `.filter(application_id=OuterRef("pk"), status="successful")` | ⚠️ Subquery for latest successful payment — misses `force_approved` |
| 315 | `choices=["verified", "rejected"]` | ⚠️ Input validation for document verification status, not payment |

---

## backend/apps/applications/document_views.py

| Line | Usage | Verdict |
|------|-------|---------|
| 251 | `status__in=("successful", "force_approved", "verified", "paid")` | ⚠️ Inline tuple checking Payment.status — includes force_approved ✓ |

---

## backend/apps/applications/tasks.py

| Line | Usage | Verdict |
|------|-------|---------|
| 199 | `new_status="expired"` | ⚠️ Application status, not payment |
| 432 | `status="pending"` | ⚠️ Condition status, not payment |
| 441 | `condition.status = "expired"` | ⚠️ Condition status, not payment |
| 797 | `verification_status="verified"` | ⚠️ Document verification status |
| 849 | `status__in=("successful", "force_approved")` | ⚠️ ORM filter on Payment.status — includes force_approved ✓ |
| 870 | `verification_status="verified"` | ⚠️ Document verification status |

---

## backend/apps/applications/condition_manager.py

All references are to condition statuses (`"met"`, `"waived"`, `"expired"`, `"pending"`), not payment statuses. **No payment status concerns.**

---

## backend/apps/applications/amendment_service.py

All references are to amendment statuses (`"pending"`), not payment statuses. **No payment status concerns.**

---

## backend/apps/applications/enrollment_service.py

References are to enrollment/condition statuses (`"pending"`, `"expired"`), not payment statuses. **No payment status concerns.**

---

## backend/apps/applications/filters.py

References are to amendment/document/interview statuses, not payment statuses. **No payment status concerns.**

---

## backend/apps/applications/duplicate_checker.py

| Line | Usage | Verdict |
|------|-------|---------|
| 10 | `TERMINAL_STATUSES = {"rejected", "withdrawn", "expired", ...}` | ⚠️ Application statuses, not payment |

---

## Summary of Flagged Issues

| # | File | Line | Issue | Priority |
|---|------|------|-------|----------|
| 1 | `documents/views.py` | 1044 | Already-paid check uses inline raw strings on `application.payment_status` | Medium |
| 2 | `documents/views.py` | 1416 | Dev-bypass sets `application.payment_status = "successful"` — should be `"verified"` per PAYMENT_TO_APP_MAP | High |
| 3 | `documents/fee_waiver_service.py` | 93 | Sets `application.payment_status = "force_approved"` — inconsistent with PAYMENT_TO_APP_MAP which maps force_approved→verified | Medium (intentional? see ADR-002) |
| 4 | `applications/services.py` | 163 | `_application_has_completed_payment` only checks `status="successful"`, misses `force_approved` | Medium |
| 5 | `applications/services.py` | 200 | Submission gate uses inline tuple instead of named constant | Low |
| 6 | `applications/serializers.py` | 223 | Payment lookup only checks `status="successful"`, misses `force_approved` | Low |
| 7 | `applications/_view_helpers.py` | 57 | Subquery only checks `status="successful"`, misses `force_approved` | Low |

### Notes on Issue #3

`fee_waiver_service.py` sets `application.payment_status = "force_approved"` directly. Per ADR-002, `force_approved` is a first-class ledger status on the **Payment** model. However, `application.payment_status` is a *derived summary* column. The correct derived value per `PAYMENT_TO_APP_MAP` would be `"verified"`. This may be intentional to preserve audit visibility at the application level — needs team decision.

### Notes on Issue #2

The dev-bypass code in `views.py` sets `application.payment_status = "successful"` which is a canonical Payment status, not a valid derived application status. Per `PAYMENT_TO_APP_MAP`, the correct derived value should be `"verified"`. This is gated behind `require_not_dev_bypass_in_production` so it only affects non-production environments.
