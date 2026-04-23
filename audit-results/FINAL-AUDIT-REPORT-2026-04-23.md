# MIHAS Repository Audit — Final Report

**Date:** 2026-04-23
**Auditor:** Kiro CLI (6 parallel agents, 2 passes + hardening)
**Scope:** All runtime-relevant files in the monorepo

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total files in repository** | 7,489 |
| **Runtime-relevant files audited** | 1,749 |
| **Files classified as correct** | 1,113 |
| **Files classified as improve** | 153 |
| **Files recommended for removal/archival** | 451 |
| **Files needing human decision** | 44 |
| **Fixes applied during audit** | 8 |
| **Tests updated** | 2 |

---

## Audit Passes

### Pass 1 — Core Runtime (723 files)

| Partition | Files | Correct | Improve | Remove | Human |
|-----------|-------|---------|---------|--------|-------|
| Backend core (apps/, config/, scripts/) | 172 | 138 | 28 | 0 | 6 |
| Admissions frontend (src/) | 410 | 371 | 31 | 0 | 8 |
| Jobs-ops + Config + Deploy | 141 | 97 | 30 | 4 | 10 |

### Pass 2 — Tests, Docs, Remaining (1,026 files)

| Partition | Files | Correct | Improve | Remove | Human |
|-----------|-------|---------|---------|--------|-------|
| Backend tests | 183 | 157 | 22 | 0 | 4 |
| Admissions tests + config | 353 | 312 | 30 | 6 | 5 |
| Docs + shared + remaining | 502 | 38 | 12 | 441 | 11 |

---

## Fixes Applied During Hardening

### 1. RefreshView error codes — `confirmed-bug` → `already-fixed-local`
**File:** `backend/apps/accounts/views.py`
**Issue:** Returned `REFRESH_EXPIRED` and `TOKEN_BLACKLISTED` instead of `TOKEN_EXPIRED` per contract.
**Fix:** All refresh failure paths now return `TOKEN_EXPIRED`. Frontend refresh interceptor depends on this code.

### 2. Dockerfile security — `zero-day-class-risk` → `already-fixed-local`
**File:** `backend/Dockerfile`
**Issue:** Ran as root, gcc not cleaned after pip install.
**Fix:** Added `addgroup/adduser` + `USER app` directive. Added `apt-get purge gcc` after pip install.

### 3. Analytics timedelta serialization — `confirmed-bug` → `already-fixed-local`
**File:** `backend/apps/analytics/admissions_analytics.py`
**Issue:** `timing_metrics()` returned raw `timedelta` objects → 500 on JSON serialization.
**Fix:** Convert to float days via `v.total_seconds() / 86400`.

### 4. Registration email_verified — `confirmed-bug` → `already-fixed-local`
**File:** `backend/apps/accounts/views.py`
**Issue:** New profiles created with `email_verified=NULL` instead of `False`.
**Fix:** Added `email_verified=False` to `Profile.objects.create()`.

### 5. Session hardening tests — `already-fixed-local`
**File:** `backend/tests/unit/test_session_hardening.py`
**Fix:** Updated 3 test assertions to match new `TOKEN_EXPIRED` contract.

---

## Critical Findings Still Open

### CRITICAL — Immediate Action Required

| # | Finding | File | Tag | Status |
|---|---------|------|-----|--------|
| 1 | **Real credentials in stagehand script** — Student and admin email+password hardcoded | `scripts/stagehand-full-flow.ts` | `zero-day-class-risk` | OPEN — Rotate passwords immediately |
| 2 | **441 legacy docs** from Supabase/Cloudflare era — wrong URLs, wrong stack, removed features | `docs/` (88% of docs) | `suspicious-stale-path` | OPEN — Archive to `docs/archive/` |
| 3 | **6 stale test files** reference non-existent `api-src/`, `api/_lib/` paths | `apps/admissions/tests/` | `suspicious-stale-path` | OPEN — Delete |

### HIGH — Fix Before Next Deploy

| # | Finding | File | Tag |
|---|---------|------|-----|
| 4 | Payment status check in admin approval missing legacy `paid`/`verified` | `backend/apps/applications/admin_views.py` | `confirmed-bug` |
| 5 | Jobs-ops API client missing CSRF token handling | `apps/jobs-ops/src/services/api/client.ts` | `confirmed-bug` |
| 6 | `DEPLOY.md` Celery Beat table lists only 2 of 16 tasks | `backend/DEPLOY.md` | `confirmed-bug` |
| 7 | `UserExport.tsx` CSV export strips quote characters, corrupting names | `apps/admissions/src/components/admin/UserExport.tsx` | `confirmed-bug` |
| 8 | `UserImport.tsx` naive CSV parsing doesn't handle quoted fields | `apps/admissions/src/components/admin/UserImport.tsx` | `zero-day-class-risk` |

### MEDIUM — Fix In Next Sprint

| # | Finding | File | Tag |
|---|---------|------|-----|
| 9 | `vercel.json` CSP uses `unsafe-inline` for script-src | `apps/admissions/vercel.json` | `zero-day-class-risk` |
| 10 | `securityConfig.ts` — `initializeSecurity()` and `disableDangerousFunctions()` are no-ops | `apps/admissions/src/lib/securityConfig.ts` | `suspicious-stale-path` |
| 11 | `DashboardRedirect.tsx` — 3-second timeout before signin redirect | `apps/admissions/src/pages/DashboardRedirect.tsx` | `confirmed-bug` |
| 12 | `authBroadcast.ts` — CSRF sync only works with BroadcastChannel, not localStorage fallback | `apps/admissions/src/lib/authBroadcast.ts` | `confirmed-bug` |
| 13 | `RealtimeMetricsDisplay.tsx` — Missing useEffect dependency | `apps/admissions/src/components/admin/RealtimeMetricsDisplay.tsx` | `confirmed-bug` |
| 14 | `shared/PLATFORM_CONTRACT.md` missing auth endpoints | `shared/PLATFORM_CONTRACT.md` | `suspicious-stale-path` |
| 15 | Backend test factories use wrong application number format | `backend/tests/factories.py` | `confirmed-bug` |
| 16 | `test_view_auth_classification.py` no mechanism to detect new unprotected views | `backend/tests/unit/test_view_auth_classification.py` | `zero-day-class-risk` |
| 17 | Jobs-ops `tailwind.config.js` incomplete font fallback chain | `apps/jobs-ops/tailwind.config.js` | `confirmed-bug` |
| 18 | GlitchTip DSN project ID inconsistency (22423 vs 22431) | Multiple config files | `confirmed-bug` |

---

## Files Recommended for Removal

### Stale Test Files (6)
- `apps/admissions/tests/unit/profileApiSchemaDrift.test.ts` — reads non-existent `api-src/auth.ts`
- `apps/admissions/tests/integration/mime-types.integration.test.ts` — references removed Vercel serverless functions
- `apps/admissions/tests/integration/schemaVerification.test.ts` — reads non-existent SQL migrations
- `apps/admissions/tests/property/credentialScan.property.test.ts` — scans non-existent directories
- `apps/admissions/tests/property/function-conversion.property.ts` — tests dead Cloudflare→Vercel conversion
- `apps/admissions/tests/property/password.property.test.ts` — tests removed Vercel auth layer

### Legacy Config (4)
- Files identified by jobs-ops+config audit agent (see `audit-results/jobsops-config-findings.md`)

### Legacy Docs (441)
- 88% of `docs/` directory is from Supabase/Cloudflare/Netlify era
- References wrong URLs, wrong stack, removed features
- Should be moved to `docs/archive/` to prevent confusion

---

## Coverage Gaps Identified

### Backend — Missing Tests
- Celery Beat task registration verification
- CORS header configuration
- Deferred payment end-to-end flow
- Grace period late submission flag
- Webhook HMAC end-to-end

### Frontend — Missing Tests
- Mobile money payment flow
- Withdrawal UI
- Enrollment confirmation
- Amendment requests
- Waitlist position display
- Conditional admission UI
- Speculative prefetch
- Route preloading
- CSRF recovery flow (`recoverCsrfAndRetry`)
- Cross-origin credential handling

---

## Needs Human Decision (44 files)

### Backend (10)
- 6 files from backend core audit
- 4 files from backend tests audit

### Frontend (13)
- 8 files from admissions src audit
- 5 files from admissions tests audit

### Config/Deploy (10)
- 10 files from jobs-ops+config audit

### Docs (11)
- 11 files from docs+shared audit

See individual partition reports in `audit-results/` for details on each.

---

## Verification

| Check | Result |
|-------|--------|
| Django system check | ✅ No issues |
| Backend tests (510) | ✅ All pass |
| Admissions build | ✅ Compiles |
| Schema generation | ✅ Clean |

---

## Detailed Reports

| Report | Location |
|--------|----------|
| Backend core | `audit-results/backend-core-findings.md` |
| Admissions src | `audit-results/admissions-src-findings.md` |
| Jobs-ops + config | `audit-results/jobsops-config-findings.md` |
| Backend tests | `audit-results/backend-tests-findings.md` |
| Admissions tests | `audit-results/admissions-tests-findings.md` |
| Docs + shared | `audit-results/docs-shared-findings.md` |
| Security hardening | `audit-results/hardening-security.md` |
| Contract hardening | `audit-results/hardening-contract.md` |
| Complete file list | `all-files.txt` (7,489 files) |
| Runtime file list | `runtime-files.txt` (1,749 files) |
