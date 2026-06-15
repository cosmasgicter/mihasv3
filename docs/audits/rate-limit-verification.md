# Rate-Limit Verification (R4.8)

**Spec:** `.kiro/specs/beanola-production-readiness/` — Task 8.4 (Phase 4, Component 4)
**Requirement:** R4.8 — *"THE audit SHALL confirm rate limits exist for login/register/password-reset, the public tracker, payment initiation, document download/sign-URL, and admin bulk operations."*

## Scope of this artifact

Verify that every sensitive surface named in R4.8 has an enforced rate limit, and
record any gap as an additive fix tied to R4.8. No production DB changes are made.

## Two complementary rate-limit layers

The platform enforces rate limits at two layers, both verified here:

1. **Coarse per-IP middleware** — `apps/common/middleware.py:RateLimitMiddleware`
   (`django-ratelimit` backed). Path-prefix scopes in `RateLimitMiddleware.SCOPE_LIMITS`
   match on `request.path.startswith(prefix)` and break on the first match, so more
   specific prefixes are listed before the `/api/v1/` catch-all. Fails closed
   (`RATELIMIT_FAIL_OPEN = False`) with an in-memory fallback bucket (30 req/60s/IP)
   for Redis outages. Registered in `MIDDLEWARE` (`config/settings/base.py`).
2. **Per-user DRF throttles** — `apps/common/throttling.py:PaymentUserScopedRateThrottle`
   (and `AIUserScopedRateThrottle`), keyed by `user.pk` (auth) or client IP (anon),
   with rates in `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]` (`config/settings/base.py`).

> **PAYMENT_HARDENING_RATE_LIMITS flag note.** The per-user DRF payment throttles
> (`payment_initiate`, `payment_mobile_money`, `payment_verify`, `payment_resolve_fee`,
> `payment_defer`) are gated by `PAYMENT_HARDENING_RATE_LIMITS` (default `False`). When the
> flag is **off**, `PaymentUserScopedRateThrottle.get_cache_key()` returns `None` and the
> per-user throttle is a no-op. **However, payment initiation is never unprotected:** the
> coarse per-IP `RateLimitMiddleware` scope `/api/v1/payments/initiate/` (`10/10m`) and
> `/api/v1/payments/mobile-money/` (`5/10m`) apply regardless of the flag. The flag only
> swaps *which layer owns the canonical 429 shape* — see `VIEW_MANAGED_PAYMENT_PREFIXES`,
> which deliberately makes the coarse limiter stand aside for `initiate`, `mobile-money`,
> and `resolve-fee` **only when** the DRF throttle is active. Result: per-user budgeting
> when the flag is on; per-IP budgeting when it is off. No window leaves the surface
> entirely unthrottled.

## Per-surface status

| R4.8 surface | Route(s) | Layer | Scope / class | Rate | Status |
|---|---|---|---|---|---|
| Login | `POST /api/v1/auth/login/` | Middleware | `SCOPE_LIMITS["/api/v1/auth/login/"]` | `10/5m` | ✅ Covered |
| Register | `POST /api/v1/auth/register/` | Middleware | `SCOPE_LIMITS["/api/v1/auth/register/"]` | `5/5m` | ✅ Covered |
| Password reset (request + confirm) | `POST /api/v1/auth/password-reset/`, `.../confirm/` | Middleware | `SCOPE_LIMITS["/api/v1/auth/password-reset/"]` | `5/5m` | ✅ Covered |
| Public tracker | `GET /api/v1/applications/track/` | Middleware | `SCOPE_LIMITS["/api/v1/applications/track/"]` | `20/10m` | ✅ Covered |
| Payment initiation | `POST /api/v1/payments/initiate/` | Middleware **+** DRF | `/api/v1/payments/initiate/` `10/10m` **+** `PaymentUserScopedRateThrottle` scope `payment_initiate` `6/min` (flag-gated) | see note | ✅ Covered |
| Payment initiation (mobile money) | `POST /api/v1/payments/mobile-money/` | Middleware **+** DRF | `/api/v1/payments/mobile-money/` `5/10m` **+** scope `payment_mobile_money` `6/min` (flag-gated) | see note | ✅ Covered |
| Document download | `GET /api/v1/documents/<id>/download/` | Middleware | `SCOPE_LIMITS["/api/v1/documents/"]` | `20/10m` | ✅ Covered |
| Document sign-URL | `GET /api/v1/documents/<id>/signed-url/` | Middleware | `SCOPE_LIMITS["/api/v1/documents/"]` | `20/10m` | ✅ Covered |
| Admin bulk operations | `POST /api/v1/applications/bulk-status/` | Middleware | `SCOPE_LIMITS["/api/v1/applications/bulk-status/"]` | `20/10m` | ✅ Covered |

### Adjacent surfaces also confirmed (not strictly named in R4.8, recorded for completeness)

| Surface | Route | Layer | Scope / class | Rate |
|---|---|---|---|---|
| Token refresh | `POST /api/v1/auth/refresh/` | DRF | `AnonRateThrottle` (`auth_views.RefreshView`) | `100/min` (`anon`) |
| General auth | `/api/v1/auth/*` | Middleware | `SCOPE_LIMITS["/api/v1/auth/"]` | `60/5m` |
| Admin surface | `/api/v1/admin/*` | Middleware | `SCOPE_LIMITS["/api/v1/admin/"]` | `60/10m` |
| Payment verify | `POST /api/v1/payments/<id>/verify/` | DRF (flag-gated) **+** middleware `/api/v1/payments/` `60/10m` | `payment_verify` | `30/min` |
| Payment defer | `POST /api/v1/payments/defer/` | Middleware **+** DRF | `/api/v1/payments/defer/` `10/10m` + `payment_defer` | `6/min` |
| Resolve fee | `GET /api/v1/payments/resolve-fee/` | Middleware **+** DRF | `/api/v1/payments/resolve-fee/` `30/10m` + `payment_resolve_fee` | `30/min` |
| Payment risk flags (super-admin) | `GET /api/v1/payments/risk-flags/` | DRF (flag-gated) | `payment_risk_flags` | `30/min` |
| Payment correction (super-admin) | `POST /api/v1/payments/<id>/correct/` | DRF (flag-gated) | `payment_correct` | `3/min` |
| Error report | `POST /api/v1/errors/report/` | Middleware | `SCOPE_LIMITS["/api/v1/errors/"]` | `10/5m` |
| Django admin panel | `/beanola-admin-panel/` | Middleware | `SCOPE_LIMITS["/beanola-admin-panel/"]` | `10/1m` |
| Webhook ingress | `/api/v1/payments/webhook/` | Middleware (exempt) | rate `None` — HMAC-validated, retry bursts allowed by design | — |

## Gaps and additive fixes

**No R4.8 gaps found.** Every surface named in R4.8 has an enforced rate limit at the
coarse per-IP middleware layer, and the payment surfaces additionally have per-user
DRF throttles when `PAYMENT_HARDENING_RATE_LIMITS` is enabled. No additive throttle
classes/scopes are required for R4.8.

### Observation (out-of-scope test drift, not a rate-limit gap)

`backend/tests/property/test_middleware_properties.py::TestRateLimitRetryAfterProperty::test_scope_limits_match_rate_limit_config`
fails because its hardcoded `expected_scopes` list is **stale** — it omits the
`("/api/v1/applications/bulk-status/", "20/10m")` entry that genuinely exists in
`RateLimitMiddleware.SCOPE_LIMITS`. The live config is correct (admin bulk ops *are*
rate-limited, which strengthens R4.8); the test fixture simply was not updated when
the `bulk-status` scope was added. This is pre-existing test drift outside Task 8.4's
scope and is left untouched here; it belongs to the contract-test work in Tasks 9.x.
No production behaviour is affected.

## Verification method

Verified by reading the repo (the codebase is the source of truth) — no production DB
changes were made:

- `backend/apps/common/middleware.py` — `RateLimitMiddleware.SCOPE_LIMITS` + `VIEW_MANAGED_PAYMENT_PREFIXES`.
- `backend/config/settings/base.py` — `MIDDLEWARE` registration, `RATELIMIT_FAIL_OPEN`, `DEFAULT_THROTTLE_RATES`, `PAYMENT_HARDENING_RATE_LIMITS`.
- `backend/apps/common/throttling.py` — `PaymentUserScopedRateThrottle` flag gating.
- `backend/apps/accounts/auth_views.py`, `password_views.py` — login/register/refresh/password-reset views.
- `backend/apps/applications/public_views.py`, `urls.py` — public tracker + admin bulk-status routes.
- `backend/apps/documents/urls.py`, `payment_widget_views.py`, `mobile_money_views.py`, `payment_query_views.py` — document download/sign-URL + payment throttle scopes.

Existing regression coverage: `backend/tests/property/test_rate_limiting.py`,
`backend/tests/property/test_middleware_properties.py` (asserts the exact `SCOPE_LIMITS`
list incl. `/beanola-admin-panel/`), `backend/tests/unit/test_payment_throttle_classes.py`,
`backend/tests/unit/test_payment_rate_limiting*.py`.
