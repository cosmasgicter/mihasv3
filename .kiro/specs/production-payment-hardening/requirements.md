# Requirements Document

## Introduction

The MIHAS admissions platform completed a Lenco payment gateway integration that introduced real-time payment via the Lenco inline widget, backend payment services (PaymentService, FeeResolver, WebhookProcessor), and supporting database tables. However, the system is not production-ready. This spec covers the hardening work needed: removing legacy manual payment code, adding admin payment management UI, enforcing mandatory identity document uploads, preventing race conditions, improving wizard resilience, and verifying the end-to-end flow and database integrity.

### CTO Review Notes (from live DB inspection via Neon MCP + codebase audit)

- **Conflicting unique constraints on `program_fees`**: The table has BOTH a full `UNIQUE (program_id, fee_type, residency_category)` constraint (`uq_program_fee_type_residency`) AND a partial unique index `uq_program_fee_active WHERE is_active = true`. The full constraint blocks soft-deleted records from being replaced with new active records. The full constraint must be dropped, keeping only the partial index.
- **No `nrc` or `passport` document_type records exist**: The `application_documents` table only has `application_slip`, `acceptance_letter`, and `finance_receipt` types. The column is `VARCHAR(100)` with no CHECK constraint. The wizard must use consistent type names (`nrc`, `passport`) for identity documents.
- **0 program_fees records**: No fees have been configured. The admin UI is critical for go-live. Seed data for the 4 existing programs (DRN, DCM, DEH, CPC — all K153 ZMW) should be inserted as part of the hardening.
- **25 existing applications have `payment_status = 'verified'`**: These were verified under the old manual system. The new Lenco flow uses `paid`/`successful`. The payment gate and admin review logic must treat `verified` as equivalent to `paid` for backward compatibility.
- **3 existing applications have `payment_status = 'rejected'`**: These need to be handled gracefully — students should be able to retry payment via Lenco.
- **~30+ frontend files still reference deprecated payment fields**: `pop_url`, `momo_ref`, `payer_name`, `payer_phone`, `payment_method` enum values, `proofOfPayment`, `popFile`, `handleProofOfPaymentUpload` are scattered across admin components, types, schemas, the wizard controller, the Payment page, and the state machine.
- **`useWizardController` still has full proof-of-payment upload logic**: `popFile`, `handleProofOfPaymentUploadWrapped`, `baseHandleProofOfPaymentUpload`, `baseHandleProofOfPaymentFile` are all still present and wired up.
- **Missing composite index on `payments(application_id, status)`**: The double-payment prevention query (`WHERE application_id=X AND status='pending'`) would benefit from this index for production performance.
- **`payments` table has 0 rows**: Clean slate — no backward compatibility concerns for payment records.
- **4 programs exist**: DRN, DCM, DEH, CPC — all with `application_fee = 153.00`.

## Glossary

- **Application_Wizard**: The multi-step React form at `/student/application-wizard` that guides students through personal info, education, payment, and submission.
- **Payment_Page**: The legacy page at `apps/admissions/src/pages/student/Payment.tsx` that still contains ~800 lines of manual payment forms, proof-of-payment upload, and mobile money reference fields.
- **PaymentService**: The backend service at `backend/apps/documents/payment_service.py` that manages payment lifecycle: initiation, verification, webhook processing, and forward-only status transitions.
- **FeeResolver**: The backend service at `backend/apps/documents/fee_resolver.py` that resolves application fees by program code and student residency classification.
- **WebhookProcessor**: The backend service at `backend/apps/documents/webhook_processor.py` that validates HMAC-SHA512 signatures, logs webhook events, and delegates to PaymentService.
- **ProgramFeeViewSet**: The admin-only CRUD viewset at `backend/apps/documents/views.py` for managing per-program fee configuration.
- **ApplicationReviewView**: The admin endpoint at `POST /api/v1/applications/{id}/review/` that handles status transitions and payment status overrides.
- **Lenco_Widget**: The third-party inline payment widget loaded via `useLencoWidget.ts` that processes real-time card and mobile money payments.
- **Identity_Document**: An NRC (National Registration Card) or Passport document uploaded by the student to verify their identity.
- **Payment_Status**: The status field on both the `payments` table (`pending`, `successful`, `failed`) and the `applications` table (`pending`, `paid`, `failed`, `verified`, `rejected`).
- **Forward_Only_Transition**: A constraint where payment status can only move forward (e.g., `pending` → `successful`), never backward, to prevent data corruption.
- **Admin_Dashboard**: The admin interface in `apps/admissions/src/pages/admin/` used by admissions staff to review applications, manage fees, and override payment status.

## Requirements

### Requirement 1: Remove Legacy Manual Payment Code from Payment Page

**User Story:** As a developer, I want to remove all legacy manual payment code from the Payment page, so that students only interact with the Lenco-based payment flow and no dead code remains.

#### Acceptance Criteria

1. WHEN the Payment_Page is loaded, THE Payment_Page SHALL display only Lenco payment status information and a navigation link to the Application_Wizard.
2. THE Payment_Page SHALL remove all manual payment form elements including payment method selectors, payer name fields, payer phone fields, mobile money reference fields, and proof-of-payment file upload inputs.
3. THE Payment_Page SHALL remove the `handleSubmitDeferredPayment` function and all associated form state management (`paymentForms`, `expandedApplicationId`, `submittingApplicationId`).
4. THE Payment_Page SHALL display a read-only payment history list showing payment records from the `payments` table for each application, including status, amount, currency, and timestamp.
5. WHEN a student has an application requiring payment, THE Payment_Page SHALL display a button that navigates to the Application_Wizard payment step.

### Requirement 2: Remove Legacy Payment References from Frontend Codebase

**User Story:** As a developer, I want to remove all remaining legacy manual payment references across the frontend codebase, so that no code reads or writes the deprecated Application model payment fields.

#### Acceptance Criteria

1. THE Application_Wizard SHALL remove the `handleProofOfPaymentUpload` callback and the `popFile` state from `useWizardController`.
2. THE frontend codebase SHALL remove all references to `pop_url`, `momo_ref`, `payer_name`, `payer_phone`, and `payment_method` enum values (`MTN Money`, `Airtel Money`, `Zamtel Money`, `Ewallet`, `Bank To Cell`) from type definitions, form schemas, and component props.
3. THE `applicationSchema.ts` SHALL remove the `payment_method` enum field from the Zod schema.
4. THE `applicationStateMachine.ts` SHALL remove the `SET_PROOF_OF_PAYMENT` event and `hasProofOfPayment` context field.
5. THE `useApplicationSubmit.ts` SHALL stop writing deprecated payment fields (`payment_method`, `payer_name`, `payer_phone`) during application submission.
6. THE admin components (`ApplicationDetailModal`, `ApplicationCard`, `ApplicationsCards`, `DocumentsTab`, `ReportsGenerator`) SHALL replace references to `pop_url` and `momo_ref` with data from the `payments` table.
7. THE `usePaymentReceipt.ts` and `useDocumentGeneration.ts` hooks SHALL read payment data from the `payments` table instead of deprecated Application model fields.
8. THE `offline.ts` type definition SHALL remove deprecated payment fields (`payer_name`, `payer_phone`, `momo_ref`, `pop_url`).

### Requirement 3: Admin Program Fee Management UI

**User Story:** As an admin, I want a UI to manage per-program application fees, so that I can configure different fee amounts for local and international students without database access.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL provide a program fee management interface accessible to admin and super_admin roles.
2. WHEN an admin navigates to the fee management interface, THE Admin_Dashboard SHALL display a list of active program fees grouped by program, showing fee type, residency category, amount, and currency.
3. WHEN an admin creates a new program fee, THE Admin_Dashboard SHALL call `POST /api/v1/programs/{id}/fees/` with fee_type, residency_category, amount, and currency fields.
4. WHEN an admin updates an existing program fee, THE Admin_Dashboard SHALL call `PUT /api/v1/programs/{id}/fees/{fee_id}/` with the updated fields.
5. WHEN an admin deletes a program fee, THE Admin_Dashboard SHALL call `DELETE /api/v1/programs/{id}/fees/{fee_id}/` which performs a soft delete (sets `is_active=false`).
6. IF an admin attempts to create a duplicate active fee for the same program, fee_type, and residency_category combination, THEN THE ProgramFeeViewSet SHALL return a validation error.

### Requirement 4: Admin Payment Status Override

**User Story:** As an admin, I want to manually override payment status for applications where students paid offline or via bank transfer, so that those applications can proceed through the admissions pipeline.

#### Acceptance Criteria

1. WHEN an admin views an application in the review interface, THE Admin_Dashboard SHALL display the current payment status and payment history from the `payments` table.
2. WHEN an admin submits a payment status override via `POST /api/v1/applications/{id}/review/` with a `payment_status` field, THE ApplicationReviewView SHALL update the application's `payment_status` field.
3. THE ApplicationReviewView SHALL accept payment status values of `paid`, `verified`, `rejected`, and `pending` for admin overrides.
4. WHEN an admin overrides payment status, THE ApplicationReviewView SHALL record the admin's notes in the `admin_feedback` field and the admin's identity in `admin_feedback_by`.
5. WHEN an admin overrides payment status, THE ApplicationReviewView SHALL dispatch a `payment_update` SSE event to notify the student in real time.
6. IF an admin attempts to approve an application without verified payment and without setting `force=true`, THEN THE ApplicationReviewView SHALL return a `PAYMENT_UNVERIFIED` error.

### Requirement 5: Mandatory NRC or Passport Document Upload

**User Story:** As an admissions officer, I want NRC or Passport document upload to be mandatory before application submission, so that every submitted application has verified identity documentation.

#### Acceptance Criteria

1. THE Application_Wizard education step SHALL mark the identity document upload (NRC or Passport) as required instead of optional.
2. WHEN a student attempts to proceed from the education step without uploading an identity document, THE Application_Wizard SHALL display a validation error indicating that an NRC or Passport document is required.
3. WHEN a student submits an application, THE backend submission endpoint SHALL verify that at least one `application_documents` record with `document_type` of `nrc` or `passport` exists for the application.
4. IF no identity document exists for the application at submission time, THEN THE backend submission endpoint SHALL return a validation error with code `IDENTITY_DOCUMENT_REQUIRED`.
5. THE Application_Wizard submit step readiness checklist SHALL include an identity document check that shows incomplete status when no NRC or Passport document is uploaded.

### Requirement 6: Prevent Double Payment Initiation

**User Story:** As a student, I want the system to prevent creating duplicate pending payments for the same application, so that I am not charged twice.

#### Acceptance Criteria

1. WHEN a payment initiation request is received for an application that already has a `pending` payment record, THE PaymentService SHALL return the existing pending payment reference instead of creating a new record.
2. THE PaymentService SHALL use database-level constraints or queries to check for existing pending payments before creating a new payment record.
3. THE PaymentStep frontend component SHALL disable the pay button while a payment initiation request is in flight to prevent rapid double-clicks.
4. WHEN the Lenco_Widget `onClose` callback fires without a success or pending result, THE PaymentStep SHALL re-enable the pay button for retry.

### Requirement 7: Prevent Webhook and Verification Race Condition

**User Story:** As a system operator, I want to prevent race conditions between webhook processing and manual payment verification, so that payment records are not corrupted by concurrent updates.

#### Acceptance Criteria

1. WHEN the PaymentService updates a payment status, THE PaymentService SHALL use `SELECT FOR UPDATE` row-level locking to prevent concurrent modifications.
2. THE PaymentService `_update_payment_status` method SHALL re-read the payment record inside the lock before applying the transition, ensuring the forward-only constraint is checked against the latest state.
3. WHEN a webhook event and a verification request arrive simultaneously for the same payment, THE PaymentService SHALL ensure only one transition is applied and the other is a safe no-op.
4. THE `process_webhook_event` method SHALL remain idempotent: processing the same event multiple times SHALL produce the same final payment state.

### Requirement 8: Prevent Double Application Submission

**User Story:** As a student, I want the system to prevent submitting the same application twice, so that duplicate submissions do not occur.

#### Acceptance Criteria

1. WHEN an application submission request is received, THE backend submission endpoint SHALL verify the application status is `draft` before transitioning to `submitted`.
2. IF the application status is not `draft` at submission time, THEN THE backend submission endpoint SHALL return an error indicating the application has already been submitted.
3. THE Application_Wizard submit button SHALL be disabled after the first click and remain disabled until the submission response is received.
4. THE backend submission endpoint SHALL use `SELECT FOR UPDATE` on the application row to prevent concurrent submission attempts from succeeding.

### Requirement 9: Prevent Draft Auto-Save Conflicts

**User Story:** As a student, I want auto-save to work reliably without conflicting with payment or submission flows, so that my draft data is preserved without interfering with critical operations.

#### Acceptance Criteria

1. WHILE the Application_Wizard is on the payment step and a payment is in progress (status `initiating` or `pending`), THE auto-save mechanism SHALL pause draft saving to avoid interfering with the payment flow.
2. WHILE the Application_Wizard is processing a submission, THE auto-save mechanism SHALL pause draft saving.
3. THE auto-save mechanism SHALL use optimistic concurrency by including the application `version` field in update requests and handling version conflict responses gracefully.
4. IF an auto-save request fails due to a network error, THEN THE Application_Wizard SHALL retain the unsaved data in local storage and retry on the next auto-save cycle.

### Requirement 10: Application Wizard Network Resilience

**User Story:** As a student on a slow or unstable connection, I want the Application Wizard to handle network failures gracefully, so that I do not lose my progress.

#### Acceptance Criteria

1. WHEN the Lenco_Widget script fails to load, THE PaymentStep SHALL display a clear error message indicating the payment widget is unavailable and suggest refreshing the page.
2. WHEN a payment verification request times out, THE PaymentStep SHALL display a pending status message and continue polling for the payment result.
3. WHEN a network error occurs during any wizard API call, THE Application_Wizard SHALL display a retry-capable error message instead of silently failing.
4. THE Application_Wizard SHALL preserve form data in local storage on `beforeunload` events so that data survives browser refreshes and accidental navigation.
5. WHEN the user's session expires during the payment step, THE Application_Wizard SHALL preserve the current draft and redirect to sign-in with a return URL that restores the wizard state.

### Requirement 11: Application Wizard Mobile and Navigation Resilience

**User Story:** As a student using a mobile device, I want the Application Wizard to work correctly on small screens and handle browser navigation properly, so that I can complete my application on any device.

#### Acceptance Criteria

1. THE Application_Wizard SHALL render all form elements with a minimum touch target size of 44x44 pixels on mobile devices.
2. WHEN the user presses the browser back button during the wizard, THE Application_Wizard SHALL navigate to the previous wizard step instead of leaving the wizard entirely.
3. WHEN the user presses the browser forward button after going back, THE Application_Wizard SHALL navigate to the next wizard step.
4. THE Lenco_Widget payment modal SHALL be usable on mobile viewports without horizontal scrolling or clipped content.

### Requirement 12: End-to-End Flow Verification

**User Story:** As a system operator, I want to verify the complete admissions flow works end-to-end, so that the system is ready for production use.

#### Acceptance Criteria

1. THE complete flow from Registration through Email Verification, Profile Setup, Application Wizard, Lenco Payment, Submission, and Admin Review SHALL function without errors.
2. WHEN a Lenco webhook event is received for a successful payment, THE WebhookProcessor SHALL update the payment record and sync the application payment_status to `paid`.
3. WHEN the polling fallback task runs for a pending payment older than 5 minutes, THE PaymentService SHALL verify the payment via the Lenco API and update the status accordingly.
4. THE FeeResolver SHALL return the correct fee amount for all program and residency category combinations, falling back to the program-level `application_fee` when no ProgramFee record exists.
5. THE Admin_Dashboard SHALL allow admins to manage program fees and override payment status for applications with offline payments.

### Requirement 13: Database Schema Verification

**User Story:** As a system operator, I want to verify all database tables, columns, indexes, and constraints are correct, so that the payment system operates on a sound data foundation.

#### Acceptance Criteria

1. THE `program_fees` table SHALL have a partial unique index on `(program_id, fee_type, residency_category)` filtered by `is_active = true`.
2. THE `webhook_event_logs` table SHALL have an index on the `reference` column for efficient lookup during webhook processing.
3. THE `payments` table SHALL include the `lenco_reference`, `fee`, and `bearer` columns added during the Lenco integration.
4. THE `applications` table SHALL have `payment_status` column with a default value of `pending`.
5. THE `application_documents` table SHALL support `document_type` values of `nrc` and `passport` for identity document tracking.

### Requirement 14: Payment Gate Enforcement

**User Story:** As an admissions officer, I want the payment gate to be enforced consistently across both frontend and backend, so that no application can be submitted without payment.

#### Acceptance Criteria

1. WHEN a student attempts to submit an application without a `successful` payment record in the `payments` table, THE backend submission endpoint SHALL reject the submission with a `PAYMENT_REQUIRED` error.
2. THE Application_Wizard SHALL check payment status before enabling the submit step and display a message directing the student to complete payment first.
3. WHEN an admin transitions an application to `approved` status, THE ApplicationReviewView SHALL verify that payment is verified or that `force=true` is set.
4. THE PaymentService SHALL enforce forward-only payment status transitions (`pending` → `successful` or `pending` → `failed`) and reject any backward transitions.

### Requirement 15: Fee Resolution Fallback

**User Story:** As a system operator, I want fee resolution to work correctly even when no ProgramFee record exists, so that students always see the correct application fee.

#### Acceptance Criteria

1. WHEN no active ProgramFee record exists for a program and residency combination, THE FeeResolver SHALL fall back to the program-level `application_fee` field with currency `ZMW`.
2. WHEN the program-level `application_fee` is null, THE FeeResolver SHALL fall back to the default fee of K153.00 ZMW.
3. THE FeeResolver SHALL classify residency as `local` when nationality is `Zambian` or country is `Zambia` or `ZM`, and `international` otherwise.

### Requirement 16: Webhook Signature Validation

**User Story:** As a security engineer, I want webhook signature validation to use the correct algorithm, so that forged webhook events are rejected.

#### Acceptance Criteria

1. THE WebhookProcessor SHALL compute the expected signature using SHA-256 hash of the `LENCO_API_SECRET_KEY` as the HMAC key, and HMAC-SHA512 of the raw request body as the digest.
2. THE WebhookProcessor SHALL use constant-time comparison (`hmac.compare_digest`) to prevent timing attacks when comparing signatures.
3. IF the `LENCO_API_SECRET_KEY` environment variable is not configured, THEN THE WebhookProcessor SHALL reject all webhook events and log a warning.
4. WHEN a webhook event has an invalid signature, THE WebhookProcessor SHALL log the event with `signature_valid=false` and return HTTP 401.

### Requirement 17: Amount Mismatch Detection

**User Story:** As a finance officer, I want the system to detect when the payment amount does not match the expected fee, so that underpayments and overpayments are flagged.

#### Acceptance Criteria

1. WHEN the Lenco API returns a successful payment with an amount different from the expected fee stored in the payment record, THE PaymentService SHALL log a warning and not transition the payment to `successful`.
2. WHEN a webhook event reports a successful collection with a mismatched amount, THE PaymentService SHALL log the mismatch and skip the status transition.
3. THE PaymentService SHALL use `Decimal` comparison for amount matching to avoid floating-point precision errors.


### Requirement 18: Drop Conflicting Full Unique Constraint on program_fees

**User Story:** As a developer, I want the `program_fees` table to only enforce uniqueness on active records, so that soft-deleted fees can be replaced with new active fees for the same program/type/residency combination.

#### Acceptance Criteria

1. THE migration script SHALL drop the `uq_program_fee_type_residency` full unique constraint from the `program_fees` table.
2. THE partial unique index `uq_program_fee_active` on `(program_id, fee_type, residency_category) WHERE is_active = true` SHALL remain in place.
3. AFTER the migration, creating a new active ProgramFee for a combination that has a soft-deleted (inactive) record SHALL succeed without constraint violation.

### Requirement 19: Add Composite Index on payments(application_id, status)

**User Story:** As a system operator, I want the double-payment prevention query to be fast, so that payment initiation does not slow down under load.

#### Acceptance Criteria

1. THE migration script SHALL add a composite index on `payments(application_id, status)` for efficient lookup during double-payment prevention.
2. THE index SHALL be created with `IF NOT EXISTS` for idempotency.

### Requirement 20: Seed Initial Program Fees

**User Story:** As an admin, I want the 4 existing programs to have default application fees configured, so that fee resolution works immediately after deployment.

#### Acceptance Criteria

1. THE migration or seed script SHALL insert active ProgramFee records for all 4 existing programs (DRN, DCM, DEH, CPC) with fee_type `application`, residency_category `local`, amount `153.00`, and currency `ZMW`.
2. THE seed SHALL use `ON CONFLICT DO NOTHING` to be idempotent.
3. THE admin SHALL be able to modify these fees via the admin UI after deployment.

### Requirement 21: Backward Compatibility with Legacy Payment Statuses

**User Story:** As a system operator, I want the payment gate to treat legacy `verified` payment status as equivalent to `paid`, so that existing approved applications are not blocked.

#### Acceptance Criteria

1. WHEN checking payment gate for submission, THE backend SHALL accept applications where `payment_status` is `verified` OR where a `successful` payment record exists in the `payments` table.
2. WHEN checking payment gate for approval, THE backend SHALL treat `verified` as equivalent to `paid` for backward compatibility.
3. THE admin payment status override SHALL continue to accept `verified` as a valid status value.
