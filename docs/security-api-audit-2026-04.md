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

#### H2: CSP Allows `unsafe-inline` for Scripts (STILL OPEN)

- File: `apps/admissions/vercel.json`
- Evidence: `script-src 'self' 'unsafe-inline' ...`
- Impact: Weakens XSS protection — inline scripts can execute if HTML injection is achieved
- CVSS: 6.1
- Remediation: Replace with nonce-based CSP. Vite supports `html.cspNonce` config.

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

#### M1: Application Track Endpoint Exposes Data Without Authentication (STILL OPEN)

- Tracking codes have ~48 bits of entropy. Rate limit is 120/10m via catch-all.
- Remediation: Add dedicated rate limit for track endpoint. Remove `payment_status` from tracking response.

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
| H2: CSP unsafe-inline | HIGH | Medium | Fix this sprint | OPEN |
| N1: Analytics endpoints public with real data | MEDIUM | Low | Fix this sprint | NEW |
| H4: Error reporter spam | HIGH | Low | Fix this sprint | OPEN |
| N2: SQL injection in migration script | MEDIUM | Low | Fix this sprint | NEW |
| M1: Track endpoint data exposure | MEDIUM | Medium | Next sprint | OPEN |
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
