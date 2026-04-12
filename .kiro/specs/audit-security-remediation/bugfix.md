# Bugfix Requirements Document

## Introduction

This spec remediates the P0 and P1 security findings from the April 2026 full system audit (`docs/full-system-audit-2026-04.md`) and API security audit (`docs/security-api-audit-2026-04.md`). Five bugs are addressed: hardcoded secrets in MCP config files (P0), CSP `unsafe-inline` for scripts (P1), missing `Cache-Control` headers on authenticated API responses (P1), jobs-ops scaffold endpoints using `AllowAny` (P1), and publicly accessible Django admin and OpenAPI docs (P1).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `.kiro/mcp.json` is committed to git THEN the system exposes a Context7 API key (`ctx7sk-...`) in plaintext in the repository history

1.2 WHEN `.kiro/settings/mcp.json` is committed to git THEN the system exposes Supabase service role key, Supabase access token, Supabase anon key, and Context7 API key in plaintext in the repository history

1.3 WHEN `.kiro/settings/mcp.json` is not listed in `.gitignore` THEN the system allows future commits to continue tracking secrets in this file

1.4 WHEN `apps/admissions/vercel.json` defines the Content-Security-Policy header THEN the system includes `script-src 'self' 'unsafe-inline' ...` which allows arbitrary inline script execution if HTML injection is achieved

1.5 WHEN an authenticated API endpoint returns a response THEN the system does not include `Cache-Control: no-store, private` headers, allowing browsers to cache sensitive data in back/forward cache

1.6 WHEN the `SourceAnalyticsView` endpoint is requested THEN the system serves the response with `permission_classes = [AllowAny]` and `authentication_classes = []`, requiring no authentication

1.7 WHEN the `OutreachAnalyticsView` endpoint is requested THEN the system serves the response with `permission_classes = [AllowAny]` and `authentication_classes = []`, requiring no authentication

1.8 WHEN the `DailyDigestReportView` endpoint is requested THEN the system serves the response with `permission_classes = [AllowAny]` and `authentication_classes = []`, requiring no authentication

1.9 WHEN the `EmailMessageListView` endpoint is requested THEN the system serves the response with `permission_classes = [AllowAny]` and `authentication_classes = []`, requiring no authentication

1.10 WHEN the `EmailThreadListView` endpoint is requested THEN the system serves the response with `permission_classes = [AllowAny]` and `authentication_classes = []`, requiring no authentication

1.11 WHEN the `ResumeListView` endpoint is requested THEN the system serves the response with `permission_classes = [AllowAny]` and `authentication_classes = []`, requiring no authentication

1.12 WHEN the `DocumentVersionListView` endpoint is requested THEN the system serves the response with `permission_classes = [AllowAny]` and `authentication_classes = []`, requiring no authentication

1.13 WHEN a user navigates to `/admin/` THEN the system displays the Django admin login page publicly without any access restriction

1.14 WHEN a user navigates to `/api/v1/schema/`, `/api/v1/docs/`, or `/api/v1/redoc/` THEN the system serves OpenAPI schema and documentation publicly without authentication

### Expected Behavior (Correct)

2.1 WHEN `.kiro/mcp.json` is committed to git THEN the system SHALL contain only empty string or `<YOUR_KEY_HERE>` placeholder values for all API keys and secrets

2.2 WHEN `.kiro/settings/mcp.json` is committed to git THEN the system SHALL contain only empty string or `<YOUR_KEY_HERE>` placeholder values for all Supabase keys, access tokens, and Context7 API keys

2.3 WHEN `.gitignore` is evaluated THEN the system SHALL include `.kiro/settings/mcp.json` so that future changes to this file are not tracked

2.4 WHEN `apps/admissions/vercel.json` defines the Content-Security-Policy header THEN the system SHALL include a `TODO` comment documenting the `unsafe-inline` risk and the requirement for nonce-based CSP, while keeping the current `unsafe-inline` directive until server-side nonce generation is feasible

2.5 WHEN an authenticated API endpoint returns a response THEN the system SHALL include `Cache-Control: no-store, private` in the response headers to prevent browser caching of sensitive data

2.6 WHEN the `SourceAnalyticsView` endpoint is requested THEN the system SHALL require `IsAuthenticated` permission

2.7 WHEN the `OutreachAnalyticsView` endpoint is requested THEN the system SHALL require `IsAuthenticated` permission

2.8 WHEN the `DailyDigestReportView` endpoint is requested THEN the system SHALL require `IsAuthenticated` permission

2.9 WHEN the `EmailMessageListView` endpoint is requested THEN the system SHALL require `IsAuthenticated` permission

2.10 WHEN the `EmailThreadListView` endpoint is requested THEN the system SHALL require `IsAuthenticated` permission

2.11 WHEN the `ResumeListView` endpoint is requested THEN the system SHALL require `IsAuthenticated` permission

2.12 WHEN the `DocumentVersionListView` endpoint is requested THEN the system SHALL require `IsAuthenticated` permission

2.13 WHEN a user navigates to the Django admin THEN the system SHALL serve it at a non-standard URL path (not `/admin/`) to reduce exposure to automated scanners

2.14 WHEN a user requests `/api/v1/schema/`, `/api/v1/docs/`, or `/api/v1/redoc/` in production THEN the system SHALL require `IsAuthenticated` permission before serving the OpenAPI schema or documentation

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `.kiro/mcp.json` is read by MCP tooling THEN the system SHALL CONTINUE TO contain valid server configuration structure (command, args, env keys) so that users can populate their own keys

3.2 WHEN `.kiro/settings/mcp.json` is read by MCP tooling THEN the system SHALL CONTINUE TO contain valid server configuration structure with all expected env key names present

3.3 WHEN unauthenticated endpoints (`LoginView`, `RegisterView`, `PasswordResetRequestView`, `PasswordResetConfirmView`, `RefreshView`, health checks, error reporter, webhook, `ApplicationTrackView`, catalog public reads, `PlatformMetaView`) are requested THEN the system SHALL CONTINUE TO allow access without authentication

3.4 WHEN the `FunnelAnalyticsView` endpoint is requested by an authenticated user THEN the system SHALL CONTINUE TO return admissions funnel analytics data (this view was already fixed to `IsAuthenticated`)

3.5 WHEN authenticated write endpoints in jobs-ops scaffold views (`ResumeVariantCreateView`, `CoverLetterGenerateView`, `QuestionBankAnswerView`, `ZohoConnectView`) are requested THEN the system SHALL CONTINUE TO require `IsAuthenticated` permission

3.6 WHEN the CSP header is evaluated by browsers THEN the system SHALL CONTINUE TO allow scripts from `'self'`, `https://va.vercel-scripts.com`, `https://pay.lenco.co`, and `https://pay.sandbox.lenco.co`

3.7 WHEN unauthenticated API endpoints return responses THEN the system SHALL CONTINUE TO NOT add `Cache-Control: no-store, private` headers (cache control is only for authenticated responses)

3.8 WHEN the Django admin is accessed at its new URL path by a session-authenticated admin user THEN the system SHALL CONTINUE TO function identically to the current `/admin/` behavior

3.9 WHEN health check endpoints (`/health/live/`, `/health/ready/`) are requested THEN the system SHALL CONTINUE TO allow access without authentication

3.10 WHEN the Lenco webhook endpoint (`/api/v1/payments/webhook/lenco/`) is requested THEN the system SHALL CONTINUE TO allow access without authentication (HMAC-validated separately)
