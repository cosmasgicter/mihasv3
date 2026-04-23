# Hardening Contract Audit Results

**Date:** 2026-04-23  
**Auditor:** harden-contract orchestrated session  

---

## C1: SessionView missing envelope

**Status:** FALSE POSITIVE  
**Severity:** N/A  

**Evidence:**  
The finding conflates two different endpoints:

1. `SessionView` at `GET /api/v1/auth/session/` — returns the current authenticated user. This is a bootstrap endpoint, not a list endpoint. It returns `{"user": {...}}` or `{"user": null}` by design (lines 645–690 of `backend/apps/accounts/views.py`). This is correct — it's not a list endpoint and doesn't need the `{"success": true, "data": [...]}` envelope.

2. `SessionListView` at `GET /api/v1/sessions/` — lists active device sessions. This endpoint **does** use the correct envelope format. Line 91 of `backend/apps/accounts/session_views.py`:
   ```python
   return Response({"success": True, "data": data})
   ```
   where `data` is a list of session objects.

Both endpoints are correctly implemented for their respective contracts.

---

## C2: RefreshView wrong error code

**Status:** CONFIRMED  
**Severity:** HIGH  

**Evidence:**  
`RefreshView` in `backend/apps/accounts/views.py` (lines 310–370) returns **inconsistent** error codes for expired/blacklisted tokens:

| Condition | Error Code | Expected per Contract |
|-----------|-----------|----------------------|
| No refresh cookie (line 318) | `NO_REFRESH_TOKEN` ✅ | `NO_REFRESH_TOKEN` |
| `jwt.ExpiredSignatureError` (line 338) | `REFRESH_EXPIRED` ❌ | `TOKEN_EXPIRED` |
| `ValueError` — revoked/blacklisted (line 343) | `TOKEN_BLACKLISTED` ⚠️ | `TOKEN_EXPIRED` |
| `jwt.InvalidTokenError` (line 349) | `REFRESH_EXPIRED` ❌ | `TOKEN_EXPIRED` |
| Generic exception (line 354) | `REFRESH_EXPIRED` ❌ | `TOKEN_EXPIRED` |

The product contract states: *"Token refresh uses distinct error codes: `NO_REFRESH_TOKEN` when the cookie is missing, `TOKEN_EXPIRED` for expired/blacklisted/invalid tokens."*

The `REFRESH_EXPIRED` code is not documented in the contract and will cause the frontend refresh interceptor to fail to recognize the error and trigger the correct recovery flow.

**Fix required:** Change all `REFRESH_EXPIRED` codes to `TOKEN_EXPIRED`. The `TOKEN_BLACKLISTED` code should also be `TOKEN_EXPIRED` per the contract (frontend only distinguishes missing vs expired).

---

## C3: Payment status check in approval

**Status:** CONFIRMED  
**Severity:** MEDIUM  

**Evidence:**  
In `backend/apps/applications/admin_views.py`, the `ApplicationReviewView.post()` method (around line 195) checks payment before approval:

```python
if new_status == "approved" and not force:
    has_verified = (
        app.payment_status in ("successful", "force_approved")
        or Payment.objects.filter(
            application_id=application_id,
            status__in=("successful", "force_approved")
        ).exists()
    )
```

This check only looks for `successful` and `force_approved`. It does **not** handle legacy statuses `paid` or `verified` which may exist in older records. The product contract states: *"Treat legacy `verified` and current paid/successful payment outcomes as equivalent verified states."*

An application with a legacy `paid` or `verified` payment status would be incorrectly blocked from approval without `force=true`.

**Fix required:** Add `"paid"` and `"verified"` to both the `app.payment_status in (...)` check and the `Payment.objects.filter(status__in=(...))` query.

---

## C4: waitlist_cascade_task format

**Status:** ALREADY-FIXED  
**Severity:** N/A  

**Evidence:**  
In `backend/apps/applications/tasks.py`, the `waitlist_cascade_task` (around line 370) generates application numbers using:

```python
new_app_number = f"APP-{now.strftime('%Y%m%d')}-{uuid_mod.uuid4().hex[:8].upper()}"
```

This produces the format `APP-YYYYMMDD-XXXXXXXX` which matches the documented contract pattern `APP-YYYYMMDD-XXXXXXXX`. The format is correct.

---

## C5: email_verified not set on registration

**Status:** CONFIRMED  
**Severity:** MEDIUM  

**Evidence:**  
In `backend/apps/accounts/views.py`, the `RegisterView.post()` method (lines 430–460) creates a profile:

```python
profile = Profile.objects.create(
    email=data["email"],
    password_hash=hash_password(data["password"]),
    first_name=data["first_name"],
    last_name=data["last_name"],
    phone=data.get("phone", ""),
    nationality=data.get("nationality", "Zambian"),
    role="student",
    is_active=True,
)
```

The `email_verified` field is **not set**. The model definition (line 31 of `models.py`) is:
```python
email_verified = models.BooleanField(null=True, blank=True)
```

Since there's no `default=False` on the model and the field is `null=True`, new profiles get `email_verified=NULL` instead of `False`. This means:
- `if profile.email_verified:` → `False` (correct by accident)
- `if profile.email_verified is False:` → `False` (incorrect — it's `None`)
- `if profile.email_verified is not None:` → `True` (incorrect — implies it was set)

Any code that distinguishes "never verified" (`False`) from "unknown" (`None`) will behave incorrectly.

**Fix required:** Add `email_verified=False` to the `Profile.objects.create()` call in `RegisterView.post()`.

---

## C6: cleanup_stale_sessions_task missing from Beat

**Status:** FALSE POSITIVE  
**Severity:** N/A  

**Evidence:**  
`cleanup_stale_sessions_task` **is** present in `CELERY_BEAT_SCHEDULE` in `backend/config/settings/base.py` (lines 160–163):

```python
"cleanup-stale-sessions": {
    "task": "apps.accounts.tasks.cleanup_stale_sessions_task",
    "schedule": crontab(hour=2, minute=30),
},
```

It runs daily at 02:30 UTC.

---

## C7: Draft deletion already fixed

**Status:** ALREADY-FIXED  
**Severity:** N/A  

**Evidence:**  
In `backend/apps/applications/student_views.py`, the `_delete_application_graph` static method (lines 155–166) uses pure ORM-based deletion in FK-safe order within a transaction:

```python
@staticmethod
def _delete_application_graph(application_id):
    """Delete an application and all dependents via ORM in FK-safe order."""
    with transaction.atomic():
        ApplicationDocument.objects.filter(application_id=application_id).delete()
        ApplicationGrade.objects.filter(application_id=application_id).delete()
        Payment.objects.filter(application_id=application_id).delete()
        ApplicationStatusHistory.objects.filter(application_id=application_id).delete()
        ApplicationDraft.objects.filter(application_id=application_id).delete()
        ApplicationInterview.objects.filter(application_id=application_id).delete()
        ApplicationCondition.objects.filter(application_id=application_id).delete()
        ApplicationAmendment.objects.filter(application_id=application_id).delete()
        FeeWaiver.objects.filter(application_id=application_id).delete()
        Application.objects.filter(id=application_id).delete()
```

No raw SQL. Fully ORM-based. Wrapped in `transaction.atomic()`.

---

## C8: Document readiness split-brain already fixed

**Status:** CONFIRMED (partial — `deriveDraftResumeUploads` still uses URL fallbacks)  
**Severity:** LOW  

**Evidence:**  
The draft restoration paths in `useWizardController.ts` have been significantly improved. The server draft restoration path (around line 1040) now calls `hydrateServerDocuments()` which queries the actual documents API endpoint and uses `normalizeServerUploadedFiles()` to determine upload status from real document records — not from URL fields.

However, `deriveDraftResumeUploads` in `draftResume.ts` (lines 28–31) still uses URL fields as a fallback:

```typescript
export function deriveDraftResumeUploads(application: DraftResumeApplicationState) {
  return {
    result_slip: Boolean(application.result_slip_url),
    extra_kyc: Boolean(application.extra_kyc_url),
  }
}
```

This function is called in `handleLoadDraft` (line 1120 of `useWizardController.ts`) but its result is immediately overwritten by `hydrateServerDocuments`:

```typescript
const restoredUploads = {
    ...deriveDraftResumeUploads(draft),       // URL-based (overwritten below)
    result_slip: Boolean(hydratedServerUploads.result_slip),  // API-based (wins)
    extra_kyc: Boolean(hydratedServerUploads.extra_kyc),      // API-based (wins)
}
```

The spread-then-overwrite pattern means the URL fallback is effectively dead code in the upload status path. However, `resolveDraftResumeStepId` in `draftResume.ts` still uses `deriveDraftResumeUploads` to determine which wizard step to resume at, which could cause a step mismatch if the URL fields are stale.

**Risk:** Low — the step resolution is a convenience heuristic, not a data integrity issue. The actual upload status is always determined by the API.

---

## C9: Deferred payment UI already fixed

**Status:** ALREADY-FIXED  
**Severity:** N/A  

**Evidence:**

**paymentStatus.ts** (lines 22–24):
```typescript
export function requiresStudentPaymentAction(paymentStatus?: string | null) {
  const normalized = normalizePaymentStatus(paymentStatus)
  return normalized === 'not_paid' || normalized === 'rejected' || normalized === 'deferred'
}
```
✅ Returns `true` for `deferred`.

**SubmissionSuccess.tsx**:
- `getPaymentStatusStyles` (line 52): explicit `case 'deferred'` → warning styling ✅
- `getPaymentStatusDescription` (line 63): explicit `case 'deferred'` → "Payment deferred — you can pay anytime from your dashboard." ✅
- Conditional message (line 119): `submittedApplication.paymentStatus === 'deferred'` → shows deferred-specific copy ✅
- "Complete Payment Later" link (line 131): shown when `paymentStatus == null || paymentStatus === 'deferred'` ✅

All deferred payment paths have explicit handling.

---

## Summary

| Finding | Status | Severity | Action Required |
|---------|--------|----------|-----------------|
| C1: SessionView missing envelope | FALSE POSITIVE | — | None |
| C2: RefreshView wrong error code | **CONFIRMED** | **HIGH** | Change `REFRESH_EXPIRED` → `TOKEN_EXPIRED` |
| C3: Payment status check in approval | **CONFIRMED** | **MEDIUM** | Add `paid`, `verified` to approval check |
| C4: waitlist_cascade_task format | ALREADY-FIXED | — | None |
| C5: email_verified not set on registration | **CONFIRMED** | **MEDIUM** | Add `email_verified=False` to create() |
| C6: cleanup_stale_sessions_task missing | FALSE POSITIVE | — | None |
| C7: Draft deletion already fixed | ALREADY-FIXED | — | None |
| C8: Document readiness split-brain | CONFIRMED (partial) | LOW | `deriveDraftResumeUploads` still URL-based but overwritten by API |
| C9: Deferred payment UI already fixed | ALREADY-FIXED | — | None |

**3 findings require fixes (C2, C3, C5). 1 finding is low-risk partial (C8). 5 findings are false positives or already fixed.**
