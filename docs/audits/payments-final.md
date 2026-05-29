# Payments end-to-end audit

**Date:** 2026-05-29
**Auditor:** Kiro (automated read-only audit)
**Scope:** Backend payment service, webhook processor, views, frontend payment libs and stores

## Summary
- Total checks: 15
- Pass: 11
- Fail (real bug): 2
- Concern (worth tracking): 2

## Findings

### [FAIL] 1. ADR-007 sole writer

Two out-of-band `payments.status` writes exist outside `_transition()`:

1. **`backend/apps/documents/tasks.py` line 121** — The legacy path of `poll_pending_payments_task` directly sets `locked_payment.status = 'expired'` without routing through `_transition()`. This path only executes when `PAYMENT_HARDENING_FORWARD_ONLY=False` (the hardened path at line 56 correctly delegates to `service.expire_stale()` which uses `_transition()`), but while the flag is off this is a live ADR-007 violation.

2. **`backend/apps/documents/payment_helpers.py` line 564** — `_review_application_payment_impl` sets `latest_payment.status = target_payment_status` directly. This is the admin review path (`review_application_payment`). It bypasses `_transition()` entirely, meaning no integrity gate, no audit via `PaymentAuditService.record_payment_event`, and no receipt generation for force-approved outcomes through this path.

3. **`backend/apps/documents/payment_service.py` line 227** — `defer_payment()` sets `existing_pending.status = 'deferred'` directly. This is a `pending → deferred` transition that bypasses `_transition()`. No audit row is emitted for this state change.

### [PASS] 2. State machine completeness

The `ALLOWED_TRANSITIONS` dict in `payment_constants.py` covers all forward-only transitions. `_transition()` (payment_service.py ~line 530) validates `(from_status, target_status)` against the map, allows `super_admin_correction` as a universal override, and returns a `TransitionResult` with `risk_flag=None` (no status change) when the transition is blocked. Blocked transitions emit a `payment.transition_blocked` audit event. The integrity gate (4-check: amount, currency, provider reference, snapshot) runs for every `successful` target. Idempotent replay (same status from provider sources) is a no-op. Terminal states (`successful`, `failed`, `expired`, `force_approved`) have no outbound transitions in the map except via `super_admin_correction`.

### [PASS] 3. Webhook HMAC-SHA512 + canonical-JSON dedup; out-of-order events handled

`WebhookProcessor.validate_signature()` (webhook_processor.py ~line 100) implements the Lenco algorithm: `SHA-256(LENCO_API_SECRET_KEY)` → HMAC-SHA512 over raw body → constant-time compare via `hmac.compare_digest`. Invalid signatures are logged but the webhook returns 200 (preventing retry storms). Canonical-JSON dedup uses `WebhookEventIdentity` (provider_event_id, event_type, reference, payload_hash via SHA-256 of `canonical_json()`). `is_duplicate()` checks processed logs. Out-of-order handling: `apply_webhook_event()` blocks late `collection.failed` after `successful` (emits `payment.late_failed_webhook_ignored` audit), and `collection.settled` only updates metadata without mutating status.

### [PASS] 4. Phone number persistence: only phone_hash + phone_last4

`mark_provider_initiation()` (payment_service.py ~line 340) persists only `phone_hash` (SHA-256 hex) and `phone_last4` in `metadata.provider_initiation`. The raw phone is passed only to `_call_lenco_mobile_money()` (payment_helpers.py line 421) in the transient HTTP POST body — never stored. `_sanitize_lenco_response()` (payment_helpers.py ~line 138) redacts any `phone`/`phoneNumber`/`msisdn` keys from Lenco API responses before they are persisted in `metadata.lenco_response`. `PaymentAuditService._redact_pii()` additionally redacts phone markers in audit metadata.

### [CONCERN] 5. Idempotency keys on initiate / mobile-money / verify / force-approve

`@idempotent` is applied to:
- `PaymentInitiateView.post` (payment_widget_views.py line 170) ✓
- `DeferPaymentView.post` (payment_widget_views.py line 297) ✓
- `MobileMoneyInitiateView.post` (mobile_money_views.py line 468) ✓

**Missing:**
- `PaymentVerifyView.post` (payment_query_views.py line 295) — no `@idempotent`. Verify is not strictly state-creating (it reads Lenco status and transitions), but concurrent verify calls could race on the same payment row. The `select_for_update` in `_transition()` serializes them, so this is safe but not idempotent at the HTTP layer.
- `SuperAdminPaymentCorrectionView.post` (payment_admin_views.py line 203) — no `@idempotent`. The import exists but the decorator is not applied. A double-click could emit duplicate audit rows (the status transition itself is idempotent due to `from_status == target_status` guard, but the pre-transition audit in `super_admin_correct` would fire twice).

### [PASS] 6. Stable error codes drift between backend PAYMENT_ERROR_CODES and frontend mirror

Backend `PAYMENT_ERROR_CODES` (payment_error_codes.py) defines 20 codes. Frontend `PAYMENT_STABLE_CODES` (paymentErrorCodes.ts) lists exactly the same 20 codes in the same order: `NOT_OWNER`, `APPLICATION_NOT_FOUND`, `APPLICATION_NOT_PAYABLE`, `ALREADY_PAID`, `MAX_PAYMENT_ATTEMPTS_EXCEEDED`, `PAYMENT_PENDING`, `PAYMENT_CONFIRMED`, `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, `MISSING_PROVIDER_REFERENCE`, `PROVIDER_UNAVAILABLE`, `PAYMENT_UNAVAILABLE`, `FEE_UNAVAILABLE`, `PAYMENT_SENSITIVE_FIELDS_LOCKED`, `DRAFT_DELETE_BLOCKED_BY_PAYMENT`, `CANNOT_REVERSE_SUCCESSFUL_PAYMENT`, `OVERRIDE_REASON_REQUIRED`, `RECEIPT_NOT_ELIGIBLE`, `RATE_LIMITED`, `VALIDATION_ERROR`. The drift-guard test (`paymentErrorCodes.test.ts`) enforces parity at CI time.

### [PASS] 7. 5-attempt cap enforced; 24h pending expiry enforced

`_check_retry_limit()` (payment_helpers.py ~line 450) counts all Payment rows for the application excluding expired rows older than `EXPIRED_EXCLUSION_DAYS` (7 days). Raises `ValueError("MAX_PAYMENT_ATTEMPTS_EXCEEDED|0")` when count ≥ `MAX_PAYMENT_ATTEMPTS` (5). Called by both `initiate_payment()` and the hardened `initiate()`. The 24h expiry is enforced by `expire_stale()` (payment_service.py) which transitions pending payments older than 24h to `expired` via `_transition()` (hardened path), and by the legacy task path (tasks.py line 121) which directly sets status (see Finding 1).

### [PASS] 8. Force-approve audit trail (Phase 5)

`force_approve()` (payment_service.py ~line 490) writes override metadata (`reviewed_by`, `reviewed_at`, `reason`, `actor_role`) to `payment.metadata` before calling `_transition()`. `_transition()` step 7 emits `payment.force_approved` audit action (distinct from the generic `payment.transitioned`). The `PaymentAuditService` auto-promotes this action to 365-day security retention via `SECURITY_RETENTION_ACTION_PREFIXES`. `super_admin_correct()` emits `payment.super_admin_corrected` before the transition (also security-retained). Both paths require `reason.strip() >= 10 chars`.

### [PASS] 9. Receipt idempotence + force-approved label

`_generate_receipt_idempotent()` (payment_service.py ~line 580) returns the existing `receipt_number` if already set (idempotent). Otherwise generates a 12-char base32 receipt, retries up to 3 times on `IntegrityError` (unique constraint `uq_payments_receipt_number`). Called from `_transition()` step 6 for both `successful` and `force_approved` targets. `PaymentReceiptView.get()` (payment_query_views.py ~line 230) includes `"override": payment.status == "force_approved"` in the receipt data, providing the force-approved label.

### [PASS] 10. Per-user rate limits (initiate / mobile-money / verify / resolve-fee)

All four views declare `throttle_classes = [PaymentUserScopedRateThrottle]` with distinct `throttle_scope` values:
- `PaymentInitiateView`: scope `payment_initiate`
- `MobileMoneyInitiateView`: scope `payment_mobile_money`
- `PaymentVerifyView`: scope `payment_verify`
- `FeeResolveView`: scope `payment_resolve_fee`
- `SuperAdminPaymentCorrectionView`: scope `payment_correct`

`PaymentUserScopedRateThrottle` (throttling.py) keys by `user.pk` for authenticated requests, client IP for anonymous. Returns `None` (no-op) when `PAYMENT_HARDENING_RATE_LIMITS=False`. Webhook ingress (`LencoWebhookView`) is correctly exempt — gated by HMAC signature, not DRF throttle.

### [CONCERN] 11. Dev-bypass returns 404 in production for every payment view

`@require_not_dev_bypass_in_production` is applied to:
- `PaymentInitiateView.post` (payment_widget_views.py:169) ✓
- `MobileMoneyInitiateView.post` (mobile_money_views.py:467) ✓
- `PaymentVerifyView.post` (payment_query_views.py:295) ✓
- `FeeResolveView.get` (payment_query_views.py:391) ✓
- `LencoWebhookView.post` (lenco_webhook_views.py:154) ✓
- `SuperAdminPaymentCorrectionView.post` (payment_admin_views.py:203) ✓
- `RiskFlagsListView.get` (risk_views.py:235) ✓

**Missing:**
- `DeferPaymentView.post` (payment_widget_views.py:277) — no `@require_not_dev_bypass_in_production`. A dev-bypass vector on the defer endpoint would not be blocked in production. This is lower severity (defer creates a non-terminal `deferred` record, not a payment confirmation), but breaks the "every payment view" contract.
- `PaymentReceiptView.get` (payment_query_views.py) — no `@require_not_dev_bypass_in_production`. Read-only, lower risk.
- `PaymentListView.get` (payment_query_views.py) — no `@require_not_dev_bypass_in_production`. Read-only, lower risk.

### [PASS] 12. payments.metadata never persists raw PII

`_sanitize_lenco_response()` (payment_helpers.py ~line 135) recursively replaces values for keys matching `_PII_KEYS_IN_LENCO_RESPONSE` (phone, email, name, address, NRC, passport, DOB, etc.) with `[REDACTED]` before storing in `metadata.lenco_response`. `mark_provider_initiation()` stores only `phone_hash` and `phone_last4`. `PaymentAuditService._redact_pii()` applies the same treatment to audit metadata. The `initiate()` method stores only `residency_category`, `fee_source`, `original_amount`, `waiver_applied`, and `snapshot` in metadata — no PII fields.

### [PASS] 13. paymentRecoveryStore: 24h TTL keyed by application_id

`paymentRecoveryStore.ts` defines `PAYMENT_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000` (24h). `record()` computes `ttl_expires_at = initiated_at + PAYMENT_RECOVERY_TTL_MS`. `get()` returns `null` when `ttl_expires_at < Date.now()`. Store is keyed by `application_id` (entries are `Record<string, PaymentRecoveryEntry>` where key = `entry.application_id`). `pruneExpired()` drops all entries with `ttl_expires_at < now`. Rehydration from localStorage calls `pruneExpired()` automatically. Zustand persist middleware with `createJSONStorage(() => localStorage)` and version migration support.

### [PASS] 14. derivePaymentUiState exhaustiveness

`derivePaymentUiState()` (paymentStatus.ts) handles all combinations:
- **Terminal:** `successful`/`force_approved` → `confirmed`
- **Stable codes:** `ALREADY_PAID` → `already_paid`; `MAX_PAYMENT_ATTEMPTS_EXCEEDED` → `max_attempts_reached`; `PAYMENT_SENSITIVE_FIELDS_LOCKED` → `sensitive_fields_locked`; `RATE_LIMITED` → `rate_limited`; `PROVIDER_UNAVAILABLE`/`PAYMENT_UNAVAILABLE` → `retry_with_different_number` or `unavailable` depending on backendStatus; `AMOUNT_MISMATCH`/`CURRENCY_MISMATCH`/`MISSING_PROVIDER_REFERENCE`/`CANNOT_REVERSE_SUCCESSFUL_PAYMENT`/`OVERRIDE_REASON_REQUIRED`/`RECEIPT_NOT_ELIGIBLE` → `needs_admin_followup`
- **Polling timeout:** `pending` + `pollingExceededTimeout` → `still_confirming` (never `failed` — R14.3)
- **Inflight:** → `initiating`
- **Backend status:** `pending` → `awaiting_provider`; `expired` → `expired`; `failed` → `retry_with_different_number`; `deferred` → `idle`
- **Default:** → `idle`

All 12 `PaymentUiState` values are reachable. The function is pure (no Date, no I/O).

### [PASS] 15. Fee resolver: program_code + residency dispatch correct, no bypass

`FeeResolver.resolve_fee()` (fee_resolver.py) resolves by `program_code` (tries `Program.code`, then `Program.id`, then `Program.name` — all requiring `is_active=True`). Residency is classified by `_classify_residency(nationality, country)`: Zambian nationality or ZM country → `local`, else `international`. Looks up `ProgramFee` with `(program, 'application', residency, is_active=True)`. Falls back to `program.application_fee` (default K150) with currency ZMW. No bypass path — `Program.DoesNotExist` propagates to the caller. `FeeResolveView` returns `FEE_UNAVAILABLE` (404) on resolution failure.

## Action items
- [ ] Route `_review_application_payment_impl` status writes through `_transition()` or add equivalent audit + integrity checks -- file: backend/apps/documents/payment_helpers.py line: 564
- [ ] Route `defer_payment()` pending→deferred transition through `_transition()` -- file: backend/apps/documents/payment_service.py line: 227
- [ ] Add `@require_not_dev_bypass_in_production` to `DeferPaymentView.post` -- file: backend/apps/documents/payment_widget_views.py line: 297
- [ ] Add `@idempotent` to `SuperAdminPaymentCorrectionView.post` to prevent duplicate audit rows on double-submit -- file: backend/apps/documents/payment_admin_views.py line: 203
- [ ] Remove legacy direct-status-write path in `poll_pending_payments_task` (tasks.py line 121) once `PAYMENT_HARDENING_FORWARD_ONLY` is permanently enabled -- file: backend/apps/documents/tasks.py line: 121
