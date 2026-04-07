# Requirements Document

## Introduction

This feature replaces the current manual mobile money proof-of-payment system in the MIHAS admissions platform with a real-time Lenco payment gateway integration. The scope covers: embedding the Lenco payment widget in the student application wizard, building a database-driven webhook system for payment event processing, introducing program-level pricing with local vs international fee differentiation managed by admins, overhauling the application pipeline to remove all deprecated manual payment code, and ensuring the full application flow works end-to-end with real payments.

The integration uses Lenco's sandbox environment during development, with production keys swapped via environment variables at go-live.

### CTO Review Notes (from live DB schema inspection via Neon MCP)

- The `payments` table exists but has **0 rows** — it was never used in production. This is a clean slate for Lenco integration.
- The `payments` table already has an index `idx_payments_ref` on `transaction_reference` — no new index needed for that column.
- The `programs.application_fee` column defaults to `153.00` (ZMW) — this is the hardcoded fee that will become the fallback when no `program_fees` record exists.
- The `applications.nationality` column defaults to `'Zambian'` — this is the field used for local vs international residency detection.
- The `applications.payment_status` column defaults to `'pending_review'` — this default must change to `'pending'` to align with the Lenco payment flow (no more manual review).
- The `applications.program`, `applications.intake`, and `applications.institution` columns store **varchar codes** (not UUID FKs) — the Fee_Resolver must look up programs by code, not by ID.
- The `payments` table is missing `lenco_reference`, `fee`, and `bearer` columns needed for Lenco response data — these must be added via ALTER TABLE.
- The `applications` table has 12 legacy payment columns (`payment_method`, `payer_name`, `payer_phone`, `amount`, `paid_at`, `momo_ref`, `pop_url`, `receipt_number`, `payment_status`, `payment_verified_at`, `payment_verified_by`, `application_fee`) — these should NOT be dropped in the migration (backward compatibility with existing rows) but should be deprecated in code.

## Glossary

- **Lenco_Widget**: The Lenco inline JavaScript payment widget (`LencoPay.getPaid(...)`) embedded in the frontend to collect card and mobile money payments
- **Payment_Service**: The backend Django service responsible for creating payment records, verifying payment status with the Lenco API, and processing webhook events
- **Webhook_Processor**: The backend component that receives, validates, and processes Lenco webhook event payloads (`collection.successful`, `collection.failed`, `collection.settled`)
- **Payment_Record**: A row in the `payments` table representing a single payment transaction linked to an application
- **Program_Fee**: A database record associating a program with a fee type (application or tuition), currency, and amount, with local vs international differentiation
- **Application_Wizard**: The multi-step React form that guides students through the admissions application process
- **Fee_Resolver**: The backend logic that determines the correct application fee for a student based on their selected program and residency classification (local or international)
- **Lenco_API**: The Lenco REST API used for server-side payment status verification (`GET /access/v2/collections/status/:reference`)
- **Admin_Dashboard**: The existing admin interface where administrators manage programs, intakes, and now program fees
- **Webhook_Event_Log**: A database table that stores raw webhook payloads and processing metadata for auditability and replay

## Requirements

### Requirement 1: Lenco Widget Payment Initiation

**User Story:** As a student, I want to pay my application fee directly through a secure payment widget during the application process, so that my payment is processed in real time without manual proof-of-payment uploads.

#### Acceptance Criteria

1. WHEN a student reaches the payment step of the Application_Wizard, THE Lenco_Widget SHALL render an inline payment interface supporting card and mobile-money channels
2. WHEN the student initiates payment, THE Application_Wizard SHALL call `LencoPay.getPaid` with the correct public key, a unique payment reference, the student email, the resolved application fee amount, the appropriate currency (ZMW or USD), and customer details (first name, last name, phone)
3. WHEN the Lenco_Widget reports a successful payment via the `onSuccess` callback, THE Application_Wizard SHALL display a payment success confirmation and allow the student to proceed to the next step
4. WHEN the Lenco_Widget reports a pending confirmation via the `onConfirmationPending` callback, THE Application_Wizard SHALL display a pending status message and allow the student to proceed while payment confirmation continues asynchronously
5. WHEN the Lenco_Widget is closed without completing payment via the `onClose` callback, THE Application_Wizard SHALL retain the current step state and allow the student to retry payment
6. THE Application_Wizard SHALL generate a unique payment reference for each payment attempt using a deterministic format that includes the application identifier
7. THE Application_Wizard SHALL load the Lenco widget script from a URL determined by an environment variable, defaulting to the sandbox URL during development

### Requirement 2: Backend Payment Record Creation

**User Story:** As a system operator, I want every payment attempt to be recorded in the database before the widget opens, so that payment state is tracked from initiation through completion.

#### Acceptance Criteria

1. WHEN a student initiates a payment from the Application_Wizard, THE Payment_Service SHALL create a Payment_Record with status `pending`, the generated reference, the resolved fee amount, currency, and a foreign key to the application
2. THE Payment_Service SHALL store the Lenco public key identifier used for the transaction in the Payment_Record metadata
3. IF the Payment_Service fails to create the Payment_Record, THEN THE Application_Wizard SHALL display an error message and prevent the Lenco_Widget from opening
4. THE Payment_Record SHALL use the existing `payments` table, extended with new columns: `lenco_reference` (VARCHAR(100), nullable), `fee` (NUMERIC(10,2), nullable — the Lenco processing fee), and `bearer` (VARCHAR(20), nullable — 'merchant' or 'customer'). Existing columns used: `id`, `application_id`, `user_id`, `amount`, `currency`, `payment_method`, `transaction_reference`, `status`, `metadata`, `created_at`, `updated_at`

### Requirement 3: Server-Side Payment Verification

**User Story:** As a system operator, I want the backend to verify payment status directly with Lenco's API, so that payment confirmation does not rely solely on client-side callbacks.

#### Acceptance Criteria

1. WHEN the frontend reports a successful or pending payment, THE Payment_Service SHALL call the Lenco_API at `GET /access/v2/collections/status/:reference` using the API secret key from environment configuration
2. WHEN the Lenco_API returns status `successful`, THE Payment_Service SHALL update the Payment_Record status to `successful` and store the Lenco reference, fee, bearer, and payment type (card or mobile-money) from the response
3. WHEN the Lenco_API returns status `failed`, THE Payment_Service SHALL update the Payment_Record status to `failed` and store the failure details in metadata
4. WHEN the Lenco_API returns status `pending`, THE Payment_Service SHALL keep the Payment_Record status as `pending`
5. IF the Lenco_API is unreachable or returns an error, THEN THE Payment_Service SHALL log the error, keep the Payment_Record status unchanged, and return a retriable error response to the caller
6. THE Payment_Service SHALL authenticate Lenco_API requests using a Bearer token from the `LENCO_API_SECRET_KEY` environment variable

### Requirement 4: Webhook Event Processing

**User Story:** As a system operator, I want Lenco webhook events to automatically update payment records, so that payment status stays accurate even when the student closes the browser after paying.

#### Acceptance Criteria

1. WHEN the Webhook_Processor receives a POST request at the webhook endpoint, THE Webhook_Processor SHALL validate the `X-Lenco-Signature` header by computing HMAC SHA-512 of the raw request body using the webhook hash key (SHA-256 of the API secret key) and comparing it to the signature
2. IF the webhook signature validation fails, THEN THE Webhook_Processor SHALL return HTTP 401 and log the invalid attempt without processing the payload
3. WHEN a `collection.successful` event is received with a valid signature, THE Webhook_Processor SHALL update the matching Payment_Record status to `successful` and store the Lenco reference, fee, settlement details, and payment type
4. WHEN a `collection.failed` event is received with a valid signature, THE Webhook_Processor SHALL update the matching Payment_Record status to `failed`
5. WHEN a `collection.settled` event is received with a valid signature, THE Webhook_Processor SHALL update the matching Payment_Record settlement fields in metadata
6. THE Webhook_Processor SHALL store every received webhook payload in the Webhook_Event_Log table with fields: `id`, `event_type`, `reference`, `payload`, `signature_valid`, `processed`, `processing_error`, `created_at`
7. THE Webhook_Processor SHALL return HTTP 200 for all successfully validated and processed webhook requests
8. THE Webhook_Processor SHALL be idempotent: processing the same webhook event multiple times SHALL produce the same Payment_Record state
9. WHEN a Payment_Record is updated to `successful` by the Webhook_Processor, THE Webhook_Processor SHALL also update the associated application payment status to `paid`

### Requirement 5: Program-Level Fee Configuration

**User Story:** As an admin, I want to set application and tuition fees per program with separate pricing for local (Zambian) and international students, so that each program can have its own fee structure.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL provide an interface for creating and editing Program_Fee records for each program
2. THE Program_Fee SHALL support two fee types: `application` and `tuition`
3. THE Program_Fee SHALL support two residency categories: `local` and `international`
4. THE Program_Fee SHALL store amount as a decimal value and currency as a three-letter ISO code (ZMW or USD)
5. WHEN an admin creates a Program_Fee, THE Admin_Dashboard SHALL validate that no duplicate fee exists for the same program, fee type, and residency category combination
6. THE Program_Fee table SHALL contain fields: `id`, `program_id`, `fee_type`, `residency_category`, `amount`, `currency`, `is_active`, `created_at`, `updated_at`
7. WHEN no Program_Fee record exists for a given program and residency combination, THE Fee_Resolver SHALL fall back to the program-level `application_fee` field for backward compatibility

### Requirement 6: Dynamic Fee Resolution for Applications

**User Story:** As a student, I want to see the correct application fee for my selected program and residency status, so that I know exactly how much to pay.

#### Acceptance Criteria

1. WHEN a student selects a program in the Application_Wizard, THE Fee_Resolver SHALL look up the program by its code (since `applications.program` stores a varchar code, not a UUID FK), then return the active Program_Fee for that program, the `application` fee type, and the student residency category
2. THE Fee_Resolver SHALL determine residency category as `local` when the student nationality is `'Zambian'` (the DB default) or the student country is `'Zambia'` or `'ZM'`, and `international` otherwise
3. WHEN the resolved fee is returned, THE Application_Wizard SHALL display the fee amount and currency to the student before payment initiation
4. WHEN the student nationality or country changes in the Application_Wizard, THE Application_Wizard SHALL re-resolve the fee and update the displayed amount
5. IF no active Program_Fee exists for the selected program and residency category, THEN THE Fee_Resolver SHALL return the program-level `application_fee` as a fallback with currency ZMW

### Requirement 7: Removal of Manual Payment Code

**User Story:** As a developer, I want all deprecated manual payment code removed, so that the codebase has a single clean payment path through Lenco.

#### Acceptance Criteria

1. THE Application_Wizard SHALL remove the proof-of-payment file upload component from the payment step
2. THE Application_Wizard SHALL remove the "pay now" vs "pay later" radio selection and the manual payment method dropdown (MTN Money, Airtel Money, Zamtel Money, Ewallet, Bank To Cell)
3. THE Application_Wizard SHALL remove the manual payment detail fields: payer name, payer phone, amount input, payment date/time, and mobile money reference
4. THE frontend SHALL remove the `PAYMENT_CONFIG` object from `apps/admissions/src/config/payments.ts` including hardcoded K153 fee and mobile money phone numbers
5. THE frontend SHALL remove the `paymentFlow.ts` module including `requiresImmediatePayment`, `validatePaymentStep`, and `buildApplicationPaymentUpdate` functions
6. THE Application_Wizard form schema SHALL remove the deprecated payment fields: `payment_option`, `payment_method`, `payer_name`, `payer_phone`, `amount`, `paid_at`, `momo_ref`
7. THE backend Application model inline payment fields (`payment_method`, `payer_name`, `payer_phone`, `amount`, `paid_at`, `momo_ref`, `pop_url`, `receipt_number`, `payment_verified_at`, `payment_verified_by`) SHALL be deprecated in code (not read or written by new payment flows) but SHALL NOT be dropped from the database to preserve backward compatibility with existing application rows

### Requirement 8: Application Pipeline Payment Gate

**User Story:** As a system operator, I want the application pipeline to enforce payment completion before submission, so that only paid applications enter the review queue.

#### Acceptance Criteria

1. WHEN a student attempts to submit an application, THE Application_Wizard SHALL verify that a Payment_Record with status `successful` exists for the application
2. IF no successful Payment_Record exists for the application, THEN THE Application_Wizard SHALL prevent submission and display a message directing the student to complete payment
3. WHEN an application is submitted with a successful payment, THE Payment_Service SHALL transition the application status from `draft` to `submitted`
4. THE backend submission endpoint SHALL independently verify that a successful Payment_Record exists before accepting the status transition to `submitted`
5. WHEN a payment is confirmed via webhook after the student has left the payment step, THE Application_Wizard SHALL reflect the updated payment status when the student returns to the application

### Requirement 9: Environment-Based Configuration

**User Story:** As a developer, I want all Lenco credentials and endpoints to be environment-driven, so that switching between sandbox and production requires only environment variable changes.

#### Acceptance Criteria

1. THE Payment_Service SHALL read the Lenco API secret key from the `LENCO_API_SECRET_KEY` environment variable
2. THE Payment_Service SHALL read the Lenco API base URL from the `LENCO_API_BASE_URL` environment variable, defaulting to `https://sandbox.lenco.co/access/v2/`
3. THE Application_Wizard SHALL read the Lenco public key from the `VITE_LENCO_PUBLIC_KEY` environment variable
4. THE Application_Wizard SHALL read the Lenco widget script URL from the `VITE_LENCO_WIDGET_URL` environment variable, defaulting to `https://pay.sandbox.lenco.co/js/v1/inline.js`
5. THE Payment_Service SHALL read the webhook endpoint path from configuration without hardcoding it in multiple locations
6. IF any required Lenco environment variable is missing at startup, THEN THE Payment_Service SHALL log a warning and disable payment processing gracefully

### Requirement 10: Payment Security and Data Integrity

**User Story:** As a system operator, I want payment processing to be secure and tamper-resistant, so that payment records are trustworthy.

#### Acceptance Criteria

1. THE Webhook_Processor endpoint SHALL be exempt from CSRF protection and session authentication since it receives external POST requests from Lenco servers
2. THE Webhook_Processor endpoint SHALL be rate-limited to prevent abuse
3. THE Payment_Service SHALL never log or expose the Lenco API secret key in responses, error messages, or application logs
4. THE Payment_Service SHALL validate that the payment amount in the Lenco_API verification response matches the expected fee amount stored in the Payment_Record
5. THE Payment_Record status transitions SHALL only move forward: `pending` to `successful` or `failed`, with no backward transitions allowed
6. THE Webhook_Event_Log SHALL retain raw payloads for a minimum of 90 days for audit and dispute resolution
7. THE Payment_Service SHALL use HTTPS for all communication with the Lenco_API

### Requirement 11: SQL Migration for New Tables

**User Story:** As a developer, I want new database tables created via SQL migration scripts consistent with the existing `managed = False` pattern, so that schema changes follow the established Neon Postgres workflow.

#### Acceptance Criteria

1. THE migration script SHALL create the `program_fees` table with columns matching the Program_Fee model definition
2. THE migration script SHALL create the `webhook_event_logs` table with columns matching the Webhook_Event_Log model definition
3. THE migration script SHALL add `lenco_reference` (VARCHAR(100)), `fee` (NUMERIC(10,2)), and `bearer` (VARCHAR(20)) columns to the existing `payments` table
4. THE migration script SHALL add a unique constraint on `program_fees` for the combination of `program_id`, `fee_type`, and `residency_category`
5. THE migration script SHALL add an index on `webhook_event_logs` for the `reference` column
6. THE migration script SHALL NOT add an index on `payments.transaction_reference` because `idx_payments_ref` already exists in the live database
7. THE migration script SHALL be idempotent using `IF NOT EXISTS` guards for all CREATE and ALTER statements
8. THE migration script SHALL update the `applications.payment_status` default from `'pending_review'` to `'pending'` to align with the Lenco payment flow

### Requirement 12: Payment Status Polling Fallback

**User Story:** As a system operator, I want a periodic task that polls Lenco for the status of pending payments, so that payments are confirmed even if webhooks fail or are delayed.

#### Acceptance Criteria

1. A Celery Beat periodic task SHALL query for Payment_Records with status `pending` that are older than 5 minutes and younger than 24 hours
2. FOR each pending Payment_Record found, THE task SHALL call the Lenco_API verification endpoint to check the current payment status
3. WHEN the Lenco_API returns status `successful`, THE task SHALL update the Payment_Record and associated application payment status identically to the webhook flow
4. WHEN the Lenco_API returns status `failed`, THE task SHALL update the Payment_Record status to `failed`
5. THE task SHALL run every 10 minutes and process at most 50 pending payments per run to avoid overloading the Lenco_API
6. THE task SHALL log each verification attempt and result for operational visibility

### Requirement 13: Admin Fee Management API

**User Story:** As an admin, I want API endpoints to manage program fees, so that I can set and update pricing for each program without direct database access.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL expose `GET /api/v1/programs/:id/fees/` to list all active fees for a program
2. THE Admin_Dashboard SHALL expose `POST /api/v1/programs/:id/fees/` to create a new Program_Fee record
3. THE Admin_Dashboard SHALL expose `PUT /api/v1/programs/:id/fees/:fee_id/` to update an existing Program_Fee record
4. THE Admin_Dashboard SHALL expose `DELETE /api/v1/programs/:id/fees/:fee_id/` to deactivate a Program_Fee record (soft delete via `is_active = false`)
5. ALL fee management endpoints SHALL require admin authentication
6. THE create and update endpoints SHALL validate that no duplicate active fee exists for the same program, fee type, and residency category combination
