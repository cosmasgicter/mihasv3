# Session Fix Execution Plan — Eliminate Auth Issues Permanently

## Root Cause Summary

The session system has been failing because of **one architectural flaw**: authentication responsibility is split between Django middleware and DRF, and they overwrite each other.

```
Request arrives with valid JWT cookie
  → Middleware decodes JWT, sets request.user = JWTUser ✓
  → DRF wraps request, runs authentication_classes
  → Views with authentication_classes = [] → DRF sets request.user = AnonymousUser ✗
  → SessionView returns {"user": null} despite valid token
  → Frontend enters recovery loop → "Reconnecting your session…" forever
```

Every "fix" so far has been a patch on top of this split:
- Debounce timers, cooldowns, recovery windows, payment flags, visibility guards
- 128 auth-related code points across 7+ frontend files
- All compensating for backend ambiguity that should not exist

## The Fix: Two Steps

### Step 1: Same-Origin API Proxy (eliminates cross-origin cookie issues)
### Step 2: Single Auth Authority (eliminates middleware/DRF conflict)

---

## Step 1: Same-Origin API Proxy via Vercel Rewrites

**What**: Route all `/api/*` requests through Vercel to the backend. The browser never makes cross-origin requests.

**Why this matters**:
- Cookies become same-origin (no `SameSite=None` needed)
- No CORS preflight requests (faster)
- No cross-origin cookie stripping by browsers/proxies
- Cloudflare/Koyeb proxy chain can't interfere with cookie delivery

**Files to change**:

### 1.1 vercel.json — Add API rewrite (BEFORE the SPA catch-all)

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api.mihas.edu.zm/api/:path*"
    },
    {
      "source": "/((?!assets/|images/|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
      "destination": "/index.html"
    }
  ]
}
```

### 1.2 Frontend API config — Use same-origin `/api/v1`

Change `src/lib/apiConfig.ts` so production uses same-origin:

```typescript
export function getApiBaseUrl(): string {
  // Local dev: same-origin (Vite proxy)
  if (browserOrigin && isLocalBrowserOrigin(browserOrigin)) {
    return browserOrigin
  }
  // Production: same-origin via Vercel rewrite
  if (browserOrigin === PRODUCTION_APP_ORIGIN) {
    return PRODUCTION_APP_ORIGIN  // was: PRODUCTION_API_ORIGIN
  }
  // Explicit override
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configured) return normalizeBaseUrl(configured)
  // Fallback
  return browserOrigin || PRODUCTION_API_ORIGIN
}
```

### 1.3 Backend CORS — Allow same-origin (already works, just verify)

The backend already has `access-control-allow-origin: https://apply.mihas.edu.zm`. Same-origin requests won't even need CORS headers.

### 1.4 Cookie domain — Keep `.mihas.edu.zm` for now

The cookies with `Domain=.mihas.edu.zm` will still work for same-origin requests to `apply.mihas.edu.zm`. No cookie config change needed.

### 1.5 CSP connect-src — Add same-origin

Update the CSP `connect-src` to include `'self'` (already there) — no change needed since `/api/*` is same-origin.

---

## Step 2: Single Auth Authority (DRF Only)

**What**: Remove auth responsibility from middleware. DRF is the only auth authority.

**Files to change**:

### 2.1 Remove JWTAuthenticationMiddleware auth logic

File: `backend/apps/common/middleware.py`

The middleware currently:
1. Extracts JWT from cookie/header
2. Decodes it
3. Sets `request.user = JWTUser`
4. Converts 403→401 for expired tokens

Change it to ONLY do step 4 (the 403→401 conversion for expired tokens). Remove steps 1-3. DRF handles authentication.

Actually, even step 4 becomes unnecessary once all views use proper DRF auth classes. But we can keep it as a safety net during migration.

Simplified middleware:
```python
class JWTAuthenticationMiddleware:
    """Flags expired JWT tokens so downstream 403 can be converted to 401."""
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Only flag expired tokens — do NOT set request.user
        token = request.COOKIES.get("access_token") or self._bearer_token(request)
        if token:
            try:
                import jwt as pyjwt
                pyjwt.decode(token, options={"verify_signature": False, "verify_exp": True})
            except pyjwt.ExpiredSignatureError:
                request._jwt_expired = True
            except Exception:
                pass
        return self.get_response(request)
    
    @staticmethod
    def _bearer_token(request):
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        return auth[7:].strip() if auth.startswith("Bearer ") else None
```

### 2.2 Classify and fix all `authentication_classes = []` views

| View | File | Current | Should Be | Reason |
|------|------|---------|-----------|--------|
| LoginView | accounts/views.py:189 | `[]` | `[]` | Correct — login is pre-auth |
| RefreshView | accounts/views.py:410 | `[]` | `[]` | Correct — uses refresh cookie directly |
| RegisterView | accounts/views.py:519 | `[]` | `[]` | Correct — registration is pre-auth |
| SessionView | accounts/views.py:614 | `[OptionalJWT]` | `[OptionalJWT]` | ✅ Already fixed |
| PasswordResetRequestView | accounts/views.py:712 | `[]` | `[]` | Correct — pre-auth |
| PasswordResetConfirmView | accounts/views.py:834 | `[]` | `[]` | Correct — pre-auth |
| LencoWebhookView | documents/views.py:717 | `[]` | `[]` | Correct — webhook, no user |
| ErrorReportView | common/error_views.py:41 | `[]` | `[]` | Correct — public error reporting |
| PlatformMetaView | common/meta_views.py:37 | `[]` | `[]` | Correct — public metadata |
| HealthLiveView | common/health.py:28 | `[]` | `[]` | Correct — health check |
| HealthReadyView | common/health.py:50 | `[]` | `[]` | Correct — health check |
| EmailProviderViews | integrations/ | `[]` | `[]` | Correct — webhook/public |

**Result**: All `authentication_classes = []` views are legitimately pre-auth or public. The SessionView was the only one that needed fixing (already done).

### 2.3 Ensure DRF default auth is set globally

File: `backend/config/settings/base.py`

Already configured:
```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.JWTCookieAuthentication",
    ],
}
```

This means every view WITHOUT explicit `authentication_classes` uses `JWTCookieAuthentication`. This is correct.

### 2.4 Simplify frontend auth — remove compensation layers

Once the backend has one auth authority and same-origin cookies:

**Remove from `AuthContext.tsx`**:
- `isPaymentInProgress()` guard in visibility handler (no longer needed — cookies are same-origin, widget can't break them)
- The import of `isPaymentInProgress`

**Simplify `ProtectedRoute.tsx`**:
- Remove `AUTH_RECOVERY_TIMEOUT_MS` (5s delay before redirect)
- Remove `isRecoveringSession` state
- Remove `recoveryAttempted` state
- Simple logic: loading → skeleton, authenticated → children, not authenticated → redirect

**Simplify `useApplicationPaymentAction.ts`**:
- Remove `_paymentInProgress` global flag
- Remove `isPaymentInProgress()` export

**Simplify `sessionHardening.ts`**:
- Keep `shouldDispatchAuthFailure()` debounce (still useful for concurrent 401s)
- Keep `isPermissionDenial()` (still useful for 403 classification)
- Remove payment-specific guards

**Simplify `client.ts`**:
- Keep refresh deduplication (still useful)
- Keep 401→refresh→retry flow
- Remove CSRF retry complexity if CSRF is simplified (see below)

### 2.5 Simplify CSRF (optional but recommended)

With same-origin requests, Django's built-in CSRF protection works. Consider:
- Using Django's standard `csrftoken` cookie + `X-CSRFToken` header
- Removing the custom `CSRFEnforcementMiddleware` and `csrf_tokens` table
- This eliminates an entire class of 403 errors

If keeping custom CSRF:
- Ensure CSRF failures return a distinct HTTP status (e.g., 419) or a clear `CSRF_INVALID` code
- Frontend retries once by fetching a new CSRF token

---

## Execution Sequence

### Day 1: Same-Origin Proxy (Step 1)

1. Update `vercel.json` with API rewrite
2. Update `apiConfig.ts` to use same-origin for production
3. Deploy to Vercel
4. Test: session endpoint returns user data
5. Test: login/logout/refresh work
6. Test: payment widget works
7. Test: admin operations work

### Day 2: Simplify Middleware (Step 2.1)

1. Reduce `JWTAuthenticationMiddleware` to expired-token flagging only
2. Deploy backend to Koyeb
3. Test: all endpoints still authenticate correctly via DRF
4. Test: expired tokens get 401 (not 403)

### Day 3: Simplify Frontend (Step 2.4)

1. Remove payment-in-progress guards
2. Simplify ProtectedRoute
3. Remove unnecessary recovery logic
4. Deploy to Vercel
5. Test: no "Reconnecting your session" on any page
6. Test: payment flow works without logout
7. Test: tab switching doesn't log out

### Day 4: Verify and Monitor

1. Monitor GlitchTip for auth-related errors
2. Monitor for any 401/403 anomalies
3. Confirm zero "Reconnecting" reports from users

---

## What This Eliminates

| Problem | How It's Eliminated |
|---------|-------------------|
| "Reconnecting your session" stuck state | Same-origin cookies always delivered; DRF always authenticates |
| Mobile logout during payment | No cross-origin cookie issues; payment guard unnecessary |
| SessionView returning user:null | OptionalJWTCookieAuthentication (already fixed) + same-origin delivery |
| Middleware/DRF conflict | Middleware no longer sets request.user |
| 403 ambiguity | DRF auth → 401 for unauth, 403 for forbidden, CSRF separate |
| 128 frontend auth code points | Reduced to ~30 (single auth path, no compensation) |
| Cross-origin cookie stripping | Eliminated (same-origin) |
| CORS preflight overhead | Eliminated (same-origin) |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Vercel rewrite adds latency | Vercel edge network is fast; measure actual impact |
| Vercel rewrite timeout (30s for hobby, 60s for pro) | Backend responses are well under 10s; only PDF export might be slow |
| Same-origin breaks something | Keep `VITE_API_BASE_URL` override as escape hatch |
| Middleware removal breaks a view | All views already use DRF auth or `[]`; tested in Step 2.1 |

---

## Alignment with infra.txt

This plan implements:
- **ADR-001**: DRF is the only auth authority ✓
- **ADR-002**: Keep cookie auth, same-origin proxy as transport hardening ✓
- **Phase 0**: Auth endpoint classification ✓ (done above)
- **Phase 1**: Auth boundary refactor ✓ (Steps 1+2)
- **Principle 1**: One authority per concern ✓
- **Principle 2**: Stable transport semantics ✓ (401=unauth, 403=forbidden)
