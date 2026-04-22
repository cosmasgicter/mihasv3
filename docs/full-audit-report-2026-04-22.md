# MIHAS Full Repository Audit Report

**Date:** 2026-04-22
**Auditor:** Kiro CLI (3-wave parallel agent audit)
**Scope:** Every runtime, test, config, script, and documentation file in the repository

---

## Final Tally

| Metric | Count |
|--------|-------|
| **Total files audited** | **1,228** |
| **Files read in full** | **~450** |
| **Files classified by pattern/filename** | **~778** |
| **Confirmed bugs [B]** | **7** |
| **Zero-day-class risks [Z]** | **1** |
| **Suspicious stale paths [S]** | **~45** |
| **Files to improve [I]** | **~55** |
| **Files to remove [R]** | **3** |
| **Needs human decision [H]** | **2** |
| **Ignored as correct [C]** | **~1,115** |
| **Files still unresolved** | **0** |

---

## CONFIRMED BUGS [B] — 7

| # | File | Bug | Impact |
|---|------|-----|--------|
| 1 | `backend/apps/applications/document_views.py` | `FinanceReceiptView` queries `Payment.status="verified"` — not a canonical Lenco status | Will find zero payment records for Lenco payments; finance receipt generation broken |
| 2 | `backend/apps/applications/tasks.py` | `generate_finance_receipt_task` queries `Payment.status="verified"` | Same as above — async receipt generation broken |
| 3 | `backend/apps/applications/public_views.py` | `ApplicationTrackView` returns raw serializer data without `{success:true, data:...}` envelope | Contract violation — frontend may fail to parse |
| 4 | `backend/apps/applications/student_views.py` | (a) `app.grades_summary` references non-existent field; (b) `ApplicationDocumentsView`, `ApplicationDetailView._update_application`, `ApplicationSubmitView.post()` return without envelope | Multiple contract violations |
| 5 | `backend/apps/jobs/views.py` | `JobScoreView.update_or_create(job=job, ...)` — FK is `job_posting` not `job`; fields `score`/`reasoning`/`scored_at` don't exist on `JobMatchScore` | Runtime crash on AI score save |
| 6 | `backend/apps/analytics/views.py` | `hash(frozenset(...))` for cache key is non-deterministic across Python processes (PYTHONHASHSEED); silently swallows all exceptions | Cache misses between workers; errors hidden |
| 7 | `apps/admissions/src/components/ui/SafeHtml.tsx` | Renders sanitized HTML as text content (not `dangerouslySetInnerHTML`) — tags appear as literal text | Either rendering or naming is wrong |

## ZERO-DAY-CLASS RISK [Z] — 1

| # | File | Risk | Impact |
|---|------|------|--------|
| 1 | `backend/apps/integrations/views.py` | `TelegramWebhookView` is `AllowAny` with zero signature/secret validation | Any attacker can POST arbitrary payloads to the webhook endpoint |

## FILES TO REMOVE [R] — 3

| File | Evidence |
|------|----------|
| `apps/admissions/tests/unit/signOutCleanup.test.ts` | Duplicate of `signout-cleanup.test.ts`; references stale `?action=logout` |
| `apps/admissions/tests/unit/PaymentStep.test.tsx` | Older version; `paymentStep.test.ts` is the current audit-remediation version |
| `apps/admissions/tests/unit/LazyLoadErrorBoundary.test.tsx` | Minimal SSR-only test; `lazyLoadErrorBoundary.test.tsx` has full coverage |

## NEEDS HUMAN DECISION [H] — 2

| File | Decision Needed |
|------|-----------------|
| `apps/admissions/src/components/ui/ConfirmDialog.tsx` | Custom modal — should migrate to Radix AlertDialog (`alert-dialog.tsx` has `ConfirmAlertDialog`) |
| `apps/admissions/src/components/ui/DataPopulationConfirmation.tsx` | Custom modal — should migrate to Radix Dialog |

## SUSPICIOUS STALE PATHS [S] — ~45

### Code (5)
- `apps/admissions/src/components/navigation/MobileBottomNav.tsx` — superseded by BottomNavigation
- `apps/admissions/src/components/admin/applications/ApplicationsCards.tsx` — superseded by ApplicationCard.tsx
- `apps/admissions/src/components/ui/Modal.tsx` — redundant wrapper over Dialog.tsx
- `apps/admissions/src/components/ui/FocusTrap.tsx` — superseded by Radix Dialog focus trapping
- `apps/jobs-ops/src/features/shared/ScaffoldPage.tsx` — not imported anywhere

### Tests (~15)
- `tests/property/supabase-*.property.test.ts` (7 files) — Supabase fully removed
- `tests/unit/pwaPackageRemoval.test.ts` + `tests/property/pwaArtifactAbsence.property.test.ts` — PWA removed
- `tests/unit/deadCodeRemovalVerification.test.ts` + `tests/property/deadCode.property.test.ts` — always pass
- `tests/property/vercel-api-bundling-fix/*.property.test.ts` (3 files) — reference non-existent `api/` directory
- `tests/unit/forensic-cleanliness.test.ts` — fragile Cloudflare hostname check

### Docs (~22)
- `docs/reports/NETLIFY_*.md` (2) — Netlify retired
- `docs/guides/CLOUDFLARE_*.md` (4) + `docs/CLOUDFLARE_*.md` (2) + `docs/analysis/CLOUDFLARE_AI_MIGRATION.md` + `docs/task-21-cloudflare-optimization-summary.md` — Cloudflare retired
- `docs/migration/SUPABASE.md` + `docs/migration/runtime-supabase-inventory.md` + `docs/reports/fix-supabase.md` — Supabase removed
- `docs/reports/PWA_OFFLINE_100_PERCENT.md` — PWA removed
- `docs/reports/DARK_MODE_*.md` (2) + `docs/DARK_MODE_REMOVAL.md` — dark mode removed
- `docs/migration/2026-03-09-nestjs-migration-guide.md` + `docs/migration/2026-03-11-self-hosted-spring-boot-platform-plan.md` — never adopted
- `docs/DEPLOY_NOW.md` — stale deploy references
- `docs/guides/CRON_*.md` (2) — pre-Celery cron setup

### Backend references (3)
- `backend/scripts/lenco_payment_integration.sql` — referenced in steering but missing from disk
- `backend/scripts/business_logic_densification.sql` — referenced in steering but missing from disk
- `backend/scripts/create_error_logs_table.sql` — referenced in steering but missing from disk

### Types (1)
- `apps/admissions/src/types/applicationStatus.ts` — missing 5 statuses from backend state machine

## IMPROVEMENTS NEEDED [I] — ~55

### High Priority
| File | Issue |
|------|-------|
| `backend/apps/accounts/admin_views.py` | Dashboard queries `Payment.status__in=['paid','successful','verified']` — `paid`/`verified` non-canonical |
| `backend/apps/applications/admin_views.py` | Review payment check uses non-canonical `paid`/`verified` |
| `backend/apps/catalog/tasks.py` | `_log_error_and_alert` writes to deprecated `ErrorLog` model instead of `sentry_sdk` |
| `backend/config/settings/staging.py` | Missing cookie domain overrides — staging inherits production `.mihas.edu.zm` |
| `apps/admissions/src/hooks/usePaymentStatus.ts` | `normalizePaymentStatusValue` duplicates `lib/paymentStatus.ts` with different return type |
| `apps/admissions/src/hooks/auth/authQueries.ts` | ✅ Already fixed this session — `isAuthProfileError` now uses `isPermissionDenial` |
| `apps/admissions/src/hooks/useDocumentGeneration.ts` | ✅ Already fixed this session — uses backend receipt API |
| `apps/admissions/src/components/student/PaymentForm.tsx` | ✅ Already fixed this session — single `normalizedPhone` |
| `backend/apps/common/communication_service.py` | ✅ Already fixed this session — `public_tracking_code` fallback |

### Medium Priority
| File | Issue |
|------|-------|
| `apps/jobs-ops/src/services/api/*.ts` (6 files) | Silent error fallback masks auth failures |
| `apps/jobs-ops/src/features/integrations/pages/IntegrationsPage.tsx` | Hardcoded providers instead of backend data |
| `apps/jobs-ops/src/components/ui/ProgressBar.tsx` | Missing `role="progressbar"` and ARIA attributes |
| `apps/jobs-ops/src/app/layout/JobsOpsShell.tsx` | Command palette lacks focus trap and `role="dialog"` |
| `apps/jobs-ops/eslint.config.js` | `react-hooks/exhaustive-deps` is `off` |
| `apps/jobs-ops/package.json` | Dev deps in `dependencies` |
| `apps/admissions/src/components/admin/EnhancedDataTable.tsx` | Missing `key` on `<tr>` elements |
| `apps/admissions/src/components/ui/Pagination.tsx` | No truncation for large page counts, missing `aria-current` |
| `apps/admissions/src/components/ui/PageShell.tsx` | Hardcoded slate colors instead of design tokens |
| `apps/admissions/src/components/ui/ActiveSessions.tsx` | Feature component misplaced in ui/ directory |
| `apps/admissions/src/components/ui/UserMenu.tsx` | Feature component misplaced in ui/ directory |
| `apps/admissions/tests/property/*.property.ts` (6 files) | Missing `.test.` in filename — invisible to vitest |
| `backend/scripts/verify_schema_static.py` | Missing 28 jobs-ops tables |
| `backend/scripts/verify_migration.py` | Missing 33 tables total |
| `backend/apps/automation/views.py` | `PublicReadWriteProtectedMixin` duplicated across 3 apps |
| `backend/requirements.txt` | Unpinned upper bounds on `openai`, `cryptography` |
| `docs/README.md`, `docs/DEVELOPER_ONBOARDING.md`, `docs/production-deployment-guide.md` | Dozens of stale platform references |

---

## Verification Status

| Check | Result |
|-------|--------|
| TypeScript compilation (admissions) | ✅ 0 errors |
| TypeScript compilation (jobs-ops) | Not run (no changes made to jobs-ops) |
| Backend tests (communication_service + email_slip) | ✅ 12/12 passed |
| Django system check | ✅ Clean |
| All files accounted for | ✅ 0 unresolved |
