# Bugfix Requirements Document

## Introduction

A super_admin POSTing `{"new_status":"submitted"}` to `POST /api/v1/applications/{id}/review/` triggered a 500 Internal Server Error four times in production. The root cause was a signature drift: `ApplicationReviewView.post()` passed `notes=bypass_notes` to `submit_application()`, but the canonical-truth refactor (commit `3ed848451`) had removed the `notes` parameter from `submit_application()` in `services.py`. The resulting `TypeError: submit_application() got an unexpected keyword argument 'notes'` was uncaught — the surrounding `try` only handles `ApplicationSubmissionError`, so the exception propagated and DRF returned a bare 500.

The immediate fix shipped (commit `9979a07fd`), removing the unsupported kwarg. This spec is the **hardening pass** to ensure:
1. No uncaught exception in `ApplicationReviewView.post()` can produce a bare 500 without structured error envelope and observability.
2. Caller-to-service signature drift is detected at test time before it reaches production.
3. The fix is validated via a bug-condition reproducer.
4. All existing happy-path and structured-error behaviors are preserved.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `ApplicationReviewView.post()` calls a service function (`submit_application`, `transition_application_status`) with keyword arguments not present in the service function's signature THEN the system raises an uncaught `TypeError` that propagates to DRF's default exception handler and returns HTTP 500 with no structured error envelope

1.2 WHEN any exception other than `ApplicationSubmissionError` or `ValueError` is raised inside the `new_status == "submitted"` branch of `ApplicationReviewView.post()` THEN the system returns HTTP 500 with no structured error envelope, no GlitchTip capture with contextual tags, and no structured log line

1.3 WHEN any exception other than `ApplicationSubmissionError`, `ValueError`, or `ConditionError` is raised inside the general transition branch of `ApplicationReviewView.post()` THEN the system returns HTTP 500 with no structured error envelope, no GlitchTip capture with contextual tags, and no structured log line

1.4 WHEN a `TypeError` occurs due to caller-service signature drift THEN the system provides no test-time detection mechanism — the drift is only discovered at runtime when the code path is exercised in production

### Expected Behavior (Correct)

2.1 WHEN `ApplicationReviewView.post()` calls a service function with keyword arguments not present in the service function's signature THEN the system SHALL detect this at test time via a drift-guard property test that introspects `submit_application` and `transition_application_status` signatures and asserts every caller in `backend/apps/applications/` passes only kwargs present in those signatures

2.2 WHEN any uncaught exception (including `TypeError`, `AttributeError`, `RuntimeError`, or any other `Exception` subclass) is raised inside `ApplicationReviewView.post()` THEN the system SHALL return HTTP 500 with the canonical structured envelope `{"success": false, "error": "An internal error occurred while processing this review.", "code": "INTERNAL_ERROR"}` instead of a bare DRF 500

2.3 WHEN any uncaught exception is raised inside `ApplicationReviewView.post()` THEN the system SHALL call `sentry_sdk.capture_exception()` with tags `application_id`, `target_new_status`, `actor_id`, `actor_role`, and `view_class` (all non-PII values) before returning the structured 500 envelope

2.4 WHEN any uncaught exception is raised inside `ApplicationReviewView.post()` THEN the system SHALL emit a structured log line at ERROR level containing `application_id`, `target_new_status`, `actor_id` (UUID only), `actor_role`, and `exception_type` — with no PII (no names, emails, phone numbers, NRC, or passport numbers) in the log payload

2.5 WHEN a caller in `backend/apps/applications/` (excluding `tests/`) invokes `submit_application` or `transition_application_status` with any kwarg not in the function's `inspect.signature().parameters` THEN the drift-guard test SHALL fail, preventing the regression from reaching production

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an admin POSTs `{"new_status":"approved", "force": true, "reason": "..."}` to an application with unverified payment THEN the system SHALL CONTINUE TO return HTTP 200 with `{"success": true, "data": {"message": "Status updated from ... to approved", ...}}`

3.2 WHEN an admin POSTs `{"new_status":"submitted"}` to a valid application (post-fix) THEN the system SHALL CONTINUE TO call `submit_application()` with `admin_force=True` and return HTTP 200 with the transition result

3.3 WHEN an admin POSTs `{"new_status":"under_review"}` to a submitted application THEN the system SHALL CONTINUE TO call `transition_application_status()` and return HTTP 200 with the transition result

3.4 WHEN an admin POSTs `{"paymentStatus":"verified"}` THEN the system SHALL CONTINUE TO process the payment status update branch and return HTTP 200 with the payment update result

3.5 WHEN `submit_application()` raises `ApplicationSubmissionError` THEN the system SHALL CONTINUE TO return HTTP 400 with `{"success": false, "error": exc.message, "code": exc.code}`

3.6 WHEN `transition_application_status()` raises `ValueError` (invalid transition) THEN the system SHALL CONTINUE TO return HTTP 400 with `{"success": false, "error": str(exc), "code": "INVALID_TRANSITION"}`

3.7 WHEN the application ID does not exist THEN the system SHALL CONTINUE TO return HTTP 404 with `{"success": false, "error": "Application not found", "code": "NOT_FOUND"}`

3.8 WHEN an admin POSTs `{"new_status":"conditionally_approved", "conditions": [...]}` THEN the system SHALL CONTINUE TO route through `ConditionManager.assign_conditions()` and return the appropriate response

3.9 WHEN an admin POSTs `{"new_status":"waitlisted"}` THEN the system SHALL CONTINUE TO assign a waitlist position and send the `waitlist_position_assigned` communication

3.10 WHEN an admin POSTs `{"new_status":"rejected"}` to a waitlisted application THEN the system SHALL CONTINUE TO trigger `WaitlistManager.promote_next()` after the transition

3.11 WHEN the `PAYMENT_HARDENING_FORCE_APPROVED` flag is enabled and an admin verifies payment on an application with no prior Payment row THEN the system SHALL CONTINUE TO route through `PaymentService.force_approve()` and return the payment update result

3.12 WHEN Sentry tags are emitted on the 500 path THEN the tag values SHALL CONTINUE TO contain no PII — only UUIDs, role strings, status strings, and class names

---

## Bug Condition Derivation

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ReviewRequest (application_id, new_status, kwargs_passed_to_service)
  OUTPUT: boolean

  // The bug triggers when the view passes kwargs to a service function
  // that are not in that function's signature
  LET service_fn = resolve_service_function(X.new_status)
  LET valid_params = inspect.signature(service_fn).parameters.keys()
  LET caller_kwargs = X.kwargs_passed_to_service.keys()
  
  RETURN EXISTS k IN caller_kwargs WHERE k NOT IN valid_params
END FUNCTION
```

Concrete instance: `isBugCondition({new_status: "submitted", kwargs: {notes: "..."}})` → `True` because `submit_application` has no `notes` parameter.

### Fix Checking Property

```pascal
// Property: Fix Checking — Structured 500 on uncaught exceptions
FOR ALL X WHERE isBugCondition(X) DO
  response ← ApplicationReviewView.post'(X)
  ASSERT response.status_code = 500
  ASSERT response.data["success"] = false
  ASSERT response.data["code"] = "INTERNAL_ERROR"
  ASSERT sentry_sdk.capture_exception was called with tags
END FOR
```

```pascal
// Property: Fix Checking — Drift guard catches at test time
FOR ALL callers C in backend/apps/applications/*.py (excluding tests/) DO
  FOR ALL calls to submit_application or transition_application_status in C DO
    LET call_kwargs = extract_keyword_arguments(call)
    LET sig_params = inspect.signature(target_function).parameters.keys()
    ASSERT call_kwargs ⊆ sig_params
  END FOR
END FOR
```

### Preservation Checking Property

```pascal
// Property: Preservation — Non-buggy inputs behave identically
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
  // i.e., valid review requests produce identical responses before and after the fix
END FOR
```

---

## Test Plan Summary

| Test Type | Location | Coverage |
|-----------|----------|----------|
| Bug-condition reproducer (TypeError-as-500) | `backend/tests/property/test_admin_review_500_bug_condition.py` | Reproduces the exact failure: calling `submit_application` with unsupported kwarg triggers structured 500 instead of bare 500 |
| Drift-guard property test | `backend/tests/property/test_admin_review_signature_drift.py` | AST-walks `backend/apps/applications/*.py`, introspects service signatures, asserts no caller passes unknown kwargs |
| Structured 500 envelope unit test | `backend/tests/unit/test_admin_review_500_hardening.py` | Mocks service to raise `TypeError`/`RuntimeError`/`Exception`, asserts canonical envelope + sentry capture + structured log |
| Preservation unit tests | `backend/tests/unit/test_admin_review_500_preservation.py` | Happy paths (approved force, submitted, under_review, payment update, conditions, waitlist, rejection) + structured 400/404/409 responses unchanged |
| Observability unit test | `backend/tests/unit/test_admin_review_500_hardening.py` | Asserts `sentry_sdk.capture_exception()` called with correct non-PII tags on every 500 path |
