# Bugfix Requirements Document

## Introduction

This document addresses five confirmed bugs across the admissions and approval flows in the MIHAS platform. These bugs collectively affect: condition verification persistence (backend), admin UI for conditionally approved applications (frontend), developer payment testing workflow (frontend), auto-save auth recovery data loss (frontend), and inaccurate review SLA timestamps (backend). Each bug has been verified against the source code and represents a real defect in production or development workflows.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 — condition_manager.py verify_condition() update_fields mismatch**

1.1 WHEN an admin verifies a condition via `ConditionManager.verify_condition()` and the code sets `condition.verified_by_id = admin_id` then calls `condition.save(update_fields=["status", "met_at", "verified_by", "updated_at"])` THEN the system uses `"verified_by"` (the Django field name) in `update_fields` while the value was assigned to `verified_by_id` (the column attribute) — Django resolves this correctly for FK fields, but the pattern is fragile and inconsistent with Django best practices where `update_fields` should use the same attribute name used for assignment

1.2 WHEN `condition.save(update_fields=["status", "met_at", "verified_by", "updated_at"])` is called and the `ApplicationCondition` model has `updated_at = DateTimeField(auto_now=True)` with `managed = False` THEN the system relies on Django's `auto_now` behavior to set `updated_at` during save — however, since the model is unmanaged and the table is created via raw SQL, the `auto_now=True` only works at the Django ORM level and does not create a database-level trigger, meaning if any code path bypasses the ORM (raw SQL, bulk updates), `updated_at` will not be set

1.3 WHEN `verify_condition()` completes the save inside a `transaction.atomic()` block but the subsequent notification call (`CommunicationService.send`) fails with an exception THEN the system catches the exception and logs it but the condition verification has already been committed — this is correct behavior, but the notification failure is silently swallowed with only a log entry, providing no feedback to the admin that the student was not notified

**Bug 2 — ApplicationApprovalActions missing conditionally_approved status handling**

1.4 WHEN an admin opens the approval actions panel for an application with status `conditionally_approved` THEN the system renders NO application status action buttons because the component only handles `draft`, `submitted`, `under_review`, `approved`, and `rejected` statuses — the admin sees an empty status controls section with no way to manage the application

1.5 WHEN an admin views a conditionally approved application THEN the system provides no UI to view attached conditions, verify individual conditions, or manually transition the application to `approved` or `rejected` from the approval actions component

1.6 WHEN an admin views an application with status `waitlisted`, `enrolled`, `withdrawn`, `expired`, or `enrollment_expired` THEN the system renders no status indicator or contextual information in the approval actions panel, leaving the admin with a blank controls area

**Bug 3 — Payment dev bypass not wired in frontend PaymentStep**

1.7 WHEN a developer runs the admissions app locally with `VITE_PAYMENT_DEV_BYPASS=true` in their environment THEN the `PaymentStep.tsx` component does not read or act on this environment variable — there is no dev bypass button, no simulated payment flow, and no way to skip the Lenco payment gateway in development

1.8 WHEN a developer attempts to test the full application wizard flow locally THEN the system blocks at the payment step because the Lenco gateway does not work on localhost, and neither `PaymentStep.tsx` nor `PaymentForm.tsx` implement any mechanism to call the existing backend `PaymentDevBypassView` (`POST /api/v1/payments/dev-bypass/`) endpoint

1.9 WHEN the backend already has `PAYMENT_DEV_BYPASS` in `base.py` settings and a working `PaymentDevBypassView` endpoint, and the `.env.example` already documents `VITE_PAYMENT_DEV_BYPASS=false` THEN the frontend has zero code that references `VITE_PAYMENT_DEV_BYPASS`, making the documented env var a dead configuration

**Bug 4 — useAutoSave auth recovery does not re-trigger cloud save for dirty data**

1.10 WHEN a student's JWT session expires while they are actively editing the wizard form THEN the system correctly stops cloud saves (sets `authExpiredRef.current = true`) and continues saving to localStorage, but form changes entered during the expired-auth window are never added to the `saveQueue` array

1.11 WHEN the `mihas:auth-recovered` event fires after the student re-authenticates THEN the `handleAuthRecovered` handler resets `authExpiredRef` and calls `processSaveQueue()`, but `processSaveQueue()` only processes items in the `saveQueue` array — since auth expiry does not queue saves, the queue is empty, and the current dirty form data is never synced to the server

1.12 WHEN auth recovers and the save queue is empty THEN the system sets `saveStatus` to `'idle'` and waits for the next auto-save interval (up to 8 seconds) before the dirty data is synced — during this gap, if the student navigates away or the page unloads, their changes entered during the expired-auth window are lost from the server (only preserved in localStorage)

**Bug 5 — review_started_at set on student self-submit transition**

1.13 WHEN a student submits their application (triggering `transition_application_status()` with `draft → submitted`) and `application.review_started_at` is `None` THEN the system unconditionally sets `review_started_at = timezone.now()` because the code checks `if not application.review_started_at` without filtering by target status — this records the submission timestamp as the review start time

1.14 WHEN an admin later views the application's review SLA metrics THEN the system calculates review duration from `review_started_at` (which was set at student submission time) rather than from when an admin actually began reviewing, making SLA calculations inaccurate and inflated

1.15 WHEN the `review_sla_reminder_task` (daily at 07:00 UTC) checks for applications exceeding the review SLA threshold THEN the system uses the inflated `review_started_at` timestamp, potentially triggering false SLA breach alerts for applications that were recently submitted but not yet picked up for review


### Expected Behavior (Correct)

**Bug 1 — condition_manager.py verify_condition() update_fields**

2.1 WHEN an admin verifies a condition via `ConditionManager.verify_condition()` THEN the system SHALL use consistent attribute naming in `update_fields` — either use `"verified_by_id"` to match the assignment `condition.verified_by_id = admin_id`, or assign via `condition.verified_by_id = admin_id` and list `"verified_by"` in `update_fields` (which Django resolves correctly for FK fields) — the key requirement is that the verifier identity is reliably persisted to the database after save

2.2 WHEN `verify_condition()` saves the condition with `update_fields` THEN the system SHALL ensure `updated_at` is explicitly set to `timezone.now()` before calling `save()`, rather than relying solely on `auto_now=True` behavior, to guarantee the timestamp is persisted even when `update_fields` is used on an unmanaged model

2.3 WHEN the post-verification notification to the student fails THEN the system SHALL continue to commit the condition verification (current behavior is correct) but SHALL log the failure at WARNING level with sufficient context (condition ID, application ID, student ID) for operational monitoring

**Bug 2 — ApplicationApprovalActions conditionally_approved handling**

2.4 WHEN an admin opens the approval actions panel for an application with status `conditionally_approved` THEN the system SHALL display a "Conditionally Approved" status indicator and provide action buttons to: (a) view/manage attached conditions, (b) manually approve the application (bypassing condition auto-promotion), and (c) reject the application

2.5 WHEN an admin views a conditionally approved application THEN the system SHALL display contextual information indicating the application is pending condition resolution, and provide a link or inline section to view the conditions and their statuses

2.6 WHEN an admin views an application with status `waitlisted`, `enrolled`, `withdrawn`, `expired`, or `enrollment_expired` THEN the system SHALL display an appropriate status badge with contextual information (e.g., waitlist position for `waitlisted`, enrollment deadline for `enrolled`) rather than rendering an empty controls area

**Bug 3 — Payment dev bypass in frontend**

2.7 WHEN a developer runs the admissions app locally with `VITE_PAYMENT_DEV_BYPASS=true` and `import.meta.env.DEV` is `true` THEN the `PaymentStep` component SHALL render a visually distinct "Simulate Payment (Dev)" button that calls the backend `PaymentDevBypassView` endpoint (`POST /api/v1/payments/dev-bypass/`) to create a simulated successful payment record

2.8 WHEN the dev bypass button is clicked THEN the system SHALL call the backend dev-bypass endpoint with the application ID, and on success SHALL update the local payment status to `successful` via `onPaymentStatusChange` so the wizard can proceed to the next step

2.9 WHEN the application is running in production (where `import.meta.env.DEV` is `false`) THEN the system SHALL NOT render any dev bypass button regardless of environment variable values — the bypass SHALL be completely absent from production builds

**Bug 4 — useAutoSave auth recovery immediate save**

2.10 WHEN the `mihas:auth-recovered` event fires after re-authentication THEN the system SHALL immediately trigger a full save cycle with the current form data (calling `saveData()` or equivalent) in addition to processing any queued saves, ensuring that dirty data entered during the expired-auth window is synced to the server without waiting for the next auto-save interval

2.11 WHEN auth recovers and the immediate save cycle completes successfully THEN the system SHALL update `saveStatus` to `'saved'`, clear `saveError`, and update `lastSaved` to reflect the successful sync

2.12 WHEN auth recovers but the immediate save cycle fails (e.g., network error) THEN the system SHALL fall back to the existing retry mechanism (exponential backoff) rather than silently dropping the data

**Bug 5 — review_started_at only on actual review transitions**

2.13 WHEN `transition_application_status()` is called with a target status of `under_review`, `conditionally_approved`, `approved`, or `rejected` and `review_started_at` is `None` THEN the system SHALL set `review_started_at = timezone.now()` because these transitions represent actual admin review activity

2.14 WHEN `transition_application_status()` is called with a target status of `submitted`, `waitlisted`, `enrolled`, `withdrawn`, `expired`, or `enrollment_expired` THEN the system SHALL NOT set `review_started_at`, preserving it as `None` (or its existing value) so that SLA calculations accurately reflect when admin review actually began

2.15 WHEN the `review_sla_reminder_task` checks for SLA breaches THEN the system SHALL only flag applications where `review_started_at` is set (indicating actual review has begun) and the elapsed time exceeds the threshold, avoiding false alerts for recently submitted applications

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an admin verifies a condition as `met` or `waived` and all conditions for the application are resolved THEN the system SHALL CONTINUE TO auto-promote the application to `approved` (if all met/waived) or auto-reject (if any expired) via `ConditionManager.auto_promote_if_all_met()`

3.2 WHEN an admin verifies a condition and the condition status is not `pending` THEN the system SHALL CONTINUE TO raise a `ConditionError` with code `CONDITION_NOT_PENDING`

3.3 WHEN an admin opens the approval actions panel for a `submitted` application THEN the system SHALL CONTINUE TO display the "Review" button that transitions to `under_review`

3.4 WHEN an admin opens the approval actions panel for an `under_review` application THEN the system SHALL CONTINUE TO display "Approve" and "Reject" buttons with the existing confirmation dialogs and payment verification gate

3.5 WHEN an admin uses the payment Verify/Reject/Defer buttons for a `pending_review` payment THEN the system SHALL CONTINUE TO open the review dialog with notes and process the update through `onPaymentStatusUpdate`

3.6 WHEN the application is running in production with real Lenco credentials THEN the system SHALL CONTINUE TO require real payment completion via the Lenco widget — no bypass mechanism shall be available

3.7 WHEN the student is online with valid auth and the auto-save interval fires THEN the system SHALL CONTINUE TO auto-save every 8 seconds with change detection, localStorage persistence, and cloud sync

3.8 WHEN the student goes offline THEN the system SHALL CONTINUE TO save to localStorage, queue saves, and process the queue when connectivity returns

3.9 WHEN an admin transitions an application from `under_review` to `approved` or `rejected` THEN the system SHALL CONTINUE TO set `reviewed_by_id`, `admin_feedback`, `admin_feedback_date`, and `decision_date` as currently implemented

3.10 WHEN `transition_application_status()` is called for any valid transition THEN the system SHALL CONTINUE TO enforce the `ALLOWED_TRANSITIONS` state machine, create an `ApplicationStatusHistory` record, and set `updated_at`


---

## Bug Condition Derivations

### Bug 1 — condition_manager.py verify_condition() update_fields

```pascal
FUNCTION isBugCondition_Bug1(X)
  INPUT: X of type ConditionVerification { condition_id, admin_id, target_status }
  OUTPUT: boolean

  // The bug triggers on every verify_condition() call because the
  // update_fields list always includes "updated_at" which relies on
  // auto_now=True on an unmanaged model, and uses "verified_by" while
  // assigning to "verified_by_id"
  RETURN X.target_status IN {"met", "waived"} AND condition(X.condition_id).status = "pending"
END FUNCTION

// Property: Fix Checking — updated_at explicitly set
FOR ALL X WHERE isBugCondition_Bug1(X) DO
  result ← verify_condition'(X.condition_id, X.target_status, X.admin_id)
  ASSERT result.updated_at IS NOT NULL
  ASSERT result.verified_by_id = X.admin_id
  ASSERT result.status = X.target_status
  ASSERT result.met_at IS NOT NULL
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_Bug1(X) DO
  ASSERT verify_condition(X) = verify_condition'(X)
  // Non-pending conditions still raise ConditionError
  // Invalid statuses still raise ConditionError
END FOR
```

### Bug 2 — ApplicationApprovalActions missing conditionally_approved

```pascal
FUNCTION isBugCondition_Bug2(X)
  INPUT: X of type ApplicationView { application_status }
  OUTPUT: boolean

  RETURN X.application_status IN {"conditionally_approved", "waitlisted", "enrolled", "withdrawn", "expired", "enrollment_expired"}
END FUNCTION

// Property: Fix Checking — unhandled statuses render meaningful UI
FOR ALL X WHERE isBugCondition_Bug2(X) DO
  rendered ← renderApprovalActions'(X)
  ASSERT rendered.hasStatusIndicator = true
  IF X.application_status = "conditionally_approved" THEN
    ASSERT rendered.hasActionButtons = true  // approve, reject, view conditions
  ELSE
    ASSERT rendered.hasStatusBadge = true    // informational badge
  END IF
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_Bug2(X) DO
  ASSERT renderApprovalActions(X) = renderApprovalActions'(X)
END FOR
```

### Bug 3 — Payment dev bypass not wired in frontend

```pascal
FUNCTION isBugCondition_Bug3(X)
  INPUT: X of type PaymentStepContext { isDev, devBypassEnabled, paymentSettled }
  OUTPUT: boolean

  RETURN X.isDev = true AND X.devBypassEnabled = true AND X.paymentSettled = false
END FUNCTION

// Property: Fix Checking — dev bypass button rendered and functional
FOR ALL X WHERE isBugCondition_Bug3(X) DO
  rendered ← renderPaymentStep'(X)
  ASSERT rendered.hasDevBypassButton = true
  ASSERT rendered.devBypassButton.callsEndpoint = "POST /api/v1/payments/dev-bypass/"
END FOR

// Property: Preservation Checking — production unaffected
FOR ALL X WHERE NOT isBugCondition_Bug3(X) DO
  ASSERT renderPaymentStep(X) = renderPaymentStep'(X)
  // In production (isDev=false), no bypass button exists regardless of env vars
END FOR
```

### Bug 4 — useAutoSave auth recovery missing immediate save

```pascal
FUNCTION isBugCondition_Bug4(X)
  INPUT: X of type AuthRecoveryContext { authWasExpired, hasDirtyData, saveQueueEmpty }
  OUTPUT: boolean

  RETURN X.authWasExpired = true AND X.hasDirtyData = true AND X.saveQueueEmpty = true
END FUNCTION

// Property: Fix Checking — dirty data synced on auth recovery
FOR ALL X WHERE isBugCondition_Bug4(X) DO
  result ← handleAuthRecovered'(X)
  ASSERT result.immediateSaveTriggered = true
  ASSERT result.currentDataSentToServer = true
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_Bug4(X) DO
  ASSERT handleAuthRecovered(X) = handleAuthRecovered'(X)
  // When auth was not expired, recovery is a no-op
  // When save queue is not empty, processSaveQueue still runs
END FOR
```

### Bug 5 — review_started_at set on student self-submit

```pascal
FUNCTION isBugCondition_Bug5(X)
  INPUT: X of type StatusTransition { old_status, new_status, review_started_at }
  OUTPUT: boolean

  RETURN X.new_status = "submitted" AND X.review_started_at IS NULL
END FUNCTION

// Property: Fix Checking — submitted transition does not set review_started_at
FOR ALL X WHERE isBugCondition_Bug5(X) DO
  result ← transition_application_status'(X.application, "submitted", X.changed_by)
  ASSERT result.application.review_started_at IS NULL
END FOR

// Property: Preservation Checking — review transitions still set review_started_at
FOR ALL X WHERE NOT isBugCondition_Bug5(X) DO
  ASSERT transition_application_status(X) = transition_application_status'(X)
  // Transitions to under_review, approved, rejected, conditionally_approved
  // still set review_started_at when it was previously NULL
END FOR
```
