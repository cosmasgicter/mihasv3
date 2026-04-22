# MIHAS Codebase Audit Report

**Date:** 2026-04-22
**Scope:** All runtime files in `apps/admissions/src/`, `apps/jobs-ops/src/`, `backend/apps/`, `backend/config/`
**Methodology:** Every file older than 7 days treated as suspicious; classified by evidence.

## Summary

| Metric | Count |
|--------|-------|
| Total runtime files audited | 616 |
| Suspicious files (>7 days old) | 335 |
| Files improved (code changed) | 5 |
| Files recommended for removal | 1 (dead export) |
| Files ignored as correct | 326 |
| Files needing human decision | 3 |

## Fixes Applied

### 1. `apps/admissions/src/hooks/usePaymentReceipt.ts` — IMPROVED
- **Was:** Client-side receipt fabrication using `generateReceiptNumber()`, `buildReceiptData()`, `applicationService.getById()`
- **Now:** Uses backend `GET /payments/{id}/receipt/` as source of truth with payment-record fallback
- **Removed:** `generateReceiptNumber` import, `applicationService` import, `ReceiptApplication` type, `buildReceiptData()`, `normalizeAmount()`

### 2. `apps/admissions/src/hooks/useDocumentGeneration.ts` — IMPROVED
- **Was:** Receipt case used `generateReceiptNumber()` for fabricated receipt numbers
- **Now:** Fetches from backend receipt endpoint first, falls back to `buildReceiptData()` (which uses `payment.id.slice(0,8)` instead of fabricated numbers)
- **Removed:** `generateReceiptNumber` import

### 3. `apps/admissions/src/components/student/PaymentForm.tsx` — IMPROVED
- **Was:** Phone normalization happened inside `getCustomerDetails` callback, re-computed on every call
- **Now:** Single `normalizedPhone` computed once at component top, shared by all payment channels (mobile money + card widget)

### 4. `apps/admissions/src/hooks/auth/authQueries.ts` — IMPROVED
- **Was:** `isAuthProfileError()` treated ALL 403 responses as auth errors (line 61: `maybeError.status === 403`)
- **Now:** Uses `isPermissionDenial(403, code)` from `sessionHardening.ts` — only CSRF 403s trigger auth error path; permission denials do not

### 5. `backend/apps/common/communication_service.py` — IMPROVED
- **Was:** `getattr(application, "tracking_code", "")` — references old field name
- **Now:** `getattr(application, "public_tracking_code", "") or getattr(application, "tracking_code", "")` — safe fallback chain

## Recommended for Removal

### `apps/admissions/src/lib/receiptGenerator.ts` → `generateReceiptNumber()` export (line 196)
- **Evidence:** Zero consumers remain after fixes to `usePaymentReceipt.ts` and `useDocumentGeneration.ts`
- **Disposition:** Dead export. Safe to remove the function. The `generatePaymentReceipt()` export in the same file is still actively used.

## Needs Human Decision

### 1. `apps/admissions/src/components/8starlabs/` (4 files)
- Third-party UI component library (partition-bar, status-indicator, timeline)
- Not imported by any stale-file audit target
- **Decision needed:** Verify these are still used in the app; if not, remove the directory

### 2. `apps/admissions/src/components/smoothui/` (7 files)
- Animation/UI effect library (animated-counter, animated-select, infinite-grid, scroll-reveal, shiny-text, text-effect, text-rotate)
- **Decision needed:** Verify active usage; some may be decorative-only and removable

### 3. `apps/admissions/src/lib/secureStorage.ts`
- Encryption abstraction already removed; only `clearSession()` and `stripPiiFields()` remain
- The `secureStorage` default export is deprecated
- **Decision needed:** Remove the deprecated `secureStorage` default export and rename file to `sessionCleanup.ts` for clarity, or keep as-is

## Files Ignored as Correct (326 files)

All 326 remaining suspicious files were audited against the canonical system and found to be:
- Aligned with the `/api/v1/` REST contract
- Using correct field names (`public_tracking_code` via serializer alias `tracking_code` is valid)
- Using `apiClient` for API calls (raw `fetch()` in `services/client.ts`, `services/csrf.ts`, `lib/storage.ts`, `lib/speculativePrefetch.ts` is correct — these are infrastructure-level)
- Using proper 403 classification where applicable
- Using `normalizePaymentStatus()` for payment reads
- Following cookie-based auth patterns
- Following the envelope format for list endpoints

### Key categories verified:
- **Payment files (42):** All use Lenco gateway, `normalizePaymentStatus()`, correct fee resolution
- **Auth/session files (30):** Cookie-based auth, JWT middleware, CSRF enforcement, `isPermissionDenial()` classification
- **Application state files (25):** Correct status enum, proper transition enforcement
- **Jobs-ops files (40):** Correct `/api/v1/` routes, proper domain separation
- **Backend config (4):** Correct ASGI setup, settings hierarchy
- **UI primitives (100+):** Radix UI wrappers, Tailwind patterns, accessibility attributes present
- **Type definitions (8):** Aligned with backend serializer output
- **Backend domain apps (87):** Correct model references, proper URL patterns, envelope format

## Verification

| Check | Result |
|-------|--------|
| TypeScript compilation | ✅ 0 errors |
| Backend tests (communication_service) | ✅ 11 passed |
| Backend tests (email_slip) | ✅ 1 passed |
| Django system check | ✅ No issues |
| `generateReceiptNumber` consumers | ✅ 0 (dead export) |
| `secureStorage.init` references | ✅ 0 (removed) |
| Bare `tracking_code` getattr in backend | ✅ 0 remaining |
| 403-as-auth-error without `isPermissionDenial` | ✅ 0 remaining |
