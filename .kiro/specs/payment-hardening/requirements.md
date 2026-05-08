# Requirements Document

## Introduction

This document defines requirements for hardening the MIHAS admissions payment flow (Lenco integration) so that the backend is the sole authority for amount, currency, ownership, status, receipt eligibility, and final application payment state. The hardening makes payments ledger-first, race-safe, abuse-resistant, and recoverable across common failure modes: student retries, closed tabs, wrong identifiers, tampered frontend payloads, double-clicks, underpayment, and provider uncertainty.

The scope covers the canonical payment state machine, retry/ownership enforcement, fee integrity, webhook and verification resilience, database invariants, receipts, student-facing UX, and operational controls. Existing `/api/v1/payments/*` routes, filenames, and the Lenco widget integration are preserved; only the internal behavior becomes stricter and more defensible.

## Glossary

- **Payment**: A row in the `payments` table; canonical per-attempt record of an application fee interaction.
- **Payment_Service**: `backend/apps/documents/payment_service.PaymentService`, owner of lifecycle transitions.
- **Fee_Resolver**: `backend/apps/documents/fee_resolver.FeeResolver`, server-side source of truth for program+residency fees.
- **Webhook_Processor**: `backend/apps/documents/webhook_processor.WebhookProcessor`, validates and routes Lenco webhooks.
- **Mobile_Money_View**: `POST /api/v1/payments/mobile-money/` (`MobileMoneyInitiateView`).
- **Payment_Initiate_View**: `POST /api/v1/payments/initiate/` (`PaymentInitiateView`).
- **Payment_Verify_View**: `POST /api/v1/payments/{id}/verify/` (`PaymentVerifyView`).
- **Payment_Webhook_View**: `POST /api/v1/payments/webhook/lenco/`.
- **Fee_Resolver_View**: `GET /api/v1/payments/resolve-fee/`.
- **Application**: A row in the `applications` table; `Application.payment_status` is a derived summary of the latest canonical Payment.
- **Canonical_Payment_Status**: One of `pending`, `deferred`, `successful`, `failed`, `expired`, `force_approved`.
- **Forward_Only_Transition**: A transition allowed by the state machine; `successful`, `failed`, `expired`, `force_approved` are terminal unless corrected through the Super_Admin_Correction_Path.
- **Terminal_Status**: `successful`, `failed`, `expired`, `force_approved`.
- **Force_Approved**: An explicit non-cash ledger status created by an authorized admin/super-admin override with audit metadata; never created by provider flows.
- **Super_Admin_Correction_Path**: A dedicated, audited endpoint/path reserved for super-admins to correct ledger mistakes; not the normal admin review endpoint.
- **Payment_Snapshot**: Immutable metadata captured at initiation time: expected fee, waiver state, program, intake, residency, currency, and fee source.
- **Provider_Reference**: Lenco-issued reference returned in the provider response or webhook (`lencoReference`).
- **Webhook_Event_Identity**: Tuple used for webhook deduplication: provider event ID when present, otherwise `(event_type, reference, payload_hash)`.
- **Payment_Sensitive_Fields**: Fields that affect fee calculation or receipt identity: program, intake, institution, nationality, country (residency), applicant full name, NRC/passport number, and the application-level fee amount.
- **Receipt**: A generated document representing a verified payment; identified by a unique `receipt_number`.
- **Dev_Bypass**: Any code path that skips provider verification in non-production environments.
- **Risk_Flag**: A structured entry in `payments.metadata.risk_flags` describing an integrity anomaly (amount mismatch, currency mismatch, wrong owner, etc.).
- **Audit_Event**: A record written to the audit trail for security/finance-sensitive actions.
- **Active_Payment**: A Payment with status in `{pending, deferred}` for a given application.

## Requirements

### Requirement 1: Canonical Payment State Machine

**User Story:** As a platform operator, I want every payment to follow one documented forward-only state machine, so that status cannot silently reverse and application summaries remain consistent with the ledger.

#### Acceptance Criteria

1. THE Payment_Service SHALL treat the Payment record as the source of truth for payment status, and `Application.payment_status` SHALL be a derived summary of the latest canonical Payment for that application.
2. WHEN Payment_Service applies a status transition, THE Payment_Service SHALL allow only the following transitions: `pending → successful`, `pending → failed`, `pending → expired`, `deferred → pending`, `deferred → successful`, `deferred → failed`, `deferred → expired`.
3. WHEN a Payment is already in a Terminal_Status, THE Payment_Service SHALL ignore any non-terminal transition request and record a no-op log entry including the attempted source and target status.
4. IF Payment_Service receives a request to transition a Terminal_Status Payment to another status via the normal verify, webhook, or admin-review paths, THEN THE Payment_Service SHALL reject the transition and leave the Payment unchanged.
5. WHERE the Super_Admin_Correction_Path is used, THE Payment_Service SHALL permit correction of a Terminal_Status Payment only when the caller has `super_admin` role, a reason string of at least 10 characters is supplied, and an Audit_Event is written before the transition is persisted.
6. WHEN a Payment transitions to `successful`, `failed`, `expired`, or `force_approved`, THE Payment_Service SHALL update `Application.payment_status` in the same database transaction using the documented payment→application mapping.
7. THE Payment_Service SHALL expose a single internal transition entry point, and direct `UPDATE payments SET status=...` outside that entry point SHALL be prohibited in application code.

### Requirement 2: Admin Review Cannot Reverse Provider Outcomes

**User Story:** As a super admin, I want admin review to be unable to silently reverse a successful provider payment, so that finance records remain trustworthy.

#### Acceptance Criteria

1. WHEN an admin invokes `POST/PATCH /api/v1/applications/{id}/review/` with a payment status change, THE Payment_Service SHALL refuse to transition a `successful` Payment to `pending`, `deferred`, `failed`, or `pending_review`.
2. IF an admin submits a review that would reverse a `successful` Payment, THEN THE Payment_Service SHALL return error code `CANNOT_REVERSE_SUCCESSFUL_PAYMENT` with HTTP status 409 and leave both the Payment and the Application unchanged.
3. WHEN an admin verifies payment for an application that has no Payment record, THE Payment_Service SHALL create a `force_approved` override Payment instead of a zero-amount `successful` Payment.
4. WHERE a `force_approved` override Payment is created, THE Payment_Service SHALL record `reviewed_by` (actor id), `reviewed_at` (timestamp), `reason` (non-empty string from the admin), `actor_role`, and `override=true` in Payment.metadata.
5. IF admin review attempts to create a `force_approved` override without a reason string, THEN THE Payment_Service SHALL return error code `OVERRIDE_REASON_REQUIRED` with HTTP status 400.
6. THE Payment_Service SHALL log an Audit_Event of type `payment.force_approved` for every `force_approved` Payment creation, including actor, application id, amount, reason, and request IP/user-agent metadata.

### Requirement 3: One Active Payment Attempt Per Application

**User Story:** As a student, I want rapid clicks and retries to reuse my existing pending attempt, so that I never create duplicate charges or reach my retry limit artificially.

#### Acceptance Criteria

1. WHEN Payment_Initiate_View or Mobile_Money_View is called for an application with an existing Active_Payment, THE Payment_Service SHALL return the existing Active_Payment (`payment_id`, `reference`, `amount`, `currency`) instead of creating a new Payment.
2. WHILE concurrent initiation requests for the same application are in flight, THE Payment_Service SHALL serialize them using a row-level lock on the application so that at most one Active_Payment is created.
3. THE database SHALL enforce a partial unique constraint ensuring at most one Payment per `application_id` with status in `{pending, deferred}`.
4. WHEN `Payment.transaction_reference` is non-null, THE database SHALL enforce uniqueness of `transaction_reference` across the `payments` table.
5. IF a student exceeds the configured retry limit (default 5 non-excluded attempts per application), THEN THE Payment_Service SHALL return error code `MAX_PAYMENT_ATTEMPTS_EXCEEDED` with HTTP status 409 and SHALL NOT create a new Payment.
6. WHERE a Payment has status `expired` and was created more than 7 days before the current time, THE Payment_Service SHALL exclude that Payment from the retry count.

### Requirement 4: Ownership and Target Validation at Initiation

**User Story:** As a student, I want the backend to reject payment attempts for applications I do not own or that are already resolved, so that payments cannot be misrouted or wasted.

#### Acceptance Criteria

1. WHEN Payment_Initiate_View or Mobile_Money_View is called, THE Payment_Service SHALL resolve the target application using only the authenticated `request.user`, and SHALL use `application_id` from the request only to look up the application.
2. IF the authenticated user is not the owner of the target application, THEN THE Payment_Service SHALL return error code `NOT_OWNER` with HTTP status 403 and SHALL NOT create or mutate any Payment.
3. IF the target application is in status `draft` and fails application submission gates, THEN THE Payment_Service SHALL return error code `APPLICATION_NOT_PAYABLE` with HTTP status 409.
4. IF the target application has been deleted, does not exist, or has a mismatched `user_id`, THEN THE Payment_Service SHALL return error code `APPLICATION_NOT_FOUND` with HTTP status 404.
5. IF the target application already has a Payment in status `successful` or `force_approved`, THEN THE Payment_Service SHALL return error code `ALREADY_PAID` with HTTP status 409 and SHALL include the `payment_id` of the resolved Payment in the response envelope.
6. WHEN Payment_Initiate_View or Mobile_Money_View processes a request, THE Payment_Service SHALL ignore any `amount`, `currency`, `reference`, `payment_id`, `status`, or `operator` fields supplied in the request body for the purpose of determining backend truth.

### Requirement 5: Payment-Sensitive Field Lock After Payment Activity

**User Story:** As an admissions administrator, I want payment-sensitive application fields to lock once a student has started paying, so that fee amounts, residency, and receipt identity cannot be changed under an active payment.

#### Acceptance Criteria

1. WHILE an application has any Payment record with status in `{pending, deferred, successful, force_approved}`, THE application editing API SHALL reject changes to any Payment_Sensitive_Fields and return error code `PAYMENT_SENSITIVE_FIELDS_LOCKED` with HTTP status 409.
2. WHEN an application has any Payment record regardless of status (except where all payments are `expired`), THE application deletion API SHALL reject draft deletion and return error code `DRAFT_DELETE_BLOCKED_BY_PAYMENT` with HTTP status 409.
3. WHERE a super-admin uses the Super_Admin_Correction_Path to unlock an application, THE application editing API SHALL allow a bounded edit window and SHALL write an Audit_Event of type `payment.sensitive_fields_unlocked`.
4. WHEN Payment_Sensitive_Fields are locked, THE fee quoted by the Fee_Resolver for that application SHALL be computed using the locked snapshot values, not any newer draft edits.

### Requirement 6: Server-Side Fee Resolution and Payment Snapshot

**User Story:** As a finance reviewer, I want the fee that a student pays to be computed server-side every time and frozen on the Payment record, so that fee drift and frontend tampering cannot affect money received.

#### Acceptance Criteria

1. WHEN Payment_Initiate_View, Mobile_Money_View, or the defer path creates or returns a Payment, THE Fee_Resolver SHALL compute `amount`, `currency`, `residency_category`, and `fee_source` server-side from `ProgramFee`, active fee waivers, and application data.
2. WHEN a Payment is created, THE Payment_Service SHALL store a Payment_Snapshot in `Payment.metadata.snapshot` containing `expected_amount`, `currency`, `residency_category`, `program_code`, `intake_id`, `waiver_applied`, `original_amount`, and `fee_source`.
3. THE Payment_Snapshot SHALL be immutable once written; subsequent Payment_Service writes SHALL NOT overwrite existing snapshot fields.
4. WHEN Fee_Resolver_View returns a fee, THE response SHALL include `amount_due`, `currency`, `provider_fee_estimate`, and `customer_total` computed server-side, and the frontend SHALL display `customer_total` to the student without client-side recalculation.
5. IF Fee_Resolver cannot resolve a fee for the requested program and residency, THEN THE Fee_Resolver_View SHALL return error code `FEE_UNAVAILABLE` with HTTP status 404.

### Requirement 7: Amount, Currency, and Provider Reference Integrity

**User Story:** As a finance reviewer, I want the backend to reject any successful-path update whose amount, currency, or provider reference does not match the Payment_Snapshot, so that underpayment, overpayment, or corrupted references never become successful.

#### Acceptance Criteria

1. WHEN a verification or webhook path would transition a Payment to `successful`, THE Payment_Service SHALL compare the provider-reported amount against the Payment_Snapshot `expected_amount` using `Decimal` equality at 2 decimal places.
2. IF the provider-reported amount is less than, greater than, or unequal to `expected_amount`, THEN THE Payment_Service SHALL NOT transition the Payment to `successful`, SHALL write a Risk_Flag of type `amount_mismatch` with `expected`, `received`, and `source`, and SHALL leave status as `pending`.
3. IF the provider-reported currency is non-empty and differs (case-insensitive) from the Payment `currency`, THEN THE Payment_Service SHALL NOT transition the Payment to `successful` and SHALL write a Risk_Flag of type `currency_mismatch`.
4. IF the provider-reported amount is zero, negative, or unparseable as Decimal, THEN THE Payment_Service SHALL NOT transition the Payment to `successful` and SHALL write a Risk_Flag of type `invalid_amount`.
5. IF a `collection.successful` webhook or `successful` verify response arrives without a non-empty `lencoReference` (or provider-equivalent reference), THEN THE Payment_Service SHALL NOT transition the Payment to `successful` and SHALL write a Risk_Flag of type `missing_provider_reference`.
6. WHEN the Payment_Service writes a Risk_Flag, THE Payment_Service SHALL preserve the current Payment status, append the flag to `Payment.metadata.risk_flags`, and emit an Audit_Event of type `payment.risk_flag`.

### Requirement 8: Webhook Signature Validation and Deduplication

**User Story:** As an operator, I want Lenco webhooks to be signature-validated and deduplicated before any state change, so that forged or replayed events cannot corrupt the ledger.

#### Acceptance Criteria

1. WHEN Payment_Webhook_View receives a request, THE Webhook_Processor SHALL validate the `X-Lenco-Signature` header using HMAC-SHA512 over the raw request body with the SHA-256 hash of `LENCO_API_SECRET_KEY` as key, and SHALL use constant-time comparison.
2. IF signature validation fails, THEN THE Webhook_Processor SHALL write a `WebhookEventLog` row with `signature_valid=false` and `processing_error='Invalid webhook signature'`, SHALL NOT mutate any Payment, and SHALL return HTTP 200.
3. WHEN a webhook event is received with a provider-supplied event id (`payload.data.id`, `payload.data.eventId`, or `payload.data.event_id`), THE Webhook_Processor SHALL treat the Webhook_Event_Identity as that provider event id.
4. WHERE no provider event id is present, THE Webhook_Processor SHALL compute the Webhook_Event_Identity as `(event_type, reference, sha256(canonical_json(payload)))`.
5. WHEN a webhook event arrives whose Webhook_Event_Identity matches a previously processed `WebhookEventLog` row with `processed=true`, THE Webhook_Processor SHALL write a duplicate-marker `WebhookEventLog` row, SHALL NOT invoke Payment_Service, and SHALL return HTTP 200.
6. THE database SHALL enforce that no two `WebhookEventLog` rows have the same Webhook_Event_Identity for `processed=true` rows.
7. WHEN Payment_Webhook_View receives an `event_type` outside the known set (`collection.successful`, `collection.failed`, `collection.settled`), THE Webhook_Processor SHALL log the event with `processed=true` and `processing_error='Unrecognised event type'`, and SHALL NOT mutate any Payment.

### Requirement 9: Out-of-Order and Late Webhook Safety

**User Story:** As a finance reviewer, I want late or out-of-order webhooks to never reverse a successful payment, so that once money is confirmed it stays confirmed.

#### Acceptance Criteria

1. WHEN a `collection.failed` webhook arrives for a Payment that is already `successful` or `force_approved`, THE Payment_Service SHALL NOT change the status and SHALL log an Audit_Event of type `payment.late_failed_webhook_ignored`.
2. WHEN a `collection.settled` webhook arrives for any Payment, THE Payment_Service SHALL update `Payment.metadata.settlement` only, and SHALL NOT change Payment status.
3. WHEN two `collection.successful` webhooks arrive for the same Payment, THE Payment_Service SHALL apply the transition at most once and SHALL treat the second event as a duplicate no-op.
4. WHILE a Payment is in `pending` state and a `collection.failed` webhook arrives with a valid signature and non-empty reason, THE Payment_Service SHALL transition the Payment to `failed` and persist the reason in `Payment.notes` (truncated to 500 characters).

### Requirement 10: Idempotent Verification with Stable Error Codes

**User Story:** As a student, I want retrying verification to always be safe, so that double-clicks and polling never corrupt my payment.

#### Acceptance Criteria

1. WHEN Payment_Verify_View is called for a Payment in any Terminal_Status, THE Payment_Service SHALL return the current Payment state without calling Lenco.
2. WHEN Payment_Verify_View is called for a Payment in `pending` state and the Lenco API is unreachable or returns a non-2xx response, THE Payment_Verify_View SHALL leave the Payment in `pending` and return a response envelope with stable code `PROVIDER_UNAVAILABLE`.
3. WHEN Payment_Verify_View successfully reads a Lenco status of `pay-offline`, `otp-required`, or `pending`, THE Payment_Service SHALL leave the Payment in `pending` and return stable code `PAYMENT_PENDING`.
4. WHEN Payment_Verify_View successfully confirms a `successful`/`paid` status with matching amount, currency, and provider reference, THE Payment_Service SHALL transition the Payment to `successful` and return stable code `PAYMENT_CONFIRMED`.
5. IF Payment_Verify_View detects an amount mismatch, THEN THE Payment_Verify_View SHALL return stable code `AMOUNT_MISMATCH` and leave the Payment in `pending`.
6. IF Payment_Verify_View is called by a user who does not own the referenced Payment, THEN THE Payment_Verify_View SHALL return stable code `NOT_OWNER` with HTTP status 403.
7. THE response envelope for Payment_Verify_View SHALL preserve the `{"success": boolean, "data": ...}` shape and include the stable code in `data.code`.

### Requirement 11: Mobile Money Uncertainty Handling

**User Story:** As a student paying via mobile money, I want the backend to keep uncertain provider calls as pending so I can complete them on my phone without being told I failed.

#### Acceptance Criteria

1. WHEN Mobile_Money_View calls Lenco and receives a non-2xx response, a timeout, or a provider-level "unknown" result, THE Payment_Service SHALL record provider-initiation state via `mark_provider_initiation` with status `unknown` and SHALL leave the Payment in `pending`.
2. WHEN Mobile_Money_View calls Lenco and the provider accepts the request, THE Payment_Service SHALL record provider-initiation state as `accepted` and SHALL leave the Payment in `pending` until webhook or verify confirms.
3. IF Mobile_Money_View calls Lenco and the provider explicitly rejects the request (e.g., invalid operator or number), THEN THE Payment_Service SHALL record provider-initiation state as `rejected` and SHALL leave the Payment in `pending`, and the API response SHALL include `next_action=retry_with_different_number` and a user-facing message.
4. THE Payment_Service SHALL never transition a Payment to `failed` solely because a provider HTTP call timed out or returned 5xx.
5. WHEN Mobile_Money_View receives a phone number, THE Payment_Service SHALL normalize the number server-side and determine the operator server-side, and SHALL NOT trust operator or normalized-phone fields supplied in the request body.
6. THE Payment_Service SHALL store only a hash and the last 4 digits of the submitted phone number in `Payment.metadata.provider_initiation`, and SHALL NOT store the full phone number.

### Requirement 12: Database Invariants and Preflight Migrations

**User Story:** As a platform engineer, I want database-level invariants backing the payment state machine, so that concurrency bugs or application-layer mistakes cannot corrupt the ledger.

#### Acceptance Criteria

1. THE database migration SHALL add a partial unique index enforcing at most one Payment per `application_id` with `status IN ('pending','deferred')`.
2. THE database migration SHALL add a unique index on `payments.transaction_reference` where `transaction_reference IS NOT NULL`.
3. THE database migration SHALL add a unique index on `payments.receipt_number` where `receipt_number IS NOT NULL`.
4. THE database migration SHALL add an index to `webhook_event_logs` enforcing uniqueness of `(event_type, reference, payload_hash)` for `processed=true` rows, and an index on `provider_event_id` where non-null.
5. THE database migration SHALL add supporting indexes on `payments(application_id)`, `payments(user_id, status)`, and `payments(status, created_at)`.
6. WHEN a migration for a new uniqueness constraint is applied, THE migration SHALL execute a preflight `SELECT` that identifies existing conflicting rows and SHALL abort with a descriptive error if conflicts are detected.
7. THE migration file SHALL include a matching `DOWN` SQL block that drops every index, constraint, and column the `UP` block introduced.

### Requirement 13: Receipt Generation Integrity

**User Story:** As a student, I want a receipt only for a genuinely successful or clearly marked force-approved payment, and I never want duplicate receipt numbers.

#### Acceptance Criteria

1. WHEN a Payment transitions to `successful` or `force_approved`, THE Payment_Service SHALL generate exactly one Receipt for that Payment.
2. IF receipt generation is invoked for a Payment already carrying a non-null `receipt_number`, THEN THE Payment_Service SHALL return the existing Receipt and SHALL NOT allocate a new `receipt_number`.
3. THE database SHALL enforce global uniqueness of `payments.receipt_number` when non-null.
4. IF receipt generation is invoked for a Payment whose status is `pending`, `deferred`, `failed`, or `expired`, THEN THE Payment_Service SHALL return error code `RECEIPT_NOT_ELIGIBLE` with HTTP status 409 and SHALL NOT create a Receipt.
5. WHERE a Receipt is generated for a `force_approved` Payment, THE Receipt SHALL include a visible "Administrative Override" label, the override reason (redacted of PII), the actor role, and the override timestamp.
6. THE Receipt SHALL include `payment_reference`, `provider_reference` (when present), `amount`, `currency`, `status`, `timestamp`, applicant full name, program, and intake.

### Requirement 14: Frontend Payment UX Safety

**User Story:** As a student on a slow connection, I want the payment UI to protect me from double-clicks, timeouts, and refresh-induced loss, so that I can always recover my pending attempt.

#### Acceptance Criteria

1. WHILE a payment initiation request is in flight or a Payment is in `pending` state, THE PaymentStep and PaymentForm components SHALL disable the initiate button for both mobile money and card methods.
2. WHEN Payment_Service returns a Payment in `pending` state, THE frontend SHALL persist the `payment_id` and application context in a recovery store keyed to the application so the student can resume after a refresh or navigation.
3. WHEN `usePaymentStatus` polling for a `pending` Payment exceeds the configured timeout, THE PaymentStep SHALL display a "still confirming" state with manual re-check and retry affordances, and SHALL NOT mark the Payment as failed in the UI.
4. WHEN the backend response includes `next_action`, THE PaymentStep SHALL render the corresponding user-facing guidance (e.g., "retry with different number", "already paid", "unavailable").
5. WHILE a phone number is being entered, THE PaymentForm SHALL validate format locally (Zambian MSISDN patterns) but SHALL NOT attempt to determine the operator on the client.
6. WHEN the Payment is already in a terminal successful state (including `force_approved`), THE PaymentStep SHALL render an "already paid" state with receipt access and SHALL NOT allow a new initiation.
7. WHEN the retry limit is reached, the provider is unavailable, the pending attempt has expired, or admin follow-up is required, THE PaymentStep SHALL render a distinct state per case using the stable code returned by the backend.

### Requirement 15: Standardized Error Envelope for Payment Endpoints

**User Story:** As a frontend engineer, I want payment errors to use stable machine-readable codes, so that UX states and analytics can branch reliably.

#### Acceptance Criteria

1. THE Payment_Initiate_View, Mobile_Money_View, Payment_Verify_View, and Fee_Resolver_View SHALL return responses using the `{"success": boolean, "data": ..., "error": ...}` envelope.
2. WHEN a payment endpoint returns an error, THE response SHALL set `success=false` and SHALL include `error.code`, `error.message`, and optional `error.details`.
3. THE set of stable error codes for payment endpoints SHALL include at minimum: `NOT_OWNER`, `APPLICATION_NOT_FOUND`, `APPLICATION_NOT_PAYABLE`, `ALREADY_PAID`, `MAX_PAYMENT_ATTEMPTS_EXCEEDED`, `PAYMENT_PENDING`, `PAYMENT_CONFIRMED`, `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, `MISSING_PROVIDER_REFERENCE`, `PROVIDER_UNAVAILABLE`, `FEE_UNAVAILABLE`, `PAYMENT_SENSITIVE_FIELDS_LOCKED`, `DRAFT_DELETE_BLOCKED_BY_PAYMENT`, `CANNOT_REVERSE_SUCCESSFUL_PAYMENT`, `OVERRIDE_REASON_REQUIRED`, and `RECEIPT_NOT_ELIGIBLE`.
4. WHEN a payment endpoint succeeds, THE response SHALL set `success=true` and place domain payload in `data` (and SHALL include an optional `data.next_action` where applicable).
5. THE documented stable codes SHALL NOT change meaning across releases; new cases SHALL be added as new codes rather than repurposed codes.

### Requirement 16: Dev-Bypass Lockout in Production

**User Story:** As a security engineer, I want any developer-bypass path to be unreachable in production, so that auth or provider checks cannot be skipped on live traffic.

#### Acceptance Criteria

1. WHERE `DEBUG=False` or `DJANGO_ENV=production`, THE Payment_Initiate_View, Mobile_Money_View, Payment_Verify_View, and Payment_Webhook_View SHALL refuse any `dev-bypass`, `DEV_BYPASS_AUTH`, or equivalent query/body/header flag and SHALL return HTTP 404.
2. WHEN a Dev_Bypass flag is supplied in a non-production environment, THE Payment_Service SHALL write an Audit_Event of type `payment.dev_bypass_used` including caller identity and request path.
3. THE test suite SHALL include a regression test asserting that every payment view returns HTTP 404 for Dev_Bypass attempts when production settings are active.

### Requirement 17: Audit Events and Metrics

**User Story:** As an operator, I want auditable records and observable metrics for every security- or money-sensitive payment event, so that fraud, abuse, and reliability issues can be detected and investigated.

#### Acceptance Criteria

1. WHEN any of initiation, provider acceptance/rejection/unknown, webhook processing, Risk_Flag creation, admin override, receipt generation, or Terminal_Status transition occurs, THE Payment_Service SHALL write an Audit_Event including actor, action, target Payment id, application id, and relevant metadata.
2. THE Payment_Service SHALL emit counters for: `payment.initiation.success`, `payment.initiation.duplicate`, `payment.initiation.failure`, `payment.webhook.invalid_signature`, `payment.webhook.duplicate`, `payment.risk.amount_mismatch`, `payment.risk.currency_mismatch`, `payment.provider.unknown`, `payment.admin.override`, and `payment.receipt.generated`.
3. WHEN a Risk_Flag is recorded, THE Payment_Service SHALL include the risk type and source in the emitted metric labels.
4. THE Audit_Event payload SHALL NOT include the student's full phone number, full NRC number, or any document contents; only hashed or masked identifiers are permitted.
5. THE backend SHALL expose a super-admin-only endpoint to list recent Risk_Flags filtered by type and date range for operational review.

### Requirement 18: Reconciliation and Expiry

**User Story:** As an operator, I want stale pending payments to be reconciled and expired automatically, so that the ledger reflects final outcomes without manual intervention.

#### Acceptance Criteria

1. WHEN `poll_pending_payments_task` runs, THE Payment_Service SHALL re-query Lenco for every Payment in `pending` state older than 5 minutes, up to the configured batch cap per run.
2. WHEN a `pending` Payment is older than 24 hours and no terminal status has been returned by the provider, THE Payment_Service SHALL transition the Payment to `expired` and emit an Audit_Event of type `payment.expired_by_reconciliation`.
3. IF reconciliation detects a provider `successful` state with matching amount, currency, and reference, THEN THE Payment_Service SHALL transition the Payment to `successful` following the standard transition rules.
4. WHEN reconciliation detects an amount/currency/reference mismatch, THE Payment_Service SHALL record a Risk_Flag and SHALL NOT transition the Payment.
5. THE reconciliation task SHALL be idempotent; re-running the task SHALL NOT duplicate state changes or receipts.

### Requirement 19: Rate Limiting on Payment Endpoints

**User Story:** As a security engineer, I want per-user rate limits on payment endpoints, so that abusive automation cannot exhaust provider quotas or dominate reconciliation.

#### Acceptance Criteria

1. WHEN an authenticated user calls Payment_Initiate_View, Mobile_Money_View, or Payment_Verify_View more than the configured per-user per-minute threshold, THE backend SHALL return HTTP 429 with stable code `RATE_LIMITED`.
2. THE rate limiter SHALL key by authenticated `user_id` (not IP) and SHALL fall back to IP keying for unauthenticated endpoints like the webhook.
3. WHEN the rate limiter triggers, THE backend SHALL log an Audit_Event of type `payment.rate_limited` and SHALL emit a counter `payment.rate_limited` with endpoint and user-role labels.
4. THE per-user rate limit SHALL NOT apply to the Payment_Webhook_View; webhook ingress SHALL instead be gated by signature validation.

### Requirement 20: Correctness Properties for Property-Based Testing

**User Story:** As a quality engineer, I want explicit correctness properties for the payment state machine so property tests can find race conditions, regressions, and edge cases automatically.

#### Acceptance Criteria

1. FOR ALL sequences of `N` concurrent initiation requests for the same application by the owner, THE Payment_Service SHALL produce at most one Active_Payment, and all responses SHALL return the same `payment_id` (race-safety property).
2. FOR ALL Payments `p` with status in `{successful, failed, expired, force_approved}` and ALL inputs `i` (verify, webhook, admin-review non-override), APPLY(p, i) SHALL leave `p.status` unchanged (forward-only / terminal-stability property).
3. FOR ALL webhook event sequences `[e1, e2, ..., ek]` for the same Payment where any `ei` is `collection.successful` and passes validation, THE final Payment status SHALL be `successful` regardless of the order of the remaining events, provided no event is `force_approved`-inducing (out-of-order safety property).
4. FOR ALL webhook events `e`, PROCESS(e) followed by PROCESS(e) SHALL leave the Payment state identical to a single PROCESS(e) (webhook idempotence property).
5. FOR ALL Payment_Snapshots `s` and ALL provider responses `r`, IF `r.amount ≠ s.expected_amount` OR `r.currency ≠ s.currency` OR `r.provider_reference` is empty, THEN the Payment SHALL NOT transition to `successful` (amount/currency/reference integrity property).
6. FOR ALL successful Payments `p`, generating a Receipt for `p` `k` times SHALL produce exactly one `receipt_number` and `k` identical Receipt payloads (receipt idempotence property).
7. FOR ALL applications `a` and ALL Active_Payments queries, the database invariant `COUNT(payments WHERE application_id = a AND status IN ('pending','deferred')) ≤ 1` SHALL hold (single-active invariant).
8. FOR ALL Payments `p` with a non-null `transaction_reference`, `COUNT(payments WHERE transaction_reference = p.transaction_reference) = 1` SHALL hold (reference uniqueness).
9. FOR ALL Payments `p` with a non-null `receipt_number`, `COUNT(payments WHERE receipt_number = p.receipt_number) = 1` SHALL hold (receipt uniqueness).
10. FOR ALL valid fee-resolver inputs `(program, residency, waiver_state)`, Fee_Resolver SHALL be deterministic: two resolutions with the same inputs SHALL return the same `(amount, currency, residency_category, fee_source)` (resolver determinism).
11. FOR ALL frontend submissions of `amount`, `currency`, `reference`, or `status` in initiation requests, the resulting server-side Payment SHALL have values derived only from Fee_Resolver and server-generated identifiers (tamper-resistance property).
12. FOR ALL mobile-money initiations where the provider HTTP call times out or returns 5xx, the resulting Payment SHALL remain in `pending` (provider-uncertainty property).

### Requirement 21: Parser and Serializer Integrity for Webhook Payloads

**User Story:** As a platform engineer, I want the canonical webhook payload hashing and identity parsing to be robust and round-trip tested, so that deduplication is reliable.

#### Acceptance Criteria

1. THE Webhook_Processor SHALL compute `payload_hash` using a canonical JSON serialization with sorted keys, no whitespace, and deterministic handling of non-JSON-native values (`default=str`).
2. FOR ALL dictionaries `d` that are valid JSON-compatible payloads, `canonical_json(parse(canonical_json(d))) == canonical_json(d)` SHALL hold (canonical-form round-trip property).
3. THE Webhook_Processor SHALL expose a pretty-printer that renders `Webhook_Event_Identity` for logs and Audit_Events without revealing raw payload bodies containing PII.
4. FOR ALL valid `Webhook_Event_Identity` values `i`, `parse_identity(print_identity(i)) == i` SHALL hold (identity round-trip property).
5. IF canonical JSON serialization fails, THEN THE Webhook_Processor SHALL write a `WebhookEventLog` row with `processing_error='Canonical serialization failed'` and SHALL NOT mutate any Payment.

### Requirement 22: Non-Functional Requirements

**User Story:** As a platform stakeholder, I want payment hardening to meet explicit non-functional targets, so that the system is secure, performant, and auditable without regressing the student experience.

#### Acceptance Criteria

1. THE Payment_Initiate_View and Mobile_Money_View SHALL return a response within 3 seconds at the 95th percentile under nominal load, measured excluding provider call time.
2. THE Payment_Verify_View SHALL return a cached Terminal_Status response within 500 ms at the 95th percentile when no provider call is required.
3. THE Webhook_Processor SHALL process a valid webhook within 2 seconds at the 95th percentile excluding downstream notification sends.
4. THE Payment_Service SHALL NOT log full phone numbers, full NRC/passport numbers, card PANs, CVVs, or document bodies at any log level.
5. THE Payment_Service and Webhook_Processor SHALL log structured events suitable for GlitchTip and downstream SIEM consumption, including request id, user id, application id, and payment id where available.
6. THE Payment_Service code paths introduced by this hardening SHALL preserve existing API routes, filenames, and the `{"success": true, "data": ...}` response envelope, and SHALL preserve the existing Lenco widget integration and mobile-money-first UX.
7. THE backend SHALL preserve backward compatibility with existing Payment rows; new constraints SHALL be introduced with preflight checks and rollback SQL per Requirement 12.
8. THE frontend SHALL preserve accessibility of the PaymentStep (keyboard focus, visible state changes announced via `aria-live`, retention of error role semantics per `ErrorDisplay`).
