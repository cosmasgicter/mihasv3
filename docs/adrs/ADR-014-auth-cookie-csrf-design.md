# ADR-014 — Cookie-Based Auth + CSRF Design

**Status:** Accepted (2026-05-17)
**Related:** ADR-013 (system actor), `apps.accounts.authentication`, `apps.accounts.tokens`

## Context

The admissions frontend (`apply.mihas.edu.zm`) calls the Django API (`api.mihas.edu.zm`) cross-origin with `credentials: 'include'`. Vercel's free tier does not support external rewrites, so a same-origin proxy is not available. This shapes every choice in the auth and CSRF design.

## Decision

### Token model
- **Access token:** HTTP-only `access_token` cookie, 30-minute lifetime, JWT signed with `JWT_SIGNING_KEY` (HS256).
- **Refresh token:** HTTP-only `refresh_token` cookie, 7-day lifetime, JWT with a `jti` claim. JTI is recorded in Redis for blacklisting.
- **Cookie attributes (production):** `Secure`, `HttpOnly`, `SameSite=None` (required for cross-origin), `Domain=.mihas.edu.zm` (shared across `apply.` and `api.`).
- **Cookie attributes (staging):** `SameSite=Lax`, `Domain` from `COOKIE_DOMAIN` env var.

### Authentication flow
- `JWTCookieAuthentication` (`apps.accounts.authentication`) is the sole authority for setting `request.user`. The `JWTAuthenticationMiddleware` does NOT authenticate — it only flags expired tokens so 403→401 conversion fires for the frontend refresh interceptor.
- Token decode rejects expired tokens with code `TOKEN_EXPIRED`.
- A missing refresh cookie returns code `NO_REFRESH_TOKEN` (distinct from `TOKEN_EXPIRED`) so the frontend can differentiate config issues from token expiry.

### Token rotation
- `ROTATE_REFRESH_TOKENS = True` is declarative; actual rotation lives in `apps.accounts.tokens.rotate_refresh_token`.
- After successful refresh, the old `jti` is added to the Redis blacklist. Subsequent uses of the old token are rejected.
- `BLACKLIST_AFTER_ROTATION = True` similarly declarative.

### CSRF model
- CSRF is enforced at the `JWTCookieAuthentication._enforce_csrf` layer for cookie-sourced state-changing requests, NOT in middleware. This is because middleware runs before authentication; we need to know which user is making the request to validate their CSRF token.
- CSRF tokens are stored server-side in the `csrf_tokens` table, keyed by `(token_hash, user_id, expires_at)`.
- 4-tuple validation: token in request header `X-CSRF-Token` is hashed with SHA-256 and looked up against the table where `expires_at > now()`.
- Validation result cached in Redis for 60 seconds (planned — Stream 4 of v2 plan, not yet implemented). Today every state-changing cookie request hits the DB once.

### CSRF token issuance and recovery
- `LoginView` and `RefreshView` always issue a fresh CSRF token in the `X-CSRF-Token` response header.
- `SessionView` issues one only when the user has none or the latest is older than 5 minutes (tolerance window).
- The frontend stores the CSRF token in-memory only. On page refresh the token is lost; the bootstrap session call uses `?refresh_csrf=1` to force a fresh issuance.
- Cross-origin recovery uses the query parameter (not a custom header) to avoid CORS preflight on every request.
- `CORS_ALLOW_HEADERS` includes `x-csrf-token`, `x-csrf-recovery`, `idempotency-key`, `cache-control` in addition to `corsheaders` defaults.

### CSRF exempt paths
Defined in `authentication.py:CSRF_EXEMPT_PATTERNS`:
- `/api/v1/auth/login/`
- `/api/v1/auth/register/`
- `/api/v1/auth/password-reset/` (and confirm)
- `/api/v1/auth/logout/`
- `/api/v1/auth/refresh/`
- `/api/v1/errors/report/`
- `/api/v1/payments/webhook/*`

Logout is exempt because logout only invalidates the user's own session — the worst a CSRF-induced logout can do is annoy the user.

### Why query-param CSRF recovery instead of a custom header
A custom header (e.g. `X-CSRF-Recovery: 1`) triggers CORS preflight on every cross-origin request. With query params we keep the request a "simple" GET that does not require preflight, reducing latency. The token comes back in the `X-CSRF-Token` response header, which is exposed via `CORS_EXPOSE_HEADERS`.

### Why CSRF in DRF auth class instead of middleware
Two reasons:
1. We need `request.user` to look up the user's CSRF tokens, and that's only set by the auth class.
2. The middleware order has `CorsMiddleware` first and can't depend on auth.

The standard Django CSRF middleware doesn't fit because it expects a CSRF cookie + matching form token; we use a session-table-backed token validated at auth time.

## Consequences

### Positive
- Cookies prevent token theft via XSS (HttpOnly).
- 30-minute access token limits damage from any single token leak.
- JTI blacklist enables logout-everywhere via `revoke-all` endpoint.
- CSRF tokens tied to a user, not a session cookie — works without `django.contrib.sessions`.
- Cross-origin works without preflight on simple requests.

### Negative
- A user deactivated by an admin retains access until their access token expires (max 30 minutes). Mitigated by short token TTL and JTI blacklist on revoke-all.
- CSRF DB query on every state-changing request (planned cache fix tracked separately).
- `SameSite=None` requires `Secure`; cannot be used in HTTP-only local dev. Local dev uses `SameSite=Lax` via `dev.py`.
- The CSRF tokens table grows; cleaned up nightly by `cleanup_audit_logs_task`.

### Neutral
- Two distinct error codes (`NO_REFRESH_TOKEN`, `TOKEN_EXPIRED`) require frontend handling but improve diagnosability.

## Verification

- `backend/tests/unit/test_jwt_middleware.py` — token decode and 401-vs-403 behavior.
- `backend/tests/unit/test_drf_csrf_authentication.py` — CSRF enforcement.
- `backend/tests/unit/test_jti_blacklist.py` — blacklist on revoke.
- `backend/tests/property/test_token_refresh_properties.py` — rotation + blacklist invariants.
- `backend/tests/unit/test_auth_csrf_headers.py` — exposed headers.
- `apps/admissions/src/services/authInterceptor.ts` — frontend 401 → refresh → retry flow.

## Rollback

This design has been in production since the cookie auth migration. There is no rollback to bearer-token auth without breaking every browser session simultaneously. Any future change must ship as an additive new auth mode behind a feature flag.
