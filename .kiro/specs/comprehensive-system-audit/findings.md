# Audit Findings

## Phase 1 — Security

### P1-SEC-001: `unsafe-eval` in CSP was removable via Zod v4 `jitless` config

**Finding ID:** P1-SEC-001
**Severity:** High
**Requirement:** Req 1.1, 1.2, 1.3
**Summary:** The `unsafe-eval` directive in the CSP `script-src` was added for Zod v4 JIT compilation but can be safely removed by enabling Zod's built-in `jitless` mode.

**Evidence:**

- **CSP before:** `script-src 'self' 'unsafe-eval' https://va.vercel-scripts.com`
- **Zod version:** 4.3.6 (`apps/admissions/node_modules/zod/package.json`)
- **JIT code path:** `apps/admissions/node_modules/zod/src/v4/core/doc.ts` line 37 — `Doc.compile()` uses `new Function(...)` to generate JIT-compiled object schema parsers
- **JIT guard:** `apps/admissions/node_modules/zod/src/v4/core/schemas.ts` line 2007 — `const jit = !core.globalConfig.jitless` controls whether JIT path is used
- **Eval detection:** `apps/admissions/node_modules/zod/src/v4/core/util.ts` line 371 — `allowsEval` lazily calls `new Function("")` in a try/catch to detect CSP restrictions. Even though the error is caught, it still triggers CSP violation reports in the browser.
- **Fallback:** When `jitless: true` is set, `allowsEval` is never accessed (short-circuit evaluation at line 2009: `jit && allowsEval.value`), so `new Function` is never called. Zod falls back to its standard interpreter (`superParse`).

**Analysis:**

Zod v4 introduced JIT compilation for `z.object()` schemas using `new Function()` (the `$ZodObjectJIT` constructor). This is a performance optimization that generates specialized parsing functions at runtime. The JIT path:

1. Checks `globalConfig.jitless` — if true, JIT is completely disabled
2. Checks `allowsEval.value` — lazily tests if `new Function("")` works
3. Only uses JIT when both conditions allow it AND the parse context is synchronous

The `allowsEval` check itself calls `new Function("")`, which triggers CSP violation reports even though the error is caught. This is a known issue ([GitHub #4273](https://github.com/colinhacks/zod/issues/4273), [#4360](https://github.com/colinhacks/zod/issues/4360)).

Setting `z.config({ jitless: true })` completely bypasses both the JIT path and the `allowsEval` probe, eliminating the need for `unsafe-eval` in CSP. The performance impact is negligible for client-side form validation workloads.

**Remediation:** ✅ Resolved

1. Added `z.config({ jitless: true })` to `apps/admissions/src/main.tsx` before any schema parsing occurs
2. Removed `'unsafe-eval'` from `script-src` in `apps/admissions/vercel.json`
3. TypeScript compilation verified clean (zero errors)

**CSP after:** `script-src 'self' https://va.vercel-scripts.com`

**Status:** Resolved

---

### P1-SEC-002: CSP correctly blocks inline scripts

**Finding ID:** P1-SEC-002
**Severity:** Info (Positive finding)
**Requirement:** Req 1.4
**Summary:** The CSP `script-src` directive does NOT include `unsafe-inline`, confirming that inline script execution is blocked.

**Evidence:**

- **CSP `script-src`:** `'self' https://va.vercel-scripts.com` (after fix)
- **No `unsafe-inline`** in `script-src` — inline `<script>` tags and `javascript:` URIs are blocked
- **`unsafe-inline` in `style-src` only:** `style-src 'self' 'unsafe-inline'` — this is expected and acceptable for Tailwind CSS / CSS-in-JS patterns and does not affect script injection risk

**Status:** Verified — No action needed

---

### P1-SEC-003: `style-src 'unsafe-inline'` is justified

**Finding ID:** P1-SEC-003
**Severity:** Low
**Requirement:** Req 1.4
**Summary:** The `unsafe-inline` directive in `style-src` is justified by Tailwind CSS and Radix UI runtime style injection patterns.

**Evidence:**

- Tailwind CSS and Radix UI primitives inject inline styles at runtime
- Removing `unsafe-inline` from `style-src` would break component styling
- `unsafe-inline` in `style-src` does not enable script injection — it only allows inline CSS
- The security risk of inline styles is significantly lower than inline scripts

**Status:** Verified — Accepted risk


---

### P1-SEC-004: Cookie security attributes are correctly configured across all environments

**Finding ID:** P1-SEC-004
**Severity:** Info (Positive finding)
**Requirement:** Req 2.1, 2.2, 2.3, 2.4
**Summary:** Auth cookies (`access_token`, `refresh_token`) use correct security attributes in all environments. No auth tokens are stored in `localStorage` or `sessionStorage`.

**Evidence:**

#### Cookie Attribute Matrix

| Attribute | `base.py` (default) | `prod.py` (production) | `dev.py` (development) |
|-----------|---------------------|------------------------|------------------------|
| `AUTH_COOKIE_DOMAIN` | `.mihas.edu.zm` | `.mihas.edu.zm` | `None` (localhost) |
| `AUTH_COOKIE_SAMESITE` | `Lax` | `None` | inherits `Lax` from base |
| `AUTH_COOKIE_SECURE` | `True` | `True` | `False` |
| `AUTH_COOKIE_HTTPONLY` | `True` | `True` | inherits `True` from base |
| `SESSION_COOKIE_SECURE` | Django default (`False`) | Django default | `False` (explicit) |
| `CSRF_COOKIE_SECURE` | Django default (`False`) | Django default | `False` (explicit) |

#### Cookie-Setting Code (`backend/apps/accounts/views.py`, `_set_auth_cookies`)

Both `access_token` and `refresh_token` cookies are set via `response.set_cookie()` with attributes read from Django settings:

```python
cookie_domain = getattr(settings, "AUTH_COOKIE_DOMAIN", ".mihas.edu.zm")
samesite = getattr(settings, "AUTH_COOKIE_SAMESITE", "Lax")
secure = getattr(settings, "AUTH_COOKIE_SECURE", True)
httponly = getattr(settings, "AUTH_COOKIE_HTTPONLY", True)
```

- `access_token`: `max_age=900` (15 min), `httponly`, `secure`, `samesite`, `domain`, `path=/`
- `refresh_token`: `max_age=604800` (7 days), `httponly`, `secure`, `samesite`, `domain`, `path=/`

No other backend code sets auth cookies — `set_cookie` is only called in `_set_auth_cookies`.

**Analysis:**

1. **`Secure=True` and `HttpOnly=True` (Req 2.2):** ✅ Both attributes are `True` in base and production settings. The `getattr` fallback defaults also default to `True`, so even if the settings are missing, cookies are secure by default. Development correctly relaxes `Secure` to `False` for `localhost` (HTTP).

2. **`SameSite=None` justification (Req 2.1, 2.3):** ✅ Production overrides `SameSite` from `Lax` (base) to `None`. This is justified by the cross-origin architecture:
   - Backend: `api.mihas.edu.zm` (Koyeb)
   - Frontend: `apply.mihas.edu.zm` (Vercel)
   - These are different subdomains served from different origins (different hosts), so the browser treats API requests from the frontend as cross-site. `SameSite=Lax` would block cookies on cross-origin POST requests (e.g., login, refresh, state-changing operations). `SameSite=None` is required for cookies to be sent on these cross-origin requests.
   - `Secure=True` is correctly paired with `SameSite=None` (browsers reject `SameSite=None` without `Secure`).
   - The `AUTH_COOKIE_DOMAIN=.mihas.edu.zm` (leading dot) ensures cookies are shared across all `*.mihas.edu.zm` subdomains.

3. **No auth tokens in `localStorage`/`sessionStorage` (Req 2.4):** ✅ Searched all `.ts` and `.tsx` files across both `apps/admissions` and `apps/jobs-ops` for `localStorage.setItem` and `sessionStorage.setItem` with token-related keys (`access_token`, `refresh_token`, `jwt`, `auth_token`, `bearer`). Zero matches found. All `localStorage`/`sessionStorage` usage is for non-sensitive data:
   - Application draft auto-save (`applicationDraft`, `applicationWizardDraft`)
   - UI state (sidebar collapsed, PWA install prompt dismissal, install banner session flag)
   - Redirect paths (`mihas:post-auth-redirect`, `mihas:before-auth-redirect`)
   - Service worker reload guards
   - Push notification preferences
   - API cache (non-auth data)
   - Filter state persistence

4. **CSRF token delivery:** The CSRF token is delivered via the `X-CSRF-Token` response header (not a cookie), stored in-memory by the frontend `apiClient`, and sent back as the `X-CSRF-Token` request header. It is not persisted to `localStorage` or `sessionStorage`.

5. **Development environment (Req 2.2 relaxation):** `dev.py` correctly sets `AUTH_COOKIE_SECURE=False` and `AUTH_COOKIE_DOMAIN=None` for local development over HTTP. `SESSION_COOKIE_SECURE` and `CSRF_COOKIE_SECURE` are also relaxed. This is expected and does not affect production security.

**Status:** Verified — No action needed

---

### P1-SEC-005: `SameSite` base/prod divergence is intentional but worth documenting

**Finding ID:** P1-SEC-005
**Severity:** Low
**Requirement:** Req 2.1
**Summary:** `base.py` sets `AUTH_COOKIE_SAMESITE=Lax` while `prod.py` overrides to `None`. The divergence is correct for the cross-origin architecture but the base default would break production if `prod.py` were accidentally bypassed.

**Evidence:**

- `base.py` line: `AUTH_COOKIE_SAMESITE = "Lax"`
- `prod.py` line: `AUTH_COOKIE_SAMESITE = "None"`
- `dev.py`: no override (inherits `Lax` from base)

**Analysis:**

The `Lax` default in `base.py` is a safe fallback for environments that don't need cross-origin cookies. Production correctly overrides to `None` because the frontend (`apply.mihas.edu.zm`) and backend (`api.mihas.edu.zm`) are on different origins. If `prod.py` were accidentally not loaded, the `Lax` default would silently break cross-origin auth (cookies wouldn't be sent on cross-origin POST requests). This is a defense-in-depth concern, not a bug.

**Remediation:** Consider adding a comment in `base.py` next to `AUTH_COOKIE_SAMESITE = "Lax"` noting that production overrides this to `None` for cross-origin cookie support, so future maintainers understand the intentional divergence.

**Status:** Open (documentation improvement)

---

### P1-SEC-006: CORS configuration is correctly locked down in production

**Finding ID:** P1-SEC-006
**Severity:** Info (Positive finding)
**Requirement:** Req 3.1, 3.2, 3.3, 3.4
**Summary:** Production CORS is correctly configured with explicit origin lists, `CORS_ALLOW_ALL_ORIGINS = False`, and `CORS_ALLOW_CREDENTIALS = True` paired with explicit origins. No wildcard origin is used in production. Development correctly relaxes to `CORS_ALLOW_ALL_ORIGINS = True` for local convenience.

**Evidence:**

#### CORS Settings Matrix

| Setting | `base.py` (default) | `prod.py` (production) | `dev.py` (development) |
|---------|---------------------|------------------------|------------------------|
| `CORS_ALLOWED_ORIGINS` | `split_csv_env("CORS_ALLOWED_ORIGINS")` → `[]` (empty if env unset) | `split_csv_env("CORS_ALLOWED_ORIGINS", "***REMOVED***")` → `["***REMOVED***"]` | inherits from base |
| `CORS_ALLOWED_ORIGIN_REGEXES` | `split_csv_env("CORS_ALLOWED_ORIGIN_REGEXES")` → `[]` (empty if env unset) | 3 regex patterns (see below) | inherits from base |
| `CORS_ALLOW_ALL_ORIGINS` | not set (Django default `False`) | `False` (explicit) | `True` (explicit) |
| `CORS_ALLOW_CREDENTIALS` | `True` | inherits `True` from base | inherits `True` from base |
| `CORS_ALLOW_HEADERS` | `[*default_headers, "cache-control", "last-event-id", "x-csrf-token"]` | inherits from base | inherits from base |
| `CORS_EXPOSE_HEADERS` | `["X-CSRF-Token", "X-Request-ID"]` | inherits from base | inherits from base |
| `CORS_PREFLIGHT_MAX_AGE` | `86400` (24 hours) | inherits from base | inherits from base |

#### Production `CORS_ALLOWED_ORIGIN_REGEXES` (default values in `prod.py`)

```
^https://([A-Za-z0-9-]+\.)*beanola\.com$
^https://([A-Za-z0-9-]+\.)*mihas\.edu\.zm$
^https://([A-Za-z0-9-]+\.)*katc\.edu\.zm$
```

These are processed by `django-cors-headers` v4.9.0 via `re.match()` on each incoming `Origin` header.

#### Environment Variable Overrides

Both `CORS_ALLOWED_ORIGINS` and `CORS_ALLOWED_ORIGIN_REGEXES` are read from environment variables via `split_csv_env()`, with the values above as defaults. This means the Koyeb deployment can override them at runtime without code changes.

Scanned all `.env.*` files in the repo root:

| File | `CORS_ALLOWED_ORIGINS` | `CORS_ALLOWED_ORIGIN_REGEXES` |
|------|------------------------|-------------------------------|
| `.env.production` | not set | not set |
| `.env.vercel.production` | not set | not set |
| `.env.vercel.development` | not set | not set |
| `.env.vercel.preview` | not set | not set |
| `.env.development` | not set | not set |
| `.env.example` | not set | not set |
| `.env.local` | not set | not set |
| `.env.frontend` | not set | not set |

No `.env` file sets `CORS_ALLOWED_ORIGINS` or `CORS_ALLOWED_ORIGIN_REGEXES`. The Vercel `.env` files are frontend-only (they contain `VITE_*` variables and legacy Node.js API variables). The backend CORS configuration relies entirely on the defaults in `prod.py` unless overridden in the Koyeb deployment environment.

The `Dockerfile` uses a build-time placeholder: `CORS_ALLOWED_ORIGINS=https://build-placeholder.example.com` — this is only used during `collectstatic` and does not affect runtime behavior.

**Analysis:**

1. **`CORS_ALLOW_ALL_ORIGINS = False` in production (Req 3.3):** ✅ Explicitly set to `False` in `prod.py`. No wildcard origin is configured.

2. **`CORS_ALLOW_CREDENTIALS = True` paired with explicit origins (Req 3.4):** ✅ `CORS_ALLOW_CREDENTIALS = True` is set in `base.py` and inherited by production. In production, `CORS_ALLOW_ALL_ORIGINS = False` with explicit `CORS_ALLOWED_ORIGINS` and `CORS_ALLOWED_ORIGIN_REGEXES`. The `django-cors-headers` library correctly refuses to set `Access-Control-Allow-Origin: *` when credentials are enabled — it reflects the specific allowed origin instead.

3. **Development `CORS_ALLOW_ALL_ORIGINS = True` (Req 3.3 relaxation):** ✅ `dev.py` sets `CORS_ALLOW_ALL_ORIGINS = True` for local development convenience. This is acceptable because `dev.py` is only loaded when `DJANGO_SETTINGS_MODULE=config.settings.dev`. Note: `CORS_ALLOW_CREDENTIALS = True` is also inherited in dev — `django-cors-headers` handles this correctly by reflecting the requesting origin rather than using `*` when credentials are enabled.

4. **Regex pattern security review (Req 3.1):** ✅ The three regex patterns are well-constructed:
   - All patterns are anchored with `^` and `$` — no partial match risk
   - All patterns require `https://` — no HTTP origins accepted
   - The subdomain wildcard `([A-Za-z0-9-]+\.)*` only matches alphanumeric characters and hyphens followed by a dot — no path traversal or special character injection
   - Domain TLDs are escaped (`\.com$`, `\.edu\.zm$`) — no suffix confusion
   - The patterns cover three legitimate domains: `beanola.com` (developer), `mihas.edu.zm` (institution), `katc.edu.zm` (partner institution)
   - One minor observation: the patterns allow any subdomain depth (e.g., `a.b.c.mihas.edu.zm`), but this is acceptable since all subdomains of these domains are under the same organizational control

5. **Preflight rejection (Req 3.2):** ✅ `django-cors-headers` middleware (position 4 in `MIDDLEWARE`) checks every request's `Origin` header against `CORS_ALLOWED_ORIGINS` and `CORS_ALLOWED_ORIGIN_REGEXES`. If the origin is not in either list, no `Access-Control-Allow-Origin` header is set on the response, causing the browser to block the cross-origin request. Existing property tests in `backend/tests/property/test_middleware_properties.py` verify this behavior.

6. **`CORS_ALLOW_HEADERS` includes `x-csrf-token`:** ✅ The custom CSRF header is included in the allowed headers list, enabling the frontend to send `X-CSRF-Token` on cross-origin requests. This was previously a bug (P1-SEC finding in the `production-cors-pagination-fix` spec) and is now verified by property tests.

7. **`CORS_EXPOSE_HEADERS` includes `X-CSRF-Token` and `X-Request-ID`:** ✅ These headers are exposed to the frontend JavaScript, enabling CSRF token extraction from responses and request tracing.

**Status:** Verified — No action needed

---

### P1-SEC-007: Development `CORS_ALLOW_ALL_ORIGINS = True` with `CORS_ALLOW_CREDENTIALS = True` is safe but worth noting

**Finding ID:** P1-SEC-007
**Severity:** Low
**Requirement:** Req 3.3, 3.4
**Summary:** Development settings combine `CORS_ALLOW_ALL_ORIGINS = True` with `CORS_ALLOW_CREDENTIALS = True`. While `django-cors-headers` handles this safely (reflecting the requesting origin instead of `*`), this combination should never reach production.

**Evidence:**

- `dev.py` line: `CORS_ALLOW_ALL_ORIGINS = True`
- `base.py` line: `CORS_ALLOW_CREDENTIALS = True`
- `prod.py` line: `CORS_ALLOW_ALL_ORIGINS = False` (explicit override)

**Analysis:**

When `CORS_ALLOW_ALL_ORIGINS = True` and `CORS_ALLOW_CREDENTIALS = True`, `django-cors-headers` reflects the requesting `Origin` header as `Access-Control-Allow-Origin` (instead of using `*`, which browsers reject with credentials). This means any origin can make credentialed cross-origin requests in development. This is acceptable for local development but would be a critical vulnerability in production.

The production guard is `prod.py` explicitly setting `CORS_ALLOW_ALL_ORIGINS = False`. If `prod.py` were accidentally bypassed (e.g., wrong `DJANGO_SETTINGS_MODULE`), `base.py` does not set `CORS_ALLOW_ALL_ORIGINS` at all, so Django's default (`False`) would apply — a safe fallback.

**Remediation:** No action required. The layered settings (`base.py` defaults to `False`, `prod.py` explicitly sets `False`, only `dev.py` sets `True`) provide adequate protection. Consider adding a startup assertion in `prod.py` that verifies `CORS_ALLOW_ALL_ORIGINS is False` for defense-in-depth.

**Status:** Verified — Accepted risk (development only)



---

### P1-SEC-008: JWT refresh flow is correctly implemented end-to-end

**Finding ID:** P1-SEC-008
**Severity:** Info (Positive finding)
**Requirement:** Req 4.1, 4.2, 4.3, 4.4, 4.5
**Summary:** The JWT refresh flow works correctly across the frontend 401 interceptor, backend token rotation, JTI blacklisting, cross-origin cookie handling, and frontend refresh deduplication. Token lifetimes match the specified 15min/7day configuration.

**Evidence:**

#### End-to-End Flow Trace

**Step 1 — Frontend 401 Interceptor** (`apps/admissions/src/services/client.ts`)

When a non-auth API request receives a 401 response, the `ApiClient.executeRequest()` method triggers the refresh flow:

1. Checks `response.status === 401` and `!this.isAuthExcludedEndpoint(normalizedEndpoint)`
2. Excluded endpoints: `/api/v1/auth/refresh/`, `/api/v1/auth/login/`, `/api/v1/auth/register/` — prevents infinite refresh loops
3. Calls `this.attemptRefresh()` which delegates to `performRefresh()`
4. If refresh succeeds (`response.ok`), retries the original request once with fresh CSRF token
5. If the retry also returns 401, invokes `onAuthFailure()` callback and throws `AuthenticationError`
6. If refresh fails, invokes `onAuthFailure()` callback and throws `AuthenticationError`

**Step 2 — Frontend Refresh Request** (`ApiClient.performRefresh()`)

```
POST {API_BASE}/api/v1/auth/refresh/
credentials: 'include'          ← sends HTTP-only cookies (refresh_token)
X-CSRF-Token: {csrfToken}       ← attached if available
Content-Type: application/json
```

The frontend also captures `X-CSRF-Token` from the refresh response header via `response.headers.get('X-CSRF-Token')` and updates the in-memory store if present.

**Step 3 — Backend RefreshView** (`backend/apps/accounts/views.py`, `RefreshView.post()`)

1. Extracts `refresh_token` from `request.COOKIES.get("refresh_token")`
2. Returns 401 if no refresh token cookie present
3. Calls `verify_token(refresh_token, token_type="refresh")` which:
   - Decodes the JWT with the signing key
   - Validates `token_type == "refresh"`
   - Checks JTI blacklist via Redis (`is_jti_blacklisted(jti)`)
   - Raises `ValueError` if JTI is blacklisted (revoked token)
4. Looks up the user from the payload's `user_id` to get full claims (email, role, first_name, last_name)
5. Calls `rotate_tokens(refresh_token, user=user)` which:
   - Blacklists the old refresh token's JTI in Redis with 7-day TTL (`blacklist_jti(old_jti)`)
   - Generates a new access token (15min lifetime) with full user claims
   - Generates a new refresh token (7day lifetime) with new JTI
6. Updates the `DeviceSession` record: replaces old refresh token hash with new one, updates `last_activity`
7. Sets new `access_token` and `refresh_token` cookies via `_set_auth_cookies()`

**Step 4 — Backend Token Extraction (Two Layers)**

The backend has two token extraction mechanisms that work at different levels:

| Layer | Class | Location | Behavior on Invalid Token |
|-------|-------|----------|---------------------------|
| Middleware | `JWTAuthenticationMiddleware` | `backend/apps/common/middleware.py` | Silently passes through (sets `request.user` only on valid token) |
| DRF Auth | `JWTCookieAuthentication` | `backend/apps/accounts/authentication.py` | Raises `AuthenticationFailed` (401) |

Both use the same token extraction order:
1. `access_token` HTTP-only cookie (primary)
2. `Authorization: Bearer <token>` header (fallback)

Both validate:
- JWT signature via `SIGNING_KEY` and `ALGORITHM` from `SIMPLE_JWT` settings
- `token_type == "access"`
- `user_id` is present and non-empty

The middleware runs first (position 8 in `MIDDLEWARE`) and sets `request.user` for all requests. DRF's `JWTCookieAuthentication` runs second as the `DEFAULT_AUTHENTICATION_CLASS` and enforces authentication for views with `IsAuthenticated` permission.

**Note:** Neither `JWTCookieAuthentication` nor `JWTAuthenticationMiddleware` checks the JTI blacklist for access tokens. The JTI blacklist is only checked for refresh tokens during `verify_token(token, token_type="refresh")`. This is acceptable because access tokens have a short 15-minute lifetime, making blacklisting unnecessary — the token will expire before a revocation check would matter in practice.

#### Token Lifetime Verification (Req 4.5)

From `backend/config/settings/base.py`:

```python
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),   # ✅ 15 minutes
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),       # ✅ 7 days
    "SIGNING_KEY": os.environ.get("JWT_SIGNING_KEY", ""),
    "ALGORITHM": "HS256",
    "ROTATE_REFRESH_TOKENS": True,                     # ✅ Rotation enabled
    "BLACKLIST_AFTER_ROTATION": True,                  # ✅ Blacklisting enabled
}
```

Token generation in `backend/apps/accounts/tokens.py` reads these settings:

- `generate_access_token()`: `lifetime = settings.SIMPLE_JWT.get("ACCESS_TOKEN_LIFETIME", timedelta(minutes=15))` → `exp = now + lifetime`
- `generate_refresh_token()`: `lifetime = settings.SIMPLE_JWT.get("REFRESH_TOKEN_LIFETIME", timedelta(days=7))` → `exp = now + lifetime`

Cookie `max_age` values in `_set_auth_cookies()` match:
- `access_token`: `max_age=15 * 60` = 900 seconds (15 minutes) ✅
- `refresh_token`: `max_age=7 * 24 * 60 * 60` = 604,800 seconds (7 days) ✅

#### Token Rotation and Blacklisting (Req 4.2, 4.3)

`ROTATE_REFRESH_TOKENS=True` and `BLACKLIST_AFTER_ROTATION=True` are set in `SIMPLE_JWT` config. However, the actual rotation logic is implemented in the custom `rotate_tokens()` function in `tokens.py`, not via SimpleJWT's built-in rotation. The custom implementation:

1. `verify_token(refresh_token, token_type="refresh")` — decodes and validates, checks JTI blacklist
2. `blacklist_jti(old_jti)` — stores `jti:{old_jti}` in Redis with 604,800s TTL (7 days)
3. Generates new access + refresh tokens with fresh JTIs

JTI blacklist behavior:
- **Write (blacklist):** `redis.setex(f"jti:{jti}", 604800, "1")` — fail-open on Redis write errors (logs error, continues)
- **Read (check):** `redis.exists(f"jti:{jti}")` — fail-closed on Redis read errors (treats as blacklisted, returns `True`)

This fail-closed read behavior is correct: if Redis is unavailable, refresh tokens are rejected rather than accepted, forcing re-authentication.

#### Cross-Origin Cookie Handling (Req 4.4)

The cross-origin architecture requires cookies to flow between:
- Frontend: `apply.mihas.edu.zm` (Vercel)
- Backend: `api.mihas.edu.zm` (Koyeb)

Configuration verified in P1-SEC-004 and P1-SEC-006:

| Setting | Value | Purpose |
|---------|-------|---------|
| `AUTH_COOKIE_DOMAIN` | `.mihas.edu.zm` | Shared across all `*.mihas.edu.zm` subdomains |
| `AUTH_COOKIE_SAMESITE` | `None` (prod) | Required for cross-origin cookie sending |
| `AUTH_COOKIE_SECURE` | `True` | Required when `SameSite=None` |
| `CORS_ALLOW_CREDENTIALS` | `True` | Tells browser to include cookies in cross-origin requests |
| `CORS_EXPOSE_HEADERS` | `["X-CSRF-Token", "X-Request-ID"]` | Allows frontend JS to read CSRF token from response |

Frontend sends `credentials: 'include'` on all requests (both in `performRefresh()` and `executeRequest()`), which instructs the browser to attach cookies on cross-origin requests.

#### Frontend Refresh Deduplication (Req 4.1)

The `ApiClient` implements a promise-lock pattern for refresh deduplication:

```typescript
private refreshPromise: Promise<boolean> | null = null;

private async attemptRefresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;  // ← reuse in-flight promise
    this.refreshPromise = this.performRefresh();
    try {
        return await this.refreshPromise;
    } finally {
        this.refreshPromise = null;  // ← clear lock on completion
    }
}
```

When multiple concurrent requests receive 401s simultaneously:
1. The first 401 sets `this.refreshPromise` to the refresh call
2. Subsequent 401s find `this.refreshPromise` is non-null and await the same promise
3. Only one `POST /api/v1/auth/refresh/` is sent to the backend
4. All waiting requests get the same boolean result
5. The lock is cleared in `finally` regardless of success or failure

This correctly prevents parallel refresh requests that would cause token rotation conflicts (the second refresh would use an already-blacklisted token).

**Analysis:**

The JWT refresh flow is well-implemented with correct:
- 401 interception with auth endpoint exclusion to prevent infinite loops
- Promise-lock deduplication for concurrent 401s
- Token rotation with JTI blacklisting in Redis
- Fail-closed blacklist reads (safe default)
- Cross-origin cookie configuration matching the subdomain architecture
- Token lifetimes matching the specified 15min/7day configuration
- Cookie `max_age` values matching token lifetimes

**Status:** Verified — No action needed

---

### P1-SEC-009: RefreshView does not issue a new CSRF token after rotation

**Finding ID:** P1-SEC-009
**Severity:** Medium
**Requirement:** Req 4.2, 6.4
**Summary:** The `RefreshView` rotates auth tokens and sets new cookies but does not generate or return a new CSRF token. The frontend `performRefresh()` checks for `X-CSRF-Token` in the response header, but the backend never sets it on the refresh response. The existing CSRF token from login remains valid (it has a 24-hour TTL), so this is not a functional bug, but it means the CSRF token is not rotated alongside the refresh token.

**Evidence:**

- `RefreshView.post()` in `backend/apps/accounts/views.py` (lines ~300-340): calls `_set_auth_cookies()` but never calls `_generate_csrf_token()` and never sets `response["X-CSRF-Token"]`
- `LoginView.post()` in the same file: calls `_generate_csrf_token(user)` and sets `response["X-CSRF-Token"] = csrf_token`
- `_generate_csrf_token()` creates a `CSRFToken` row with `expires_at = now + 24 hours`
- Frontend `performRefresh()`: `const newCsrfToken = response.headers.get('X-CSRF-Token')` — this will always be `null` from the refresh endpoint
- The `CSRFEnforcementMiddleware` exempts `/api/v1/auth/refresh/` from CSRF checks, so the refresh itself works fine

**Analysis:**

The CSRF token issued at login has a 24-hour TTL. Since the refresh token has a 7-day lifetime, a user who stays logged in via refresh rotation will have their CSRF token expire after 24 hours. At that point:

1. State-changing requests will fail with 403 (`CSRF_VALIDATION_FAILED`)
2. The frontend's `handleCsrf403()` method will attempt to re-fetch the CSRF token from the session endpoint (`GET /api/v1/auth/session/`), but the session endpoint also does not set `X-CSRF-Token` in its response
3. The user would need to log out and log back in to get a fresh CSRF token

In practice, this may not be frequently hit because:
- The access token expires every 15 minutes, triggering refresh
- If the user closes the browser, cookies may be cleared depending on browser settings
- The 24-hour CSRF TTL covers most single-session usage patterns

However, for long-lived sessions (e.g., a tab left open for days with periodic refreshes), the CSRF token will expire and state-changing requests will fail silently until the user re-authenticates.

**Remediation:**

Option A (recommended): Add CSRF token generation to `RefreshView.post()`:
```python
# In RefreshView.post(), after _set_auth_cookies():
csrf_token = _generate_csrf_token(user)
response["X-CSRF-Token"] = csrf_token
```

Option B: Extend CSRF token TTL to match refresh token lifetime (7 days). This is simpler but reduces the security benefit of short-lived CSRF tokens.

**Status:** Open

---

### P1-SEC-010: `ROTATE_REFRESH_TOKENS` and `BLACKLIST_AFTER_ROTATION` settings are declarative only

**Finding ID:** P1-SEC-010
**Severity:** Low
**Requirement:** Req 4.2
**Summary:** The `SIMPLE_JWT` settings `ROTATE_REFRESH_TOKENS=True` and `BLACKLIST_AFTER_ROTATION=True` are set in `base.py` but are not consumed by any code. The actual rotation and blacklisting logic is implemented in the custom `rotate_tokens()` function in `tokens.py`, which reads `SIGNING_KEY`, `ALGORITHM`, `ACCESS_TOKEN_LIFETIME`, and `REFRESH_TOKEN_LIFETIME` from `SIMPLE_JWT` but ignores `ROTATE_REFRESH_TOKENS` and `BLACKLIST_AFTER_ROTATION`.

**Evidence:**

- `backend/config/settings/base.py`: `"ROTATE_REFRESH_TOKENS": True, "BLACKLIST_AFTER_ROTATION": True`
- `backend/apps/accounts/tokens.py`, `rotate_tokens()`: hardcodes rotation and blacklisting behavior — always rotates, always blacklists. Does not read `ROTATE_REFRESH_TOKENS` or `BLACKLIST_AFTER_ROTATION` from settings.
- Searched all Python files for references to `ROTATE_REFRESH_TOKENS` and `BLACKLIST_AFTER_ROTATION`: only found in `base.py` settings definition. No code reads these values.

**Analysis:**

The custom token implementation in `tokens.py` correctly implements rotation and blacklisting, so the behavior is correct. The `SIMPLE_JWT` settings serve as documentation of the intended behavior rather than configuration that controls it. This is not a bug — the settings accurately describe what the code does — but it could confuse a future maintainer who changes the settings expecting the behavior to change.

The project does not use `djangorestframework-simplejwt`'s built-in token views or serializers (which would read these settings). Instead, it uses the `PyJWT` library directly for all token operations.

**Remediation:** Add a comment in `base.py` next to these settings noting they are declarative/documentation-only and that the actual rotation logic lives in `backend/apps/accounts/tokens.py`.

**Status:** Open (documentation improvement)

---

### P1-SEC-011: Rate limiting scopes and limits are correctly configured

**Finding ID:** P1-SEC-011
**Severity:** Info (Positive finding)
**Requirement:** Req 5.1, 5.2, 5.4
**Summary:** The `RateLimitMiddleware` defines 6 rate limit scopes covering auth, admin, documents, sessions, notifications, and error reporting endpoints. Each scope returns HTTP 429 with a correct `Retry-After` header when the limit is exceeded. The error reporting endpoint correctly enforces 10 requests per 5 minutes per IP.

**Evidence:**

#### Rate Limit Scope Inventory

| Scope Prefix | Rate | Limit | Window | Retry-After (seconds) |
|-------------|------|-------|--------|----------------------|
| `/api/v1/auth/` | `60/5m` | 60 requests | 5 minutes | 300 |
| `/api/v1/admin/` | `60/10m` | 60 requests | 10 minutes | 600 |
| `/api/v1/documents/` | `20/10m` | 20 requests | 10 minutes | 600 |
| `/api/v1/sessions/` | `30/10m` | 30 requests | 10 minutes | 600 |
| `/api/v1/notifications/` | `50/10m` | 50 requests | 10 minutes | 600 |
| `/api/v1/errors/` | `10/5m` | 10 requests | 5 minutes | 300 |

The middleware uses `django_ratelimit.core.is_ratelimited()` with `key="ip"` and `increment=True` for each matching scope. Only the first matching scope applies (early `break` after match).

#### Error Reporting Endpoint (Req 5.4)

The error reporting endpoint at `POST /api/v1/errors/report/` (mounted via `backend/apps/common/error_urls.py`) falls under the `/api/v1/errors/` scope with rate `10/5m` — exactly 10 requests per 5 minutes per IP. ✅

#### 429 Response Format

When rate limited, the middleware returns:
```json
{"success": false, "error": "Rate limit exceeded", "code": "RATE_LIMITED"}
```
with HTTP status 429 and a `Retry-After` header set to the window duration in seconds.

#### Property Test Verification

- `test_rate_limiting.py::TestRateLimitingEnforcement::test_rate_limit_enforcement` — ✅ PASSED (Hypothesis, 100 examples)
- `test_middleware_properties.py::TestRateLimitRetryAfterProperty` — ✅ 5/5 PASSED (including scope config match)

**Status:** Verified — No action needed

---

### P1-SEC-012: Auth endpoints share the same rate limit as general auth scope — not stricter

**Finding ID:** P1-SEC-012
**Severity:** Medium
**Requirement:** Req 5.3
**Summary:** Authentication endpoints (`/api/v1/auth/login/`, `/api/v1/auth/register/`, `/api/v1/auth/password-reset/`) share the `/api/v1/auth/` scope at 60 requests per 5 minutes per IP. This is the same rate as the general auth scope (which also covers `/api/v1/auth/session/`, `/api/v1/auth/refresh/`, `/api/v1/auth/logout/`). Sensitive credential-testing endpoints (login, register, password-reset) should arguably have stricter limits than session/refresh/logout.

**Evidence:**

All endpoints under `/api/v1/auth/` share a single rate limit scope:

| Endpoint | Purpose | Rate Limit |
|----------|---------|-----------|
| `POST /api/v1/auth/login/` | Credential testing | 60/5m (shared) |
| `POST /api/v1/auth/register/` | Account creation | 60/5m (shared) |
| `POST /api/v1/auth/password-reset/` | Password reset request | 60/5m (shared) |
| `POST /api/v1/auth/password-reset/confirm/` | Password reset confirm | 60/5m (shared) |
| `POST /api/v1/auth/refresh/` | Token refresh | 60/5m (shared) |
| `POST /api/v1/auth/logout/` | Session termination | 60/5m (shared) |
| `GET /api/v1/auth/session/` | Session info | 60/5m (shared) |

**Analysis:**

The current 60/5m rate for the entire `/api/v1/auth/` prefix is reasonable as a general limit, but credential-testing endpoints (login, register, password-reset) are the primary targets for brute-force and credential-stuffing attacks. Industry best practice is to apply stricter limits to these endpoints — typically 5-10 attempts per minute for login, and even lower for password reset.

However, the shared scope means that 60 login attempts per 5 minutes (12 per minute) are allowed from a single IP. This is higher than recommended for credential-testing endpoints but acceptable given:
1. The platform uses bcrypt password hashing (slow by design)
2. Account lockout may be implemented at the application layer
3. The rate limit is per-IP, so distributed attacks would bypass it regardless

**Remediation:** Consider splitting the auth scope into sub-scopes:
- `/api/v1/auth/login/` → `10/5m` (stricter for credential testing)
- `/api/v1/auth/register/` → `5/5m` (stricter for account creation)
- `/api/v1/auth/password-reset/` → `5/5m` (stricter for password reset)
- `/api/v1/auth/` → `60/5m` (general auth operations like refresh, session, logout)

This would require adding these more specific prefixes before the general `/api/v1/auth/` entry in `SCOPE_LIMITS` (since the middleware uses first-match).

**Status:** Open

---

### P1-SEC-013: Many API endpoint groups have no rate limiting

**Finding ID:** P1-SEC-013
**Severity:** High
**Requirement:** Req 5.1
**Summary:** The `RateLimitMiddleware` only covers 6 URL prefixes. Many API endpoint groups have no rate limiting at all, including applications, catalog, jobs, job-applications, outreach, automation, integrations, analytics, reports, payments, events, email, and meta endpoints.

**Evidence:**

#### Endpoint-to-Rate-Limit Mapping

| URL Prefix | Rate Limited? | Rate |
|-----------|:------------:|------|
| `/api/v1/auth/` | ✅ | 60/5m |
| `/api/v1/admin/` | ✅ | 60/10m |
| `/api/v1/documents/` | ✅ | 20/10m |
| `/api/v1/sessions/` | ✅ | 30/10m |
| `/api/v1/notifications/` | ✅ | 50/10m |
| `/api/v1/errors/` | ✅ | 10/5m |
| `/api/v1/applications/` | ❌ | — |
| `/api/v1/catalog/` | ❌ | — |
| `/api/v1/jobs/` | ❌ | — |
| `/api/v1/job-applications/` | ❌ | — |
| `/api/v1/outreach/` | ❌ | — |
| `/api/v1/automation/` | ❌ | — |
| `/api/v1/integrations/` | ❌ | — |
| `/api/v1/analytics/` | ❌ | — |
| `/api/v1/reports/` | ❌ | — |
| `/api/v1/payments/` | ❌ | — |
| `/api/v1/events/` | ❌ | — |
| `/api/v1/email/` | ❌ | — |
| `/api/v1/meta/` | ❌ | — |
| `/api/v1/schema/` | ❌ | — |
| `/api/v1/docs/` | ❌ | — |
| `/health/live/` | ❌ | — |
| `/health/ready/` | ❌ | — |

**Analysis:**

13 out of 19 API endpoint groups (excluding health/schema/docs) have no rate limiting. While most of these require authentication (which provides some protection via token-based access control), an authenticated user or a compromised token could still abuse these endpoints without any throttling.

Notable unprotected endpoints:
- `/api/v1/applications/` — student application CRUD, including file-heavy operations
- `/api/v1/payments/` — payment verification, sensitive financial operations
- `/api/v1/outreach/` — message sending, potential for spam abuse
- `/api/v1/automation/` — rule execution, potential for resource exhaustion
- `/api/v1/integrations/` — external service calls (Telegram, OpenAI), potential for cost amplification
- `/api/v1/email/` — email sending, potential for spam

Health check endpoints (`/health/live/`, `/health/ready/`) are intentionally unprotected — they need to be accessible for deployment platform probes.

**Remediation:**

Add a default/catch-all rate limit for all `/api/v1/` endpoints not covered by specific scopes. Suggested approach:

1. Add specific scopes for high-risk endpoints:
   - `/api/v1/outreach/` → `30/10m` (message sending)
   - `/api/v1/email/` → `30/10m` (email operations)
   - `/api/v1/integrations/` → `20/10m` (external API calls)
   - `/api/v1/payments/` → `20/10m` (financial operations)

2. Add a catch-all scope at the end of `SCOPE_LIMITS`:
   - `/api/v1/` → `120/10m` (general API rate limit)

This ensures every API endpoint has at least a baseline rate limit.

**Status:** Open

---

### P1-SEC-014: Redis-unavailable fallback defaults to fail-closed (blocks requests)

**Finding ID:** P1-SEC-014
**Severity:** High
**Requirement:** Req 5.5
**Summary:** When Redis is unavailable, the `django-ratelimit` library (v4.1.0) defaults to fail-closed behavior — it blocks requests rather than allowing them through. The `RATELIMIT_FAIL_OPEN` setting is not configured in any Django settings file, so the default (`False`) applies. This means a Redis outage would cause all rate-limited endpoints to return 429 errors, effectively blocking legitimate traffic.

**Evidence:**

#### `django_ratelimit` v4.1.0 Redis Failure Path (`core.py`)

The `get_usage()` function in `django_ratelimit/core.py` handles cache failures as follows:

```python
count = None
try:
    added = cache.add(cache_key, initial_value, period + EXPIRATION_FUDGE)
except socket.gaierror:  # for redis
    added = False
if added:
    count = initial_value
else:
    if increment:
        try:
            count = cache.incr(cache_key)
        except ValueError:
            pass
    else:
        count = cache.get(cache_key, initial_value)

# Getting or setting the count from the cache failed
if count is None or count is False:
    if getattr(settings, 'RATELIMIT_FAIL_OPEN', False):
        return None    # ← fail-open: allow request
    return {
        'count': 0,
        'limit': 0,
        'should_limit': True,   # ← fail-closed: BLOCK request
        'time_left': -1,
    }
```

When Redis is down:
1. `cache.add()` raises `socket.gaierror` → caught, `added = False`
2. `cache.incr()` returns `None` (Redis client returns `None` for unavailable keys)
3. `count` remains `None`
4. Since `RATELIMIT_FAIL_OPEN` is not set (defaults to `False`), the function returns `should_limit: True`
5. `is_ratelimited()` returns `True` → middleware returns 429

#### Settings Verification

Searched all settings files (`base.py`, `prod.py`, `dev.py`) and all `.env*` files for `RATELIMIT_FAIL_OPEN`: **not found anywhere**. The default `False` applies, meaning fail-closed behavior.

#### Impact

During a Redis outage:
- All 6 rate-limited endpoint groups would return HTTP 429 to every request
- Auth endpoints (login, register, refresh) would be blocked
- Error reporting would be blocked (preventing error visibility during the outage)
- Admin, document, session, and notification endpoints would be blocked
- Non-rate-limited endpoints would continue to work normally

**Analysis:**

Requirement 5.5 states: "IF Redis is unavailable, THEN THE Rate_Limiter SHALL degrade gracefully without blocking legitimate requests." The current behavior violates this requirement — Redis unavailability causes rate-limited endpoints to block all traffic.

The `RateLimitMiddleware.__call__()` method also has no `try/except` around the `is_ratelimited()` call, so any unexpected exception from the cache backend would propagate as a 500 error rather than failing open.

**Remediation:**

Add `RATELIMIT_FAIL_OPEN = True` to `backend/config/settings/base.py`:

```python
# django-ratelimit: fail-open when Redis is unavailable.
# This ensures rate-limited endpoints remain accessible during Redis outages.
# Without this, a Redis outage would cause all rate-limited endpoints to
# return 429 errors, blocking legitimate traffic.
RATELIMIT_FAIL_OPEN = True
```

Additionally, wrap the `is_ratelimited()` call in the middleware with a `try/except` to handle unexpected cache backend exceptions:

```python
def __call__(self, request):
    from django_ratelimit.core import is_ratelimited

    for prefix, rate in self.SCOPE_LIMITS:
        if request.path.startswith(prefix):
            group = prefix.strip("/").replace("/", ".")
            try:
                limited = is_ratelimited(
                    request=request, group=group, key="ip",
                    rate=rate, increment=True,
                )
            except Exception:
                logger.warning("Rate limiter unavailable, failing open for %s", prefix)
                limited = False
            if limited:
                # ... return 429
            break
    return self.get_response(request)
```

**Status:** Open

---

### P1-SEC-015: Stale property test did not include `/api/v1/errors/` scope

**Finding ID:** P1-SEC-015
**Severity:** Low
**Requirement:** Req 5.1
**Summary:** The `test_scope_limits_match_rate_limit_config` test in `test_middleware_properties.py` was missing the `/api/v1/errors/` scope from its expected scopes dictionary, causing a test failure. The `/api/v1/errors/` scope was added to the middleware after the test was written.

**Evidence:**

- Test file: `backend/tests/property/test_middleware_properties.py`, `TestRateLimitRetryAfterProperty.test_scope_limits_match_rate_limit_config`
- Expected scopes had 5 entries, actual middleware had 6 (including `/api/v1/errors/`: `10/5m`)
- Test failure: `AssertionError: {5 scopes + errors} != {5 scopes}`

**Remediation:** ✅ Resolved — Added `/api/v1/errors/": "10/5m"` to the expected scopes dictionary in the test.

**Status:** Resolved

