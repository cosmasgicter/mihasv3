# Bugfix Requirements Document

## Introduction

This document addresses four bugs in the MIHAS admissions platform that collectively degrade the student application flow and admin review experience. The most critical bug prevents students from saving draft applications due to a silent authentication failure during token refresh. A misleading phone number placeholder causes validation errors. The Lenco payment widget lacks a test/sandbox bypass for development environments. Finally, the admin status change controls are not discoverable for draft-status applications because the `ApplicationApprovalActions` component only renders action buttons for specific statuses (`submitted`, `under_review`, `pending_review`) and shows nothing actionable for `draft` or `not_paid` states.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 — Draft Save Fails Silently (CRITICAL)**

1.1 WHEN a student clicks "Save Now" on the Personal Details step and the JWT access token has expired THEN the system attempts a token refresh via `POST /api/v1/auth/refresh/` which returns 401, and the subsequent PATCH/POST to `/api/v1/applications/` is never sent, causing the `useAutoSave` hook's `onSave` callback to throw, resulting in a "Save failed" status message and unsaved data

1.2 WHEN the token refresh returns 401 and the auto-save interval (8 seconds) fires THEN the system silently fails each auto-save cycle with exponential backoff retries that also fail, leaving the student with a persistent "Save failed" or "Saved locally — waiting to sync" status while believing their data is being persisted to the server

1.3 WHEN the refresh token cookie is expired or missing and the student triggers a manual save THEN the system does not redirect the student to sign in or display a clear authentication-expired message, instead showing a generic "Save failed" error that does not explain the root cause

**Bug 2 — Phone Number Placeholder Mismatch**

1.4 WHEN a student enters a phone number with spaces (e.g., "+260 97 123 4567") matching the placeholder text shown in the BasicKycStep form THEN the backend `validate_zambian_phone` validator rejects it because it requires the format `+260XXXXXXXXX` (no spaces), while the frontend Zod schema (`/^\+?[0-9]{7,15}$/`) strips or ignores spaces differently

1.5 WHEN the student sees the placeholder "e.g., +260 97 123 4567" on the phone input field THEN the system misleads the student into entering a format that will fail backend validation, creating a confusing validation error on step transition or save

**Bug 3 — Payment Widget Test Environment**

1.6 WHEN the Lenco payment widget loads in a development or test environment THEN the system requires real payment credentials and a real Lenco transaction to proceed past the payment step, blocking end-to-end testing and development of the post-payment flow (review, submission)

1.7 WHEN a student's application has been successfully created but the Lenco widget cannot complete a transaction in the test environment THEN the student cannot reach the application review and submission stages, making the full application flow untestable without production payment credentials

**Bug 4 — Admin Approval Not Discoverable for Draft Applications**

1.8 WHEN an admin opens the ApplicationDetailModal for an application with status "draft" THEN the `ApplicationApprovalActions` component renders no status transition buttons because the component only shows action buttons for `submitted` and `under_review` statuses, leaving the admin with no visible way to change the application status

1.9 WHEN an admin views an application with payment_status "not_paid" (displayed as "Awaiting Payment") THEN the `ApplicationApprovalActions` component renders no payment action buttons because it only shows Verify/Reject buttons for `pending_review` status and a Reopen button for `rejected` status, providing no mechanism to transition from the initial `not_paid` state

### Expected Behavior (Correct)

**Bug 1 — Draft Save Fails Silently**

2.1 WHEN a student clicks "Save Now" and the JWT access token has expired THEN the system SHALL silently refresh the token and retry the save request, and if the refresh itself fails with 401 THEN the system SHALL display a clear "Session expired — please sign in again" message and redirect to the sign-in page after a brief delay

2.2 WHEN the auto-save interval fires and the token refresh fails THEN the system SHALL stop retrying cloud saves, preserve the data in localStorage, and display a clear "Session expired" notification that guides the student to sign in again, rather than silently cycling through failed retries

2.3 WHEN the refresh token is expired or missing during a manual save THEN the system SHALL detect the authentication failure, display an actionable "Your session has expired. Please sign in to continue." message, and provide a sign-in link or automatic redirect

**Bug 2 — Phone Number Placeholder Mismatch**

2.4 WHEN the phone input field is rendered in the BasicKycStep THEN the system SHALL display a placeholder that matches the backend-accepted format, specifically "e.g., +260XXXXXXXXX" or "e.g., +260971234567" (no spaces)

2.5 WHEN a student enters a phone number with spaces THEN the system SHALL either strip spaces before validation (normalizing the input) or display a clear inline validation error that specifies the required format without spaces, before the data reaches the backend

**Bug 3 — Payment Widget Test Environment**

2.6 WHEN the application is running in a development or test environment (determined by environment variable or Vite mode) THEN the system SHALL provide a mechanism to bypass or simulate the Lenco payment step so that the post-payment flow can be tested without real payment credentials

2.7 WHEN a test/development bypass is used to skip payment THEN the system SHALL update the application's payment status to a verified-equivalent state so that the submission gate (`submit_application`) does not block on payment checks

**Bug 4 — Admin Approval Not Discoverable**

2.8 WHEN an admin opens the ApplicationDetailModal for a "draft" status application THEN the system SHALL display contextual information explaining that the application is still in draft and has not been submitted, and if appropriate, provide an admin action to force-submit or transition the status

2.9 WHEN an admin views an application with payment_status "not_paid" THEN the system SHALL provide a visible admin action to override the payment status (e.g., "Mark as Paid" or "Force Approve Payment") so that offline or manual payments can be recorded without requiring the student to go through the Lenco widget

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the JWT access token is valid and the student saves the application THEN the system SHALL CONTINUE TO send the PATCH request to `/api/v1/applications/{id}/` and display "Saved" status on success

3.2 WHEN the auto-save interval fires and the network is available with valid auth THEN the system SHALL CONTINUE TO auto-save every 8 seconds with change detection and display the correct save status

3.3 WHEN the student is offline THEN the system SHALL CONTINUE TO save data to localStorage and display "offline" status, then sync when connectivity returns

3.4 WHEN a student enters a phone number in the correct format "+260XXXXXXXXX" without spaces THEN the system SHALL CONTINUE TO accept it without validation errors on both frontend and backend

3.5 WHEN the application is running in production THEN the system SHALL CONTINUE TO require real Lenco payment completion before allowing submission — no test bypass shall be available in production

3.6 WHEN an admin opens the ApplicationDetailModal for a "submitted" or "under_review" application THEN the system SHALL CONTINUE TO display the existing Review/Approve/Reject buttons as currently implemented

3.7 WHEN an admin uses the payment Verify/Reject buttons for a "pending_review" payment THEN the system SHALL CONTINUE TO open the review dialog with notes and process the update through `onPaymentStatusUpdate`

3.8 WHEN the `submit_application` service is called THEN the system SHALL CONTINUE TO enforce payment verification, identity document upload, intake deadline, and duplicate checks before transitioning to "submitted" status
