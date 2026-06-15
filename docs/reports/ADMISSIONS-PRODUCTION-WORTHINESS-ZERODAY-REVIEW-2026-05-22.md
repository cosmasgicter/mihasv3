# Admissions Production Worthiness And Zero-Day Review

Date: 2026-05-22  
Scope: admissions frontend (`apps/admissions`) and Django backend admissions/auth/documents/payments paths.

## Executive Summary

Overall production-worthiness score: **78 / 100**.

The admissions system is materially beyond prototype quality. It has strict production settings, HTTP-only cookie auth, CSRF validation for cookie-authenticated state changes, UUID resource IDs, R2/S3 signed document URLs, payment hardening flags, webhook signature validation, CSP/security headers, audit/logging hooks, and meaningful unit/property/integration test structure.

I did **not** find an obvious unauthenticated remote-code-execution, SQL injection, arbitrary file read, or direct payment-success forgery path in the reviewed code. The main “zero-day style” risks are trust-boundary weaknesses that could become critical in real production: overly broad credentialed CORS across wildcard subdomains, fail-open rate limiting, local draft PII fallback behavior, and a few admission/payment workflow edge cases.

Remediation update: the same-day hardening pass fixed **ZD-01**, **ZD-03**, **ZD-04**, **ZD-05**, **ZD-06**, and **ZD-08** with focused tests. **ZD-02** (Redis/rate-limit fail-open policy) and **ZD-07** (payment verification error status semantics/telemetry) remain as follow-up production policy decisions. Post-fix estimated score: **84 / 100**, pending full regression and production smoke evidence.

## Scorecard

| Metric | Score | Rationale |
|---|---:|---|
| Authentication and session security | 82 | HTTP-only cookies, CSRF header token, JWT signing key required at runtime. Refresh/logout are intentionally CSRF-exempt, which is acceptable only if refresh rotation and logout semantics are solid. |
| Authorization and object ownership | 84 | Most application, document, and payment paths enforce owner/admin checks. UUIDs reduce enumeration. Some draft/application linkage and document-type workflow edges remain. |
| CSRF and browser trust boundaries | 72 | CSRF validation exists for cookie state changes, but credentialed CORS plus wildcard trusted subdomain regexes materially expands the blast radius of a subdomain takeover. |
| Payment integrity | 83 | Forward-only payment flags, Lenco verification, webhook HMAC, payment attempt limits, idempotency, and correction controls are good. Deferred-payment and some provider-error paths need tighter throttling and operational checks. |
| File/document handling | 80 | Size limit, filename sanitization, magic-byte validation, private storage and signed URLs are present. Content scanning and tighter post-submission document-type rules are missing. |
| Frontend security | 77 | CSP is strong, no broad raw HTML pattern, CSRF is in-memory, tokens are not stored in localStorage. Draft persistence has fallback PII leakage risk if secure storage is unavailable/uninitialized. |
| Secrets and production config | 82 | Prod settings fail closed for Lenco and audit encryption keys, `DEBUG=False`, strict host default, secure cookies. Production checker has a JWT key check bug and CORS regex default is too broad. |
| Rate limiting and abuse resistance | 70 | DRF throttles exist for key endpoints and AI/payment scopes, but Redis/cache rate limiting is explicitly fail-open and some endpoints are not throttled. |
| Observability and auditability | 82 | Structured logging, Sentry/Glitchtip option, audit middleware, payment metrics, production checks and runbooks exist. Runtime evidence and drills still need to be captured. |
| Test and release readiness | 76 | Backend pytest/property tests and frontend vitest/playwright setup exist. I did not run the full suite during this review, and prior docs still call out deploy evidence gaps. |

## High Priority Findings

### ZD-01: Credentialed CORS trusts wildcard production subdomains

Severity: **High**

Location:
- `backend/config/settings/base.py:275-279`
- `backend/config/settings/prod.py:66-78`
- `backend/config/settings/prod.py:28-36`

Evidence:
- `CORS_ALLOW_CREDENTIALS = True`
- `CORS_EXPOSE_HEADERS = ["X-CSRF-Token", ...]`
- Production allows regex origins matching any subdomain under `beanola.com`, `mihas.edu.zm`, and `katc.edu.zm`.
- Production auth cookies are scoped to `.mihas.edu.zm` and use `SameSite=None`.

Impact:
If any trusted subdomain is taken over or can host attacker-controlled JavaScript, that origin can make credentialed requests to the API. Because CSRF recovery exposes `X-CSRF-Token` to allowed origins, this can become authenticated cross-origin action execution.

Fix:
Replace wildcard production CORS regex defaults with exact frontend origins. Keep wildcard patterns only for reviewed preview environments that cannot receive production cookies, or isolate preview domains outside the auth cookie parent domain.

### ZD-02: Rate limiting fails open when Redis/cache is unavailable

Severity: **High**

Location: `backend/config/settings/base.py:242-256`

Evidence:
- Redis cache backs rate limiting.
- `RATELIMIT_FAIL_OPEN = True`.

Impact:
A Redis outage or induced cache failure removes a major control for login, payment, AI OCR, payment verification, and abuse-sensitive flows. This is a common production incident shape: the dependency outage and traffic spike happen together.

Fix:
Fail closed or degrade selectively for high-risk endpoints: auth, payment initiation/verification, mobile money, OCR/AI, password reset, and error reporting. If availability requires fail-open, add edge/CDN rate limits and alert on cache failure.

### ZD-03: Local draft secure-storage fallback only strips top-level PII

Severity: **Medium-High**

Location:
- `apps/admissions/src/lib/secureStorage.ts:104-119`
- `apps/admissions/src/lib/secureStorage.ts:140-191`
- `apps/admissions/src/lib/localStorageCache.ts:31-40`
- `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts:1448-1458`

Evidence:
The wizard stores a draft object containing nested `formData`. If secure storage is unavailable or not initialized, fallback storage calls `stripPiiFields()` only on the top-level object. Nested `formData.email`, `formData.phone`, `formData.nrc_number`, etc. can remain.

Impact:
On browsers without Web Crypto, before secure storage initialization, or after encryption init failure, localStorage may retain admissions PII in plain JSON.

Fix:
Make PII stripping recursive, block draft persistence until secure storage is initialized, or only persist a minimal non-PII recovery pointer in fallback mode.

### ZD-04: Application draft save accepts arbitrary `application_id` without ownership validation

Severity: **Medium**

Location: `backend/apps/applications/student_draft_views.py:304-312`

Evidence:
The POST handler stores `request.data["application_id"]` with the authenticated user's draft via `update_or_create()` but does not load the application or verify ownership.

Impact:
Depending on database constraints and downstream draft restore logic, this can create inconsistent draft-to-application associations or denial-of-service style conflicts. It is not a direct data-read bug from the reviewed code, but it weakens the ownership model.

Fix:
If `application_id` is supplied, load the `Application` and require `app.user_id == request.user.id` or admin role before saving the draft.

### ZD-05: Students may upload `application_slip` documents after submission

Severity: **Medium**

Location: `backend/apps/documents/document_storage_views.py:225-238`

Evidence:
Non-admin users are blocked from uploading documents to non-draft applications except when `document_type == "application_slip"`, even though the comment says slips are system-generated.

Impact:
A student can add a user-uploaded “application slip” record to a submitted application. If staff tooling or downstream automations treat that document type as authoritative, this can create review confusion or document substitution risk.

Fix:
Require admin/system actor for `application_slip`, or write system-generated slips through a separate internal path that does not accept arbitrary user uploads.

## Medium Priority Findings

### ZD-06: Payment defer endpoint lacks payment-specific throttling

Severity: **Medium**

Location: `backend/apps/documents/payment_widget_views.py:304-323`

Evidence:
`PaymentInitiateView` and `PaymentVerifyView` use payment-specific throttles, but `DeferPaymentView` only uses authentication and idempotency.

Impact:
Authenticated abuse can repeatedly exercise deferred-payment logic, especially if idempotency keys vary. The service may still enforce canonical rules, but the HTTP edge is looser than adjacent payment endpoints.

Fix:
Add `PaymentUserScopedRateThrottle` and a `payment_defer` scope.

### ZD-07: Payment verification returns HTTP 200 for provider/integrity errors

Severity: **Medium**

Location: `backend/apps/documents/payment_query_views.py:343-390`

Evidence:
Provider failures, pending payments, and amount/currency mismatches are normalized into HTTP 200 responses.

Impact:
This is not a direct exploit by itself, but it makes monitoring, WAF rules, client error handling, and fraud triage harder. Integrity failures deserve clear non-2xx telemetry even if the API envelope carries stable codes.

Fix:
Keep stable response codes in the body if the frontend requires them, but emit separate high-severity metrics and consider `409`/`422` for confirmed integrity mismatches.

### ZD-08: Production readiness checker appears to inspect the wrong JWT setting name

Severity: **Medium**

Location:
- `backend/config/settings/base.py:262-266`
- `backend/apps/common/management/commands/check_production_state.py:48-51`

Evidence:
Runtime JWT signing key lives at `SIMPLE_JWT["SIGNING_KEY"]`; the checker reads `settings.JWT_SIGNING_KEY`.

Impact:
The deploy-time command may report a false failure or fail to validate the actual runtime signing key. Production gate reliability matters because this project relies on management checks as release controls.

Fix:
Check `settings.SIMPLE_JWT.get("SIGNING_KEY")`.

## Positive Findings

- Production settings set `DEBUG = False`, secure cookies, SSL redirect, HSTS, nosniff, and strict default host.
- JWT access token is read from an HTTP-only cookie, with bearer token support for API testing.
- Cookie-authenticated state-changing requests enforce `X-CSRF-Token` except intentionally public/auth/webhook paths.
- Application, document, and payment resources use UUIDs and mostly enforce owner/admin checks.
- Document upload validates file size, sanitizes filename, validates magic bytes, stores privately, and serves signed URLs.
- Lenco webhook is unauthenticated but validates HMAC signature and optionally source IP.
- Payment hardening is forced on in production.
- Frontend CSP blocks inline scripts and frames are denied.
- Raw HTML rendering is centralized through DOMPurify in `SafeHtml`.

## Zero-Day Assessment

No confirmed “drop everything” zero-day was found in this pass. The closest practical zero-day candidates are:

1. Wildcard credentialed CORS plus shared parent-domain cookies.
2. Fail-open rate limiting under Redis outage.
3. Plaintext nested PII draft fallback.

These are production-realistic attack paths, not theoretical style issues. I would fix them before declaring the admissions system fully production-ready.

## Recommended Release Decision

Current decision: **Limited production / controlled launch**, not full public launch.

Conditions before full public launch:

1. Restrict credentialed CORS to exact production frontend origins.
2. Change high-risk rate limits to fail closed or enforce equivalent edge limits.
3. Fix recursive PII stripping or block local draft persistence when secure storage is unavailable.
4. Validate application draft ownership on save.
5. Lock `application_slip` uploads to system/admin paths.
6. Run and archive backend pytest, admissions vitest, Playwright smoke, `manage.py check --deploy`, and `check_production_state --strict` output with production-like env.
