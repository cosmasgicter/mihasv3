# Design Document: tech-debt-remediation

## Overview

This design addresses 30 tech debt items identified during a full codebase audit, grouped into 17 requirements. The changes span the admissions frontend, Django backend, spec directory, and environment configuration. No new features are introduced — this is purely cleanup, hardening, and deduplication.

### Scope

1. Fix 2 critical runtime bugs (error boundary reporting, contact form no-op)
2. Delete 4 dead frontend files and 8 unused npm packages
3. Remove stale Supabase comments and deprecated API surfaces
4. Harden backend error handling (transactions, logging, exception leakage)
5. Deduplicate backend view logic (document tasks, status transitions)
6. Clean up stale specs, env config, and add completion markers

### Out of Scope

- New backend endpoints (contact form uses existing notification endpoint)
- Frontend architecture refactoring beyond the identified items
- Database schema changes

## Components and Interfaces

### Component 1: Error Boundary Fix (Req 1)

**File:** `apps/admissions/src/components/ui/EnhancedErrorHandling.tsx`

Replace `fetch('/log-error')` in `componentDidCatch` with `reportError()` from `errorReporter.ts`. The `reportError()` function already batches errors and POSTs to `/api/v1/errors/report/`. Wrap in try-catch for silent degradation.

### Component 2: Contact Form Fix (Req 2)

**File:** `apps/admissions/src/pages/ContactPage.tsx`

Replace the no-op `console.log` handler with `apiClient.request('/notifications/', { method: 'POST', body: ... })`. Add `submitState` for success/error feedback. Uses existing notification endpoint — no new backend endpoint needed.

### Component 3: Dead Code Removal (Reqs 3, 4, 5)

**Files to delete (Req 3):**
- `apps/admissions/src/services/documentExtraction.ts`
- `apps/admissions/src/utils/lazy-imports.ts`
- `apps/admissions/src/utils/animationOptimization.ts`
- `apps/admissions/src/utils/performance.ts`

**Stale comments to remove (Req 4):**
- `EnhancedErrorHandling.tsx` — remove "Supabase error format" comment
- `pages/student/Dashboard.tsx` — remove "replaces Supabase Realtime" comments
- `hooks/useRealtime.ts` — remove Supabase migration comments
- `contexts/RealtimeStatusContext.tsx` — remove Supabase migration comments

**Deprecated fields to remove (Req 5):**
- `interviews.ts`: Remove `application_id` from `ScheduleInterviewData`, keep `applicationId`
- `EmptyState.tsx`: Remove `title` prop from `EmptyStateProps`, keep `heading`

### Component 4: Bulk Status Transaction (Req 6)

**File:** `backend/apps/applications/views.py` — `ApplicationBulkStatusView.post()`

Wrap the application update loop in `transaction.atomic()` with `select_for_update()` on each application. If any update fails, the entire batch rolls back.

### Component 5: Document Task Deduplication (Req 7)

Extract `_enqueue_document_task(application, task_type, task_func, request)` shared helper from AcceptanceLetterView and FinanceReceiptView. Handles idempotency check, task dispatch, audit logging, and response construction.

### Component 6: Status Transition Helper (Req 13)

**New file:** `backend/apps/applications/services.py`

`transition_application_status(application, new_status, changed_by, notes, ip_address, user_agent)` — shared by ReviewView and BulkStatusView. Saves the application, creates ApplicationStatusHistory record, returns old_status.

### Component 7: Error Handling Hardening (Reqs 10, 11)

**Accounts views (Req 10):** Replace bare `except Exception: pass` with `except Exception: logger.warning("...", exc_info=True)` in logout JTI blacklisting and token rotation.

**Documents views (Req 11):** Replace `return Response({"error": str(e)})` with generic `"Invalid file format"` message + `logger.exception()`.

### Component 8: Email Constant Centralization (Req 12)

Use `settings.ERROR_ALERT_EMAIL` (already defined in `base.py`) instead of hardcoded `***REMOVED***` in 3 files: `exceptions.py`, `error_views.py`, `tasks.py`.

### Component 9: Dependency Cleanup (Reqs 8, 9)

**Backend:** Remove `djangorestframework-simplejwt` from `requirements.txt`
**Frontend:** Remove 8 packages from `package.json`: `exceljs`, `xlsx`, `form-data`, `dotenv`, `react-window`, `@types/react-window`, `@tsparticles/react`, `@tsparticles/slim`

### Component 10: Stale Artifact Cleanup (Reqs 14, 15, 16, 17)

**Stale test (Req 14):** Rename `test_scope_limits_match_arcjet_config` to `test_scope_limits_match_rate_limit_config`

**Stale specs to delete (Req 15):** 6 directories referencing Supabase

**Env config (Req 16):** Remove `ARCJET_KEY`, consolidate SMTP naming, separate frontend/backend vars

**Completion markers (Req 17):** Add `"status": "completed"` to `.config.kiro` for finished specs

## Correctness Properties

### Property 1: Error boundary reports reach the monitoring pipeline

For any error caught by componentDidCatch, the Error_Boundary SHALL call reportError() which POSTs to /api/v1/errors/report/. The source code SHALL NOT contain any reference to /log-error.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Bulk status updates are atomic

For any batch of N application status updates, either all N are committed or zero. No partial state.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 3: No internal exception messages in API responses

For any exception in Documents_Views, the response SHALL NOT contain str(e). Generic message only.

**Validates: Requirements 11.1, 11.2, 11.3**

### Property 4: Dead code files do not exist

After remediation, the 4 dead files SHALL NOT exist and the frontend SHALL build.

**Validates: Requirements 3.1-3.5**

### Property 5: Unused dependencies removed

package.json SHALL NOT list the 8 removed packages. requirements.txt SHALL NOT list djangorestframework-simplejwt.

**Validates: Requirements 8.1, 9.1-9.7**

### Property 6: Fallback email comes from settings

All alert email paths SHALL use settings.ERROR_ALERT_EMAIL, not hardcoded strings.

**Validates: Requirements 12.1, 12.2**

### Property 7: No bare except-pass patterns in accounts views

Every except Exception block in accounts/views.py SHALL contain a logger call. No bare pass.

**Validates: Requirements 10.1, 10.2, 10.3**

## Testing Strategy

### Frontend (Vitest + fast-check)
- Property 1: Verify source does not contain /log-error
- Property 4: Verify dead files dont exist
- Property 5: Verify removed packages not in package.json
- Unit: Contact form calls apiClient with correct payload

### Backend (pytest + hypothesis)
- Property 2: Verify transaction.atomic wraps bulk updates
- Property 3: Verify generic errors, not str(e)
- Property 6: Verify settings.ERROR_ALERT_EMAIL usage
- Property 7: Inspect source for bare except:pass

## Error Handling

| Component | Error Scenario | Handling |
|-----------|---------------|----------|
| Error Boundary | reportError() throws | Silent catch, fallback UI unaffected |
| Contact Form | Network failure | Show error message, preserve form data |
| Bulk Status | Single app fails | transaction.atomic() rolls back batch |
| Documents View | Validation exception | Generic error + server-side log |
| Accounts Views | JTI blacklist failure | logger.warning() + continue logout |
