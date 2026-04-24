# Payment Flow Deep Analysis

**Date:** 2026-04-25
**Scope:** All payment-related backend code — service, views, webhook, fee resolver, tasks, URL routing, and submission checks.

---

## 1. payment_service.py — Payment Lifecycle Service

### What It Does
Central service managing the full Lenco payment lifecycle: initiation, verification, webhook processing, admin review, and deferral. All payment-status mutations flow through this module to enforce forward-only transition rules and amount-mismatch detection.

### State Transitions

**Allowed forward-only transitions (`_ALLOWED_TRANSITIONS`):**
| From | To |
|------|-----|
| `pending` | `successful`, `failed`, `expired` |
| `deferred` | `pending`, `successful`, `failed`, `expired` |

**Lenco API status mapping (`_LENCO_STATUS_MAP`):**
| Lenco Status | Internal Status |
|-------------|----------------|
| `successful` | `successful` |
| `paid` | `successful` |
| `failed` | `failed` |
| `pending` | `pending` |
| `pay-offline` | `pending` |
| `otp-required` | `pending` |

**Application payment_status sync (`_PAYMENT_TO_APP_STATUS`):**
| Payment Status | Application Status |
|---------------|-------------------|
| `successful` | `verified` |
| `paid` | `verified` |
| `failed` | `failed` |

### Methods

#### `initiate_payment(application_id, user_id)`
- Creates a `pending` Payment record with resolved fee.
- **Idempotency:** Returns existing pending payment if one exists (atomic + `select_for_update`).
- **Retry limit:** Max 5 attempts per application. Expired payments older than 7 days excluded from count.
- **Fee waiver:** Applies partial waiver via `FeeWaiverService.get_effective_fee()` — silently falls back to full fee on error.
- **Already-paid shortcut:** Returns a result with `payment_id=None` and zero amount if application already has `successful`/`verified`/`force_approved` status.

#### `defer_payment(application_id, user_id)`
- Creates a `deferred` Payment record.
- **Idempotency:** Returns existing deferred payment if one exists.
- Syncs `Application.payment_status = 'deferred'` via raw `.update()`.

#### `verify_payment(payment_id)`
- Calls Lenco `GET /collections/status/{reference}` API.
- **Short-circuit:** If payment is not `pending`, returns current state without API call.
- **Amount mismatch:** Blocks transition to `successful` if Lenco amount ≠ stored amount.
- Updates payment via `_update_payment_status()`.

#### `process_webhook_event(event_type, reference, payload)`
- Handles `collection.successful`, `collection.failed`, `collection.settled`.
- **Row-level locking:** `select_for_update()` inside `transaction.atomic()`.
- `collection.settled` only updates metadata, no status change.
- **Amount mismatch:** On `collection.successful`, blocks if amounts don't match.
- **Currency mismatch:** Logs warning but does NOT block the transition (inconsistent with amount handling).

#### `review_application_payment(application_id, payment_status, reviewed_by_id, notes)`
- Admin payment review. Maps review statuses: `pending_review`→`pending`, `verified`→`successful`, `rejected`→`failed`, `deferred`→`deferred`.
- Creates synthetic payment record if none exists and admin is verifying/deferring.
- Blocks backward transition from `successful` to `pending`/`deferred`.
- Syncs `Application.payment_status` and sends communication.

#### `_update_payment_status(payment, new_status, lenco_data)`
- Core transition engine. Re-reads row with `select_for_update()` for latest status.
- Enforces forward-only transitions.
- Triple amount-mismatch check on `successful` transition.
- Syncs application payment_status inside same atomic block.
- Emits business metric on successful payment.

### Error Paths
1. `initiate_payment`: `ValueError("MAX_PAYMENT_ATTEMPTS_EXCEEDED|0")` — pipe-delimited error string (fragile parsing).
2. `initiate_payment`: `ValueError` if program not found.
3. `verify_payment`: Returns error string in `PaymentVerificationResult.error` for API failures, missing config, non-JSON responses, amount mismatch.
4. `process_webhook_event`: Silent no-op if payment not found (logs warning).
5. `review_application_payment`: `ValueError("PAYMENT_RECORD_REQUIRED")` if no payment and status isn't verified/deferred. `ValueError("CANNOT_REVERSE_SUCCESSFUL_PAYMENT")` for backward transitions.

### Gaps and Issues

**GAP-PS-1: Currency mismatch is logged but not blocked.**
In `process_webhook_event`, currency mismatch only logs a warning. Amount mismatch blocks the transition. This is inconsistent — a payment in USD matching a ZMW amount would be accepted.

**GAP-PS-2: `_ALLOWED_TRANSITIONS` is incomplete.**
`successful`, `failed`, and `expired` are terminal — no outbound transitions defined. This is correct behavior but not explicitly documented in the dict. The `force_approved` status used elsewhere is not in the transition map at all.

**GAP-PS-3: `defer_payment` doesn't check retry limits.**
`initiate_payment` enforces MAX_PAYMENT_ATTEMPTS but `defer_payment` does not. A student could create unlimited deferred records (though idempotency returns existing deferred).

**GAP-PS-4: `defer_payment` doesn't check if a pending payment already exists.**
If a student has a pending payment and then defers, both records coexist. The pending payment could still be completed via webhook, creating a conflict with the deferred status on the application.

**GAP-PS-5: Application payment_status sync uses different mechanisms.**
- `_update_payment_status` uses `Application.objects.filter().update()` (raw SQL).
- `review_application_payment` uses `application.save(update_fields=[...])`.
- `defer_payment` uses `Application.objects.filter().update()`.
This inconsistency means some paths don't trigger Django signals or model `save()` hooks.

**GAP-PS-6: `initiate_payment` returns `payment_id=None` for already-paid.**
The caller must handle this special case. `MobileMoneyInitiateView` does check for this, but it's a fragile API contract.

**GAP-PS-7: Reference generation uses millisecond timestamp — not guaranteed unique.**
`_generate_reference` uses `int(time.time() * 1000)`. Two rapid calls for the same application could theoretically collide, though the DB unique constraint would catch it.

**GAP-PS-8: Triple amount-mismatch check is redundant.**
Amount is checked in `verify_payment`, `process_webhook_event`, AND `_update_payment_status`. The first two call `_update_payment_status` which checks again. The outer checks return early before reaching `_update_payment_status`, so they're not truly redundant — but the logic is scattered.

**GAP-PS-9: No rate limiting on `verify_payment`.**
The Lenco API call has no per-user or per-payment rate limit. A malicious client could hammer the verify endpoint.

### Hardcoded Values
- `MAX_PAYMENT_ATTEMPTS = 5`
- `EXPIRED_EXCLUSION_DAYS = 7`
- `_LENCO_TIMEOUT = 15` seconds
- `_PAYMENT_TO_APP_STATUS` mapping (inside `_update_payment_status`)
- `User-Agent: MIHAS/2.0`
- Currency `'ZMW'` in synthetic admin payment records

### Race Conditions
- **Mitigated:** `initiate_payment` uses `select_for_update` to prevent double-payment creation.
- **Mitigated:** `_update_payment_status` re-reads with `select_for_update` to serialize concurrent webhook + verify.
- **Mitigated:** `process_webhook_event` uses `select_for_update` for payment lookup.
- **Potential:** `defer_payment` checks for existing deferred payment with `select_for_update`, but doesn't check for existing pending payment. A concurrent initiate + defer could create both.

---

## 2. views.py — Payment-Related Views

### PaymentListView (`GET /api/v1/payments/`)
- Lists payments for authenticated user. Students see own, admins see all.
- Supports `?application_id=` filter.
- Uses `StandardPagination`.
- **GAP-V-1:** Does not use the `{"success": true, "data": ...}` envelope for the non-paginated fallback path. The paginated path uses `get_paginated_response` which may or may not wrap in the envelope depending on `StandardPagination` implementation.

### PaymentInitiateView (`POST /api/v1/payments/initiate/`)
- Creates pending payment via `PaymentService.initiate_payment()`.
- Returns Lenco public key for frontend widget.
- **Error handling:** Catches `ValueError` (parses `MAX_PAYMENT_ATTEMPTS_EXCEEDED|N` string), generic `Exception`.
- Emits metrics on success and failure.
- **GAP-V-2:** No per-user rate limiting. Noted in AUDIT-REPORT as a known open issue.
- **GAP-V-3:** `application_id` is not validated as UUID before passing to `Application.objects.get()`. Django's UUID field will raise `ValidationError` which is not caught — would result in 500.

### PaymentVerifyView (`POST /api/v1/payments/{id}/verify/`)
- Verifies payment via Lenco API through `PaymentService.verify_payment()`.
- Ownership check: students verify own, admins verify any.
- **GAP-V-4:** No per-user rate limiting. Known open issue from audit.
- **GAP-V-5:** Returns `status=200` even when `result.error` is set (with `success: false`). This is semantically odd — a verification error returns HTTP 200.

### PaymentReceiptView (`GET /api/v1/payments/{id}/receipt/`)
- Returns receipt data for a payment.
- Ownership check: students see own, admins see all.
- **GAP-V-6:** Response does not use the `{"success": true, "data": ...}` envelope. Returns raw receipt dict.
- **GAP-V-7:** No check that payment is in `successful` status. Receipts can be generated for pending/failed/expired payments.

### DeferPaymentView (`POST /api/v1/payments/defer/`)
- Creates deferred payment via `PaymentService.defer_payment()`.
- Ownership check present.
- **GAP-V-8:** `application_id` not validated as UUID (same as PaymentInitiateView).

### MobileMoneyInitiateView (`POST /api/v1/payments/mobile-money/`)
- Initiates mobile money collection via Lenco API.
- Phone normalization: handles Zambian formats (0XX, 260XX, 9-digit).
- Reuses existing pending payment if one exists (avoids creating duplicate).
- Calls Lenco `POST /collections/mobile-money` with phone, operator, reference.
- Updates payment record with Lenco reference after API call.
- **GAP-V-9:** Phone normalization doesn't validate the result. A non-Zambian number could pass through with just `+` prepended.
- **GAP-V-10:** The Lenco API call and the payment metadata update are NOT atomic. If the metadata update fails, the payment is initiated with Lenco but the local record doesn't have the Lenco reference. The `except Exception: pass` pattern silently swallows this.
- **GAP-V-11:** `operator` validation only checks `airtel`/`mtn`. If Lenco adds new operators, this is a hardcoded blocklist.
- **GAP-V-12:** The existing pending payment reuse path (`existing_pending`) doesn't use `select_for_update`, creating a TOCTOU race with concurrent requests.
- **GAP-V-13:** `float(amount)` is used in the Lenco API payload. This loses Decimal precision. Should use `str(amount)` or check Lenco's expected format.

### PaymentDevBypassView (`POST /api/v1/payments/dev-bypass/`)
- Development-only endpoint. Guarded by `DEBUG=True` AND `PAYMENT_DEV_BYPASS=True`.
- Creates or updates payment to `successful` status.
- Sets `application.payment_status = "successful"` directly.
- **GAP-V-14:** Bypasses the forward-only transition rules in `PaymentService`. Sets status directly on the model. This is acceptable for dev-only but the guard relies on `settings.DEBUG` which is a known audit issue (`IsAuthenticatedOrDebug`).

### LencoWebhookView (`POST /api/v1/payments/webhook/lenco/`)
- Unauthenticated (`AllowAny`), no CSRF.
- Validates `X-Lenco-Signature` header via `WebhookProcessor`.
- Returns 401 for invalid signature (after logging the event).
- Returns 200 for valid events.
- **GAP-V-15:** No rate limiting on the webhook endpoint. An attacker could flood it with invalid payloads, filling the `webhook_event_logs` table.
- **GAP-V-16:** Returns 200 even if processing fails internally. The `WebhookProcessor.process()` catches exceptions and logs them but the view always returns 200 for valid signatures. This is actually correct webhook behavior (prevents retries for processing errors) but means Lenco won't retry on transient failures.

### FeeResolveView (`GET /api/v1/payments/resolve-fee/`)
- Resolves fee for program + residency.
- Query params: `program_code`, `nationality`, `country`.
- **No issues found.** Clean implementation.

### ProgramFeeViewSet (`CRUD /api/v1/programs/{id}/fees/`)
- Admin-only CRUD for program fees.
- Validates unique active constraint on (program, fee_type, residency_category).
- Soft delete (sets `is_active=False`).
- **No significant issues found.**

---

## 3. webhook_processor.py — Webhook Event Validation and Processing

### What It Does
Validates HMAC-SHA512 signatures on incoming Lenco webhooks, logs every event to `webhook_event_logs`, and delegates payment status updates to `PaymentService`.

### Signature Validation
Algorithm:
1. `webhook_hash_key = SHA-256(LENCO_API_SECRET_KEY)`
2. `expected = HMAC-SHA512(raw_body, webhook_hash_key)`
3. `valid = hmac.compare_digest(expected, signature)`

Uses constant-time comparison — correct.

### Event Processing Flow
1. Extract `reference` from `payload.data.reference`.
2. **Dedup check:** If `(reference, event_type)` already processed, log duplicate and return.
3. Create `WebhookEventLog` record (always, even for invalid signatures).
4. If signature invalid → mark error, return.
5. If event type not in `_KNOWN_EVENT_TYPES` → mark processed with error, return.
6. If no reference → mark error, return.
7. Delegate to `PaymentService.process_webhook_event()`.
8. On success → mark processed. On exception → log error.

### Known Event Types
- `collection.successful`
- `collection.failed`
- `collection.settled`

### Error Paths
1. Missing `LENCO_API_SECRET_KEY` → signature validation returns `False`, event logged with invalid signature.
2. Invalid signature → event logged, 401 returned by view.
3. Unrecognized event type → logged as processed with error message.
4. Missing reference → logged with error, NOT marked as processed.
5. Processing exception → logged with generic error message.

### Gaps and Issues

**GAP-WH-1: Dedup check has a race condition.**
The dedup check (`WebhookEventLog.objects.filter(...).exists()`) and the subsequent `WebhookEventLog.objects.create()` are not atomic. Two concurrent identical webhooks could both pass the dedup check and both get processed.

**GAP-WH-2: Missing reference events are never marked as processed.**
When `reference` is empty, the log entry is created with `processed=False` and an error. It will never be retried or cleaned up. Over time these accumulate.

**GAP-WH-3: Duplicate event log entry is created for dedup hits.**
When a duplicate is detected, a NEW `WebhookEventLog` record is created with `processed=True` and the error message "Duplicate event — already processed". This means the table grows even for duplicates.

**GAP-WH-4: Generic error message on processing failure.**
The `processing_error` is always `'Error processing webhook event'` regardless of the actual exception. The full traceback goes to the logger but not to the database record.

**GAP-WH-5: No retry mechanism for failed processing.**
If `PaymentService.process_webhook_event()` raises an exception, the event is logged with an error but never retried. There's no Celery task or cron to reprocess failed webhook events.

### Idempotency
- Dedup check prevents reprocessing of `(reference, event_type)` pairs.
- `PaymentService.process_webhook_event()` is itself idempotent (forward-only transitions).
- However, the dedup race condition (GAP-WH-1) means true idempotency is not guaranteed under concurrent load.

### Hardcoded Values
- `_KNOWN_EVENT_TYPES` — if Lenco adds new event types, code change required.

---

## 4. fee_resolver.py — Fee Resolution

### What It Does
Determines the correct application fee based on program and residency classification (local vs international).

### Resolution Logic
1. Classify residency: `'local'` if `nationality == 'Zambian'` or `country in ('Zambia', 'ZM')`, else `'international'`.
2. Look up active `ProgramFee` for `(program, 'application', residency)`.
3. Fallback to `program.application_fee` with currency `ZMW`.
4. Final fallback: `_DEFAULT_APPLICATION_FEE = Decimal('150.00')`.

### Program Lookup
Tries three strategies in order:
1. `Program.objects.get(code=program_code, is_active=True)`
2. `Program.objects.get(id=program_code, is_active=True)` — catches `ValidationError`/`ValueError` for non-UUID strings.
3. `Program.objects.get(name=program_code, is_active=True)`

### Gaps and Issues

**GAP-FR-1: Residency classification is simplistic.**
Only checks for exact string `'Zambian'` nationality or `'Zambia'`/`'ZM'` country. No normalization (case-insensitive, trimming). A student entering `'zambian'` or `' Zambian '` would be classified as international.

**GAP-FR-2: `_DEFAULT_APPLICATION_FEE` is hardcoded at 150.00 ZMW.**
The steering doc mentions 153.00 as the program-level default. This 150.00 fallback only applies when `program.application_fee` is `None`, but the discrepancy is confusing.

**GAP-FR-3: Program lookup by name could match wrong program.**
If two programs share the same name (unlikely but possible), `get()` would raise `MultipleObjectsReturned`, which is not caught.

**GAP-FR-4: No caching.**
Fee resolution hits the database on every call. For high-traffic payment initiation, this could be optimized.

### Hardcoded Values
- `_DEFAULT_CURRENCY = 'ZMW'`
- `_DEFAULT_APPLICATION_FEE = Decimal('150.00')`
- Residency strings: `'Zambian'`, `'Zambia'`, `'ZM'`

---

## 5. tasks.py — Payment-Related Celery Tasks

### `poll_pending_payments_task` (Every 10 minutes)

**What It Does:**
1. **Expire phase:** Finds payments with `status='pending'` and `created_at < 24h ago`, sets them to `expired`. Max 50 per run.
2. **Verify phase:** Finds payments with `status='pending'` and `created_at` between 5min and 24h ago, verifies via Lenco API. Max 50 per run.

**Expiry Flow:**
- Uses `select_for_update` per payment to prevent race with concurrent webhook.
- Sends `payment_expired` communication to student.
- Catches per-payment exceptions — one failure doesn't block others.

**Verification Flow:**
- Calls `PaymentService.verify_payment()` for each payment.
- If ALL verifications fail, captures Sentry message for possible Lenco outage.

**Gaps:**
- **GAP-T-1:** Expiry does NOT sync `Application.payment_status`. When a payment expires, the application's `payment_status` remains unchanged. This means the application could show `pending` payment status even though all payments are expired.
- **GAP-T-2:** The 50-payment cap on both expiry and verification means a backlog could accumulate. If there are 100 pending payments older than 24h, it takes 2 runs (20 minutes) to expire them all.
- **GAP-T-3:** Task lock timeout is 600 seconds (10 minutes) — same as the task interval. If a run takes slightly over 10 minutes, the next scheduled run will skip, but the lock will also expire, potentially allowing overlap with a delayed run.
- **GAP-T-4:** Expired payments don't update the `notes` field with an expiry reason.

### `deferred_payment_reminder_task` (Daily 11:00 UTC)

**What It Does:**
Finds applications with `payment_status='deferred'` and `updated_at < 3 days ago`, sends reminder via `CommunicationService`. Max 100 per run.

**Gaps:**
- **GAP-T-5:** Uses `updated_at` as the cutoff, not the payment creation date. Any update to the application (even unrelated) resets the reminder clock.
- **GAP-T-6:** No tracking of how many reminders have been sent. A student who deferred 6 months ago gets a reminder every day (as long as `updated_at` is old enough). No escalation or stop after N reminders.
- **GAP-T-7:** The 100-application cap means some students may never get reminders if the backlog is large.

### Hardcoded Values
- 5-minute grace period before verification polling
- 24-hour expiry threshold
- 50-payment cap per run (both phases)
- 3-day deferred reminder cutoff
- 100-application cap for reminders
- 600-second task lock timeout

---

## 6. urls.py — Payment URL Routing

### Payment Endpoints
| Method | Path | View |
|--------|------|------|
| GET | `/api/v1/payments/` | `PaymentListView` |
| POST | `/api/v1/payments/initiate/` | `PaymentInitiateView` |
| POST | `/api/v1/payments/defer/` | `DeferPaymentView` |
| POST | `/api/v1/payments/mobile-money/` | `MobileMoneyInitiateView` |
| POST | `/api/v1/payments/dev-bypass/` | `PaymentDevBypassView` |
| GET | `/api/v1/payments/resolve-fee/` | `FeeResolveView` |
| POST | `/api/v1/payments/webhook/lenco/` | `LencoWebhookView` |
| GET | `/api/v1/payments/{id}/receipt/` | `PaymentReceiptView` |
| POST | `/api/v1/payments/{id}/verify/` | `PaymentVerifyView` |

### Program Fee Endpoints
| Method | Path | View |
|--------|------|------|
| GET/POST | `/api/v1/programs/{id}/fees/` | `ProgramFeeViewSet` (list/create) |
| GET/PUT/PATCH/DELETE | `/api/v1/programs/{id}/fees/{pk}/` | `ProgramFeeViewSet` (detail) |

### Gaps
- **GAP-U-1:** `dev-bypass` endpoint is registered in production URL routing. It's guarded by `settings.DEBUG` in the view, but the URL itself is discoverable via schema/docs.

---

## 7. services.py — Submission Payment Checks

### `_application_has_completed_payment(application_id)`
Simple check: `Payment.objects.filter(application_id=..., status="successful").exists()`

**GAP-S-1:** Only checks for `status="successful"`. Does not check for `force_approved` or `verified` payment records. However, the `submit_application` function also checks `application.payment_status` which covers those cases.

### `submit_application()` Payment Gate
```python
has_payment = (
    application.payment_status in ("verified", "paid", "force_approved", "deferred")
    or _application_has_completed_payment(application.id)
)
```

This is a two-layer check:
1. Application-level: `payment_status` in `verified`, `paid`, `force_approved`, `deferred`.
2. Payment-record-level: Any `successful` payment exists.

**GAP-S-2:** The `application.payment_status` check happens BEFORE the `select_for_update` lock. The locked re-read (`locked_app`) only checks `status != "draft"`, not payment status. A race condition exists where payment status could change between the check and the lock.

**GAP-S-3:** `"successful"` is not in the `application.payment_status` check list, but it IS a valid application payment_status (set by `PaymentDevBypassView`). A dev-bypass payment would only pass via the `_application_has_completed_payment` fallback.

**GAP-S-4:** `"deferred"` allows submission without actual payment. This is by design but means the payment gate is effectively optional for students who choose to defer.

### Late Fee Enforcement
- Checks for `ProgramFee` with `fee_type="late_application"`.
- Checks for `Payment` with `metadata__fee_type="late_application"` and `status="successful"`.
- **GAP-S-5:** The `metadata__fee_type` lookup uses Django's JSON field lookup. This assumes the metadata dict has a top-level `fee_type` key, but `PaymentService.initiate_payment()` stores metadata with keys like `residency_category`, `fee_source`, `original_amount`, `waiver_applied` — NOT `fee_type`. There is no code path that creates a payment with `metadata.fee_type = "late_application"`. **This means late fee enforcement is broken — it will never find a matching payment.**

---

## 8. Cross-Cutting Concerns

### Complete Payment State Machine

```
                    ┌──────────┐
                    │  (start) │
                    └────┬─────┘
                         │
                    ┌────▼─────┐
              ┌─────│ pending  │─────┐──────────┐
              │     └────┬─────┘     │          │
              │          │           │          │
         ┌────▼───┐ ┌───▼────┐ ┌───▼─────┐   │
         │ failed │ │success-│ │ expired  │   │
         │        │ │  ful   │ │          │   │
         └────────┘ └────────┘ └──────────┘   │
                                               │
                    ┌──────────┐               │
                    │ deferred │───────────────┘
                    └──┬───────┘    (can transition
                       │             to pending,
                       │             successful,
                       │             failed, expired)
                       │
              (same targets as pending)
```

### Application payment_status Values (across all code paths)
| Value | Set By |
|-------|--------|
| `verified` | `_update_payment_status` (on successful payment) |
| `failed` | `_update_payment_status` (on failed payment) |
| `deferred` | `defer_payment`, `review_application_payment` |
| `successful` | `PaymentDevBypassView` |
| `force_approved` | Admin review (via `review_application_payment` setting raw `payment_status`) |
| `pending_review` | Admin review |
| `rejected` | Admin review |
| `pending` | (initial/default) |
| `paid` | (legacy, checked in submission gate) |

**GAP-CC-1: `application.payment_status` and `payment.status` use different vocabularies.**
Payment records use: `pending`, `successful`, `failed`, `expired`, `deferred`.
Application records use: `verified`, `paid`, `force_approved`, `deferred`, `failed`, `successful`, `pending_review`, `rejected`.
The mapping is scattered across multiple locations with no single source of truth.

### Idempotency Summary
| Operation | Idempotent? | Mechanism |
|-----------|-------------|-----------|
| Payment initiation | Yes | Returns existing pending payment |
| Payment deferral | Yes | Returns existing deferred payment |
| Payment verification | Yes | Short-circuits if not pending |
| Webhook processing | Mostly | Forward-only transitions + dedup check (race condition exists) |
| Admin review | No | Can be called multiple times with different statuses |
| Mobile money initiation | Partially | Reuses existing pending payment but Lenco API call is not idempotent |

### Security Concerns
1. **Webhook endpoint has no rate limiting** — DoS vector for filling `webhook_event_logs`.
2. **PaymentVerifyView and PaymentInitiateView lack per-user rate limiting** — known audit issue.
3. **Dev bypass endpoint registered in production URLs** — relies on runtime guard only.
4. **Phone number passed to Lenco API without sanitization beyond digit extraction** — potential for injection if Lenco API is vulnerable.

---

## 9. Priority Action Items

### Critical (Data Integrity)
1. **Fix late fee enforcement (GAP-S-5):** No code path creates payments with `metadata.fee_type = "late_application"`, so the late fee check in `submit_application` will never find a matching payment. Late fee enforcement is effectively dead code.
2. **Fix payment expiry not syncing application status (GAP-T-1):** Expired payments leave `application.payment_status` stale.
3. **Fix currency mismatch not blocking transitions (GAP-PS-1):** Amount mismatch blocks but currency mismatch only logs.

### High (Race Conditions / Consistency)
4. **Fix webhook dedup race condition (GAP-WH-1):** Use `select_for_update` or unique constraint on `(reference, event_type, processed=True)`.
5. **Fix MobileMoneyInitiateView pending payment reuse race (GAP-V-12):** Use `select_for_update` like `initiate_payment` does.
6. **Fix defer_payment not checking for existing pending payment (GAP-PS-4):** Could create conflicting payment states.
7. **Fix submission payment check race (GAP-S-2):** Move payment status check inside the `select_for_update` block.

### Medium (Operational)
8. **Add rate limiting to PaymentVerifyView and PaymentInitiateView (GAP-V-2, V-4).**
9. **Add rate limiting to webhook endpoint (GAP-V-15).**
10. **Make residency classification case-insensitive (GAP-FR-1).**
11. **Add deferred reminder tracking to prevent infinite daily reminders (GAP-T-6).**
12. **Sync application payment_status on payment expiry (GAP-T-1).**

### Low (Code Quality)
13. **Consolidate payment status vocabulary (GAP-CC-1).**
14. **Remove dev-bypass URL from production routing (GAP-U-1).**
15. **Use `Decimal` instead of `float` in Lenco API payload (GAP-V-13).**
16. **Add caching to fee resolution (GAP-FR-4).**
17. **Improve error message specificity in webhook processor (GAP-WH-4).**
