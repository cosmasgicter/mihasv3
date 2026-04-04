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
| `CORS_ALLOWED_ORIGINS` | `split_csv_env("CORS_ALLOWED_ORIGINS")` → `[]` (empty if env unset) | `split_csv_env("CORS_ALLOWED_ORIGINS", "https://apply.mihas.edu.zm")` → `["https://apply.mihas.edu.zm"]` | inherits from base |
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


---

### P1-SEC-016: CSRF enforcement flow is correctly implemented end-to-end

**Finding ID:** P1-SEC-016
**Severity:** Info (Positive finding)
**Requirement:** Req 6.1, 6.2, 6.4
**Summary:** The CSRF enforcement flow — token issuance, frontend in-memory storage, header attachment on state-changing requests, and backend hash-based validation — is correctly implemented. POST/PUT/PATCH/DELETE requests without a valid `X-CSRF-Token` header are rejected with HTTP 403.

**Evidence:**

#### End-to-End CSRF Flow Trace

**Step 1 — Token Issuance** (`backend/apps/accounts/views.py`, `_generate_csrf_token()`)

On successful login, `LoginView.post()` generates a CSRF token:

1. `secrets.token_hex(32)` produces a 64-character hex string (256 bits of entropy)
2. The raw token is SHA-256 hashed: `hashlib.sha256(raw_token.encode()).hexdigest()`
3. A `CSRFToken` row is created in the `csrf_tokens` table with:
   - `user` FK → the authenticated user (session-bound)
   - `token_hash` → the SHA-256 hash of the raw token
   - `expires_at` → `now + 24 hours`
4. The raw token is returned in the `X-CSRF-Token` response header: `response["X-CSRF-Token"] = csrf_token`

The backend never stores the raw token — only the hash. This means even if the database is compromised, the raw CSRF tokens cannot be recovered.

**Step 2 — Frontend Storage** (`apps/admissions/src/lib/csrfToken.ts`)

The CSRF token is stored in a module-level variable — never persisted to `localStorage` or `sessionStorage`:

```typescript
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void { csrfToken = token; }
export function getCsrfToken(): string | null { return csrfToken; }
export function clearCsrfToken(): void { csrfToken = null; }
```

The `ApiClient` captures the token from response headers in multiple places:
- `performRefresh()`: `response.headers.get('X-CSRF-Token')` → `setCsrfToken()`
- `executeRequest()` (non-GET): `response.headers.get('X-CSRF-Token')` → `setCsrfToken()`
- `executeRequest()` (GET with cache): `onResponse` callback captures `X-CSRF-Token` → `setCsrfToken()`
- 401 retry path: captures from retry response
- 403 CSRF retry path: re-fetches from session endpoint

In-memory storage is the correct choice: it's cleared on page refresh (forcing re-authentication) and cannot be accessed by XSS attacks that target `localStorage`.

**Step 3 — Header Attachment** (`apps/admissions/src/services/client.ts`, `executeRequest()`)

For state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`), the `ApiClient` attaches the CSRF token:

```typescript
if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
        requestHeaders['X-CSRF-Token'] = csrfToken;
    }
}
```

This is also done on the refresh request in `performRefresh()` and on 401 retry paths.

**Step 4 — Backend Validation** (`backend/apps/common/middleware.py`, `CSRFEnforcementMiddleware`)

1. Checks if the request method is in `STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}`
2. Checks if the path matches any `EXEMPT_PATTERNS` — if so, skips validation
3. Extracts `X-CSRF-Token` from `request.META.get("HTTP_X_CSRF_TOKEN")`
4. If missing → returns 403 with `{"success": false, "error": "CSRF validation failed", "code": "CSRF_VALIDATION_FAILED"}`
5. SHA-256 hashes the token: `hashlib.sha256(csrf_token.encode()).hexdigest()`
6. Looks up the hash in the `csrf_tokens` table: `CSRFToken.objects.filter(token_hash=token_hash).exists()`
7. If not found → returns 403

**Step 5 — Frontend 403 Recovery** (`apps/admissions/src/services/client.ts`, `handleCsrf403()`)

When a 403 with `CSRF_VALIDATION_FAILED` code is received:

1. Fetches `GET /api/v1/auth/session/` to attempt CSRF token refresh
2. Captures `X-CSRF-Token` from the session response header
3. Retries the original request with the fresh token
4. If the retry also fails, throws an enhanced error

**Verification — 403 on missing/invalid token (Req 6.2):**

- Missing `X-CSRF-Token` header → `csrf_token` is `None` → `_forbidden_response()` returns 403 ✅
- Invalid token (not in DB) → hash lookup returns `False` → `_forbidden_response()` returns 403 ✅
- GET/HEAD/OPTIONS requests → bypass CSRF check entirely (correct — these are safe methods) ✅

**Status:** Verified — Core flow is correct

---

### P1-SEC-017: CSRF exempt endpoints are justified

**Finding ID:** P1-SEC-017
**Severity:** Info (Positive finding)
**Requirement:** Req 6.3
**Summary:** All CSRF-exempt patterns in `CSRFEnforcementMiddleware` are justified. Each exempt endpoint is either unauthenticated (no CSRF token available) or requires exemption for the auth flow to function.

**Evidence:**

#### Exempt Pattern Inventory

| Pattern | Endpoint | Justification |
|---------|----------|---------------|
| `^/api/v1/auth/login/?$` | Login | Unauthenticated — user has no CSRF token before login. Login itself issues the CSRF token. |
| `^/api/v1/auth/register/?$` | Register | Unauthenticated — new user has no session or CSRF token. |
| `^/api/v1/auth/password-reset/?$` | Password reset request | Unauthenticated — user requesting a reset link has no active session. |
| `^/api/v1/auth/logout/?$` | Logout | Exempt to ensure logout always succeeds even if CSRF token is stale or missing. Logout is idempotent and only deactivates the user's own session (identified by refresh cookie). |
| `^/api/v1/auth/refresh/?$` | Token refresh | Exempt because the CSRF token may be stale during refresh. The refresh endpoint is protected by the HTTP-only refresh cookie, which cannot be read by JavaScript (XSS-resistant). |
| `^/api/v1/errors/report/?$` | Frontend error reporting | Unauthenticated (`AllowAny`) — error reports must work even when the user is not logged in or the CSRF token is unavailable. Rate-limited to 10 req/5min/IP to prevent abuse. |

**Analysis:**

All exempt endpoints fall into two categories:
1. **Unauthenticated endpoints** (login, register, password-reset, error report): The user has no CSRF token because they haven't logged in yet. These endpoints use `AllowAny` permission and `authentication_classes = []`.
2. **Auth flow endpoints** (logout, refresh): These need to work even when the CSRF token is expired or missing, to prevent users from being stuck in a broken auth state.

No authenticated, state-changing endpoint is exempt from CSRF validation.

**Status:** Verified — No action needed

---

### P1-SEC-018: CSRF middleware does not validate token expiry

**Finding ID:** P1-SEC-018
**Severity:** High
**Requirement:** Req 6.1, 6.4
**Summary:** The `CSRFEnforcementMiddleware` checks that a `CSRFToken` row exists with the matching hash but does NOT check the `expires_at` field. Expired CSRF tokens remain valid indefinitely until the database row is manually deleted.

**Evidence:**

- `CSRFEnforcementMiddleware.__call__()` in `backend/apps/common/middleware.py`:
  ```python
  if not CSRFToken.objects.filter(token_hash=token_hash).exists():
      return self._forbidden_response()
  ```
- The query filters only on `token_hash` — no `expires_at__gt=now()` condition
- `CSRFToken` model has `expires_at = models.DateTimeField()` field (set to `now + 24h` at creation)
- No cleanup task or signal deletes expired `CSRFToken` rows

**Analysis:**

The `_generate_csrf_token()` function sets `expires_at = tz.now() + timedelta(hours=24)`, but this field is never checked during validation. This means:

1. A CSRF token issued at login remains valid forever (as long as the DB row exists)
2. Old CSRF tokens from previous sessions are never invalidated
3. If a user logs in multiple times, all previously issued CSRF tokens remain valid
4. The `expires_at` field is effectively dead code — it's written but never read

This weakens the CSRF protection because:
- Stolen CSRF tokens have an unlimited validity window
- Token accumulation in the `csrf_tokens` table grows unbounded (no cleanup)

**Remediation:**

1. Add expiry check to the middleware query:
   ```python
   from django.utils import timezone as tz
   if not CSRFToken.objects.filter(token_hash=token_hash, expires_at__gt=tz.now()).exists():
       return self._forbidden_response()
   ```

2. Add a periodic cleanup task (or extend `cleanup_audit_logs_task`) to delete expired `CSRFToken` rows:
   ```python
   CSRFToken.objects.filter(expires_at__lt=tz.now()).delete()
   ```

**Status:** Open

---

### P1-SEC-019: CSRF middleware does not verify token belongs to the requesting user

**Finding ID:** P1-SEC-019
**Severity:** Medium
**Requirement:** Req 6.1, 6.4
**Summary:** The `CSRFEnforcementMiddleware` validates that a `CSRFToken` row exists with the matching hash but does NOT verify that the token belongs to the authenticated user making the request. Any valid CSRF token from any user is accepted for any authenticated request.

**Evidence:**

- `CSRFEnforcementMiddleware.__call__()` in `backend/apps/common/middleware.py`:
  ```python
  token_hash = hashlib.sha256(csrf_token.encode()).hexdigest()
  if not CSRFToken.objects.filter(token_hash=token_hash).exists():
      return self._forbidden_response()
  ```
- The query filters only on `token_hash` — no `user=request.user` condition
- `CSRFToken` model has `user = models.ForeignKey(Profile, on_delete=models.CASCADE)` — the FK exists but is unused during validation
- The middleware runs after `JWTAuthenticationMiddleware` (position 9 vs 8), so `request.user` is available

**Analysis:**

The `CSRFToken` model correctly stores a `user` FK, and `_generate_csrf_token(user)` correctly associates the token with the logged-in user. However, the middleware validation ignores this association. In practice, this means:

- User A's CSRF token could be used to authorize User B's state-changing requests
- If an attacker obtains any valid CSRF token (from any user), they can use it for requests on behalf of any other user (provided they also have that user's auth cookies)

The practical exploitability is low because:
1. The attacker would need both a valid CSRF token AND the victim's auth cookies
2. CSRF tokens are stored in-memory (not in `localStorage`), making XSS extraction harder
3. Auth cookies are `HttpOnly`, preventing JavaScript access

However, the missing user binding violates the principle that CSRF tokens should be session-bound.

**Remediation:**

Add user binding to the middleware query:
```python
if not hasattr(request, 'user') or not getattr(request.user, 'is_authenticated', False):
    return self._forbidden_response()

user_id = getattr(request.user, 'pk', None) or getattr(request.user, 'id', None)
if not user_id:
    return self._forbidden_response()

if not CSRFToken.objects.filter(token_hash=token_hash, user_id=user_id).exists():
    return self._forbidden_response()
```

**Status:** Open

---

### P1-SEC-020: `password-reset/confirm/` POST is not CSRF-exempt but is unauthenticated

**Finding ID:** P1-SEC-020
**Severity:** High
**Requirement:** Req 6.3
**Summary:** The `PasswordResetConfirmView` at `/api/v1/auth/password-reset/confirm/` is a POST endpoint with `AllowAny` permission and no authentication classes, but it is NOT in the CSRF exempt patterns. Users clicking a password reset link will submit a POST without a CSRF token, which will be rejected with 403.

**Evidence:**

- `PasswordResetConfirmView` in `backend/apps/accounts/views.py`:
  ```python
  class PasswordResetConfirmView(APIView):
      permission_classes = [AllowAny]
      authentication_classes = []
  ```
- URL: `path("password-reset/confirm/", PasswordResetConfirmView.as_view())`
- Full path: `/api/v1/auth/password-reset/confirm/`
- CSRF exempt patterns in `CSRFEnforcementMiddleware`:
  ```python
  re.compile(r"^/api/v1/auth/password-reset/?$"),  # only matches /password-reset/ not /password-reset/confirm/
  ```
- The regex `^/api/v1/auth/password-reset/?$` matches `/api/v1/auth/password-reset` and `/api/v1/auth/password-reset/` but NOT `/api/v1/auth/password-reset/confirm/`

**Analysis:**

The password reset flow is:
1. User requests reset → `POST /api/v1/auth/password-reset/` (CSRF-exempt ✅)
2. User receives email with reset link containing a token
3. User clicks link, submits new password → `POST /api/v1/auth/password-reset/confirm/` (NOT CSRF-exempt ❌)

At step 3, the user is unauthenticated (they forgot their password) and has no CSRF token. The CSRF middleware will reject this request with 403, making password reset non-functional.

**Remediation:**

Add the confirm endpoint to the CSRF exempt patterns:
```python
EXEMPT_PATTERNS = [
    re.compile(r"^/api/v1/auth/login/?$"),
    re.compile(r"^/api/v1/auth/register/?$"),
    re.compile(r"^/api/v1/auth/password-reset/?$"),
    re.compile(r"^/api/v1/auth/password-reset/confirm/?$"),  # ← add this
    re.compile(r"^/api/v1/auth/logout/?$"),
    re.compile(r"^/api/v1/auth/refresh/?$"),
    re.compile(r"^/api/v1/errors/report/?$"),
]
```

Alternatively, use a broader pattern: `re.compile(r"^/api/v1/auth/password-reset(/confirm)?/?$")`

**Status:** Open

---

### P1-SEC-021: CSRF token is user-bound at creation but not validated as session-bound

**Finding ID:** P1-SEC-021
**Severity:** Medium
**Requirement:** Req 6.4
**Summary:** The CSRF token is correctly associated with a user at creation time (`_generate_csrf_token(user)` stores a `user` FK), but the session-binding is incomplete because: (1) the middleware doesn't verify the user FK during validation (see P1-SEC-019), (2) old tokens from previous sessions are never invalidated, and (3) the `RefreshView` doesn't issue new CSRF tokens (see P1-SEC-009).

**Evidence:**

This finding consolidates the session-binding aspects of P1-SEC-009, P1-SEC-018, and P1-SEC-019:

| Aspect | Expected | Actual |
|--------|----------|--------|
| Token created with user FK | ✅ `CSRFToken.objects.create(user=user, ...)` | Correct |
| Token validated against requesting user | ❌ Middleware only checks `token_hash` | Missing user check |
| Token has expiry | ✅ `expires_at = now + 24h` | Set but never validated |
| Token rotated on refresh | ❌ `RefreshView` doesn't issue new CSRF token | Missing rotation |
| Old tokens invalidated on logout | ❌ `LogoutView` doesn't delete CSRF tokens | Missing cleanup |
| Old tokens cleaned up periodically | ❌ No cleanup task for expired tokens | Missing cleanup |

**Analysis:**

For the CSRF token to be truly "session-bound" (Req 6.4), the following should hold:
1. Each token is tied to a specific user session ← partially implemented (user FK exists)
2. The token is validated against the current session ← not implemented
3. The token expires with the session ← not enforced (expiry not checked)
4. Old tokens are invalidated when the session ends ← not implemented

The current implementation provides "token existence" validation rather than "session-bound" validation. The 256-bit entropy of the token makes brute-force infeasible, so the practical security impact is limited, but the design intent of session binding is not fully realized.

**Remediation:** Address P1-SEC-018 (expiry check), P1-SEC-019 (user binding), and P1-SEC-009 (refresh rotation) to achieve full session-bound CSRF protection. Additionally, add CSRF token cleanup to `LogoutView`:

```python
# In LogoutView.post(), before clearing cookies:
if hasattr(request, 'user') and getattr(request.user, 'is_authenticated', False):
    CSRFToken.objects.filter(user=request.user).delete()
```

**Status:** Open

---

### P1-SEC-022: Error monitoring pipeline is correctly implemented end-to-end

**Finding ID:** P1-SEC-022
**Severity:** Info (Positive finding)
**Requirement:** Req 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
**Summary:** The error monitoring pipeline works correctly across both backend 500 errors and frontend error reports. Throttling, fail-open behavior, and ErrorLog schema are all verified.

**Evidence:**

#### Backend 500 Path (Req 7.1)
- `envelope_exception_handler` in `exceptions.py` catches both DRF exceptions (response.status_code >= 500) and non-DRF exceptions (response is None)
- Calls `_log_error_and_alert()` which creates `ErrorLog(source="backend")` and dispatches throttled alert
- Wrapped in try/except — error logging never breaks the error response

#### Frontend Error Path (Req 7.2, 7.3)
- `errorReporter.ts` captures `window.onerror` and `unhandledrejection` events
- Batches errors with 5-second debounce via `setTimeout(flush, 5000)`
- POSTs to `/api/v1/errors/report/` using raw `fetch` (not apiClient — works before auth init)
- `ErrorReportView` creates `ErrorLog(source="frontend")` and dispatches throttled alert
- Uses `AllowAny` permission — works for unauthenticated users
- Hashes client IP with SHA-256 before storing (no raw IP in DB)

#### Throttling (Req 7.4)
- Both paths use `cache.add(f"error_alert:{msg_hash}", 1, 900)` — 15-min TTL per unique message hash
- `cache.add` returns `True` only if key didn't exist → first occurrence triggers alert, duplicates within 15 min are suppressed

#### Fail-Open (Req 7.5)
- Both `_log_error_and_alert()` and `ErrorReportView._dispatch_throttled_alert()` wrap `cache.add` in try/except
- On Redis failure: `should_alert` stays `True` → alert dispatches anyway ✅

#### ErrorLog Schema (Req 7.6)
- `id` (UUID), `source` (backend/frontend), `level` (error/warning), `message` (text), `stack_trace` (nullable text), `context` (nullable JSON), `request_path` (nullable text), `user_id` (nullable UUID), `ip_hash` (nullable char 64), `created_at` (auto timestamp) ✅
- `managed = False` — table created via SQL migration script, not Django migrations

#### One Issue: Frontend reporter uses same-origin URL
- `errorReporter.ts` uses `REPORT_URL = '/api/v1/errors/report/'` (relative path)
- In production, the frontend is at `apply.mihas.edu.zm` and the API is at `api.mihas.edu.zm`
- A relative URL would POST to `apply.mihas.edu.zm/api/v1/errors/report/` which is the Vercel static site, not the Django backend
- The error reporter should use the full API URL: `https://api.mihas.edu.zm/api/v1/errors/report/`

**Status:** Mostly verified — one issue with frontend reporter URL (see below)

---

### P1-SEC-023: Frontend error reporter uses relative URL — errors don't reach backend in production

**Finding ID:** P1-SEC-023
**Severity:** High
**Requirement:** Req 7.2
**Summary:** The `errorReporter.ts` uses a relative URL (`/api/v1/errors/report/`) for the error report endpoint. In production, the frontend is served from `apply.mihas.edu.zm` (Vercel) while the API is at `api.mihas.edu.zm` (Koyeb). The relative URL resolves to the Vercel domain, not the API domain, so frontend error reports never reach the backend.

**Evidence:**
- `apps/admissions/src/lib/errorReporter.ts` line 16: `const REPORT_URL = '/api/v1/errors/report/'`
- Frontend origin: `https://apply.mihas.edu.zm`
- API origin: `https://api.mihas.edu.zm`
- Relative URL resolves to: `https://apply.mihas.edu.zm/api/v1/errors/report/` → Vercel returns `index.html`

**Remediation:** Use `getApiBaseUrl()` from `@/lib/apiConfig` to construct the full URL:
```typescript
import { getApiBaseUrl } from '@/lib/apiConfig'
const REPORT_URL = `${getApiBaseUrl()}/api/v1/errors/report/`
```

Or since `errorReporter.ts` uses raw `fetch` (not apiClient) and runs before auth init, hardcode the production API URL with a fallback:
```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL?.trim() || ''
const REPORT_URL = `${API_BASE}/api/v1/errors/report/`
```

**Status:** Open

---

### P1-SEC-024: Frontend error reporter is gated by VITE_ERROR_REPORT_ENABLED

**Finding ID:** P1-SEC-024
**Severity:** Medium
**Requirement:** Req 7.2
**Summary:** The `initErrorReporter()` function checks `import.meta.env.VITE_ERROR_REPORT_ENABLED !== 'true'` and does nothing if the env var is not set. If this variable is not configured in Vercel production env vars, the entire frontend error reporting pipeline is silently disabled.

**Evidence:**
- `errorReporter.ts` line 108: `if (import.meta.env.VITE_ERROR_REPORT_ENABLED !== 'true') return`
- Searched all `.env*` files: `VITE_ERROR_REPORT_ENABLED` is not set in any file
- If not set, `import.meta.env.VITE_ERROR_REPORT_ENABLED` is `undefined`, which is `!== 'true'`, so the reporter is disabled

**Remediation:** Either:
1. Set `VITE_ERROR_REPORT_ENABLED=true` in Vercel production env vars
2. Or change the default to opt-out instead of opt-in: `if (import.meta.env.VITE_ERROR_REPORT_ENABLED === 'false') return`

**Status:** Open

---

### P1-SEC-025: No hardcoded secrets found in source code

**Finding ID:** P1-SEC-025
**Severity:** Info (Positive finding)
**Requirement:** Req 8.1, 8.2, 8.3, 8.5
**Summary:** Scanned all Python, TypeScript, and JavaScript source files for hardcoded API keys, passwords, tokens, and connection strings. No real secrets found. All sensitive values are environment-backed. The `SECRET_KEY` default `insecure-dev-key-change-me` exists in `base.py` and `dev.py` but is overridden in production via env var.

**Evidence:**
- Scanned for: `sk_live_`, `pk_live_`, `AKIA`, hardcoded passwords, connection strings, API keys
- Only match: `backend/tests/unit/test_password_rehash.py` uses `"mysecretpassword"` — test fixture, acceptable
- `SECRET_KEY` default in `base.py`: `os.environ.get("SECRET_KEY", "insecure-dev-key-change-me")` — overridden in production
- `.gitignore` excludes `.env`, `.env.*`, `.env.local`, `.env.production.local`
- Tracked `.env` files (`.env.development`, `.env.production`, `.env.example`) contain only placeholders (`[set-in-hosting-platform]`, `[user]:[password]`)
- No PII found in log output patterns — `ip_hash` uses SHA-256, audit logs use hashed IP/UA

**Status:** Verified — No action needed

---

### P1-SEC-026: `.env.vercel.*` files in .gitignore but `.env.development` and `.env.production` are tracked

**Finding ID:** P1-SEC-026
**Severity:** Low
**Requirement:** Req 8.2
**Summary:** The `.gitignore` has `.env.vercel.*` but the tracked files `.env.development` and `.env.production` contain only placeholder values. The `.env.frontend` and `.env.local` files are also tracked but contain no secrets. This is acceptable since all tracked env files are templates, not live configurations.

**Status:** Verified — Accepted (templates only)


---

### P1-SEC-027: ApplicationReviewView accepts raw `request.data` for payment status updates without serializer

**Finding ID:** P1-SEC-027
**Severity:** High
**Requirement:** Req 9.1, 9.4
**Summary:** `ApplicationReviewView.post()` has a code path that reads `paymentStatus`, `payment_status`, `verificationNotes`, and `notes` directly from `request.data` without passing through any serializer. This bypasses input validation entirely for the payment status update flow.

**Evidence:**

`backend/apps/applications/views.py`, `ApplicationReviewView.post()` lines ~512-534:

```python
if isinstance(request.data, dict) and (request.data.get("paymentStatus") or request.data.get("payment_status")):
    payment_status = request.data.get("paymentStatus") or request.data.get("payment_status")
    notes = request.data.get("verificationNotes") or request.data.get("notes") or ""

    app.payment_status = payment_status
    # ... saves directly to model without validation
```

This code path:
1. Reads `payment_status` directly from `request.data` — no type checking, no value validation, no allowlist of valid statuses
2. Reads `notes` directly — no length limit, no sanitization
3. Saves directly to the `Application` model without serializer validation
4. Returns before the `ApplicationReviewSerializer` validation path is reached

An attacker with admin access could set `payment_status` to any arbitrary string value.

**Remediation:** Create a dedicated `PaymentStatusUpdateSerializer` with a `ChoiceField` for `payment_status` (e.g., `["pending", "verified", "rejected"]`) and a `CharField` with `max_length` for notes. Route the payment status update through this serializer before saving.

**Status:** Open

---

### P1-SEC-028: ApplicationDraftView.post() reads raw `request.data` without serializer

**Finding ID:** P1-SEC-028
**Severity:** Medium
**Requirement:** Req 9.1, 9.4
**Summary:** `ApplicationDraftView.post()` reads `draft_data` and `application_id` directly from `request.data` without serializer validation. While `draft_data` is stored as JSON and `application_id` is used in a queryset filter, neither value is validated for type or content.

**Evidence:**

`backend/apps/applications/views.py`, `ApplicationDraftView.post()` lines ~706-710:

```python
def post(self, request):
    user_id = str(request.user.id)
    draft_data = request.data.get("draft_data", {})
    application_id = request.data.get("application_id")
    draft, created = ApplicationDraft.objects.update_or_create(
        user_id=user_id, application_id=application_id,
        defaults={"draft_data": draft_data}
    )
```

Issues:
1. `draft_data` is not validated — any JSON value is accepted and stored directly in a `JSONField`
2. `application_id` is not validated as a UUID — if it's not a valid UUID, the ORM query may raise an unhandled exception
3. No serializer is used despite `ApplicationDraftWriteSerializer` being defined in the same file but never used

**Remediation:** Use the existing `ApplicationDraftWriteSerializer` (or a similar serializer) to validate `draft_data` and `application_id` before saving.

**Status:** Open

---

### P1-SEC-029: ApplicationGradesView.post() partially bypasses serializer for batch grades

**Finding ID:** P1-SEC-029
**Severity:** Medium
**Requirement:** Req 9.1, 9.4
**Summary:** `ApplicationGradesView.post()` reads `request.data.get("grades")` directly to detect batch mode. While individual items in the batch are validated through `ApplicationGradeSerializer`, the outer structure (the `grades` key itself) is not validated through a serializer.

**Evidence:**

`backend/apps/applications/views.py`, `ApplicationGradesView.post()` line ~414:

```python
batch = request.data.get("grades") if isinstance(request.data, dict) else None
if isinstance(batch, list):
    # iterates and validates each item individually
```

The outer `request.data` dict is accessed directly. If `request.data` contains additional unexpected keys, they are silently ignored. The batch detection logic (`isinstance(request.data, dict)` and `isinstance(batch, list)`) is manual rather than serializer-driven.

**Analysis:** This is a lower-severity issue because each individual grade item IS validated through `ApplicationGradeSerializer`. The risk is limited to the outer structure not being formally validated.

**Remediation:** Create a `BatchGradeSerializer` with a `ListField(child=ApplicationGradeSerializer())` to validate the entire batch structure through a serializer.

**Status:** Open

---

### P1-SEC-030: ErrorReportView accepts raw `request.data` without serializer

**Finding ID:** P1-SEC-030
**Severity:** Medium
**Requirement:** Req 9.1, 9.4
**Summary:** `ErrorReportView.post()` reads `message`, `stack_trace`, `context`, and `url` directly from `request.data` without a serializer. While the endpoint is intentionally unauthenticated and rate-limited, the lack of serializer validation means field types and lengths are not formally enforced.

**Evidence:**

`backend/apps/common/error_views.py`, `ErrorReportView.post()`:

```python
def post(self, request):
    data = request.data
    message = data.get("message")
    # ... uses data.get("stack_trace"), data.get("context"), data.get("url")
```

Mitigating factors:
- The endpoint is rate-limited (10 req/5min/IP)
- `message` is truncated to 2000 chars before storage: `str(message)[:2000]`
- The endpoint is CSRF-exempt (intentionally unauthenticated)

However, `stack_trace`, `context`, and `url` are stored without length limits, which could allow oversized payloads to be stored in the database.

**Remediation:** Add an `ErrorReportSerializer` with `CharField(max_length=...)` for each field to enforce type and length constraints.

**Status:** Open

---

### P1-SEC-031: Jobs-ops scaffold POST endpoints ignore request body entirely

**Finding ID:** P1-SEC-031
**Severity:** Low
**Requirement:** Req 9.1
**Summary:** Multiple jobs-ops scaffold POST endpoints (`DiscoveryRunCreateView`, `JobApplicationListCreateView.post()`, `JobScoreView`, `JobTailorDocumentsView`, `JobDismissView`, `JobWatchView`, and all `JobApplication*View` action views) accept POST requests but completely ignore `request.data`. They return hardcoded scaffold responses regardless of input.

**Evidence:**

Example from `backend/apps/jobs/views.py`, `DiscoveryRunCreateView.post()`:

```python
def post(self, request):
    return Response(
        {"id": uuid.uuid4(), "source": "multi-source-scaffold", "status": "queued", ...},
        status=status.HTTP_202_ACCEPTED,
    )
```

Similarly, `backend/apps/outreach/views.py`, `backend/apps/automation/views.py`, and `backend/apps/integrations/views.py` all have scaffold POST endpoints that ignore request body.

**Analysis:** These are scaffold/placeholder endpoints that don't persist data or perform real operations. The risk is low because:
1. No user input is processed or stored
2. The endpoints are behind `IsAuthenticated` permission
3. They will need proper serializer validation when real functionality is implemented

**Remediation:** When these scaffold endpoints are implemented with real functionality, ensure each uses a serializer for input validation. Consider adding a `# TODO: Add serializer validation when implementing real logic` comment to each scaffold POST handler.

**Status:** Open (deferred — scaffold endpoints)

---

### P1-SEC-032: No `fields = "__all__"` found in any serializer

**Finding ID:** P1-SEC-032
**Severity:** Info (Positive finding)
**Requirement:** Req 9.1
**Summary:** Searched all Python files across the entire backend for `fields = "__all__"` usage in serializers. Zero matches found. All `ModelSerializer` subclasses use explicit field lists.

**Evidence:**

Serializers audited:
- `backend/apps/accounts/serializers.py` — all `Serializer` (not `ModelSerializer`), explicit fields
- `backend/apps/applications/serializers.py` — `ApplicationSerializer`, `ApplicationListSerializer`, `ApplicationTrackingSerializer`, `ApplicationDraftSerializer`, `ApplicationInterviewSerializer` all use explicit `fields = [...]` lists
- `backend/apps/documents/serializers.py` — `DocumentSerializer`, `PaymentSerializer` use explicit `fields = [...]` with `read_only_fields = fields`
- `backend/apps/catalog/serializers.py` — `InstitutionSerializer`, `ProgramSerializer`, `ProgramCreateUpdateSerializer`, `IntakeSerializer`, `SubjectSerializer` all use explicit `fields = [...]`
- `backend/apps/jobs/serializers.py` — all use explicit fields

**Status:** Verified — No action needed

---

### P1-SEC-033: Query parameters on list endpoints are validated via django-filters

**Finding ID:** P1-SEC-033
**Severity:** Info (Positive finding)
**Requirement:** Req 9.5
**Summary:** The primary list endpoint (`ApplicationListCreateView.get()`) uses `ApplicationFilter` (a `django_filters.FilterSet`) to validate and apply query parameters. The filter restricts allowed fields and uses safe lookup expressions.

**Evidence:**

`backend/apps/applications/filters.py`:
- `status` — `CharFilter(field_name="status", lookup_expr="iexact")`
- `payment` / `payment_status` — `CharFilter(field_name="payment_status", lookup_expr="iexact")`
- `program` — `CharFilter(field_name="program", lookup_expr="icontains")`
- `institution` — `CharFilter(field_name="institution", lookup_expr="icontains")`
- `search` — custom method filtering on `full_name__icontains` and `email__icontains`
- `sort` — custom method with allowlist: `{"created_at", "full_name"}` only

The `sort` filter is particularly well-implemented — it validates against an explicit allowlist of sortable fields and rejects unknown field names, preventing SQL injection via ORDER BY.

Other list endpoints (payments, jobs-ops scaffold) use simpler query parameter handling:
- `PaymentListView` filters by `application_id` from query params — used directly in ORM filter (UUID field, safe)
- Jobs-ops scaffold views use `request.query_params.get("page")`, `request.query_params.get("pageSize")` — cast to `int()` which will raise `ValueError` on non-numeric input (unhandled, but scaffold code)

**Status:** Verified — Adequate for production endpoints; scaffold endpoints need validation when implemented

---

### P1-SEC-034: File upload MIME allowlist is enforced via magic byte validation

**Finding ID:** P1-SEC-034
**Severity:** Info (Positive finding)
**Requirement:** Req 10.1, 10.5
**Summary:** The document upload endpoint validates file content against a magic byte allowlist. Only PDF, JPEG, PNG, and GIF files are accepted. The validator checks both the declared MIME type and the actual file content bytes, rejecting mismatches.

**Evidence:**

`backend/apps/documents/validators.py`:

```python
ALLOWED_MIME_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/gif"}
```

Validation flow in `DocumentUploadView.post()`:
1. `DocumentUploadSerializer` validates the upload form (file, document_type, application_id)
2. `validate_file_magic_bytes(file_obj, declared_mime)` is called with the file object and client-declared MIME type
3. Validator checks declared MIME against `ALLOWED_MIME_TYPES` — rejects if not in allowlist
4. Reads first bytes and matches against `MAGIC_BYTES` signatures
5. Rejects if no magic byte match found
6. Rejects if detected MIME doesn't match declared MIME (prevents content-type spoofing)

This is a strong validation approach — it prevents both:
- Uploading disallowed file types (e.g., executables, HTML, SVG)
- Content-type spoofing (declaring `image/jpeg` but uploading a PDF)

**Status:** Verified — No action needed

---

### P1-SEC-035: No file size limit enforced on uploads

**Finding ID:** P1-SEC-035
**Severity:** High
**Requirement:** Req 10.2
**Summary:** Neither the `DocumentUploadSerializer` nor the `DocumentUploadView` enforces a file size limit. Django's default `DATA_UPLOAD_MAX_MEMORY_SIZE` (2.5MB) and `FILE_UPLOAD_MAX_MEMORY_SIZE` (2.5MB) are not overridden in settings. Files larger than 2.5MB are written to a temporary file on disk rather than rejected, meaning arbitrarily large files can be uploaded and stored in R2.

**Evidence:**

1. `DocumentUploadSerializer` — no `max_length` or size validation on the `file` field:
   ```python
   class DocumentUploadSerializer(serializers.Serializer):
       file = serializers.FileField()  # no size limit
   ```

2. `DocumentUploadView.post()` — no size check before storage:
   ```python
   file_obj = serializer.validated_data["file"]
   # ... directly proceeds to magic byte validation and storage
   ```

3. Django settings (`backend/config/settings/base.py`) — no `FILE_UPLOAD_MAX_MEMORY_SIZE` or `DATA_UPLOAD_MAX_MEMORY_SIZE` override found

4. Django defaults:
   - `DATA_UPLOAD_MAX_MEMORY_SIZE` = 2,621,440 bytes (2.5MB) — but this only controls when Django switches from in-memory to temp file, not a hard rejection limit
   - `FILE_UPLOAD_MAX_MEMORY_SIZE` = 2,621,440 bytes (2.5MB) — same behavior

**Remediation:**

1. Add a `validate_file` method to `DocumentUploadSerializer`:
   ```python
   def validate_file(self, value):
       max_size = 10 * 1024 * 1024  # 10MB
       if value.size > max_size:
           raise serializers.ValidationError(f"File size exceeds {max_size // (1024*1024)}MB limit.")
       return value
   ```

2. Optionally set `DATA_UPLOAD_MAX_MEMORY_SIZE` in Django settings to a hard limit that matches the desired maximum upload size.

**Status:** Open

---

### P1-SEC-036: Uploaded filenames are not sanitized — path traversal risk mitigated by UUID key prefix

**Finding ID:** P1-SEC-036
**Severity:** Medium
**Requirement:** Req 10.4
**Summary:** The original filename from the upload (`file_obj.name`) is appended to the R2 storage key without sanitization. However, the key is prefixed with `documents/{application_id}/{uuid4_hex}_`, which makes path traversal exploitation unlikely in practice.

**Evidence:**

`backend/apps/documents/views.py`, `DocumentUploadView.post()`:

```python
file_key = f"documents/{application_id}/{uuid.uuid4().hex}_{file_obj.name}"
```

The `file_obj.name` comes directly from the client-provided filename. A malicious filename like `../../../etc/passwd` would produce a key like:
```
documents/abc123/a1b2c3d4_../../../etc/passwd
```

In S3/R2, keys are flat strings (not filesystem paths), so `../` has no special meaning — the object would simply be stored with that literal key. However:

1. The unsanitized filename is also stored in `document_name=file_obj.name` in the database, which could cause issues if displayed in the UI without escaping
2. If the storage backend ever changes to a filesystem-based backend, the path traversal would become exploitable
3. The filename could contain special characters that cause issues with URL encoding in signed URLs

**Remediation:**

1. Sanitize the filename before use:
   ```python
   import os
   import re
   safe_name = re.sub(r'[^\w\-.]', '_', os.path.basename(file_obj.name))
   file_key = f"documents/{application_id}/{uuid.uuid4().hex}_{safe_name}"
   ```

2. Also sanitize `document_name` before storing in the database.

**Status:** Open

---

### P1-SEC-037: Uploaded files use non-guessable R2 keys with UUID prefix

**Finding ID:** P1-SEC-037
**Severity:** Info (Positive finding)
**Requirement:** Req 10.3
**Summary:** File storage keys include a `uuid4().hex` component (32 random hex characters), making them non-guessable. Files are served via time-limited signed URLs (15-minute expiry) with S3v4 signatures.

**Evidence:**

1. Key generation (`DocumentUploadView.post()`):
   ```python
   file_key = f"documents/{application_id}/{uuid.uuid4().hex}_{file_obj.name}"
   ```
   The `uuid.uuid4().hex` produces 32 hex characters (128 bits of randomness), making brute-force key guessing infeasible.

2. Signed URL configuration (`backend/config/settings/base.py`):
   ```python
   AWS_QUERYSTRING_EXPIRE = 900  # 15-minute signed URLs
   AWS_S3_SIGNATURE_VERSION = "s3v4"
   AWS_DEFAULT_ACL = None  # no public access
   ```

3. Signed URL generation (`backend/apps/common/storage.py`):
   ```python
   client.generate_presigned_url(
       "get_object",
       Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": file_key},
       ExpiresIn=expiry,
   )
   ```

4. `AWS_DEFAULT_ACL = None` prevents public access — files are only accessible via signed URLs.

**Status:** Verified — No action needed

---

### P1-SEC-038: Production endpoints with serializer coverage — complete audit matrix

**Finding ID:** P1-SEC-038
**Severity:** Info (Audit summary)
**Requirement:** Req 9.1, 9.2, 9.3, 9.4, 9.5
**Summary:** Complete enumeration of all DRF views with POST/PUT/PATCH methods and their serializer usage status.

**Evidence:**

#### Production Endpoints (Real Data Operations)

| View | Method | Serializer Used | Status |
|------|--------|----------------|--------|
| `LoginView` | POST | `LoginSerializer` ✅ | OK |
| `RegisterView` | POST | `RegisterSerializer` ✅ | OK |
| `LogoutView` | POST | None (reads cookies only) ✅ | OK — no request body |
| `RefreshView` | POST | None (reads cookies only) ✅ | OK — no request body |
| `PasswordResetRequestView` | POST | `PasswordResetRequestSerializer` ✅ | OK |
| `PasswordResetConfirmView` | POST | `PasswordResetConfirmSerializer` ✅ | OK |
| `ApplicationListCreateView` | POST | `ApplicationCreateSerializer` ✅ | OK |
| `ApplicationDetailView` | PATCH/PUT | `ApplicationSerializer` ✅ | OK |
| `ApplicationGradesView` | POST | `ApplicationGradeSerializer` ✅ (per item) | ⚠️ Outer batch structure unvalidated (P1-SEC-029) |
| `ApplicationReviewView` | POST/PATCH | `ApplicationReviewSerializer` ✅ | ⚠️ Payment status path bypasses serializer (P1-SEC-027) |
| `ApplicationBulkStatusView` | POST | `ApplicationBulkStatusSerializer` ✅ | OK |
| `ApplicationDraftView` | POST | None ❌ | ⚠️ Raw `request.data` (P1-SEC-028) |
| `ApplicationInterviewView` | POST | `ApplicationInterviewSerializer` ✅ | OK |
| `ApplicationInterviewView` | PATCH/PUT | `ApplicationInterviewSerializer` ✅ | OK |
| `ApplicationVerifyDocumentView` | POST | `DocumentVerifySerializer` ✅ | OK |
| `AcceptanceLetterView` | POST | None (no request body) ✅ | OK — no request body |
| `FinanceReceiptView` | POST | None (no request body) ✅ | OK — no request body |
| `DocumentUploadView` | POST | `DocumentUploadSerializer` ✅ | OK |
| `DocumentExtractView` | POST | None (no request body) ✅ | OK — no request body |
| `PaymentVerifyView` | POST | `PaymentVerifySerializer` ✅ | OK |
| `ErrorReportView` | POST | None ❌ | ⚠️ Raw `request.data` (P1-SEC-030) |
| `ProgramListCreateView` | POST | `ProgramCreateUpdateSerializer` ✅ | OK |
| `ProgramDetailView` | PATCH | `ProgramCreateUpdateSerializer` ✅ | OK |
| `IntakeListCreateView` | POST | `IntakeSerializer` ✅ | OK |
| `IntakeDetailView` | PATCH | `IntakeSerializer` ✅ | OK |
| `InstitutionListCreateView` | POST | `InstitutionSerializer` ✅ | OK |
| `InstitutionDetailView` | PATCH | `InstitutionSerializer` ✅ | OK |

#### Scaffold Endpoints (No Real Data Operations)

| View | Method | Serializer Used | Status |
|------|--------|----------------|--------|
| `DiscoveryRunCreateView` | POST | None (scaffold) | ⚠️ Ignores body (P1-SEC-031) |
| `JobApplicationListCreateView` | POST | None (scaffold) | ⚠️ Ignores body (P1-SEC-031) |
| `JobScoreView` | POST | None (scaffold) | ⚠️ Ignores body (P1-SEC-031) |
| `JobTailorDocumentsView` | POST | None (scaffold) | ⚠️ Ignores body (P1-SEC-031) |
| `JobDismissView` | POST | None (scaffold) | ⚠️ Ignores body (P1-SEC-031) |
| `JobWatchView` | POST | None (scaffold) | ⚠️ Ignores body (P1-SEC-031) |
| `JobApplication*View` (5 actions) | POST | None (scaffold) | ⚠️ Ignores body (P1-SEC-031) |
| Outreach views (5 POST) | POST | None (scaffold) | ⚠️ Ignores body (P1-SEC-031) |
| Automation views (4 POST) | POST | None (scaffold) | ⚠️ Ignores body (P1-SEC-031) |
| Integration views (4 POST) | POST | None (scaffold) | ⚠️ Ignores body (P1-SEC-031) |

**Summary:**
- **26 production POST/PUT/PATCH endpoints** — 22 properly use serializers (85%), 4 have raw `request.data` issues
- **~20 scaffold POST endpoints** — all ignore request body (acceptable for scaffold state)
- **0 serializers** use `fields = "__all__"`
- **1 list endpoint** (`ApplicationListCreateView`) uses `django-filters` for query parameter validation

**Status:** Audit complete

---

### P1-SEC-027: Several views access request.data directly without serializer validation

**Finding ID:** P1-SEC-027
**Severity:** Medium
**Requirement:** Req 9.1, 9.4
**Summary:** 6 locations in `backend/apps/applications/views.py` and 1 in `error_views.py` access `request.data` directly without passing through a DRF serializer. While some have manual validation, they bypass the structured serializer validation pattern.

**Evidence:**
- `applications/views.py:414` — `request.data.get("grades")` for grade batch update
- `applications/views.py:512-514` — `request.data.get("paymentStatus")` for payment review
- `applications/views.py:707-708` — `request.data.get("draft_data")` for draft save
- `applications/views.py:810` — `request.data.copy()` for application create/update
- `error_views.py:40` — `request.data` for error report (acceptable — unauthenticated endpoint)

No serializer uses `fields = "__all__"` — all serializers define explicit field lists. ✅

**Remediation:** Add serializers for the grade batch, payment review, and draft save endpoints. The error report endpoint is acceptable without a serializer since it's unauthenticated and rate-limited.

**Status:** Open

---

### P1-SEC-028: File upload security is correctly implemented

**Finding ID:** P1-SEC-028
**Severity:** Info (Positive finding)
**Requirement:** Req 10.1, 10.2, 10.3, 10.4, 10.5
**Summary:** File uploads use magic byte validation, UUID-based non-guessable storage keys, and S3/R2 signed URLs. File names are included in the storage key but the UUID prefix prevents path traversal.

**Evidence:**
- Magic byte validation: `validate_file_magic_bytes(file_obj, declared_mime)` — validates actual file content against declared MIME type
- Storage key: `f"documents/{application_id}/{uuid.uuid4().hex}_{file_obj.name}"` — UUID prefix makes keys non-guessable
- Storage: `MediaStorage()` (django-storages S3 backend) → Cloudflare R2
- Signed URLs: `storage.url(saved_name)` generates time-limited signed URLs
- File size: stored in `ApplicationDocument.file_size` but no explicit size limit check in the view (relies on Django's `DATA_UPLOAD_MAX_MEMORY_SIZE` and web server limits)

**One concern:** The file name from `file_obj.name` is included in the storage key without sanitization. While the UUID prefix prevents path traversal, a malicious filename with special characters could cause issues in some storage backends.

**Status:** Mostly verified — consider adding filename sanitization

---

### P1-SEC-029: JWT middleware handles all edge cases correctly

**Finding ID:** P1-SEC-029
**Severity:** Info (Positive finding)
**Requirement:** Req 29.1, 29.2, 29.3, 29.4
**Summary:** Both `JWTAuthenticationMiddleware` (middleware layer) and `JWTCookieAuthentication` (DRF layer) correctly handle expired tokens, malformed JWTs, missing credentials, wrong token types, and missing user_id claims. No internal error details are leaked to clients.

**Evidence:**

| Edge Case | Middleware Behavior | DRF Auth Behavior |
|-----------|-------------------|-------------------|
| Expired token | `ExpiredSignatureError` caught → `None` (silent) | `AuthenticationFailed("Token has expired", code="TOKEN_EXPIRED")` → 401 |
| Malformed JWT | `InvalidTokenError` caught → `None` (logs warning) | `AuthenticationFailed("Invalid authentication token", code="INVALID_TOKEN")` → 401 |
| No credentials | `_extract_token` returns `None` → no auth | `authenticate` returns `None` → anonymous |
| Wrong token_type | `payload.get("token_type") != "access"` → `None` | `AuthenticationFailed("Invalid token type")` → 401 |
| Missing user_id | `not user_id` → `None` | `AuthenticationFailed("Invalid token payload")` → 401 |
| Missing signing key | Logs error → `None` | `AuthenticationFailed("Authentication service unavailable")` → 401 |

- No stack traces leaked in any error response ✅
- Error messages are generic ("Invalid authentication token") not specific ("JWT signature verification failed with key X") ✅
- Token extraction order consistent: cookie first, Bearer header fallback ✅
- Both layers validate `token_type == "access"` and `user_id` presence ✅

**Note on JTI blacklist (Req 29.5):** Access tokens do NOT check the JTI blacklist — only refresh tokens do during `verify_token(token, token_type="refresh")`. This is acceptable because access tokens have a 15-minute lifetime, making revocation impractical. The JTI blacklist is correctly checked for refresh tokens in `RefreshView.post()`.

**Status:** Verified — No action needed

---

## Phase 1 Summary

### Finding Count by Severity

| Severity | Count | IDs |
|----------|-------|-----|
| High | 5 | P1-SEC-001 (Resolved), P1-SEC-013, P1-SEC-014, P1-SEC-018, P1-SEC-020, P1-SEC-023 |
| Medium | 5 | P1-SEC-009, P1-SEC-012, P1-SEC-019, P1-SEC-021, P1-SEC-024, P1-SEC-027 |
| Low | 5 | P1-SEC-003, P1-SEC-005, P1-SEC-007, P1-SEC-010, P1-SEC-015 (Resolved), P1-SEC-026 |
| Info | 9 | P1-SEC-002, P1-SEC-004, P1-SEC-006, P1-SEC-008, P1-SEC-011, P1-SEC-016, P1-SEC-017, P1-SEC-022, P1-SEC-025, P1-SEC-028, P1-SEC-029 |

### Open Remediation Items (Priority Order)

1. **P1-SEC-020 (High):** Add `/api/v1/auth/password-reset/confirm/` to CSRF exempt patterns — password reset is currently broken
2. **P1-SEC-018 (High):** Add `expires_at` check to CSRF middleware query — expired tokens are accepted indefinitely
3. **P1-SEC-013 (High):** Add rate limiting to 13 unprotected API endpoint groups
4. **P1-SEC-014 (High):** Set `RATELIMIT_FAIL_OPEN = True` — Redis outage blocks all rate-limited traffic
5. **P1-SEC-023 (High):** Fix frontend error reporter URL — errors don't reach backend in production
6. **P1-SEC-009 (Medium):** Add CSRF token generation to RefreshView — 24h TTL gap for long sessions
7. **P1-SEC-019 (Medium):** Add user binding to CSRF middleware query
8. **P1-SEC-012 (Medium):** Split auth rate limit scopes for credential-testing endpoints
9. **P1-SEC-024 (Medium):** Enable `VITE_ERROR_REPORT_ENABLED` in production or change default
10. **P1-SEC-027 (Medium):** Add serializers for direct `request.data` access in application views

### Resolved During Audit

- **P1-SEC-001:** Removed `unsafe-eval` from CSP via Zod `jitless` config
- **P1-SEC-015:** Fixed stale rate limit scope test
