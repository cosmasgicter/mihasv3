# API Design Review & Security Audit — April 2026 (Rev 2)

Re-audited April 12, 2026. Previous fixes verified, new findings added.

## Executive Summary

The MIHAS platform has strong security fundamentals: cookie-based JWT auth with HTTP-only flags, custom CSRF enforcement, per-scope rate limiting, HMAC-SHA512 webhook validation, forward-only payment state machines, and comprehensive audit logging.

Since the initial audit, 4 findings have been fixed (H3, L4, M3, M4). The re-audit identified 2 new findings (N1, N2) and confirmed 2 high-severity items remain open (H1, H2).

Overall risk level: MEDIUM (improved from initial audit).

---

## API Design Scorecard

| Dimension | Score | Weight | Notes |
|-----------|-------|--------|-------|
| Consistency | 88/100 | 30% | Resource-style URLs, consistent envelope, minor naming inconsistencies |
| Documentation | 82/100 | 20% | drf-spectacular covers most endpoints; some missing descriptions |
| Security | 88/100 | 20% | Improved: body size limits, JWT startup check, generic 500 messages |
| Usability | 80/100 | 15% | Good pagination, filtering, error codes; missing field selection |
| Performance | 78/100 | 15% | Pagination present; some N+1 risks in priority scoring |

Weighted score: 84/100 — Grade: B+ (up from 83)

---

## Fixed Since Initial Audit

| ID | Finding | Status |
|----|---------|--------|
| H3 | HTML injection in EmailSlipView email body | FIXED — `django.utils.html.escape()` applied to all interpolated values |
| L4 | Exception class names leaked in 500 responses | FIXED — now returns generic "An unexpected error occurred" message |
| M3 | No request body size limits | FIXED — `DATA_UPLOAD_MAX_MEMORY_SIZE=5MB`, `FILE_UPLOAD_MAX_MEMORY_SIZE=10MB` |
| M4 | JWT signing key empty string fallback | FIXED — startup check in `CommonConfig.ready()` raises `ImproperlyConfigured` |

## May 2026 Admissions Hardening Follow-Up

The May 9, 2026 admissions hardening pass closed the following audit items in code:

| ID | Finding | Status |
|----|---------|--------|
| ZDR-003 | Payment verification amplification | FIXED — `PaymentVerifyView` uses `PaymentVerifyThrottle` with `payment_verify: 10/min` |
| ZDR-004 | Payment initiation request flooding | FIXED — card and mobile-money initiation use dedicated DRF throttles |
| ZDR-005 | Raw phone PII in payment metadata | FIXED — mobile-money metadata stores `phone_hash` and `phone_last4`, while raw phone is only sent transiently to Lenco |
| ZDR-006 | Arbitrary interview status mutation | FIXED — updates reject statuses outside `scheduled`, `completed`, `cancelled`, `no_show`, `rescheduled` |
| ZDR-007 | Debug auth bypass risk | FIXED — `IsAuthenticatedOrDebug` is removed and settings reject `DEBUG=True` with `api.mihas.edu.zm` |
| ZDR-008 | `.env.vercel.*` production secrets | VERIFIED IN WORKSPACE — no `.env.vercel.*` files are present; rotate any previously exposed secrets per `docs/runbooks/secrets-rotation.md` |
| BUG-001 | Celery Beat idempotency cleanup task name | FIXED — schedule uses `apps.common.tasks.cleanup_idempotency_keys` |
| BUG-002 | Session endpoint envelope drift | FIXED — `SessionView` returns `{success, data}` for authenticated and unauthenticated states |
| BUG-003 | Refresh cookie max-age drift | FIXED — auth cookies derive max-age from `SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]` |
| BUG-004 | Deprecated Django storage settings | FIXED — storage is configured through `STORAGES` |
| BUG-005 | Duplicate preview-summary return | FIXED — the view has one response path for the generated summary |
| BUG-006 | `payment_id=None` serialized as `"None"` | FIXED — already-paid initiation returns JSON `null` |
| BUG-007 | Mark-all-read missing `read_at` | FIXED — bulk read updates set `read_at` with `timezone.now()` |
| BUG-008 | Notification POST bypassed DRF lifecycle | FIXED — notification POST now calls the shared creation helper instead of instantiating another view |
| BUG-009 through BUG-015 | Catalog envelope drift | FIXED — catalog responses return the standard envelope |
| BUG-016 | Unprotected `idempotency_redesign.sql` | VERIFIED IN WORKSPACE — the script is not present under `backend/scripts/` |
| BUG-017 | Admissions application URL encoding gaps | FIXED — application sub-resource calls use `encodeURIComponent(id)` |
| BUG-018 | Admin settings URL encoding gaps | FIXED — settings update/delete encode `id` |

---

## Open Findings

### HIGH Severity

#### H1: MCP Config Contains Hardcoded API Keys and Secrets (STILL OPEN)

- Files: `.kiro/mcp.json`, `.kiro/settings/mcp.json`
- Evidence: Context7 API key (`ctx7sk-...`), Supabase service role key, Supabase access token, and Supabase anon key are hardcoded in committed files. These files are not in `.gitignore`.
- Impact: Anyone with repo access can use these credentials. The Supabase service role key bypasses Row Level Security.
- CVSS: 7.5
- Remediation:
  1. Rotate all exposed keys immediately (Supabase dashboard, Context7 dashboard)
  2. Replace hardcoded values with empty strings or `"<YOUR_KEY_HERE>"` placeholders
  3. Add `.kiro/settings/mcp.json` to `.gitignore` (or use env var references)
  4. Store real keys in a local-only file or secrets manager

#### H2: CSP Allows `unsafe-inline` for Scripts (FIXED)

- File: `apps/admissions/vercel.json`
- Evidence: `script-src 'self' blob: ...`; the preloader script was moved to `apps/admissions/public/preloader.js`.
- Impact: Inline script execution is no longer allowed by production CSP.
- CVSS: 6.1
- Residual: `style-src 'unsafe-inline'` remains for Radix/runtime styles and must be revalidated separately before removal.

### MEDIUM Severity (New)

#### N1: Analytics and Jobs-Ops Scaffold Endpoints Use AllowAny With Real Data

- Files: `backend/apps/analytics/views.py`, `backend/apps/integrations/email_views.py`, `backend/apps/documents/job_views.py`
- Evidence: `FunnelAnalyticsView`, `SourceAnalyticsView`, `OutreachAnalyticsView`, `DailyDigestReportView`, `EmailMessageListView`, `EmailThreadListView`, `ResumeListView`, `DocumentVersionListView` all use `permission_classes = [AllowAny]` with `authentication_classes = []`
- Impact: The `FunnelAnalyticsView` queries real admissions data (funnel metrics, timing, payment stats) and exposes it publicly without authentication. While the other views return scaffold/seed data, the funnel endpoint returns live database queries filtered by date, institution, and program. Anyone can access admissions funnel analytics, payment conversion rates, and timing metrics.
- CVSS: 5.3 (AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)
- Remediation: Change `FunnelAnalyticsView` to `permission_classes = [IsAuthenticated]` (or `IsAdmin`). Review all scaffold views — if they will eventually serve real data, gate them behind auth now. The seed-data-only views (source, outreach, digest, email, resume) are lower risk but should still be authenticated before production use.

#### N2: SQL Injection in Migration Verification Script

- File: `backend/scripts/verify_migration.py` line 127
- Evidence: `cursor.execute(f"SELECT COUNT(*) FROM {table_name}")` — table name is interpolated via f-string without parameterization
- Impact: If `table_name` is ever derived from user input, this is a SQL injection vector. Currently the table names come from a hardcoded `TABLES` list, so the risk is low in practice. But the pattern is dangerous and could be copied.
- CVSS: 3.7 (AV:L/AC:H/PR:H/UI:N/S:U/C:L/I:L/A:L) — low because it's a management script, not a web endpoint
- Remediation: Use `sql.Identifier` from `psycopg2` for safe table name quoting: `from psycopg2 import sql; cursor.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table_name)))`

### MEDIUM Severity (Still Open)

#### M1: Application Track Endpoint Exposes Data Without Authentication (FIXED)

- Tracking codes have ~48 bits of entropy. The endpoint now has a dedicated `20/10m` rate limit scope.
- Remediation completed: `payment_status` and applicant/payment fields are excluded from `ApplicationTrackingSerializer`.

#### M2: Application Export May Leak Sensitive Data (STILL OPEN)

- CSV export includes NRC numbers, phone numbers, emails.
- Remediation: Require super_admin for full exports. Redact sensitive fields for admin role.

#### M5: Priority Scoring Runs Synchronously (STILL OPEN)

- `sort=priority` iterates all applications in page with synchronous scoring.
- Remediation: Pre-compute scores in background task.

#### M6: Webhook Log Flooding (STILL OPEN)

- Invalid-signature webhooks still create log entries.
- Remediation: 30/10m rate limit is reasonable. Consider IP allowlisting.

### LOW Severity (Still Open)

#### L1: Duplicate URL Pattern (STILL OPEN)

- Both `/{id}/` and `/{id}/details/` point to `ApplicationDetailView`.

#### L2: Django Admin Exposed at /admin/ (STILL OPEN)

- Admin login page publicly accessible.

#### L3: OpenAPI Schema Publicly Accessible (STILL OPEN)

- `/api/v1/schema/`, `/api/v1/docs/`, `/api/v1/redoc/` are public.

#### L5: CSRF Token in Module-Level Variable (STILL OPEN)

- Acceptable given current architecture. Mitigated by fixing H2.

---

## API Design Review

### Strengths

1. Consistent `/api/v1/` prefix with URL versioning
2. Resource-style naming throughout (kebab-case: `job-applications`, `email-slip`)
3. Consistent `{ success, data }` response envelope via DRF renderers
4. Page-based pagination with `{ page, pageSize, totalCount, results }`
5. Structured error responses with `{ success, error, code, details }`
6. Comprehensive OpenAPI documentation via drf-spectacular
7. Idempotency key support on submission endpoint
8. Proper HTTP status codes (201 creation, 204 deletion, 409 conflict)
9. Forward-only payment state machine with `SELECT FOR UPDATE` row locking
10. HMAC-SHA512 webhook signature validation with constant-time comparison

### Areas for Improvement

1. No `Cache-Control: no-store` on authenticated API responses (browsers may cache sensitive data in back/forward cache)
2. No `ETag` or `Last-Modified` headers for conditional requests
3. No field selection support (`?fields=id,name,email`)
4. Grades endpoint returns raw arrays instead of envelope in batch path
5. Action endpoints (submit, review, email-slip) use POST on resource URLs — acceptable for non-CRUD but could be more consistent

---

## Remediation Priority Matrix (Updated)

| Finding | Severity | Effort | Priority | Status |
|---------|----------|--------|----------|--------|
| H1: Hardcoded secrets in MCP config | HIGH | Low | Fix immediately | OPEN |
| H2: CSP unsafe-inline | HIGH | Medium | Fix this sprint | FIXED |
| N1: Analytics endpoints public with real data | MEDIUM | Low | Fix this sprint | NEW |
| H4: Error reporter spam | HIGH | Low | Fix this sprint | OPEN |
| N2: SQL injection in migration script | MEDIUM | Low | Fix this sprint | NEW |
| M1: Track endpoint data exposure | MEDIUM | Medium | Next sprint | FIXED |
| L2: Django admin exposure | LOW | Medium | Next sprint | OPEN |
| L3: OpenAPI public access | LOW | Low | Next sprint | OPEN |
| M5: Priority scoring performance | MEDIUM | High | Backlog | OPEN |
| M2: Export data sensitivity | MEDIUM | Medium | Backlog | OPEN |
| M6: Webhook log flooding | MEDIUM | Low | Backlog | OPEN |

---

## Verification Commands

```bash
# Verify H3 fix (HTML escaping in EmailSlipView)
grep -n "html_escape" backend/apps/applications/views.py

# Verify L4 fix (generic 500 message)
grep -n "An unexpected error occurred" backend/apps/common/exceptions.py

# Verify M3 fix (body size limits)
grep -n "DATA_UPLOAD_MAX_MEMORY_SIZE" backend/config/settings/base.py

# Verify M4 fix (JWT startup check)
grep -n "_check_jwt_signing_key" backend/apps/common/apps.py

# Check for remaining hardcoded secrets (H1)
grep -rn "ctx7sk-\|eyJhbG\|sbp_" .kiro/
```
