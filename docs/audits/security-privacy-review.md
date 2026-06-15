# Security and Privacy Review (R10)

**Spec:** `.kiro/specs/beanola-production-readiness/` — Task 21 (Phase 10, Component 10)
**Requirement:** R10 — *"the platform hardened before launch … no high-severity open findings."*

This document is the shared findings register for the R10 security/privacy review.
It is authored across three tasks that contribute distinct sections:

- **21.1** — Auth, authorization, input validation, secrets/env (R10.1–R10.4).
- **21.2** — Payment security, privacy, headers, abuse controls (R10.5–R10.8). *(this section)*
- **21.3** — Findings register roll-up + launch decision (R10.9).

No production DB changes were made during this review. The codebase is the source
of truth; every claim below was verified by reading the repo and running the
existing test suites.

---

## Task 21.2 — Payment security, privacy, headers, abuse controls (R10.5–R10.8)

**Reviewer:** Kiro (automated read-only audit)
**Verification date:** 2026-06
**Method:** repo read + targeted test runs (see "Test evidence" below). Cross-references
`docs/audits/payments-final.md` (payment end-to-end audit) and
`docs/audits/rate-limit-verification.md` (R4.8, task 8.4).

### R10.5 — Payment security controls

| Control | Status | Evidence |
|---|---|---|
| **Webhook signature validation (HMAC-SHA512)** | ✅ Pass | `WebhookProcessor.validate_signature()` (`backend/apps/documents/webhook_processor.py:132`) implements the Lenco algorithm exactly: `hash_key = SHA-256(LENCO_API_SECRET_KEY)`, `expected = HMAC-SHA512(raw_body, hash_key)`, constant-time compare via `hmac.compare_digest`. Returns `False` (and logs a warning) when the secret is unconfigured — fails closed. Invalid signatures return HTTP 200 by design to avoid Lenco retry storms, but never mutate payment state. |
| **Idempotency keys** | ✅ Pass (1 low-sev concern) | `@idempotent` applied to `PaymentInitiateView.post`, `DeferPaymentView.post`, `MobileMoneyInitiateView.post`. Webhook dedup uses the canonical `WebhookEventIdentity` (`provider_event_id`, `event_type`, `reference`, `payload_hash` over `canonical_json()`); `is_duplicate()` blocks reprocessing. **Concern (LOW):** `SuperAdminPaymentCorrectionView.post` lacks `@idempotent` — a double-submit could emit duplicate audit rows (the status transition itself is idempotent via the `from_status == target_status` guard). Tracked in `payments-final.md` action items. |
| **Reconciliation** | ✅ Pass | `poll_pending_payments_task` (`backend/apps/documents/tasks.py`) polls Lenco for pending payments and expires those >24h. The hardened path (`PAYMENT_HARDENING_FORWARD_ONLY=True`) routes through `service.expire_stale()` → `_transition()`. Out-of-order webhooks handled: late `collection.failed` after `successful` is ignored (`payment.late_failed_webhook_ignored` audit); `collection.settled` updates metadata only. |
| **Receipt authorization** | ✅ Pass | `PaymentReceiptView.get()` (`backend/apps/documents/payment_query_views.py:340`) requires `IsAuthenticated`, enforces ownership (`payment.user_id == user.id` for non-staff), applies `AccessScopeService().filter_payments()` for admins, and masks out-of-scope reads as `404 NOT_FOUND` (cannot infer existence). Receipts only issue for `RECEIPT_ELIGIBLE_STATUSES`; `force_approved` carries an `"override": true` label. |
| **Lenco mobile-money-first UX + deferral preserved (R16.6)** | ✅ Pass | `PaymentForm.tsx:125` defaults `paymentMethod` to `'mobile-money'` (card is secondary). `PaymentStep.tsx` retains the full defer flow (`handleDefer`, `deferred`/`deferConfirm` state, `deferred` as a distinct polled status). No reintroduction of the retired pre-Lenco UX. |

**R10.5 verdict: PASS.** One LOW-severity concern (correction-endpoint idempotency) already
tracked as an action item in `payments-final.md`; not launch-blocking.

### R10.6 — Privacy controls

| Control | Status | Evidence |
|---|---|---|
| **Minimize public-tracker data** | ✅ Pass | `ApplicationTrackingSerializer` (`backend/apps/applications/serializers.py:658`) exposes only `application_number`, `public_tracking_code`, `status`, `program`, `intake`, `institution`, `created_at`, `submitted_at`. No applicant name, contact, NRC, payment, or document data. `ApplicationTrackView` is `public_tracking_minimized` and validates code format before lookup. |
| **Gate export access** | ✅ Pass | Admin exports run through scoped admin views; export surfaces are covered by the scope inventory (`docs/audits/scope-endpoint-inventory.md`) and the R5 scope-masking property test. No anonymous export path exists. |
| **Document audit retention** | ✅ Pass | `PaymentAuditService` (`payment_audit_service.py`) promotes `SECURITY_RETENTION_ACTION_PREFIXES` (`payment.force_approved`, `payment.super_admin_corrected`, …) to `security` retention (365 days); everything else defaults to `standard` (90 days). Cleanup is `cleanup_audit_logs_task` (daily 03:00 UTC, 90/365-day split). |
| **Keep PII out of logs** | ✅ Pass | `PaymentAuditService._redact_pii()` recursively redacts phone/MSISDN/mobile (→ `phone_hash` + `phone_last4`), NRC/passport/PAN/CVV/card (→ sha256[:16]), and strips `document_body`/`file_content`/`raw_payload`. `_sanitize_lenco_response()` redacts PII keys before persisting `metadata.lenco_response`. Payment metadata persists only `phone_hash`/`phone_last4` — never raw phone (per `tech.md`). |

**R10.6 verdict: PASS.**

### R10.7 — Security response headers

| Header | Frontend (`apps/admissions/vercel.json`) | Backend (`SecurityHeadersMiddleware`) | Status |
|---|---|---|---|
| **Content-Security-Policy** | ✅ Full policy with Lenco/GlitchTip/R2 allowances + `report-uri` to GlitchTip (`/api/22431/security/`) | ✅ Set (no `report-uri`; backend serves API, not HTML) | ✅ Pass |
| **Strict-Transport-Security (HSTS)** | ✅ `max-age=31536000; includeSubDomains` | ✅ `max-age=31536000; includeSubDomains; preload`; Django `SECURE_HSTS_*` enabled in `base.py`/`prod.py`/`staging.py` | ✅ Pass |
| **X-Frame-Options** | ✅ `DENY` | ✅ `DENY` (+ `X_FRAME_OPTIONS = "DENY"`, CSP `frame-ancestors 'none'`) | ✅ Pass |
| **Referrer-Policy** | ✅ `strict-origin-when-cross-origin` | ✅ `strict-origin-when-cross-origin` (+ `SECURE_REFERRER_POLICY`) | ✅ Pass |
| **X-Content-Type-Options** | ✅ `nosniff` | ✅ `nosniff` | ✅ Pass (defense-in-depth) |
| **Permissions-Policy** | ✅ camera/mic/geo/payment disabled | ✅ same | ✅ Pass |

`SecurityHeadersMiddleware` (`backend/apps/common/middleware.py:35`) is registered in
`MIDDLEWARE` ahead of Django's `SecurityMiddleware`, so every backend response carries the
headers. Authenticated `/api/v1/` responses additionally get `Cache-Control: no-store …`.

**R10.7 verdict: PASS.** CSP includes the GlitchTip `report-uri` as required.

### R10.8 — Abuse controls

| Control | Status | Evidence |
|---|---|---|
| **Rate limits (sensitive surfaces)** | ✅ Pass | Two layers: coarse per-IP `RateLimitMiddleware` (`SCOPE_LIMITS`, fails closed, in-memory fallback) + per-user DRF `PaymentUserScopedRateThrottle`/`AIUserScopedRateThrottle`. Full surface matrix verified in `docs/audits/rate-limit-verification.md` (R4.8) — no gaps. |
| **Password-reset throttling** | ✅ Pass | `SCOPE_LIMITS["/api/v1/auth/password-reset/"]` = `5/5m` (covers request + confirm). Login `10/5m`, register `5/5m`. |
| **Public-tracker throttling** | ✅ Pass | `SCOPE_LIMITS["/api/v1/applications/track/"]` = `20/10m`. |
| **Upload size limits** | ✅ Pass | `DATA_UPLOAD_MAX_MEMORY_SIZE = 5MB`, `FILE_UPLOAD_MAX_MEMORY_SIZE = 10MB` (`backend/config/settings/base.py:317`). Prevents memory-exhaustion. |
| **Webhook ingress** | ✅ Pass (by design) | Exempt from DRF throttle (HMAC-gated; retry bursts allowed) but never unauthenticated mutation — signature validated first. |

**R10.8 verdict: PASS.**

### Test evidence (21.2)

All run with `DJANGO_SETTINGS_MODULE=config.settings.test`, venv Python, `--hypothesis-seed=0`:

| Suite | Result |
|---|---|
| `test_webhook_processor_signature.py`, `test_webhook_processor_dedup.py` | ✅ pass |
| `test_payment_rate_limiting.py`, `test_payment_rate_limiting_webhook_exempt.py` | ✅ pass |
| `test_payment_audit_service.py` | ✅ pass |
| (above batch) | **41 passed** |
| `test_security_headers.py`, `test_auth_csrf_headers.py`, `test_payment_throttle_classes.py`, `test_rate_limiting.py`, `test_webhook_signature.py` | **35 passed** |
| `test_payment_webhook_out_of_order.py`, `test_payment_webhook_returns_200.py`, `test_payment_reconciliation_task.py`, `test_payment_webhook_properties.py` | **20 passed, 1 xpassed** |

### Findings (21.2)

| ID | Severity | Area | Finding | Owner | Launch decision |
|---|---|---|---|---|---|
| SEC-21.2-01 | LOW | Payment idempotency | `SuperAdminPaymentCorrectionView.post` lacks `@idempotent`; double-submit can emit duplicate audit rows (state transition itself is idempotent). | Payments | Non-blocking — already an action item in `payments-final.md`. |
| SEC-21.2-02 | LOW | Payment dev-bypass | `DeferPaymentView`, `PaymentReceiptView`, `PaymentListView` lack `@require_not_dev_bypass_in_production` (defer is non-terminal; the other two are read-only). | Payments | Non-blocking — tracked in `payments-final.md`. |

**No high-severity findings for R10.5–R10.8.** Both items are LOW and pre-tracked; they do
not block launch. Final roll-up and launch decision are recorded by task 21.3 below.

---

## Task 21.1 — Auth, authorization, input validation, secrets/env (R10.1–R10.4)

**Reviewer:** Kiro (automated read-only audit)
**Verification date:** 2026-06
**Method:** repo read + targeted test runs (see "Test evidence" below). No production DB
changes were made. Secrets are referenced by key name only — no secret values were read or
echoed. Cross-references `docs/audits/scope-endpoint-inventory.md` (R5 scope inventory) and
`docs/audits/rate-limit-verification.md` (R4.8).

### R10.1 — Auth stack hardening

| Control | Status | Evidence |
|---|---|---|
| **HTTP-only cookie flags** | ✅ Pass | `_set_auth_cookies()` (`backend/apps/accounts/auth_helpers.py:39`) sets `access_token` + `refresh_token` with `httponly=AUTH_COOKIE_HTTPONLY` (default `True`), `secure=AUTH_COOKIE_SECURE`, `samesite`, and `domain`. Prod (`config/settings/prod.py`) pins `AUTH_COOKIE_HTTPONLY=True`, `AUTH_COOKIE_SECURE=True`, `AUTH_COOKIE_SAMESITE="None"` for the `apply.beanola.com → api.beanola.com` cross-subdomain flow; `base.py` defaults are HttpOnly/Secure/Lax. Dev/local relax `Secure` only (cookies are dropped over http on localhost). |
| **30-minute access token** | ✅ Pass | `SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"] = timedelta(minutes=30)` (`config/settings/base.py:275`). The cookie `max_age` is derived from the same setting (`auth_helpers.py:51`). *(Note: the docstring in `tokens.py:60` still says "15-minute" — a stale comment only; the runtime value is the 30-min setting. Logged as SEC-21.1-01 LOW, doc-only.)* |
| **7-day refresh + JTI blacklisting** | ✅ Pass | `REFRESH_TOKEN_LIFETIME = timedelta(days=7)` (`base.py:276`). `generate_refresh_token()` embeds a `jti`; `verify_token(..., token_type="refresh")` rejects blacklisted JTIs via `is_jti_blacklisted()` (Redis `jti:` keys with refresh-TTL). Blacklist **fails closed** on a second Redis read failure (`tokens.py:is_jti_blacklisted`). Defense-in-depth: a refresh token whose `DeviceSession.refresh_jti` is deactivated is also rejected, as are tokens issued before `password_changed_at`. |
| **Refresh rotation** | ✅ Pass | `rotate_tokens()` (`tokens.py:165`) verifies the old refresh token, atomically claims the JTI with a 30s Redis lock (`token_rotation:{jti}` → blocks concurrent reuse with `"Token already consumed"`), blacklists the old JTI **before** issuing the new pair, then mints a fresh access+refresh. `RefreshView` (`auth_views.py:478`) updates the `DeviceSession` row with the new refresh hash + new `refresh_jti` and reissues both cookies + a fresh `X-CSRF-Token`. Distinct error codes preserved: `NO_REFRESH_TOKEN` (missing cookie) vs `TOKEN_EXPIRED` (expired/revoked/invalid). |
| **Logout / session cleanup** | ✅ Pass | `LogoutView` (`auth_views.py:306`, `IsAuthenticated`) deactivates the matching `DeviceSession`, blacklists the refresh JTI, deletes all `CSRFToken` rows for the user, then clears both cookies via `_clear_auth_cookies()`. Session revoke / revoke-all (`session_views.py`) blacklist stored `refresh_jti`s. Stale sessions are swept by `cleanup_stale_sessions_task` (daily 02:30 UTC) and CSRF tokens by `cleanup_audit_logs_task`. |
| **CSRF on state-changing requests** | ✅ Pass | CSRF is enforced at the **authentication layer**, not middleware: `JWTCookieAuthentication._enforce_csrf()` (`authentication.py:163`) runs only for cookie-sourced auth on `POST/PUT/PATCH/DELETE`, validates `X-CSRF-Token` against `validate_csrf_token_for_user()` (DB-backed, 60s Redis cache, **fail-open on cache outage / fail with `CSRF_INVALID` on miss**). Bearer-token (non-browser) calls are exempt by design. The exempt-pattern list (`CSRF_EXEMPT_PATTERNS`) is scoped to unauthenticated/bootstrap endpoints (login, register, password-reset, logout, refresh, error report, Lenco webhook) — every authenticated state-changing endpoint is covered. |

**R10.1 verdict: PASS.** One LOW doc-only finding (stale "15-minute" docstring in `tokens.py`).

### R10.2 — Authorization / RBAC

| Control | Status | Evidence |
|---|---|---|
| **RBAC_Hierarchy** | ✅ Pass | `ROLE_HIERARCHY = {super_admin:4, admin:3, reviewer:2, student:1}` (`accounts/permissions.py:19`) is the single source of truth. Permission classes `IsStudent/IsReviewer/IsAdmin/IsSuperAdmin` use `_has_role_level()`; per-user `UserPermissionOverride` is consulted **only** when the role check fails. |
| **Student-owner checks** | ✅ Pass | `IsOwnerOrAdmin.has_object_permission()` compares `obj.user_id`/`obj.user.id` to `request.user.id`; admin+ bypass for staff. Object-level checks key off the resource owner, not display strings. |
| **School_Staff scope via AccessScopeService** | ✅ Pass | `AccessScopeService` (`catalog/services.py:505`) exposes `filter_applications/filter_payments/filter_documents`; `filters_for_user()` returns `all_access=True` only for super-admin, otherwise constrains to the institution/offering/application IDs from memberships + (unexpired) `access_grants`. The scope-drift and unscoped-endpoint guards assert no non-super-admin path loads applications/payments/documents outside this service. |
| **Super-admin-only endpoints** | ✅ Pass | `IsSuperAdmin` gates reviewer assignment, fee waivers, payment correction (`/payments/{id}/correct/`), risk-flags (`/payments/risk-flags/`), tenant onboarding, and document-profile/asset writes. `is_super_admin()` is the single imperative-check helper. |
| **Object-level permissions on canonical IDs (R5.8)** | ✅ Pass | Object-level authorization resolves through canonical IDs; `Legacy_String_Fields` (`applications.institution/program/intake`) are immutable display snapshots and are never used for authz (asserted by `test_scope_drift_guard.py`). |

**R10.2 verdict: PASS.**

### R10.3 — Input validation at the API boundary

| Surface | Status | Evidence |
|---|---|---|
| **Template tokens (allowlist + reject)** | ✅ Pass | `validate_template_payload()` (`catalog/services.py`) rejects disallowed/injected tokens at configuration time with the stable `TEMPLATE_TOKEN_REJECTED` code and blocks smuggled merge documents via `_MERGE_DOCUMENT_SIGNATURES` (DOCX/ZIP/OLE/PDF/RTF/WordprocessingML magic-byte/markup signatures). Covered by `test_template_safety.py`. |
| **HTML-escaped token values** | ✅ Pass | Render-time token substitution HTML-escapes every value: PDF renderers route profile/template sections through `_common.escape(...)`; the email component system escapes all user-supplied strings (`html.escape`) in `components.py`, `shell.py`, and every `messages/*.py`. Covered by `test_profile_section_token_substitution.py` and the P13 render-time allowlist tests. |
| **File uploads (MIME + magic bytes)** | ✅ Pass | `validate_file_magic_bytes()` (`documents/validators.py:51`) enforces the declared MIME ∈ `ALLOWED_MIME_TYPES` AND a matching magic-byte signature, rejecting empty/mismatched files (`INVALID_FILE`). Tenant assets use `validate_asset_magic_bytes()` (PNG/JPEG/WebP/SVG, with SVG active-content scanning) returning the stable `ASSET_INVALID` code. Upload caps: `DATA_UPLOAD_MAX_MEMORY_SIZE=5MB`, `FILE_UPLOAD_MAX_MEMORY_SIZE=10MB`, asset 2 MiB. |
| **Query params** | ✅ Pass | Examples: `ApplicationTrackView` validates the tracking code format (`APP-YYYYMMDD-XXXXXXXX` / `TRK-XXXXXXXXXXXX`) before lookup, returning `INVALID_FORMAT` (400) for bad input; `RiskFlagsListView` validates `type` against `ALLOWED_RISK_TYPES` enum, returning `VALIDATION_ERROR` with the allowed set. |
| **Bulk actions** | ✅ Pass | `ApplicationBulkStatusView` (`admin_bulk_views.py`) enforces `MAX_BATCH_SIZE` (25), all-or-nothing validation, and an `INVALID_CONFIRMATION_TOKEN` SHA-256 confirmation guard over sorted IDs + target status. |
| **Descriptive rejection (no raw Django/DRF error)** | ✅ Pass | Validation failures return the `{"success": false, "error", "code"}` envelope with stable codes (`VALIDATION_ERROR`, `INVALID_FILE`, `ASSET_INVALID`, `TEMPLATE_TOKEN_REJECTED`, `INVALID_FORMAT`, `INVALID_CONFIRMATION_TOKEN`) and field-level `details` where applicable (e.g. `RegisterView`). |

**R10.3 verdict: PASS.**

### R10.4 — Secrets / env

| Control | Status | Evidence |
|---|---|---|
| **No secrets in the repo** | ✅ Pass | `git ls-files | grep '\.env'` returns only template files: `.env.example`, `.env.scripts.example`, `apps/admissions/.env.example`, `backend/.env.example`, `deploy/.env.prod.example`. No real env files are tracked. Every secret-bearing key in the example files holds a placeholder (`replace-with-…`, `CHANGE_ME`, `re_xxxx…`, `[host]`, empty) — referenced by **key name only** here. Enforced by `test_tracked_env_files.py`. |
| **`.gitignore` coverage** | ✅ Pass | `.gitignore` ignores `.env`, `.env.*`, `.env.local`, `.env.vercel.*`, `.env.frontend`, `r2.env`, `*.local`, with `!`-negation only for `.env.example` and `.env.scripts.example`. Real local env files may hold real credentials safely (per steering). |
| **Env examples current** | ✅ Pass | `backend/.env.example` enumerates the live key surface (`SECRET_KEY`, `JWT_SIGNING_KEY`, `DATABASE_URL`, `S3_ACCESS_KEY`/`S3_SECRET_KEY`, `RESEND_API_KEY`, `GLITCHTIP_DSN`, `AUDIT_LOG_ENCRYPTION_KEY`, `AI_GATEWAY_API_KEY`, `LENCO_API_SECRET_KEY`/`LENCO_PUBLIC_KEY`, `ZOHO_SMTP_PASSWORD`, …); `deploy/.env.prod.example` is the production template (all `CHANGE_ME`). Tracked placeholder files `.env.development`/`.env.production` were removed in the April 2026 audit. |
| **Prod env reviewed** | ✅ Pass (config-level) | `JWT_SIGNING_KEY` is required-non-empty outside dev/test (`base.py:285` raises `ImproperlyConfigured`); `SECRET_KEY` warns when unset (dev/test only). Production cookie/HSTS/SSL settings are pinned in `prod.py`. Actual production secret **values** live only in the gitignored prod env on the EC2 box and are out of scope for a repo-side review (rotation runbook: `docs/runbooks/secrets-rotation.md`). |

**R10.4 verdict: PASS.**

### Test evidence (21.1)

All run with `DJANGO_SETTINGS_MODULE=config.settings.test`, venv Python, `--hypothesis-seed=0`:

| Suite | Result |
|---|---|
| `test_auth_csrf_headers.py`, `test_drf_csrf_authentication.py`, `test_csrf_token_cache.py`, `test_jti_blacklist.py`, `test_session_hardening.py`, `test_device_session_lifecycle.py`, `test_tracked_env_files.py`, `test_env_validator.py` | **51 passed** |
| `test_scope_drift_guard.py`, `test_unscoped_endpoint_guard.py`, `test_scoped_access_matrix.py`, `test_view_auth_classification.py`, `test_template_safety.py`, `test_profile_section_token_substitution.py`, `test_submission_revalidation.py` | **107 passed** |
| `test_production_scope_masking_properties.py`, `test_access_scope_properties.py`, `test_auth_properties.py`, `test_jti_blacklist_properties.py`, `test_production_readiness_csrf.py`, `test_production_readiness_jti.py`, `test_token_refresh_properties.py`, `test_student_error_envelope_properties.py` | **65 passed, 5 skipped** |

### Findings (21.1)

| ID | Severity | Area | Finding | Owner | Launch decision |
|---|---|---|---|---|---|
| SEC-21.1-01 | LOW | Auth (doc-only) | `tokens.py:generate_access_token` docstring still says "15-minute access token"; the runtime value is the 30-min `SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]`. Comment drift only — no behavioural impact. | Accounts | Non-blocking — doc fix; tidy in a follow-up. |

**No high-severity findings for R10.1–R10.4.** The single item is LOW and doc-only. Final
roll-up and launch decision are recorded by task 21.3.

---

## Task 21.3 — Findings register roll-up + launch decision (R10.9)

**Reviewer:** Kiro (automated read-only audit)
**Verification date:** 2026-06
**Method:** roll-up of the findings recorded by tasks 21.1 (R10.1–R10.4) and 21.2
(R10.5–R10.8) above, plus a cross-check against the related audit docs
(`docs/audits/payments-final.md`, `docs/audits/rate-limit-verification.md`,
`docs/audits/scope-endpoint-inventory.md`). No production DB changes were made.

### R10.9 — Consolidated findings register

Every finding raised across the R10 review, aggregated with its severity, the area
it touches, the accountable owner, and an explicit launch decision. The register is
the single source of truth for the launch gate on R10.

| ID | Severity | Area | Owner | Finding (summary) | Status | Launch decision |
|---|---|---|---|---|---|---|
| SEC-21.1-01 | LOW | Auth (doc-only) | Accounts | `tokens.py:generate_access_token` docstring still says "15-minute access token"; runtime value is the 30-min `SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]`. Comment drift only — no behavioural impact. | Open (tracked) | **Cleared for launch.** Non-blocking doc fix; tidy in a follow-up. |
| SEC-21.2-01 | LOW | Payment idempotency | Payments | `SuperAdminPaymentCorrectionView.post` lacks `@idempotent`; a double-submit can emit duplicate audit rows (the status transition itself is idempotent via the `from_status == target_status` guard). | Open (tracked) | **Cleared for launch.** Non-blocking — already an action item in `payments-final.md`. |
| SEC-21.2-02 | LOW | Payment dev-bypass | Payments | `DeferPaymentView`, `PaymentReceiptView`, `PaymentListView` lack `@require_not_dev_bypass_in_production` (defer is non-terminal; the other two are read-only). | Open (tracked) | **Cleared for launch.** Non-blocking — tracked in `payments-final.md`. |

### Finding count by severity

| Severity | Open | Resolved | Total |
|---|---|---|---|
| **High** | **0** | 0 | **0** |
| **Medium** | **0** | 0 | **0** |
| **Low** | 3 | 0 | 3 |
| **Total** | 3 | 0 | 3 |

### R10.9 compliance check

- **No high-severity open finding.** ✅ Zero high-severity findings exist across
  R10.1–R10.8 (auth, authorization, input validation, secrets/env, payment security,
  privacy, security headers, abuse controls). The acceptance criterion "THE security
  review SHALL have no high-severity open finding" is satisfied.
- **Every medium finding owned + has a launch decision.** ✅ Vacuously satisfied —
  there are zero medium-severity findings. (The three open findings are all LOW; each
  still carries an explicit owner and a recorded launch decision per the table above,
  exceeding the R10.9 bar.)
- **Owners assigned.** ✅ Accounts (1), Payments (2).
- **Launch decisions recorded.** ✅ All three findings are explicitly **Cleared for
  launch** (non-blocking); each references its tracking location for the follow-up fix.

### Launch decision (R10)

**GO — cleared for launch on the security/privacy gate.** The R10 review surfaced
**no high-severity and no medium-severity findings**. The three open items are all
LOW-severity, individually owned, pre-tracked in `payments-final.md` (payments) or
slated as a doc-only tidy (accounts), and none alters runtime security behaviour.
R10.9 is met: zero high-severity open findings, and every finding (well beyond just
mediums) carries an explicit owner and a recorded launch decision.

The three LOW items are post-launch follow-ups, not launch blockers:
1. **SEC-21.1-01** — correct the stale "15-minute" docstring in `tokens.py` (Accounts).
2. **SEC-21.2-01** — add `@idempotent` to `SuperAdminPaymentCorrectionView.post` (Payments).
3. **SEC-21.2-02** — add `@require_not_dev_bypass_in_production` to `DeferPaymentView` /
   `PaymentReceiptView` / `PaymentListView` (Payments).

### Test evidence (roll-up)

No new tests are authored by 21.3 — this task is a documentation roll-up of the
findings produced by 21.1 and 21.2. The underlying control verification is backed by
the suites already recorded in the **Test evidence (21.1)** (51 + 107 + 65 passed,
5 skipped) and **Test evidence (21.2)** (41 + 35 + 20 passed, 1 xpassed) sections
above, all run with `DJANGO_SETTINGS_MODULE=config.settings.test` and
`--hypothesis-seed=0`.
