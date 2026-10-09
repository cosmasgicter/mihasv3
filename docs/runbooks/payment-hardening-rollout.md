# Payment Hardening Rollout Runbook

Specs: [`.kiro/specs/payment-hardening/`](../../.kiro/specs/_archived/payment-hardening/)
(the original five-phase rollout) and
[`.kiro/specs/admissions-v2-canonical-rebuild/`](../../.kiro/specs/admissions-v2-canonical-rebuild/)
task **8.2**, which converged the rollout onto a single path.

> **Read this first.** The payment-hardening rollout is finished, and three of
> its five flags no longer exist. **Rollback for the payment state machine,
> webhook dedup, and admin override is no longer a flag flip** — it is a code
> revert. See [Rollback reality](#rollback-reality) before an incident, not
> during one.

## Current state

| Concern | Behaviour | How it is selected |
|---|---|---|
| Payment status mutation | `PaymentService._transition()` only, forward-only (ADR-007) | Unconditional |
| Webhook dedup | Canonical JSON + `WebhookEventIdentity` (ADR-004) | Unconditional |
| Admin override with no prior Payment | `force_approved` ledger row (ADR-002) | Unconditional |
| Frontend payment UI + recovery store | `derivePaymentUiState` + `paymentRecoveryStore` | Unconditional |
| Payment endpoint throttling | `PaymentUserScopedRateThrottle` | `PAYMENT_HARDENING_RATE_LIMITS` |
| Dev-bypass lockout | `require_not_dev_bypass_in_production` | Code-level, always on under production settings |

### The one surviving flag

| Flag | Env var | Default | Scope |
|------|---------|---------|-------|
| Payment rate limits | `PAYMENT_HARDENING_RATE_LIMITS` | `False` (`True` hardcoded in `prod.py` / `staging.py`) | Backend — per-user DRF throttle scopes |

It reads `"1" | "true" | "yes"` as enabled; any other value (including unset) is
disabled. Declared in `backend/config/settings/base.py`. It is a **policy**
switch, not a second implementation: both settings run the same payment path, and
turning it off only relaxes per-user request budgets.

### The three flags that were deleted (task 8.2)

| Retired flag | What it used to select | Why it is gone |
|---|---|---|
| `PAYMENT_HARDENING_FORWARD_ONLY` | `_transition()` vs the pre-hardening `_update_payment_status` mutator | Two writers for one column contradicted ADR-007; the ledger outcome was proven identical before deletion |
| `PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT` | `WebhookEventIdentity` dedup vs `(reference, event_type)` dedup | Two dedup contracts meant "was this callback already processed?" had two answers |
| `PAYMENT_HARDENING_FORCE_APPROVED` | `force_approved` row vs a synthetic zero-amount `successful` row | The synthetic row was indistinguishable in the ledger from money that actually arrived |
| `VITE_PAYMENT_HARDENING_UI` (frontend) | UI state matrix + recovery store vs the earlier renderer | A student's mid-payment refresh recovered or did not depending on how the bundle was built |

**Setting any of these env vars now does nothing.** They are not read anywhere.
Remove them from environment configuration at your convenience; leaving them set
is inert but misleading. A guard test fails if any of them reappears as a
settings assignment:
`backend/tests/unit/test_payment_single_path_8_2.py::test_no_payment_flag_selects_between_two_implementations`
and `test_prod_settings_required_flags.py::test_retired_flag_is_not_reintroduced`.

### Why the deletion was safe

Parity was demonstrated before anything was removed, not asserted afterwards. A
two-column harness drove every scenario — verify success/failure/pending, all
four `collection.*` callbacks, duplicate delivery, unknown reference, amount
mismatch, initiation reuse, already-paid short-circuit, webhook ingress with
valid/invalid signature, admin override — through the same public entry points
under both flag states, and compared the resulting ledger field by field.

It found two real divergences: the hardened path was dropping the provider's
`fee` and `bearer`, and the failure reason. Both were fixed in the sole writer
first. Evidence: [`docs/v2-evidence/8.2/`](../v2-evidence/8.2/README.md).

## Rollback reality

| Change | Rollback |
|---|---|
| Payment rate limits | `PAYMENT_HARDENING_RATE_LIMITS=false` + redeploy |
| Payment state machine / webhook dedup / admin override / payment UI | **Code revert + redeploy.** Revert the task 8.2 commit; the retired code and its flags return together. There is no environment variable that brings the old path back. |
| Phase 1 schema (partial indexes + `metadata.snapshot` backfill) | Nothing to do. Additive and safe to leave in place. |

Before reverting, confirm the problem is actually the payment path: the flags
that used to be the fast lever were also the reason two behaviours existed. If a
provider-specific incident is suspected, the faster mitigations are usually the
throttle flag, the reconciliation sweep (`poll_pending_payments_task`), and the
super-admin correction endpoint — all of which stay available.

Observability signals: `payment.*` counters via GlitchTip metrics, and no new
GlitchTip exceptions tagged `domain=payment` / `webhook` / `force_approved`.

## Phase 1 — schema and snapshot backfill (historical, already applied)

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

## The payment path, as it now runs

### Status mutation

Every status change — student verification, provider callback, reconciliation
sweep, admin override, super-admin correction — goes through
`PaymentService._transition()`. It takes the row lock, refuses transitions the
canonical `ALLOWED_TRANSITIONS` matrix does not allow (auditing the refusal),
runs the 4-check integrity gate on `successful`, persists the provider's
settlement facts (`lenco_reference`, `payment_method`, `fee`, `bearer`, and the
failure reason), updates the derived `applications.payment_status`, allocates the
receipt idempotently, and writes the audit row.

A replayed transition to the status a payment already holds is a no-op for
provider sources, so a duplicate callback or a re-run sweep converges instead of
re-deciding.

### Webhook ingress

`POST /api/v1/payments/webhook/lenco/` always returns 200, always writes a
`webhook_event_logs` row, and never mutates a Payment on an invalid signature.
Dedup is by `WebhookEventIdentity` — `provider_event_id` when the provider sent
one, otherwise `(reference, event_type)` under `SELECT FOR UPDATE`. Unknown event
types are logged as processed and mutate nothing. A payload that cannot be
canonically serialised is logged with `processing_error='Canonical serialization
failed'` and skipped.

The strict path relies on the partial unique index
`uq_webhook_processed_reference_event` and the functional index
`idx_webhook_provider_event_id`, both added in Phase 1.

### Webhook source controls

Lenco's public webhook documentation does not publish a stable source IP range
for webhook delivery. Keep `LENCO_WEBHOOK_ALLOWED_IPS` empty unless Lenco
provides a dedicated static range for this integration in writing. With the
allowlist empty, webhook authenticity is enforced by:

* `X-Lenco-Signature` HMAC-SHA512 validation in
  `WebhookProcessor.validate_signature`.
* Constant-time signature comparison before any payment mutation.
* Strict webhook dedup via canonical event identity.
* Re-query/reconciliation through the Lenco status endpoint for pending payments
  when a webhook is missed or delayed.

Do not add guessed CIDR ranges, ingress ranges, or broad cloud provider ranges to
`LENCO_WEBHOOK_ALLOWED_IPS`. Those create a false sense of control and can
silently block legitimate Lenco retries.

### Admin override

An admin verifying an application with **no** Payment row is recording money that
arrived off-platform. That routes through `PaymentService.force_approve(...)` and
lands as a canonical `force_approved` row carrying `metadata.override=true`,
`metadata.reviewed_by`, `metadata.reviewed_at`, `metadata.reason` (≥ 10 chars) and
`metadata.actor_role`, audited as `payment.force_approved` at the `security`
retention category. A reason under 10 characters returns 400 +
`OVERRIDE_REASON_REQUIRED` and leaves the ledger untouched.

An admin reviewing an application that **already has** a Payment row is deciding
about that row (verify / reject / defer / reopen); that stays with
`review_application_payment`, which cannot demote a `successful` or
`force_approved` row (409 `CANNOT_REVERSE_SUCCESSFUL_PAYMENT`).

### Rate limits

Under `PAYMENT_HARDENING_RATE_LIMITS=true`:

* `PaymentUserScopedRateThrottle` keys by `request.user.pk` for authenticated
  payment endpoints (`payment_initiate` 6/min, `payment_mobile_money` 6/min,
  `payment_verify` 30/min, `payment_resolve_fee` 30/min) and by client IP for
  anonymous requests.
* 429 responses carry the `{success: false, error, code: 'RATE_LIMITED',
  details: {retry_after, scope}}` envelope, emit a `payment.rate_limited` audit
  event with `entity_type='payment'` at the `security` retention category, and
  increment the `payment.rate_limited` counter with `{endpoint, user_role}` tags.
* The webhook ingress is intentionally exempt — dedup and HMAC-SHA512 signature
  validation are the gates there.

Rollback:

```
PAYMENT_HARDENING_RATE_LIMITS=false
# Redeploy the backend service.
```

### Frontend payment UI

Rendering is driven by the pure `derivePaymentUiState` mapper; pending payments
survive a refresh through `paymentRecoveryStore` (Zustand + localStorage,
24-hour TTL); every refusal is rendered from the stable-code copy in
`paymentErrorCodes.ts` + `paymentNextActions.ts`. Recovery entries are
self-clearing via TTL — the localStorage key `mihas-payment-recovery` needs no
cleanup.

### Waiting states — who is being waited on

A `pending` payment renders as one of **two** states, chosen by the server-derived
`phase` on the payment payload (`backend/apps/documents/payment_phase.py`, added by
admissions-v2 task 8.2 / finding STU-09). This matters when triaging a report like
"the page told me to enter a PIN but nothing arrived":

| `phase` | Provider state | What the student sees | UI wait budget | Retry offered? |
|---|---|---|---|---|
| `action_required` | Lenco **accepted** the collection — the customer prompt is out | "Approve the payment on your phone", the 1-2-3 PIN steps | 120 s | yes, after the budget |
| `provider_processing` | request **sent**, or provider error left it **unknown** | "Confirming with your provider… there's nothing to do" | 600 s | **never** |
| `failed_retryable` | provider **rejected** the request outright | failure copy + retry | — | yes |

`phase` is derived, never stored, so it cannot disagree with `status`. The two
budgets are UI-only: a payment's real expiry is 24 h and is enforced by
`poll_pending_payments_task` → `PaymentService.expire_stale`, never by a browser,
and a polling timeout is never rendered as a failure.

Operationally: `provider_processing` deliberately offers **no** retry, because a
second collection request against a provider that is still working is how a student
gets charged twice. If students are genuinely stuck in `provider_processing`, the
lever is the reconciliation sweep (or `POST /api/v1/payments/{id}/verify/`), not
asking them to pay again.

## Lenco secret rotation

A separate runbook at `docs/runbooks/secrets-rotation.md` covers JWT signing key,
database credentials, and API key rotation. Lenco secret rotation:

1. Stage the new `LENCO_API_SECRET_KEY` in the platform environment without
   removing the old one.
2. Deploy a short-lived version of `WebhookProcessor.validate_signature` that
   accepts either key (dual-signature validation window).
3. Register the new key in the Lenco dashboard.
4. Remove the old key from the platform environment.
5. Revert `validate_signature` to single-key mode.

The dual-signature validation window is an operational safety net for rotations.
Dedup is independent of signature rotation — the signature is validated against
whatever keys the backend currently considers valid.
