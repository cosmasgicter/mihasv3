# Audit Security Remediation — Bugfix Design

## Overview

This design addresses five security findings from the April 2026 system and API audits. The bugs range from P0 (hardcoded secrets in committed config files) to P1 (CSP unsafe-inline, missing cache-control headers, unauthenticated scaffold endpoints, and exposed admin/docs URLs). The fix strategy is minimal and targeted: replace secrets with placeholders, document the CSP limitation, add a cache-control middleware, flip permission classes on 7 views, move the admin URL, and gate OpenAPI docs behind auth in production.

## Glossary

- **Bug_Condition (C)**: The set of conditions under which each security defect is observable — secrets in plaintext, missing headers, unauthenticated access, or predictable admin URLs
- **Property (P)**: The desired secure behavior after the fix — placeholders instead of secrets, correct headers, authentication enforcement, obscured admin path
- **Preservation**: Existing functionality that must remain unchanged — MCP config structure, CSP allowed sources, unauthenticated public endpoints, admin functionality at the new path, dev-mode OpenAPI access
- **SecurityHeadersMiddleware**: The middleware in `backend/apps/common/middleware.py` that sets HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy on every response
- **AllowAny / IsAuthenticated**: DRF permission classes controlling endpoint access
- **DEBUG**: Django settings flag — `True` in `dev.py`, `False` in `prod.py`

## Bug Details

### Bug 1 (P0): Hardcoded Secrets in MCP Config Files

The bug manifests when `.kiro/mcp.json` and `.kiro/settings/mcp.json` are committed to git with real API keys and tokens in plaintext. Additionally, `.kiro/settings/mcp.json` is not in `.gitignore`, so future edits continue to be tracked.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug1(file)
  INPUT: file of type { path: string, content: JSON }
  OUTPUT: boolean

  IF file.path == ".kiro/mcp.json" OR file.path == ".kiro/settings/mcp.json" THEN
    secrets := extractSecretValues(file.content)
    RETURN ANY secret IN secrets WHERE secret != "" AND secret != "<YOUR_KEY_HERE>"
  END IF

  IF file.path == ".gitignore" THEN
    RETURN NOT contains(file.content, ".kiro/settings/mcp.json")
  END IF

  RETURN false
END FUNCTION
```

### Bug 2 (P1): CSP unsafe-inline for Scripts

The bug manifests when `apps/admissions/vercel.json` includes `'unsafe-inline'` in the `script-src` CSP directive without any documentation of the risk or migration plan. Full nonce-based CSP is not feasible with static Vercel deploys (no server-side nonce injection).

**Formal Specification:**
```
FUNCTION isBugCondition_Bug2(file)
  INPUT: file of type { path: string, content: JSON }
  OUTPUT: boolean

  IF file.path == "apps/admissions/vercel.json" THEN
    cspHeader := findHeader(file.content, "Content-Security-Policy")
    RETURN contains(cspHeader, "unsafe-inline")
           AND NOT hasDocumentedRiskComment(file.content, "unsafe-inline")
  END IF

  RETURN false
END FUNCTION
```

### Bug 3 (P1): Missing Cache-Control on Authenticated Responses

The bug manifests when any authenticated API endpoint returns a response without `Cache-Control: no-store, private`, allowing browsers to cache sensitive data in back/forward cache.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug3(request, response)
  INPUT: request of type HttpRequest, response of type HttpResponse
  OUTPUT: boolean

  RETURN request.user.is_authenticated == true
         AND response.status_code IN [200..299]
         AND "Cache-Control" NOT IN response.headers
END FUNCTION
```

### Bug 4 (P1): Scaffold Views Using AllowAny

The bug manifests when 7 jobs-ops scaffold views serve responses without requiring authentication. The affected views are: `SourceAnalyticsView`, `OutreachAnalyticsView`, `DailyDigestReportView` (in `analytics/views.py`), `EmailMessageListView`, `EmailThreadListView` (in `integrations/email_views.py`), `ResumeListView`, `DocumentVersionListView` (in `documents/job_views.py`).

**Formal Specification:**
```
FUNCTION isBugCondition_Bug4(view)
  INPUT: view of type DRF APIView
  OUTPUT: boolean

  RETURN view.name IN [
    "SourceAnalyticsView", "OutreachAnalyticsView", "DailyDigestReportView",
    "EmailMessageListView", "EmailThreadListView",
    "ResumeListView", "DocumentVersionListView"
  ] AND view.permission_classes == [AllowAny]
    AND view.authentication_classes == []
END FUNCTION
```

### Bug 5 (P1): Exposed Django Admin and Public OpenAPI Docs

The bug manifests when Django admin is served at the predictable `/admin/` path and when OpenAPI schema/docs/redoc endpoints are publicly accessible without authentication in production.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug5(request)
  INPUT: request of type HttpRequest
  OUTPUT: boolean

  IF request.path == "/admin/" THEN
    RETURN true  -- predictable admin URL
  END IF

  IF request.path IN ["/api/v1/schema/", "/api/v1/docs/", "/api/v1/redoc/"] THEN
    RETURN NOT request.user.is_authenticated AND settings.DEBUG == false
  END IF

  RETURN false
END FUNCTION
```

### Examples

- Bug 1: `.kiro/settings/mcp.json` contains `"SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiIs..."` — expected: `"SUPABASE_SERVICE_ROLE_KEY": ""`
- Bug 1: `.kiro/mcp.json` contains `"CONTEXT7_API_KEY": "ctx7sk-dbfa3364-..."` — expected: `"CONTEXT7_API_KEY": ""`
- Bug 1: `.gitignore` does not list `.kiro/settings/mcp.json` — expected: entry present
- Bug 2: CSP has `'unsafe-inline'` with no comment — expected: JSON comment documenting the risk and TODO
- Bug 3: `GET /api/v1/applications/` by authenticated user returns no `Cache-Control` header — expected: `Cache-Control: no-store, private`
- Bug 3: `GET /api/v1/catalog/programs/` by anonymous user — expected: no `Cache-Control: no-store, private` added (preservation)
- Bug 4: `GET /api/v1/analytics/sources/` returns 200 without auth — expected: 403
- Bug 5: `GET /admin/` shows Django admin login — expected: 404 (admin moved to `/mihas-admin-panel/`)
- Bug 5: `GET /api/v1/docs/` in production without auth returns Swagger UI — expected: 403

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- MCP config files retain valid JSON structure with all server entries, command/args/env key names intact so users can populate their own keys
- CSP continues to allow scripts from `'self'`, `https://va.vercel-scripts.com`, `https://pay.lenco.co`, and `https://pay.sandbox.lenco.co`
- All currently unauthenticated public endpoints continue to work without auth: `LoginView`, `RegisterView`, `PasswordResetRequestView`, `PasswordResetConfirmView`, `RefreshView`, health checks (`/health/live/`, `/health/ready/`), error reporter, Lenco webhook, `ApplicationTrackView`, catalog public reads, `PlatformMetaView`
- `FunnelAnalyticsView` continues to require `IsAuthenticated` (already fixed)
- Already-authenticated scaffold write views (`ResumeVariantCreateView`, `CoverLetterGenerateView`, `QuestionBankAnswerView`, `ZohoConnectView`) continue to require `IsAuthenticated`
- Django admin functions identically at its new URL path for session-authenticated admin users
- OpenAPI schema/docs/redoc remain freely accessible when `DEBUG=True` (development)
- Unauthenticated responses do NOT get `Cache-Control: no-store, private` headers
- The `EmailDeliveryWebhookView` continues to allow unauthenticated access (webhook endpoint)

**Scope:**
All inputs that do NOT involve the 5 bug conditions should be completely unaffected by this fix. This includes:
- Normal authenticated API usage (aside from gaining the new `Cache-Control` header)
- All frontend functionality
- All Celery tasks and background processing
- Database operations and migrations

## Hypothesized Root Cause

Based on the audit findings, the root causes are straightforward:

1. **Bug 1 — Secrets committed to repo**: The `.kiro/mcp.json` and `.kiro/settings/mcp.json` files were created with real credentials during initial MCP setup and committed without sanitization. `.kiro/settings/mcp.json` was never added to `.gitignore`.

2. **Bug 2 — CSP unsafe-inline undocumented**: The CSP was configured with `'unsafe-inline'` as a pragmatic choice for Vercel static deploys (no server-side nonce injection possible), but the risk was never documented in the config file itself.

3. **Bug 3 — No cache-control middleware**: The `SecurityHeadersMiddleware` sets security headers but does not include `Cache-Control`. No middleware or DRF mixin exists to add cache-control headers conditionally based on authentication status.

4. **Bug 4 — Scaffold views left open**: The 7 jobs-ops scaffold views were created with `AllowAny` and `authentication_classes = []` during initial scaffolding to simplify development. They were never tightened before the audit.

5. **Bug 5 — Default Django admin URL and public docs**: Django admin was left at the default `/admin/` path. OpenAPI endpoints were registered without any permission class, relying on the DRF default `IsAuthenticated` being overridden by drf-spectacular's own defaults.

## Correctness Properties

Property 1: Bug Condition — Secrets Replaced with Placeholders

_For any_ MCP config file (`.kiro/mcp.json` or `.kiro/settings/mcp.json`) where secret values previously contained real API keys or tokens, the fixed files SHALL contain only empty strings or `<YOUR_KEY_HERE>` placeholders for all secret fields, and `.kiro/settings/mcp.json` SHALL be listed in `.gitignore`.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — MCP Config Structure Intact

_For any_ MCP config file where the bug condition does NOT hold (non-secret fields like command, args, server names, disabled flags), the fixed files SHALL preserve the identical JSON structure, server entries, and configuration keys as the original files.

**Validates: Requirements 3.1, 3.2**

Property 3: Bug Condition — CSP Risk Documented

_For any_ CSP header definition in `apps/admissions/vercel.json` that contains `'unsafe-inline'`, the fixed file SHALL include a TODO comment documenting the `unsafe-inline` risk and the requirement for nonce-based CSP when server-side rendering becomes feasible.

**Validates: Requirements 2.4**

Property 4: Preservation — CSP Allowed Sources Unchanged

_For any_ CSP directive in `apps/admissions/vercel.json`, the fixed file SHALL preserve all existing allowed sources (`'self'`, Vercel scripts, Lenco domains) and all other header values identically.

**Validates: Requirements 3.6**

Property 5: Bug Condition — Cache-Control on Authenticated Responses

_For any_ HTTP response where `request.user.is_authenticated` is `True`, the fixed middleware SHALL set `Cache-Control: no-store, private` on the response headers.

**Validates: Requirements 2.5**

Property 6: Preservation — No Cache-Control on Unauthenticated Responses

_For any_ HTTP response where `request.user.is_authenticated` is `False` (anonymous user), the fixed middleware SHALL NOT add `Cache-Control: no-store, private` to the response headers.

**Validates: Requirements 3.7**

Property 7: Bug Condition — Scaffold Views Require Authentication

_For any_ request to `SourceAnalyticsView`, `OutreachAnalyticsView`, `DailyDigestReportView`, `EmailMessageListView`, `EmailThreadListView`, `ResumeListView`, or `DocumentVersionListView` without valid authentication, the fixed views SHALL return 403 Forbidden.

**Validates: Requirements 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12**

Property 8: Preservation — Already-Authenticated Views Unchanged

_For any_ view that already requires `IsAuthenticated` (`FunnelAnalyticsView`, `ResumeVariantCreateView`, `CoverLetterGenerateView`, `QuestionBankAnswerView`, `ZohoConnectView`), the fixed code SHALL preserve the same permission classes and behavior.

**Validates: Requirements 3.4, 3.5**

Property 9: Bug Condition — Admin URL Obscured and Docs Gated

_For any_ request to `/admin/`, the fixed URL configuration SHALL return 404 (admin moved to non-standard path). _For any_ unauthenticated request to `/api/v1/schema/`, `/api/v1/docs/`, or `/api/v1/redoc/` in production (`DEBUG=False`), the fixed views SHALL return 403 Forbidden.

**Validates: Requirements 2.13, 2.14**

Property 10: Preservation — Admin Functionality and Dev Docs Access

_For any_ session-authenticated admin user accessing the new admin URL path, the fixed configuration SHALL provide identical Django admin functionality. _For any_ request to OpenAPI endpoints when `DEBUG=True`, the fixed views SHALL allow access without authentication.

**Validates: Requirements 3.8, 3.9**

## Fix Implementation

### Changes Required

**Bug 1: Secrets Replacement**

**File**: `.kiro/mcp.json`
- Replace `"CONTEXT7_API_KEY": "<REDACTED>"` with `"CONTEXT7_API_KEY": ""`

**File**: `.kiro/settings/mcp.json`
- Replace `"SUPABASE_URL"` value with `""`
- Replace `"SUPABASE_ANON_KEY"` value with `""`
- Replace `"SUPABASE_SERVICE_ROLE_KEY"` value with `""`
- Replace `"SUPABASE_ACCESS_TOKEN"` value with `""`
- Replace `"CONTEXT7_API_KEY"` value in the `context7` headers with `""`

**File**: `.gitignore`
- Add `.kiro/settings/mcp.json` entry

---

**Bug 2: CSP Documentation**

**File**: `apps/admissions/vercel.json`
- Add a comment block before the CSP header value documenting the `unsafe-inline` risk. Since JSON does not support comments, add a separate header entry with key `X-CSP-TODO` or use a `_comment` field in the headers array. Alternatively, since `vercel.json` is a config file, add the TODO as a documentation note using a dummy header or inline in the CSP value itself as a trailing comment marker. The pragmatic approach: add a `// TODO` comment in the CSP value string is not valid JSON. Instead, add a separate object in the headers array with a descriptive key that serves as documentation:
  ```json
  { "key": "X-CSP-Note", "value": "TODO: Replace unsafe-inline with nonce-based CSP when server-side rendering is feasible. See docs/security-api-audit-2026-04.md finding H2. Current unsafe-inline is required because Vercel static deploys cannot inject per-request nonces." }
  ```

---

**Bug 3: Cache-Control Middleware**

**File**: `backend/apps/common/middleware.py`
- Add `Cache-Control: no-store, private` logic to `SecurityHeadersMiddleware.__call__`. After `response = self.get_response(request)`, check if `request.user.is_authenticated` is `True`. If so, set `response["Cache-Control"] = "no-store, private"`.

---

**Bug 4: Permission Class Changes**

**File**: `backend/apps/analytics/views.py`
- `SourceAnalyticsView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`
- `OutreachAnalyticsView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`
- `DailyDigestReportView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`

**File**: `backend/apps/integrations/email_views.py`
- `EmailMessageListView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`
- `EmailThreadListView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`

**File**: `backend/apps/documents/job_views.py`
- `ResumeListView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`
- `DocumentVersionListView`: Change `permission_classes = [AllowAny]` to `[IsAuthenticated]`, remove `authentication_classes = []`

---

**Bug 5: Admin URL and OpenAPI Gating**

**File**: `backend/config/urls.py`
- Change `path("admin/", admin.site.urls)` to `path("mihas-admin-panel/", admin.site.urls)`
- Wrap OpenAPI views with a conditional permission class:

**File**: `backend/apps/common/permissions.py` (new file)
- Create `IsAuthenticatedOrDebug` permission class:
  ```python
  from django.conf import settings
  from rest_framework.permissions import BasePermission

  class IsAuthenticatedOrDebug(BasePermission):
      def has_permission(self, request, view):
          if settings.DEBUG:
              return True
          return request.user and request.user.is_authenticated
  ```

**File**: `backend/config/urls.py`
- Wrap `SpectacularAPIView`, `SpectacularSwaggerView`, and `SpectacularRedocView` with the `IsAuthenticatedOrDebug` permission using `.as_view(permission_classes=[IsAuthenticatedOrDebug])` or by creating thin subclasses/decorators.

Since drf-spectacular views accept `permission_classes` via `as_view()` kwargs, the cleanest approach is:
```python
from apps.common.permissions import IsAuthenticatedOrDebug

path("api/v1/schema/", SpectacularAPIView.as_view(permission_classes=[IsAuthenticatedOrDebug]), name="schema"),
path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema", permission_classes=[IsAuthenticatedOrDebug]), name="swagger-ui"),
path("api/v1/redoc/", SpectacularRedocView.as_view(url_name="schema", permission_classes=[IsAuthenticatedOrDebug]), name="redoc"),
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write tests that check for secrets in config files, missing headers, unauthenticated access to scaffold views, predictable admin URL, and public OpenAPI access. Run on UNFIXED code to observe failures.

**Test Cases**:
1. **Bug 1 — Secrets Present**: Parse `.kiro/mcp.json` and `.kiro/settings/mcp.json`, assert no real API keys exist (will fail on unfixed code)
2. **Bug 1 — Gitignore Missing Entry**: Read `.gitignore`, assert `.kiro/settings/mcp.json` is listed (will fail on unfixed code)
3. **Bug 2 — CSP Undocumented**: Parse `vercel.json`, assert `unsafe-inline` risk is documented (will fail on unfixed code)
4. **Bug 3 — Missing Cache-Control**: Send authenticated request, assert `Cache-Control: no-store, private` in response (will fail on unfixed code)
5. **Bug 4 — Unauthenticated Access**: Send unauthenticated GET to `/api/v1/analytics/sources/`, assert 403 (will fail on unfixed code — returns 200)
6. **Bug 5 — Admin at /admin/**: Send GET to `/admin/`, assert 404 (will fail on unfixed code — returns 200/302)
7. **Bug 5 — Public Docs**: Send unauthenticated GET to `/api/v1/docs/` with `DEBUG=False`, assert 403 (will fail on unfixed code)

**Expected Counterexamples**:
- Config files contain real `ctx7sk-`, `eyJhbG`, `sbp_` prefixed secrets
- Authenticated responses lack `Cache-Control` header entirely
- Scaffold endpoints return 200 for anonymous requests
- `/admin/` returns Django admin login page

### Fix Checking

**Goal**: Verify that for all inputs where each bug condition holds, the fixed code produces the expected behavior.

**Pseudocode:**
```
-- Bug 1
FOR ALL file IN [".kiro/mcp.json", ".kiro/settings/mcp.json"] DO
  secrets := extractSecretValues(parse(file))
  FOR ALL secret IN secrets DO
    ASSERT secret == "" OR secret == "<YOUR_KEY_HERE>"
  END FOR
END FOR
ASSERT ".kiro/settings/mcp.json" IN readLines(".gitignore")

-- Bug 2
csp := findCSPHeader(parse("apps/admissions/vercel.json"))
ASSERT hasDocumentedRisk(parse("apps/admissions/vercel.json"), "unsafe-inline")

-- Bug 3
FOR ALL request WHERE request.user.is_authenticated DO
  response := middleware(request)
  ASSERT response["Cache-Control"] == "no-store, private"
END FOR

-- Bug 4
FOR ALL view IN affectedViews DO
  response := view.handle(unauthenticatedRequest)
  ASSERT response.status_code == 403
END FOR

-- Bug 5
response := GET("/admin/")
ASSERT response.status_code == 404
FOR ALL path IN ["/api/v1/schema/", "/api/v1/docs/", "/api/v1/redoc/"] DO
  response := GET(path, unauthenticated, DEBUG=False)
  ASSERT response.status_code == 403
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces the same result as the original.

**Pseudocode:**
```
-- Bug 1: Config structure preserved
FOR ALL file IN [".kiro/mcp.json", ".kiro/settings/mcp.json"] DO
  ASSERT validJSON(file)
  ASSERT serverEntries(parse(file)) == serverEntries(parse(original_file))
  ASSERT allConfigKeys(parse(file)) == allConfigKeys(parse(original_file))
END FOR

-- Bug 2: CSP sources preserved
original_csp := extractCSPDirectives(original_vercel_json)
fixed_csp := extractCSPDirectives(fixed_vercel_json)
ASSERT original_csp == fixed_csp

-- Bug 3: Unauthenticated responses unchanged
FOR ALL request WHERE NOT request.user.is_authenticated DO
  ASSERT "Cache-Control" NOT IN middleware(request).headers
    OR middleware(request)["Cache-Control"] == original_response["Cache-Control"]
END FOR

-- Bug 4: Already-authenticated views unchanged
FOR ALL view IN [FunnelAnalyticsView, ResumeVariantCreateView, ...] DO
  ASSERT view.permission_classes == [IsAuthenticated]  -- unchanged
END FOR

-- Bug 5: Admin works at new path, docs work in DEBUG
response := GET("/mihas-admin-panel/", session_authenticated_admin)
ASSERT response.status_code IN [200, 302]
FOR ALL path IN ["/api/v1/schema/", "/api/v1/docs/", "/api/v1/redoc/"] DO
  response := GET(path, DEBUG=True)
  ASSERT response.status_code == 200
END FOR
```

**Testing Approach**: Property-based testing is recommended for Bug 3 (cache-control) and Bug 4 (permission classes) because:
- It generates many request scenarios automatically across the input domain
- It catches edge cases like streaming responses, error responses, and unusual auth states
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

### Unit Tests

- **Bug 1**: Parse both MCP JSON files, assert no secret patterns (`ctx7sk-`, `eyJhbG`, `sbp_`) remain; assert `.gitignore` contains the entry
- **Bug 2**: Parse `vercel.json`, assert CSP risk documentation exists alongside `unsafe-inline`; assert CSP directive values are unchanged
- **Bug 3**: Test `SecurityHeadersMiddleware` with mock authenticated request → assert `Cache-Control: no-store, private`; test with anonymous request → assert no `Cache-Control` added
- **Bug 4**: For each of the 7 views, instantiate and check `permission_classes == [IsAuthenticated]` and `authentication_classes` is not `[]`
- **Bug 5**: Test URL resolution — `/admin/` returns 404, `/mihas-admin-panel/` resolves to admin; test `IsAuthenticatedOrDebug` permission class with `DEBUG=True` (allow) and `DEBUG=False` + anonymous (deny) and `DEBUG=False` + authenticated (allow)

### Property-Based Tests

- **Bug 3**: Generate random request states (authenticated/anonymous, various status codes, various paths) and verify cache-control header is present if and only if the user is authenticated
- **Bug 4**: Generate random view selections from the 7 affected views and verify all require `IsAuthenticated`; generate random view selections from unaffected views and verify their permissions are unchanged
- **Bug 5**: Generate random `DEBUG` flag states and authentication states, verify `IsAuthenticatedOrDebug` returns the correct permission decision: `DEBUG=True` → always allow, `DEBUG=False` → allow only if authenticated

### Integration Tests

- **Bug 3**: Full request cycle through Django test client with authenticated user → verify `Cache-Control` header in response
- **Bug 4**: Full request cycle to each of the 7 endpoints without auth → verify 403; with auth → verify 200
- **Bug 5**: Full request cycle to `/admin/` → 404; to `/mihas-admin-panel/` → admin page; to `/api/v1/docs/` without auth in production settings → 403; to `/api/v1/docs/` in dev settings → 200
