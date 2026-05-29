# AI Slop Audit — Final Report

**Date:** 2026-05-29
**Scope:** `apps/admissions/src/`, `apps/jobs-ops/src/`, `backend/apps/`
**Mode:** Read-only — no source files modified

---

## 1. Stale TODOs Without Concrete Trigger Condition

| Severity | File:Line | Excerpt |
|----------|-----------|---------|
| [P1] | `backend/apps/documents/models.py:73` | `# TODO: NOT NULL after orphan-payment cleanup migration` |

**Total: 1 finding.** The TODO references a migration that has no ticket, date, or trigger condition. All other `TODO`-like patterns in scope are format examples (`XXXXXXXX`) or regex comments, not actionable TODOs.

---

## 2. "Coming soon" / "for now" / "stub" / "placeholder" in Code Comments

| Severity | File:Line | Excerpt |
|----------|-----------|---------|
| [P2] | `backend/apps/accounts/services.py:182` | `# Lockout email (placeholder)` |
| [P2] | `backend/apps/documents/payment_service.py:1047` | `# Create a placeholder pending row for _transition.` |

**Total: 2 findings.** The `accounts/services.py` comment labels a section header for a function that is actually implemented (`send_lockout_email`), making the comment misleading. The `payment_service.py` usage is legitimate (describes what the code does).

---

## 3. Ceremonial Verbose Docstrings

**Total: 0 findings.** No instances of `"""This function/method/class does/is/returns..."""` pattern found. Docstrings in scope are either substantive or module-level.

---

## 4. Hardcoded Mock/Fake/Dummy Data in Production Paths

**Total: 0 findings.** No `mock`, `fake`, `dummy`, `hardcoded`, or `sample` variable assignments found in production source paths. The `jobs_ops_seed.py` file is intentional scaffold data, not a production path leak.

---

## 5. Unused Imports

**Total: 0 actionable findings.** The `import React from 'react'` pattern (140 files) is required by the JSX transform configuration in this project (React 18 without the automatic runtime in all files). ESLint is configured with `--max-warnings 0` and the build passes, confirming no ESLint-flagged unused imports exist.

---

## 6. Empty Catch Blocks (Silent Error Swallow)

### Frontend (`.catch(() => {})`)

| Severity | File:Line | Excerpt |
|----------|-----------|---------|
| [P2] | `apps/admissions/src/lib/speculativePrefetch.ts:70` | `.catch(() => {})` — prefetch failure (intentional fire-and-forget) |
| [P2] | `apps/admissions/src/lib/speculativePrefetch.ts:167` | `imp().catch(() => {})` — chunk preload (intentional) |
| [P2] | `apps/admissions/src/lib/speculativePrefetch.ts:183` | `import(...).catch(() => {})` — wizard preload (intentional) |
| [P2] | `apps/admissions/src/App.tsx:105` | `import(...).catch(() => {})` — route preload (intentional) |
| [P2] | `apps/admissions/src/App.tsx:115` | `import(...).catch(() => {})` — dashboard preload (intentional) |
| [P2] | `apps/admissions/src/contexts/AuthContext.tsx:76` | `clearSession().catch(() => {})` — logout cleanup (intentional) |
| [P2] | `apps/admissions/src/lib/localStorageCache.ts:28` | `secureStorage.delete(key).catch(() => {})` — cache eviction (intentional) |
| [P1] | `apps/admissions/src/components/student/NotificationBell.tsx:56` | `markAsRead(notification.id).catch(() => {})` — silent failure on mark-read |
| [P1] | `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts:567` | `apiClient.request(...).catch(() => {})` — OCR extract fire-and-forget |
| [P1] | `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts:1132` | `syncGrades.mutateAsync(...).catch(() => {})` — grade sync silent fail |
| [P1] | `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts:1154` | `apiClient.request(...).catch(() => {})` — re-extract silent fail |

**Total: 11 findings (4 P1, 7 P2).** Prefetch/preload empty catches are acceptable by design. The wizard controller and notification bell swallow errors that could affect user data.

---

## 7. Commented-Out Code Blocks (3+ Consecutive Lines)

**Total: 0 findings.** No blocks of 3+ consecutive commented-out `import`, `const`, `function`, `return`, or `export` statements found in production source. Individual commented lines exist but are explanatory comments that happen to start with those keywords (e.g., `// Return focus to the trigger button`).

---

## 8. `console.*` in Production Code

### Previously Approved (3 legitimate sites — VERIFIED STILL PRESENT):
1. `apps/admissions/src/lib/logger.ts` — the logger module itself (dev-only path)
2. `apps/admissions/src/lib/pdf/theme/index.ts:106-107` — institution code drift warning
3. `apps/admissions/src/lib/pdf/render.ts:37` — PDF render failure (re-throws after logging)

### NEW findings (not in the original 3):

| Severity | File:Line | Excerpt |
|----------|-----------|---------|
| [P1] | `apps/admissions/src/lib/loaderTelemetry.ts:13` | `console.info(\`[loader] ${name} started\`)` — gated by `ENABLE_LOADER_LOGS` (dev + opt-in) |
| [P1] | `apps/admissions/src/lib/loaderTelemetry.ts:28` | `console.info(\`[loader] ${name} finished in ${durationMs}ms\`)` — same gate |
| [P0] | `apps/admissions/src/lib/reloadControl.ts:103` | `console.info('[ReloadControl]', payload)` — **UNGATED, runs in production** |
| [P0] | `apps/admissions/src/lib/reloadControl.ts:151` | `console.info('[telemetry] reload', payload)` — **UNGATED, runs in production** |
| [P2] | `apps/jobs-ops/src/components/ui/ErrorBoundary.tsx:39` | `console.error('[ErrorBoundary] Caught error:', ...)` — error boundary (acceptable) |
| [P2] | `apps/jobs-ops/src/services/api/client.ts:142` | `console.error('[jobs-ops api]', {...})` — API error logging (acceptable for now) |

**Total: 6 new sites (2 P0, 2 P1, 2 P2).** The `reloadControl.ts` sites are the most concerning — they emit to console unconditionally in production builds.

---

## 9. `any` Types Outside the Framer-Motion Seam

### Allowlisted (8 in `shape-landing-hero.tsx` — VERIFIED):
All 8 `as any` casts in `apps/admissions/src/components/smoothui/shape-landing-hero.tsx` are confirmed present and remain the framer-motion type seam.

### NEW findings:

| Severity | File:Line | Excerpt |
|----------|-----------|---------|
| — | — | — |

**Total: 0 new findings.** Jobs-ops has zero `any` types. Admissions has only the 8 allowlisted sites.

---

## 10. Magic Numbers Without Named Constants

### Backend (timeouts, retries, limits without named constants):

| Severity | File:Line | Excerpt |
|----------|-----------|---------|
| [P2] | `backend/apps/common/tasks.py:60` | `cache.add(..., timeout=180)` — lock TTL inline |
| [P2] | `backend/apps/common/tasks.py:256` | `cache.add(claim_key, "1", timeout=300)` — claim lock TTL inline |
| [P2] | `backend/apps/common/celery_signals.py:54` | `cache.set(..., timeout=86400)` — 24h TTL inline |
| [P2] | `backend/apps/accounts/authentication.py:93` | `cache.set(cache_key, ..., timeout=60)` — JTI cache TTL inline |
| [P2] | `backend/apps/accounts/tokens.py:37-38` | `socket_connect_timeout=2, socket_timeout=2` — Redis socket timeouts inline |
| [P2] | `backend/apps/accounts/tokens.py:186` | `cache.add(rotation_lock_key, "1", timeout=30)` — rotation lock TTL inline |
| [P2] | `backend/apps/accounts/services.py:81` | `timedelta(minutes=15)` — rate limit window inline |
| [P2] | `backend/apps/accounts/services.py:145` | `timedelta(hours=1)` — token expiry inline |
| [P2] | `backend/apps/applications/enrollment_service.py:135` | `timedelta(days=14)` — default enrollment deadline inline |
| [P2] | `backend/apps/applications/student_submission_views.py:259` | `future.result(timeout=15)` — PDF generation timeout inline |

### Frontend (setTimeout with bare numbers):

| Severity | File:Line | Excerpt |
|----------|-----------|---------|
| [P2] | `apps/admissions/src/components/student/PaymentForm.tsx:243` | `setTimeout(() => onSuccess?.(), 2000)` — success delay |
| [P2] | `apps/admissions/src/pages/student/applicationWizard/steps/SubmitStep.tsx:162` | `setTimeout(resolve, 1200)` — artificial submission delay |
| [P2] | `apps/admissions/src/components/admin/RealtimeMetricsDisplay.tsx:328` | `setTimeout(..., 3000)` — flash clear delay |
| [P2] | `apps/admissions/src/components/admin/RealtimeMetricsDisplay.tsx:333` | `setTimeout(..., 5000)` — indicator clear delay |
| [P2] | `apps/admissions/src/pages/admin/Dashboard.tsx:56` | `setTimeout(..., 5000)` — auth recovery timeout |

**Total: 15 findings (all P2).** Most backend timeouts are in Celery task decorators which is acceptable convention. The inline `timeout=` and `timedelta()` values in service code should be extracted to module-level constants.

---

## 11. Banned Unicode Chars in Python Source

**Total em-dash (—) occurrences: 96 across 38 files.**

Breakdown:
- **User-facing strings** (email subjects, error messages, model `__str__`): ~58 occurrences — **acceptable** (these are the known 38+ user-facing sites)
- **Logger messages** (not user-facing): **13 occurrences — NEW**

| Severity | File:Line | Excerpt |
|----------|-----------|---------|
| [P1] | `backend/apps/accounts/tokens.py:192` | `logger.warning("Redis unavailable for rotation lock — proceeding...")` |
| [P1] | `backend/apps/accounts/tokens.py:221` | `logger.warning("Redis write failed for JTI blacklist — retrying once")` |
| [P1] | `backend/apps/accounts/tokens.py:236` | `logger.warning("Redis read failed for JTI blacklist — retrying once")` |
| [P1] | `backend/apps/accounts/tokens.py:239` | `logger.error("Redis read failed for JTI blacklist after retry — failing closed")` |
| [P1] | `backend/apps/common/tasks.py:390` | `logger.warning("Health check FAILED for %s — dispatching alert")` |
| [P1] | `backend/apps/common/tasks.py:406` | `logger.info("Health check RECOVERED for %s — dispatching recovery notice")` |
| [P1] | `backend/apps/common/tasks.py:422` | `logger.warning("Health check still failing for %s — no duplicate alert")` |
| [P1] | `backend/apps/common/middleware_compat.py:96` | `logger.error("JWT_SIGNING_KEY is not configured — middleware cannot authenticate")` |
| [P1] | `backend/apps/common/ai_circuit_breaker.py:159` | `logger.info("AI circuit breaker open — short-circuiting %s")` |
| [P1] | `backend/apps/common/ai_service.py:45` | `logger.warning("AI Gateway not configured — skipping vision OCR")` |
| [P1] | `backend/apps/documents/webhook_processor.py:142` | `logger.warning("LENCO_API_SECRET_KEY not configured — cannot validate...")` |
| [P1] | `backend/apps/documents/payment_helpers.py:644` | `_logger.warning("Webhook %s for payment %s — skipping")` |
| [P1] | `backend/apps/documents/payment_service.py:311` | `logger.warning("LENCO_API_SECRET_KEY not configured — cannot verify...")` |

**Total new: 13 findings (all P1).** Em-dashes in logger strings can break log parsing tools that expect ASCII. These are in code (logger calls), not user-facing strings.

---

## 12. Boilerplate "TODO: refactor" / "this is hacky" Without Explanation

**Total: 0 findings.** No instances of `TODO.*refactor`, `hacky`, `this is a hack`, `FIXME.*later`, or `TODO.*clean` found in production source.

---

## 13. Dependencies Pinned to `^x.y.z` Ranges

### `apps/admissions/package.json` — caret ranges in dependencies:

| Severity | Package | Version |
|----------|---------|---------|
| [P1] | `@radix-ui/react-accordion` | `^1.2.12` |
| [P1] | `@radix-ui/react-alert-dialog` | `^1.1.15` |
| [P1] | `@radix-ui/react-checkbox` | `^1.3.3` |
| [P1] | `@radix-ui/react-dialog` | `^1.1.15` |
| [P1] | `@radix-ui/react-dropdown-menu` | `^2.1.16` |
| [P1] | `@radix-ui/react-label` | `^2.1.8` |
| [P1] | `@radix-ui/react-navigation-menu` | `^1.2.14` |
| [P1] | `@radix-ui/react-progress` | `^1.1.8` |
| [P1] | `@radix-ui/react-radio-group` | `^1.3.8` |
| [P1] | `@radix-ui/react-select` | `^2.2.6` |
| [P1] | `@radix-ui/react-separator` | `^1.1.8` |
| [P1] | `@radix-ui/react-slot` | `^1.2.4` |
| [P1] | `@radix-ui/react-switch` | `^1.2.6` |
| [P1] | `@radix-ui/react-tabs` | `^1.1.13` |
| [P1] | `@radix-ui/react-toast` | `^1.2.15` |
| [P1] | `@radix-ui/react-tooltip` | `^1.2.8` |
| [P1] | `@react-pdf/renderer` | `^4.5.1` |
| [P1] | `@sentry/react` | `^10.52.0` |
| [P1] | `@tailwindcss/forms` | `^0.5.11` |
| [P1] | `@tanstack/react-query` | `^5.100.9` |
| [P1] | `@tanstack/react-virtual` | `^3.13.24` |
| [P1] | `class-variance-authority` | `^0.7.1` |
| [P1] | `clsx` | `^2.1.1` |
| [P1] | `date-fns` | `^4.1.0` |
| [P1] | `framer-motion` | `^11` |
| [P1] | `jspdf` | `^4.2.1` |
| [P1] | `jspdf-autotable` | `^5.0.7` |
| [P1] | `lucide-react` | `^0.468.0` |
| [P1] | `pdf-lib` | `^1.17.1` |
| [P1] | `qrcode` | `^1.5.4` |
| [P1] | `react` | `^18.3.1` |
| [P1] | `react-dom` | `^18.3.1` |
| [P1] | `react-dropzone` | `^14.4.1` |
| [P1] | `react-hook-form` | `^7.75.0` |
| [P1] | `react-intersection-observer` | `^9.16.0` |
| [P1] | `react-router-dom` | `^6.30.3` |
| [P1] | `recharts` | `^3.8.1` |
| [P1] | `tailwind-merge` | `^2.6.1` |
| [P1] | `zustand` | `^5.0.13` |

### `apps/jobs-ops/package.json` — caret ranges in dependencies:

| Severity | Package | Version |
|----------|---------|---------|
| [P1] | `@tanstack/react-query` | `^5.62.7` |
| [P1] | `@vitejs/plugin-react` | `^4.3.4` |
| [P1] | `autoprefixer` | `^10.4.20` |
| [P1] | `clsx` | `^2.1.1` |
| [P1] | `lucide-react` | `^0.468.0` |
| [P1] | `postcss` | `^8.5.14` |
| [P1] | `react` | `^18.3.1` |
| [P1] | `react-dom` | `^18.3.1` |
| [P1] | `react-hook-form` | `^7.55.0` |
| [P1] | `react-router-dom` | `^6.29.0` |
| [P1] | `tailwindcss` | `^3.4.17` |
| [P1] | `typescript` | `^5.9.3` |
| [P1] | `vite` | `^6.4.2` |
| [P1] | `zustand` | `^5.0.2` |

**Total: 53 caret-range dependencies across both apps.** Exact-pinned examples exist (`zod: "4.3.6"`, `tesseract.js: "7.0.0"`, `@hookform/resolvers: "5.2.2"`), proving the convention is known but inconsistently applied. The `bun.lockb` lockfile mitigates runtime risk, but CI reproducibility and supply-chain safety require exact pins.

---

## 14. Tests Using `sleep()`/`setTimeout` Fixed Delays Instead of `waitFor`

| Severity | File | Count | Pattern |
|----------|------|-------|---------|
| [P1] | `tests/unit/signOutRaceRegression.test.ts` | 8 | `new Promise((r) => setTimeout(r, 0/10))` |
| [P1] | `tests/unit/page-verification/signin-page.test.tsx` | 5 | `new Promise((r) => setTimeout(r, 100))` |
| [P1] | `tests/unit/page-verification/contact-page.test.tsx` | 3 | `new Promise((r) => setTimeout(r, 300))` |
| [P1] | `tests/unit/contactFormSubmission.test.tsx` | 3 | `new Promise((r) => setTimeout(r, 50))` |
| [P1] | `tests/unit/page-verification/admin-dashboard.test.tsx` | 3 | `new Promise((r) => setTimeout(r, 100))` |
| [P1] | `tests/unit/page-verification/student-dashboard.test.tsx` | 2 | `new Promise((r) => setTimeout(r, 500))` |
| [P1] | `tests/unit/wizardRefreshDedupe.test.ts` | 3 | `new Promise(r => setTimeout(r, 5/10))` |
| [P2] | `tests/property/autoLogoutRacePreservation.property.test.ts` | 4 | `new Promise(r => setTimeout(r, 10))` |
| [P2] | `tests/property/autoLogoutRaceBugCondition.property.test.ts` | 3 | `new Promise(r => setTimeout(r, delayMs))` |
| [P2] | `tests/property/authSimplificationRefresh.property.test.ts` | 3 | `new Promise(r => setTimeout(r, 5))` |

**Total: 37+ fixed-delay sites across 27 test files.** The `page-verification/` tests are the worst offenders with 100-500ms sleeps that make the suite flaky and slow. Property tests using small delays (5-10ms) for async settling are more defensible but still fragile.

---

## 15. Backend Exception Handlers That Just `pass` or Log-and-Rethrow

### Silent `except ... : pass` blocks:

| Severity | File:Line | Context |
|----------|-----------|---------|
| [P1] | `backend/apps/common/celery_signals.py:34` | `except Exception: pass` — task prerun telemetry |
| [P1] | `backend/apps/common/celery_signals.py:56` | `except Exception: pass` — task postrun telemetry |
| [P1] | `backend/apps/common/celery_signals.py:76` | `except Exception: pass` — task failure telemetry |
| [P2] | `backend/apps/common/middleware_compat.py:68` | `except (json.JSONDecodeError, AttributeError): pass` — CSRF body parse |
| [P2] | `backend/apps/common/middleware_compat.py:125` | `except Exception: pass` — JWT decode for expiry flag |
| [P2] | `backend/apps/common/middleware_compat.py:205` | `except Exception: pass` — Redis health ping |
| [P1] | `backend/apps/applications/admin_assignment_views.py:196` | `except Exception: pass` — notification send |
| [P1] | `backend/apps/applications/admin_assignment_views.py:239` | `except Exception: pass` — communication send |
| [P1] | `backend/apps/applications/admin_assignment_views.py:300` | `pass` — nested notification |
| [P2] | `backend/apps/applications/identifier_resolver.py:39` | `pass` — UUID parse attempt |
| [P2] | `backend/apps/applications/identifier_resolver.py:79` | `pass` — UUID parse attempt |
| [P2] | `backend/apps/applications/student_draft_views.py:175` | `except Exception: pass` — draft auto-save notification |
| [P2] | `backend/apps/applications/student_draft_views.py:274` | `pass` — class body placeholder |
| [P1] | `backend/apps/applications/services.py:324` | `except Exception: pass` — notification after submission |
| [P2] | `backend/apps/applications/document_views.py:150` | `except Exception: pass` — OCR import fallback |
| [P2] | `backend/apps/applications/tasks/review_sla.py:39` | `pass` — individual app processing |
| [P2] | `backend/apps/applications/tasks/waitlist.py:40` | `pass` — individual app processing |
| [P2] | `backend/apps/applications/admin_review_views.py:656` | `pass` — notification best-effort |
| [P2] | `backend/apps/applications/duplicate_checker.py:27` | `pass` — exception class body |
| [P2] | `backend/apps/documents/tasks.py:342` | `pass` — individual payment processing |
| [P2] | `backend/apps/documents/payment_query_views.py:250` | `pass` — query filter |
| [P2] | `backend/apps/documents/payment_service.py:1222` | `pass` — nested error handling |
| [P2] | `backend/apps/accounts/authentication.py:95` | `except Exception: pass` — JTI cache check |
| [P2] | `backend/apps/accounts/tokens.py:209` | `pass` — exception class body |
| [P2] | `backend/apps/accounts/auth_views.py:506` | `pass` — profile lookup |
| [P2] | `backend/apps/applications/student_submission_views.py:370` | `pass` — notification |
| [P2] | `backend/apps/applications/admin_amendment_views.py:326` | `pass` — notification |
| [P2] | `backend/apps/common/ai_circuit_breaker.py:120` | `pass` — Redis unavailable |
| [P2] | `backend/apps/common/dev_bypass.py:99` | `pass` — settings check |

**Total: 29 findings (6 P1, 23 P2).** The P1 sites silently swallow exceptions in notification/communication sends and Celery signal handlers where failures should at minimum be logged. The P2 sites are mostly legitimate best-effort patterns (UUID parsing, Redis degradation, notification fire-and-forget).

---

## Pattern Density Table (Top 10 Files)

| File | TODO | console.* | any | em-dash | silent catch | total slop |
|------|------|-----------|-----|---------|--------------|------------|
| `backend/apps/accounts/tokens.py` | 0 | 0 | 0 | 5 | 1 | 6 |
| `backend/apps/common/tasks.py` | 0 | 0 | 0 | 7 | 0 | 7 |
| `backend/apps/common/celery_signals.py` | 0 | 0 | 0 | 0 | 3 | 3 |
| `backend/apps/applications/admin_assignment_views.py` | 0 | 0 | 0 | 0 | 3 | 3 |
| `apps/admissions/src/lib/reloadControl.ts` | 0 | 2 | 0 | 0 | 0 | 2 |
| `apps/admissions/src/lib/loaderTelemetry.ts` | 0 | 2 | 0 | 0 | 0 | 2 |
| `backend/apps/documents/payment_service.py` | 0 | 0 | 0 | 6 | 1 | 7 |
| `backend/apps/common/middleware_compat.py` | 0 | 0 | 0 | 2 | 3 | 5 |
| `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts` | 0 | 0 | 0 | 0 | 3 | 3 |
| `backend/apps/applications/condition_manager.py` | 0 | 0 | 0 | 8 | 0 | 8 |

---

## Summary

| Pattern | P0 | P1 | P2 | Total |
|---------|----|----|----|----|
| 1. Stale TODOs | 0 | 1 | 0 | 1 |
| 2. Placeholder comments | 0 | 0 | 2 | 2 |
| 3. Ceremonial docstrings | 0 | 0 | 0 | 0 |
| 4. Hardcoded mock data | 0 | 0 | 0 | 0 |
| 5. Unused imports | 0 | 0 | 0 | 0 |
| 6. Empty catch blocks | 0 | 4 | 7 | 11 |
| 7. Commented-out code | 0 | 0 | 0 | 0 |
| 8. console.* in prod | 2 | 2 | 2 | 6 |
| 9. `any` types | 0 | 0 | 0 | 0 |
| 10. Magic numbers | 0 | 0 | 15 | 15 |
| 11. Banned Unicode | 0 | 13 | 0 | 13 |
| 12. Boilerplate TODOs | 0 | 0 | 0 | 0 |
| 13. Caret-range deps | 0 | 53 | 0 | 53 |
| 14. Test sleep delays | 0 | 7 | 3 | 10 |
| 15. Silent except:pass | 0 | 6 | 23 | 29 |
| **TOTAL** | **2** | **86** | **52** | **140** |

### Priority Actions

1. **P0 (fix immediately):** Remove ungated `console.info` from `reloadControl.ts` — these leak telemetry to end-user browser consoles in production.
2. **P1 (fix this sprint):** Pin all 53 caret-range dependencies to exact versions. Replace em-dashes in logger strings with ASCII `--`. Add error logging to wizard controller `.catch(() => {})` sites.
3. **P2 (backlog):** Extract magic number timeouts to named constants. Convert test `setTimeout` delays to `waitFor`/`act` patterns.
