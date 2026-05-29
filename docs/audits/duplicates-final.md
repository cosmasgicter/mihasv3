# Duplicate Implementations Audit — Final Report

**Date:** 2026-05-29  
**Scope:** `apps/admissions/src/`, `apps/jobs-ops/src/`, `backend/apps/`  
**Mode:** Read-only — no source files modified  

---

## Summary

| Check | Status | Duplicates Found |
|-------|--------|-----------------|
| 1. Status badge implementations | ⚠️ DUPLICATED | 4 distinct `getStatusColor` + 3 StatusBadge components |
| 2. Date formatters | ⚠️ PARTIAL BYPASS | 4 files import `date-fns` directly |
| 3. Error message extractors | ⚠️ WIDESPREAD | ~50+ sites use inline `error instanceof Error ? error.message : '...'` |
| 4. Confirmation dialog patterns | ✅ DISTINCT ROLES | AlertDialog (primitive) vs ConfirmDialog (composed) vs useConfirmDialog (imperative) |
| 5. Filter panel patterns | ✅ ACCEPTABLE | 1 canonical `FiltersPanel` + page-local inline filters |
| 6. Toast helpers | ✅ UNIFIED | Single canonical entry via `useToastStore` |
| 7. Document storage key builders | ✅ CONSOLIDATED | `apps/common/storage.py` is canonical; shim in `document_storage_views.py` delegates |
| 8. Sex serializer fields | ✅ CONSOLIDATED | `SexField` in `apps/common/serializer_fields.py` used by both serializers |
| 9. Payment status normalizers | ⚠️ DUPLICATED | 1 inline duplicate + 5 scattered inline tuples in backend |
| 10. Idempotency key generators | ⚠️ DUPLICATED | 4 distinct implementations |
| 11. File upload helpers | ✅ ACCEPTABLE | Layered architecture (primitive → service → hook) |
| 12. Route preload vs speculative prefetch | ✅ DISTINCT CONCERNS | routePreload = chunk loading; speculativePrefetch = data + orchestration |

---

## Check 1: Status Badge Implementations

**Severity:** Medium  
**Finding:** 4 independent `getStatusColor` functions and 3 separate StatusBadge components exist.

### `getStatusColor` duplicates

| # | File | Line | Notes |
|---|------|------|-------|
| 1 | `apps/admissions/src/lib/utils.ts` | 54 | Uses `STATUS_COLOR_MAP` lookup — **canonical** |
| 2 | `apps/admissions/src/pages/student/History.tsx` | 30 | Uses `STATUS_COLORS` lookup — **duplicate** |
| 3 | `apps/admissions/src/components/admin/AdminCommunicationsPanel.tsx` | 80 | Uses `STATUS_COLORS` lookup — **duplicate** |
| 4 | `apps/admissions/src/pages/public/tracker/components/ApplicationStatusHeader.tsx` | 31 | Switch-based, returns Tailwind text colors — **duplicate** (different return type) |

### StatusBadge component duplicates

| # | File | Purpose | Notes |
|---|------|---------|-------|
| 1 | `apps/admissions/src/components/ui/StatusBadge.tsx` | Generic tone+icon pill | **Canonical** — exported from `ui/index.ts` |
| 2 | `apps/admissions/src/components/8starlabs/status-indicator.tsx` | Simpler dot+label badge | **Duplicate** — used by `EnhancedDataTable`, `DashboardStatusOverview` |
| 3 | `apps/jobs-ops/src/components/ui/StatusBadge.tsx` | Uppercase pill with tone | **App-local** — acceptable (different app) |

### Inline badge styling (not using any component)

14 files contain hand-rolled `inline-flex items-center rounded-{full|md} px-{2|3} py-{0.5|1} text-xs font-{medium|semibold}` badge patterns instead of using the canonical `StatusBadge` or `Badge` component.

**Proposed canonical site:** `apps/admissions/src/components/ui/StatusBadge.tsx`  
**Action:** Migrate `8starlabs/status-indicator.tsx` `StatusBadge` consumers to the canonical `ui/StatusBadge`. Consolidate `getStatusColor` into a single export from `@/lib/applicationStatusUi.ts`.

---

## Check 2: Date Formatters

**Severity:** Low  
**Finding:** Most files correctly import from `@/lib/dateFormat` (directly or via `@/lib/utils` re-export). However, 4 files bypass the canonical module by importing `date-fns` directly.

### Direct `date-fns` imports (bypassing `@/lib/dateFormat`)

| # | File | Import | Reason |
|---|------|--------|--------|
| 1 | `apps/admissions/src/components/ui/ActiveSessions.tsx` | `format, formatDistanceToNow` | Uses `format(new Date(...), 'PPP p')` and relative time |
| 2 | `apps/admissions/src/components/admin/UserActivityLog.tsx` | `formatDistanceToNow` | Relative time display |
| 3 | `apps/admissions/src/components/8starlabs/timeline.tsx` | `format` | Local `formatDate` wrapping `format(date, 'MMM d, yyyy')` |
| 4 | `apps/admissions/src/pages/admin/AuditTrail.tsx` | `format, formatDistanceToNow` | Both absolute and relative time |

### Local `formatDate` redefinitions

| # | File | Line | Notes |
|---|------|------|-------|
| 1 | `apps/admissions/src/lib/exportUtils.ts` | 98 | Wraps `_fmtDate` with empty-string fallback — acceptable thin adapter |
| 2 | `apps/admissions/src/components/8starlabs/timeline.tsx` | ~130 | Local function using raw `format()` — **duplicate** |
| 3 | `apps/admissions/src/components/admin/applications/ApplicationDetailInterview.tsx` | 15 | `formatDateTimeLocal` — datetime-local input adapter (distinct concern) |

**Proposed canonical site:** `apps/admissions/src/lib/dateFormat.ts`  
**Action:** Add `formatRelativeTime(iso)` and `formatAbsoluteTimestamp(iso, pattern)` to `@/lib/dateFormat` and migrate the 4 direct-import files.

---

## Check 3: Error Message Extractors

**Severity:** High  
**Finding:** `toError()` from `@/lib/toError` is only used in **4 files**. The remaining ~50+ error-handling sites use the inline pattern `error instanceof Error ? error.message : 'fallback'`.

### `toError()` adoption sites (correct)

| # | File |
|---|------|
| 1 | `apps/admissions/src/pages/admin/Intakes.tsx` |
| 2 | `apps/admissions/src/pages/admin/lib/settingsValidation.ts` |
| 3 | `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts` |
| 4 | `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/useWizardDraftLoader.ts` |

### Inline pattern sites (sampling — not exhaustive)

| # | File | Count |
|---|------|-------|
| 1 | `src/hooks/useUserManagement.ts` | 3 |
| 2 | `src/pages/student/applicationWizard/hooks/useMultiDraft.ts` | 3 |
| 3 | `src/pages/admin/Applications.tsx` | 3 |
| 4 | `src/pages/admin/Users.tsx` | 3 |
| 5 | `src/data/applications.ts` | 3 |
| 6 | `src/services/sessionService.ts` | 3 |
| 7 | `src/hooks/useDraftManager.ts` | 2 |
| 8 | `src/hooks/useEligibilityChecker.ts` | 2 |
| 9 | `src/hooks/useApplicationPaymentAction.ts` | 2 |
| 10 | `src/components/admin/BulkUserOperations.tsx` | 2 |
| 11 | `src/components/student/ApplicationSlipActions.tsx` | 2 |
| 12 | `src/hooks/useLencoWidget.ts` | 2 |
| 13 | `src/lib/slipService.ts` | 3 |
| 14 | `src/lib/storage.ts` | 2 |
| 15 | `src/lib/applicationSlipStorage.ts` | 2 |
| ... | *(~35 more files)* | 1–2 each |

### Additional `getErrorMessage` definitions

| # | File | Line | Notes |
|---|------|------|-------|
| 1 | `src/types/errors.ts` | 26 | `getErrorMessage(error: unknown): string` — generic extractor |
| 2 | `src/pages/admin/lib/settingsValidation.ts` | 105 | `getErrorMessage(error, fallback)` — uses `toError()` internally |
| 3 | `src/pages/auth/SignUpPage.tsx` | 100 | Local `getErrorMessage(error: Error | null)` |
| 4 | `src/pages/auth/SignInPage.tsx` | 163 | Local `getErrorMessage(error: Error | null)` |

**Proposed canonical site:** `apps/admissions/src/lib/toError.ts`  
**Action:** Migrate all `error instanceof Error ? error.message : '...'` sites to `toError(error).message`. The `getErrorMessage` in `types/errors.ts` should delegate to `toError()` or be deprecated.

---

## Check 4: Confirmation Dialog Patterns

**Severity:** None — roles are distinct  
**Finding:** Three patterns exist with clear separation of concerns:

| Pattern | File | Role |
|---------|------|------|
| `AlertDialog` | `src/components/ui/alert-dialog.tsx` | Radix UI primitive — headless building block |
| `ConfirmDialog` | `src/components/ui/ConfirmDialog.tsx` | Composed component — renders a full confirm modal |
| `useConfirmDialog` | `src/hooks/useConfirmDialog.tsx` | Imperative hook — returns a `confirm()` promise |

Consumers correctly use `AlertDialog` for custom compositions (e.g., `WithdrawEnrollDialogs`) and `ConfirmDialog`/`useConfirmDialog` for standard confirmations. **No duplication.**

---

## Check 5: Filter Panel Patterns

**Severity:** None  
**Finding:** One canonical `FiltersPanel` component exists at `src/components/admin/applications/FiltersPanel.tsx`. Admin pages (`Applications`, `Users`, `AuditTrail`) implement page-local filter state via reducers, which is appropriate since filter shapes differ per domain. Jobs-ops uses inline `useMemo` filtering — acceptable for its current scaffold state.

**No consolidation needed.**

---

## Check 6: Toast Helpers

**Severity:** None — unified  
**Finding:** Single canonical entry point:

- **Store:** `apps/admissions/src/components/ui/Toast.tsx` → exports `useToastStore`
- **Re-export hook:** `apps/admissions/src/hooks/useToast.ts` → re-exports + provides standalone `toast` object
- **Consumer pattern:** `const { success: showSuccess, error: showError } = useToastStore()`

All 32 consumer files destructure from `useToastStore()`. The `showSuccess`/`showError`/`showInfo` names are local destructuring aliases, not separate implementations. **No duplication.**

---

## Check 7: Document Storage Key Builders

**Severity:** None — consolidated  
**Finding:**

| File | Role |
|------|------|
| `backend/apps/common/storage.py:89` | **Canonical** `get_document_storage_key(document)` |
| `backend/apps/documents/document_storage_views.py:118` | Compatibility shim — delegates to `apps.common.storage.get_document_storage_key` |
| `backend/apps/applications/student_document_views.py:140` | Imports from `apps.common.storage` |
| `backend/apps/documents/tasks.py:215` | Imports from `apps.common.storage` |

The shim in `document_storage_views.py` exists for backward-compatible test patches. **No duplication.**

---

## Check 8: Sex Serializer Fields

**Severity:** None — consolidated  
**Finding:**

| File | Role |
|------|------|
| `backend/apps/common/serializer_fields.py:21` | **Canonical** `SexField` class |
| `backend/apps/accounts/serializers.py:10` | Imports `SexField` |
| `backend/apps/applications/serializers.py:21` | Imports `SexField` |

**No duplication.**

---

## Check 9: Payment Status Normalizers

**Severity:** Medium  
**Finding:** The canonical map is `PAYMENT_TO_APP_MAP` in `backend/apps/documents/payment_constants.py`. However, multiple backend files define inline tuples that partially duplicate this logic.

### Backend inline payment-status tuples (should reference constants)

| # | File | Line | Inline Tuple | Notes |
|---|------|------|--------------|-------|
| 1 | `backend/apps/documents/payment_service.py` | 130 | `('successful', 'verified', 'force_approved')` | Already-paid guard |
| 2 | `backend/apps/documents/payment_service.py` | 247 | `('successful', 'verified', 'force_approved')` | Duplicate of above |
| 3 | `backend/apps/documents/payment_service.py` | 544 | `"successful", "verified", "force_approved"` | Third instance |
| 4 | `backend/apps/documents/mobile_money_views.py` | 209 | `("successful", "verified", "force_approved")` | Already-paid guard |
| 5 | `backend/apps/applications/services.py` | 200 | `("verified", "paid", "force_approved", "deferred")` | Submission gate |
| 6 | `backend/apps/applications/admin_review_views.py` | 490 | `("successful", "force_approved", "verified", "paid", "deferred")` | Review gate |
| 7 | `backend/apps/applications/review_queue.py` | 17 | `{"verified", "paid", "force_approved", "deferred"}` | Queue filter |

### Frontend duplicate

| # | File | Line | Notes |
|---|------|------|-------|
| 1 | `src/components/admin/applications/ApplicationApprovalActions.tsx` | 27 | `normalizePaymentStatusForActions` — **duplicates** `normalizePaymentStatus` from `@/lib/paymentStatus.ts` with identical logic (missing `expired` case) |

### Backend `_ADMIN_REVIEW_STATUS_MAP` vs `PAYMENT_TO_APP_MAP`

`_ADMIN_REVIEW_STATUS_MAP` in `payment_helpers.py:450` maps in the **reverse direction** (frontend status → canonical payment status) and is a distinct concern. Not a duplicate.

**Proposed canonical site:**  
- Backend: Add `PAYMENT_VERIFIED_STATUSES` and `PAYMENT_RESOLVED_STATUSES` tuples to `payment_constants.py` and import everywhere.  
- Frontend: Remove `normalizePaymentStatusForActions` from `ApplicationApprovalActions.tsx` and import `normalizePaymentStatus` from `@/lib/paymentStatus`.

---

## Check 10: Idempotency Key Generators

**Severity:** Medium  
**Finding:** 4 distinct implementations of the same `crypto.randomUUID()` + fallback pattern.

| # | File | Line | Function Name | Scope |
|---|------|------|---------------|-------|
| 1 | `src/lib/paymentStatus.ts` | 197 | `generateIdempotencyKey(applicationId)` | Payment endpoints — **canonical** |
| 2 | `src/hooks/useApplicationSubmit.ts` | 28 | `generateIdempotencyKey()` | Submission endpoint — **duplicate** (no `applicationId` prefix) |
| 3 | `src/services/notifications.ts` | 89 | `createIdempotencyKey()` | Notification dedup — **duplicate** |
| 4 | `src/pages/student/applicationWizard/hooks/useWizardController.ts` | 1587 | Inline `crypto.randomUUID()` | Wizard submission — **duplicate** |

Additionally, `wizardControllerUtils.ts:32` has a `createGradeRowId()` that uses the same pattern but for a different purpose (row IDs, not idempotency) — this is acceptable.

**Proposed canonical site:** `apps/admissions/src/lib/idempotency.ts`  
**Action:** Create a single `generateIdempotencyKey(prefix?: string)` function. All 4 sites should import from it.

---

## Check 11: File Upload Helpers

**Severity:** None — layered architecture  
**Finding:** The upload stack is intentionally layered:

| Layer | File | Role |
|-------|------|------|
| UI primitive | `src/components/ui/FileUpload.tsx` | Dropzone + progress UI |
| Service | `src/lib/storage.ts` | `uploadApplicationFile()`, `uploadFile()` — R2 signed-URL workflow |
| Hook | `src/pages/student/applicationWizard/hooks/useApplicationFileUploads.ts` | Wizard-specific state machine wrapping `uploadApplicationFile` |

All upload paths converge through `@/lib/storage.ts`. **No duplication.**

---

## Check 12: Route Preload vs Speculative Prefetch

**Severity:** None — distinct concerns  
**Finding:**

| File | Concern |
|------|---------|
| `src/lib/routePreload.ts` | **Chunk preloading** — lazy-imports route-level JS bundles (auth shell, student workspace, admin workspace) |
| `src/lib/speculativePrefetch.ts` | **Data + orchestration** — prefetches React Query data (catalog, profile) AND calls `routePreload` functions for chunk loading |

`speculativePrefetch.ts` imports and delegates to `routePreload.ts` (line 16–19). They are complementary layers, not duplicates. **No consolidation needed.**

---

## Priority Action Plan

| Priority | Check | Effort | Impact |
|----------|-------|--------|--------|
| P1 | #3 Error extractors | Medium (50+ sites) | High — consistency, debuggability |
| P2 | #10 Idempotency keys | Low (4 sites) | Medium — correctness risk if fallbacks diverge |
| P2 | #9 Payment status tuples | Low (7 backend sites) | Medium — drift risk on status additions |
| P3 | #1 Status badge / getStatusColor | Medium (4+14 sites) | Low — visual consistency |
| P3 | #2 Date formatters | Low (4 sites) | Low — already mostly canonical |

---

## Appendix: Jobs-Ops Isolation

Jobs-ops (`apps/jobs-ops/src/`) maintains its own:
- `StatusBadge` component (different tone vocabulary: `neutral|primary|success|warning|danger|insight`)
- `@/lib/format.ts` with `formatDateTime`, `formatRelativeTime`, `formatPercentage`
- Single error extraction site in `services/api/client.ts`

These are **app-local by design** per monorepo rules and do not constitute cross-app duplication requiring consolidation.
