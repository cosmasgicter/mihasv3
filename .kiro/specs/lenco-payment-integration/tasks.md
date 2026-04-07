# Implementation Plan: Lenco Payment Integration

## Overview

Bottom-up implementation: SQL migration → Django models → backend services → API endpoints → middleware updates → Celery tasks → frontend components → deprecated code cleanup. Each task builds on the previous, with checkpoints to validate incremental progress.

## Tasks

- [x] 1. Database migration and Django models
  - [x] 1.1 Create SQL migration script `backend/scripts/lenco_payment_integration.sql`
    - CREATE TABLE `program_fees` with all columns, CHECK constraints, and partial unique index `uq_program_fee_active` (WHERE is_active = true)
    - CREATE TABLE `webhook_event_logs` with all columns and index on `reference`
    - ALTER TABLE `payments` to add `lenco_reference`, `fee`, `bearer` columns
    - ALTER TABLE `applications` to change `payment_status` default from `'pending_review'` to `'pending'` (confirmed current default via Neon MCP)
    - INSERT INTO `migration_history` (migration_name) VALUES ('lenco_payment_integration.sql') — follows existing naming convention
    - All statements use `IF NOT EXISTS` guards for idempotency
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [x] 1.2 Execute the SQL migration against Neon Postgres
    - Use the Neon MCP `prepare_database_migration` tool to apply the DDL from task 1.1 on a temporary branch
    - Verify tables and columns exist on the temporary branch using `run_sql`
    - Commit the migration to the main branch using `complete_database_migration`
    - Project ID: `wild-bar-37055823`
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 1.3 Add `ProgramFee` and `WebhookEventLog` models to `backend/apps/documents/models.py`
    - Add `ProgramFee` model with `managed = False`, `db_table = 'program_fees'`
    - Add `WebhookEventLog` model with `managed = False`, `db_table = 'webhook_event_logs'`
    - Add `lenco_reference`, `fee`, `bearer` fields to existing `Payment` model
    - _Requirements: 2.4, 5.6, 4.6_

  - [x] 1.4 Write property test for SQL migration idempotency
    - **Property 13: SQL migration idempotency**
    - **Validates: Requirements 11.7**

- [x] 2. Checkpoint — Verify migration and models
  - Ensure migration script runs without error, models load correctly, ask the user if questions arise.

- [x] 3. Backend payment services
  - [x] 3.0 Add backend environment variables to `.env` files
    - Add `LENCO_API_SECRET_KEY`, `LENCO_API_BASE_URL` to `backend/.env.example` and `backend/.env.development` with sandbox defaults
    - `LENCO_API_SECRET_KEY=993bed87f9d592566a6cce2cefd79363d1b7e95af3e1e6642b294ce5fc8c59f6` (sandbox)
    - `LENCO_API_BASE_URL=https://sandbox.lenco.co/access/v2/`
    - Add startup warning log in Django settings if `LENCO_API_SECRET_KEY` is missing
    - _Requirements: 9.1, 9.2, 9.5, 9.6_

  - [x] 3.1 Implement `FeeResolver` in `backend/apps/documents/fee_resolver.py`
    - `resolve_fee(program_code, nationality, country)` method
    - Residency classification: `local` if nationality is `'Zambian'` or country in `('Zambia', 'ZM')`, else `international`
    - Look up active `ProgramFee` for (program.id, 'application', residency) via program code join
    - Fallback to `program.application_fee` with currency `ZMW`
    - Return `ResolvedFee` dataclass with amount, currency, residency_category, source
    - _Requirements: 6.1, 6.2, 5.7, 6.5_

  - [x] 3.2 Write property test for fee resolution correctness
    - **Property 9: Fee resolution correctness**
    - **Validates: Requirements 6.1, 6.2, 5.7, 6.5**

  - [x] 3.3 Write property test for ProgramFee model validation
    - **Property 7: ProgramFee model validation**
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [x] 3.4 Implement `PaymentService` in `backend/apps/documents/payment_service.py`
    - `initiate_payment(application_id, user_id)` — create pending Payment with resolved fee, generate reference `MIHAS-{app_number}-{unix_timestamp_ms}`
    - `verify_payment(payment_id)` — call Lenco API `GET /access/v2/collections/status/:reference`, update Payment + Application status
    - `process_webhook_event(event_type, reference, payload)` — idempotent status update from webhook data
    - `_update_payment_status(payment, new_status, lenco_data)` — forward-only transitions only
    - `_update_application_payment_status(application_id, status)` — sync application.payment_status
    - Amount mismatch detection: reject if Lenco amount != expected amount
    - Read `LENCO_API_SECRET_KEY` and `LENCO_API_BASE_URL` from environment
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.3, 4.4, 4.9, 9.1, 9.2, 9.5, 9.6, 10.3, 10.4, 10.5, 10.7_

  - [x] 3.5 Write property test for payment reference uniqueness and format
    - **Property 1: Payment reference uniqueness and format**
    - **Validates: Requirements 1.6**

  - [x] 3.6 Write property test for payment initiation creates a complete record
    - **Property 2: Payment initiation creates a complete record**
    - **Validates: Requirements 2.1, 2.2**

  - [x] 3.7 Write property test for payment status update from Lenco response
    - **Property 3: Payment status update from Lenco response**
    - **Validates: Requirements 3.2, 3.3, 3.4, 4.3, 4.4, 4.9, 12.3, 12.4**

  - [x] 3.8 Write property test for forward-only payment status transitions
    - **Property 12: Forward-only payment status transitions**
    - **Validates: Requirements 10.5**

  - [x] 3.9 Write property test for payment amount mismatch detection
    - **Property 11: Payment amount mismatch detection**
    - **Validates: Requirements 10.4**

  - [x] 3.10 Implement `WebhookProcessor` in `backend/apps/documents/webhook_processor.py`
    - `validate_signature(raw_body, signature)` — HMAC-SHA512 of body using SHA-256 of API secret key, constant-time compare
    - `process(event_type, payload)` — log to `webhook_event_logs`, delegate to `PaymentService`
    - Handle `collection.successful`, `collection.failed`, `collection.settled` event types
    - Always create `WebhookEventLog` record regardless of signature validity
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 3.11 Write property test for webhook signature validation round-trip
    - **Property 4: Webhook signature validation round-trip**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 3.12 Write property test for webhook processing idempotency
    - **Property 5: Webhook processing idempotency**
    - **Validates: Requirements 4.8**

  - [x] 3.13 Write property test for webhook event logging completeness
    - **Property 6: Webhook event logging completeness**
    - **Validates: Requirements 4.6, 4.7**

- [x] 4. Checkpoint — Verify backend services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Backend API endpoints and middleware
  - [x] 5.1 Implement `PaymentInitiateView` in `backend/apps/documents/views.py`
    - `POST /api/v1/payments/initiate/` — authenticated, creates pending payment, returns reference + amount + currency + public key
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 5.2 Replace `PaymentVerifyView` in `backend/apps/documents/views.py` with Lenco-aware version
    - Current `PaymentVerifyView` is admin-only (`IsAdmin`) for manual verify/reject — replace with student-accessible Lenco API verification
    - `POST /api/v1/payments/{payment_id}/verify/` — authenticated (`IsAuthenticated`), calls Lenco API `GET /collections/status/:reference`, returns updated status
    - Ensure the student can only verify their own payments (check `payment.user_id == request.user.id`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 5.3 Implement `LencoWebhookView` in `backend/apps/documents/views.py`
    - `POST /api/v1/payments/webhook/lenco/` — unauthenticated, AllowAny, validates X-Lenco-Signature, delegates to WebhookProcessor
    - Return 401 for invalid signature, 200 for valid events
    - _Requirements: 4.1, 4.2, 4.7, 10.1_

  - [x] 5.4 Implement `FeeResolveView` in `backend/apps/documents/views.py`
    - `GET /api/v1/payments/resolve-fee/?program_code=X&nationality=Y&country=Z` — authenticated, returns resolved fee
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 5.5 Implement `ProgramFeeViewSet` in `backend/apps/documents/views.py`
    - CRUD at `/api/v1/programs/:id/fees/` — admin only
    - Soft delete on DELETE (set `is_active = false`)
    - Validate unique active (program, fee_type, residency_category) on create/update
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 5.6 Write property test for ProgramFee uniqueness constraint
    - **Property 8: ProgramFee uniqueness constraint**
    - **Validates: Requirements 5.5, 13.6**

  - [x] 5.7 Write property test for admin fee endpoints require authentication
    - **Property 15: Admin fee endpoints require authentication**
    - **Validates: Requirements 13.5**

  - [x] 5.8 Register new URL patterns in `backend/apps/documents/urls.py`
    - Add `initiate/`, `webhook/lenco/`, `resolve-fee/` to `payment_urlpatterns`
    - Register `ProgramFeeViewSet` routes in `backend/config/urls.py` under `/api/v1/programs/<uuid:id>/fees/`
    - _Requirements: 2.1, 4.1, 6.1, 13.1_

  - [x] 5.9 Update middleware configuration in `backend/apps/common/middleware.py`
    - Add `re.compile(r"^/api/v1/payments/webhook/")` to `CSRFEnforcementMiddleware.EXEMPT_PATTERNS`
    - Add `("/api/v1/payments/webhook/", "30/10m")` BEFORE `("/api/v1/payments/", "20/10m")` in `RateLimitMiddleware.SCOPE_LIMITS`
    - _Requirements: 10.1, 10.2_

  - [x] 5.10 Update backend submission endpoint to enforce payment gate
    - The `transition_application_status` service in `backend/apps/applications/services.py` is the canonical status transition function — add a payment gate check there or in the calling view
    - Before accepting `draft` → `submitted` transition, verify a `Payment` record with `status='successful'` exists for the application
    - The `ApplicationReviewView.post` in `backend/apps/applications/views.py` already uses `transition_application_status` — add the payment check before calling it when `new_status == 'submitted'`
    - Also check in the frontend wizard submission flow
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 5.11 Write property test for submission requires successful payment
    - **Property 10: Submission requires successful payment**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

- [x] 6. Checkpoint — Verify API endpoints and middleware
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Celery polling task
  - [x] 7.1 Implement `poll_pending_payments_task` in `backend/apps/documents/tasks.py`
    - Query pending payments older than 5 minutes and younger than 24 hours
    - Verify each via Lenco API, update Payment + Application status
    - Max 50 per run, log each attempt
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 7.2 Register `poll_pending_payments_task` in Celery Beat schedule in `backend/config/settings/base.py`
    - Schedule: `600.0` (float, every 10 minutes) — follows the same pattern as `check-uptime` which uses `900.0`
    - Task path: `apps.documents.tasks.poll_pending_payments_task`
    - _Requirements: 12.5_

  - [x] 7.3 Write property test for pending payment query window
    - **Property 14: Pending payment query window**
    - **Validates: Requirements 12.1**

  - [x] 7.4 Write property test for webhook settlement metadata update
    - **Property 16: Webhook settlement metadata update**
    - **Validates: Requirements 4.5**

- [x] 8. Checkpoint — Verify Celery task and full backend
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Frontend — Lenco widget integration
  - [x] 9.1 Add environment variables to `apps/admissions/.env` and `.env.example`
    - `VITE_LENCO_PUBLIC_KEY` and `VITE_LENCO_WIDGET_URL` with sandbox defaults
    - _Requirements: 9.3, 9.4_

  - [x] 9.2 Implement `useLencoWidget` hook in `apps/admissions/src/hooks/useLencoWidget.ts`
    - Dynamic script loading from `VITE_LENCO_WIDGET_URL`
    - `openWidget(config)` calls `LencoPay.getPaid(...)` with public key, reference, amount, currency, customer details
    - Handle `onSuccess`, `onConfirmationPending`, `onClose` callbacks
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7_

  - [x] 9.3 Implement `useFeeResolver` hook in `apps/admissions/src/hooks/useFeeResolver.ts`
    - Call `GET /api/v1/payments/resolve-fee/` when program or nationality changes
    - Return fee amount, currency, loading state, error
    - _Requirements: 6.3, 6.4_

  - [x] 9.4 Implement `usePaymentStatus` hook in `apps/admissions/src/hooks/usePaymentStatus.ts`
    - Poll or listen via SSE for payment status updates
    - Return current status and refetch function
    - _Requirements: 8.5_

  - [x] 9.5 Redesign `PaymentStep` component in the Application Wizard
    - Display resolved fee amount and currency
    - "Pay Now" button opens Lenco widget via `useLencoWidget`
    - Show payment status indicators (pending, successful, failed)
    - Call `POST /api/v1/payments/initiate/` before opening widget
    - Call `POST /api/v1/payments/{id}/verify/` after widget `onSuccess`
    - Generate unique reference per attempt using `MIHAS-{app_number}-{timestamp_ms}` format
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.3, 3.1, 6.3, 8.1, 8.2_

- [x] 10. Checkpoint — Verify frontend widget integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Frontend — Remove deprecated manual payment code
  - [x] 11.1 Remove proof-of-payment upload, pay-now/pay-later radio, manual payment method dropdown, and manual payment detail fields from the payment step
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 11.2 Remove `PAYMENT_CONFIG` from `apps/admissions/src/config/payments.ts`
    - Delete or gut the file (remove hardcoded K153 fee and mobile money phone numbers)
    - _Requirements: 7.4_

  - [x] 11.3 Remove `paymentFlow.ts` module
    - Remove `requiresImmediatePayment`, `validatePaymentStep`, `buildApplicationPaymentUpdate` functions
    - _Requirements: 7.5_

  - [x] 11.4 Remove deprecated payment fields from Application Wizard form schema
    - Remove `payment_option`, `payment_method`, `payer_name`, `payer_phone`, `amount`, `paid_at`, `momo_ref` from Zod schema
    - _Requirements: 7.6_

  - [x] 11.5 Deprecate backend Application model inline payment fields in code
    - Add deprecation comments to `payment_method`, `payer_name`, `payer_phone`, `amount`, `paid_at`, `momo_ref`, `pop_url`, `receipt_number`, `payment_verified_at`, `payment_verified_by` fields
    - Do NOT drop columns from the database
    - _Requirements: 7.7_

- [x] 12. Checkpoint — Verify deprecated code removal
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Final checkpoint — Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property tests — can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (16 total)
- The SQL migration must be run via Neon MCP (`prepare_database_migration` → verify → `complete_database_migration`) before model code can be tested
- **Neon project ID:** `wild-bar-37055823`
- Backend environment variables (task 3.0) must be set before PaymentService (task 3.4) can call the Lenco API
- The existing `PaymentVerifyView` is admin-only (`IsAdmin`) for manual verify/reject — task 5.2 replaces it with a student-accessible Lenco API verification endpoint
- The `transition_application_status` service in `backend/apps/applications/services.py` is the canonical way to change application status — task 5.10 should use this, not raw `.save()`
- Celery Beat schedule uses float seconds for interval tasks (e.g., `900.0`) and `crontab()` for daily tasks — task 7.2 uses `600.0`
- The `migration_history` table uses `migration_name` (text, unique) — the script registers itself as `'lenco_payment_integration.sql'`
- The `payments` table has 0 rows in production — clean slate for Lenco integration
- The `applications.payment_status` default is confirmed as `'pending_review'` in live DB — migration changes it to `'pending'`
