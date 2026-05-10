# Payment Hardening Rollout Runbook

Spec: [`.kiro/specs/payment-hardening/`](../../.kiro/specs/payment-hardening/)

This runbook covers the five-phase, feature-flag-gated rollout of the
payment-hardening spec. Every phase is additive, idempotent, and
independently rollback-able via a flag flip — schema changes never need
to be reverted.

## Phases 1–5 complete

All five phases of payment hardening are shipped. Each phase is
independently enable/disable-able via its flag; schema is additive and
safe to leave in place on any rollback. Rollback order is the reverse
of the enable order — flags flip back from Phase 5 → Phase 4 → Phase 3
→ Phase 2. Phase 1's schema stays in place unconditionally (it is
purely additive partial indexes + a `metadata.snapshot` backfill).

### Enable/disable matrix

| Flag | Default | Enable | Disable |
|------|---------|--------|---------|
| `PAYMENT_HARDENING_FORWARD_ONLY` | `False` | Phase 2 enabled | Legacy `_update_payment_status` path |
| `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` | `False` | Phase 3 enabled | Legacy webhook dedup |
| `VITE_PAYMENT_HARDENING_UI` | `false` | Phase 4 enabled | Legacy PaymentStep renderer |
| `PAYMENT_HARDENING_RATE_LIMITS` | `False` | Phase 5 rate limits on | Pre-hardening throttle config |
| `PAYMENT_HARDENING_FORCE_APPROVED` | `False` | Phase 5 force-approved canonical | Legacy synthetic zero-amount `successful` |

The dev-bypass lockout (R16.1) is code-level — `require_not_dev_bypass_in_production`
always fires under `DEBUG=False` or `DJANGO_ENV='production'` regardless
of flag state.

## Feature Flags

| Flag | Env var | Default | Scope |
|------|---------|---------|-------|
| Phase 2 | `PAYMENT_HARDENING_FORWARD_ONLY` | `False` | Backend — `_transition()` forward-only guard + hardened view branches |
| Phase 3 | `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` | `False` | Backend — canonical JSON + `WebhookEventIdentity` strict webhook dedup |
| Phase 4 | `VITE_PAYMENT_HARDENING_UI` | `false` | Frontend (Vercel build-time) — new PaymentStep UI state matrix |
| Phase 5 | `PAYMENT_HARDENING_RATE_LIMITS` | `False` | Backend — per-user DRF throttle scopes |
| Phase 5 | `PAYMENT_HARDENING_FORCE_APPROVED` | `False` | Backend — admin override creates `force_approved` instead of zero-amount `successful` |

All backend flags read `"1" | "true" | "yes"` as enabled; any other value
(including unset) is disabled. Declared in
`backend/config/settings/base.py`.

## Rollout order

1. **Phase 1** — apply SQL migrations and snapshot backfill (see below).
2. **Phase 2** — flip `PAYMENT_HARDENING_FORWARD_ONLY` to `True` in
   staging, soak 48h, flip in production.
3. **Phase 3** — flip `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` to
   `True` in staging, soak 48h, flip in production.
4. **Phase 4** — set `VITE_PAYMENT_HARDENING_UI=true` in the Vercel
   staging project, redeploy, soak 48h, flip in production.
5. **Phase 5** — flip both `PAYMENT_HARDENING_RATE_LIMITS=True` and
   `PAYMENT_HARDENING_FORCE_APPROVED=True` in staging, soak 48h, flip
   in production.

Observability signals to watch after each flip: `payment.*` counters
via GlitchTip metrics + no new GlitchTip exceptions tagged
`domain=payment` / `webhook` / `force_approved`.

## Phase 1 — schema and snapshot backfill

### Apply

```
psql -v ON_ERROR_STOP=1 -f backend/scripts/payment_hardening_preflight.sql
psql -v ON_ERROR_STOP=1 -f backend/scripts/payment_hardening_indexes.sql
psql -v ON_ERROR_STOP=1 -f backend/scripts/payment_hardening_receipt_indexes.sql
python backend/scripts/payment_snapshot_backfill.py --dry-run
python backend/scripts/payment_snapshot_backfill.py
```

### Rollback

```
psql -v ON_ERROR_STOP=1 -f backend/scripts/payment_hardening_receipt_indexes_rollback.sql
psql -v ON_ERROR_STOP=1 -f backend/scripts/payment_hardening_indexes_rollback.sql
# The backfill writes only additive data inside `payments.metadata` jsonb.
# No rollback is required — leaving the populated snapshots in place is safe.
```

## Phase 2 — `_transition()` forward-only guard

### Apply

```
# In Koyeb (or equivalent) backend environment:
PAYMENT_HARDENING_FORWARD_ONLY=true
# Redeploy the backend service.
```

### Rollback

```
PAYMENT_HARDENING_FORWARD_ONLY=false
# Redeploy the backend service.
```

The legacy `_update_payment_status` path is kept in place and is the
default. Flipping the flag back immediately restores the prior behaviour.

## Phase 3 — webhook dedup strict

### Apply

```
PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=true
# Redeploy the backend service.
```

The strict path additionally relies on the partial unique index
`uq_webhook_processed_reference_event` and the functional index
`idx_webhook_provider_event_id` (both added in Phase 1). The strict
path delegates to `PaymentService.apply_webhook_event` (Phase 2) for the
actual payment mutation.

### Webhook source controls

Lenco's public webhook documentation does not publish a stable source IP
range for webhook delivery. Keep `LENCO_WEBHOOK_ALLOWED_IPS` empty unless
Lenco provides a dedicated static range for this integration in writing.
With the allowlist empty, webhook authenticity is enforced by:

* `X-Lenco-Signature` HMAC-SHA512 validation in
  `WebhookProcessor.validate_signature`.
* Constant-time signature comparison before any payment mutation.
* Strict webhook dedup via canonical event identity.
* Re-query/reconciliation through the Lenco status endpoint for pending
  payments when a webhook is missed or delayed.

Do not add guessed CIDR ranges, Koyeb ingress ranges, or broad cloud
provider ranges to `LENCO_WEBHOOK_ALLOWED_IPS`. Those create a false sense
of control and can silently block legitimate Lenco retries.

### Rollback

```
PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT=false
# Redeploy the backend service.
```

The partial unique index stays in place — it does no harm under the
legacy dedup code path.

## Phase 4 — frontend UI state matrix

### Apply

```
# In Vercel staging project:
VITE_PAYMENT_HARDENING_UI=true
# Trigger a redeploy so the build-time env var is baked in.
```

The hardened UI drives rendering from the pure `derivePaymentUiState`
function, persists pending payments through `paymentRecoveryStore`
(Zustand + localStorage, 24-hour TTL), and uses stable-code copy from
`paymentErrorCodes.ts` + `paymentNextActions.ts` for every state in the
UI state matrix. The legacy PaymentStep remains the default until the
flag is flipped.

### Rollback

```
VITE_PAYMENT_HARDENING_UI=false
# Trigger a redeploy.
```

Recovery-store entries are self-clearing via 24-hour TTL — no data
cleanup is required. The localStorage key `mihas-payment-recovery`
will be pruned automatically on next mount or ignored entirely under
the legacy renderer.

## Phase 5 — rate limits + force-approved

### Apply

```
# In Koyeb backend environment:
PAYMENT_HARDENING_RATE_LIMITS=true
PAYMENT_HARDENING_FORCE_APPROVED=true
# Redeploy the backend service.
```

Under `PAYMENT_HARDENING_RATE_LIMITS=true`:

* `PaymentUserScopedRateThrottle` keys by `request.user.pk` for
  authenticated payment endpoints (`payment_initiate` 6/min,
  `payment_mobile_money` 6/min, `payment_verify` 30/min,
  `payment_resolve_fee` 30/min) and by client IP for anonymous
  requests.
* 429 responses carry the `{success: false, error, code:
  'RATE_LIMITED', details: {retry_after, scope}}` envelope, emit a
  `payment.rate_limited` audit event with `entity_type='payment'` at
  the `security` retention category, and increment the
  `payment.rate_limited` counter with `{endpoint, user_role}` tags.
* The webhook ingress (`POST /api/v1/payments/webhook/lenco/`) is
  intentionally exempt — dedup and HMAC-SHA512 signature validation
  are the gates there.

Under `PAYMENT_HARDENING_FORCE_APPROVED=true`:

* Admin review verifications for applications with no prior Payment
  row route through `PaymentService.force_approve(...)` and land as
  canonical `force_approved` Payments carrying
  `metadata.override=true`, `metadata.reviewed_by`,
  `metadata.reviewed_at`, `metadata.reason` (≥10 chars), and
  `metadata.actor_role`. Audit is `payment.force_approved` at the
  `security` retention category.
* Short reasons (< 10 chars) return 400 + `OVERRIDE_REASON_REQUIRED`
  and leave the ledger untouched.
* The legacy synthetic zero-amount `successful` Payment path remains
  callable when the flag is off.

### Rollback

```
PAYMENT_HARDENING_RATE_LIMITS=false
PAYMENT_HARDENING_FORCE_APPROVED=false
# Redeploy the backend service.
```

`SuperAdminPaymentCorrectionView` (`POST
/api/v1/payments/<uuid>/correct/`) and `RiskFlagsListView` (`GET
/api/v1/payments/risk-flags/`) remain registered but are no longer
load-bearing because only super-admins can reach them; no data cleanup
is required. Dev-bypass lockout continues to apply because it is
code-level (the `require_not_dev_bypass_in_production` decorator), not
flag-level.

## Lenco secret rotation

A separate runbook at `docs/runbooks/secrets-rotation.md` covers JWT
signing key, database credentials, and API key rotation. The Lenco
payment-hardening cutover should follow the standard Lenco secret
rotation procedure:

1. Stage the new `LENCO_API_SECRET_KEY` in the platform environment
   without removing the old one.
2. Deploy a short-lived version of `WebhookProcessor.validate_signature`
   that accepts either key (dual-signature validation window).
3. Register the new key in the Lenco dashboard.
4. Remove the old key from the platform environment.
5. Revert `validate_signature` to single-key mode.

The dual-signature validation window is an operational safety net for
rotations. The strict-dedup path in Phase 3 is independent of signature
rotation — both paths validate the signature against whatever keys the
backend currently considers valid.
