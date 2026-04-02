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

**Current (broken):**
```tsx
componentDidCatch(error, errorInfo) {
  fetch('/log-error', { method: 'POST', body: JSON.stringify({ error: error.message }) })
}
```

**Fixed:**
```tsx
import { reportError } from '@/lib/errorReporter'

componentDidCatch(error, errorInfo) {
  try {
    reportError(error instanceof Error ? error : new Error(String(error)))
  } catch {
    // Silent degradation — don't break the fallback UI
  }
}
```

The `reportError()` function already batches errors and POSTs to `/api/v1/errors/report/`. No new wiring needed.

### Component 2: Contact Form Fix (Req 2)

**File:** `apps/admissions/src/pages/ContactPage.tsx`

Replace the no-op `console.log` handler with a real submission using `apiClient`:

```tsx
import { apiClient } from '@/services/client'

const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

const onSubmit = async (data: ContactFormData) => {
  setSubmitState('sending')
  try {
    await apiClient.request('/notifications/', {
      method: 'POST',
      body: JSON.stringify({
        user_id: null,
        title: `Contact: ${data.subject}`,
        message: `From: ${data.name} <${data.email}>\n\n${data.message}`,
        type: 'info',
      }),
    })
    setSubmitState('success')
    reset()
  } catch {
    setSubmitState('error')
  }
}
```

Uses the existing `/api/v1/notifications/` endpoint. The notification will be created as a system notification visible to admins. No new backend endpoint needed.

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

```python
from django.db import transaction

def post(self, request):
    # ... validation ...
    with transaction.atomic():
        for app_id in application_ids:
            application = Application.objects.select_for_update().get(id=app_id)
            application.status = new_status
            application.save(update_fields=['status', 'updated_at'])
            ApplicationStatusHistory.objects.create(...)
    return Response({"updated": len(application_ids)})
```

### Component 5: Document Task Deduplication (Req 7)

**New helper in:** `backend/apps/applications/views.py` (module-level)

```python
def _enqueue_document_task(application, task_type, task_func, request):
    """Shared logic for AcceptanceLetterView and FinanceReceiptView."""
    idempotency_key = f"{task_type}:{application.id}"
    existing = IdempotencyKey.objects.filter(key=idempotency_key).first()
    if existing:
        return Response(existing.response_json)
    
    result = task_func.delay(str(application.id))
    response_data = {
        "task_id": result.id,
        "application_id": str(application.id),
        "status": "queued",
    }
    IdempotencyKey.objects.create(key=idempotency_key, endpoint=task_type, response_json=response_data)
    # ... audit log ...
    return Response(response_data, status=201)
```

Both views call `_enqueue_document_task()` with their specific `task_type` and `task_func`.

### Component 6: Status Transition Helper (Req 13)

**New file:** `backend/apps/applications/services.py`

```python
def transition_application_status(application, new_status, changed_by, notes=None, ip_address=None, user_agent=None):
    """Shared status transition logic for ReviewView and BulkStatusView."""
    old_status = application.status
    application.status = new_status
    application.save(update_fields=['status', 'updated_at'])
    ApplicationStatusHistory.objects.create(
        application=application,
        status=new_status,
        old_status=old_status,
        new_status=new_status,
        changed_by=changed_by,
        notes=notes,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return old_status
```

### Component 7: Error Handling Hardening (Reqs 10, 11)

**Accounts views pattern (Req 10):**
```python
# Before (B4):
except Exception:
    pass

# After:
except Exception:
    logger.warning("JTI blacklist failed during logout", exc_info=True)
```

**Documents views pattern (Req 11):**
```python
# Before (B7):
except Exception as e:
    return Response({"error": str(e)}, status=400)

# After:
except Exception:
    logger.exception("File validation failed")
    return Response({"success": False, "error": "Invalid file format"}, status=400)
```

### Component 8: Email Constant Centralization (Req 12)

`settings.ERROR_ALERT_EMAIL` already exists in `backend/config/settings/base.py` (reads from `ERROR_ALERT_EMAIL` env var with fallback `ops@mihas.edu.zm`). The three files hardcoding `admin@mihas.edu.zm` should use `settings.ERROR_ALERT_EMAIL` instead:

- `backend/apps/common/exceptions.py`
- `backend/apps/common/error_views.py`
- `backend/apps/common/tasks.py`

### Component 9: Dependency Cleanup (Reqs 8, 9)

**Backend (`requirements.txt`):** Remove `djangorestframework-simplejwt`

**Frontend (`package.json`):** Remove 8 packages:
- `exceljs`, `xlsx`, `form-data`, `dotenv`
- `react-window`, `@types/react-window`
- `@tsparticles/react`, `@tsparticles/slim`

### Component 10: Stale Artifact Cleanup (Reqs 14, 15, 16, 17)

**Stale test (Req 14):** Rename `test_scope_limits_match_arcjet_config` → `test_scope_limits_match_rate_limit_config`

**Stale specs to delete (Req 15):**
- `.kiro/specs/admin-dashboard-fixes/`
- `.kiro/specs/bun-vercel-runtime-forensics/`
- `.kiro/specs/supabase-auth-removal/`
- `.kiro/specs/supabase-complete-removal/`
- `.kiro/specs/supabase-exit-migration/`
- `.kiro/specs/supabase-remnant-purge/`

**Env config (Req 16):**
- Remove `ARCJET_KEY` from root `.env.example`
- Rename `SMTP_*` to `ZOHO_SMTP_*` for consistency
- Move backend-only vars to `backend/.env.example`

**Completion markers (Req 17):** Add `"status": "completed"` to `.config.kiro` for finished specs.

## Correctness Properties

### Property 1: Error boundary reports reach the monitoring pipeline

*For any* error caught by `componentDidCatch`, the Error_Boundary SHALL call `reportError()` which POSTs to `/api/v1/errors/report/`. The source code SHALL NOT contain any reference to `/log-error`.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Bulk status updates are atomic

*For any* batch of N application status updates processed by `ApplicationBulkStatusView.post()`, either all N applications are updated and N `ApplicationStatusHistory` records are created, or zero changes are committed. No partial state is possible.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 3: No internal exception messages in API responses

*For any* exception raised in `Documents_Views`, the HTTP response body SHALL NOT contain the exception's `str(e)` message. The response SHALL contain a generic error message. The full exception SHALL be logged server-side.

**Validates: Requirements 11.1, 11.2, 11.3**

### Property 4: Dead code files do not exist

*After remediation*, the 4 dead code files SHALL NOT exist on disk, and the frontend SHALL build and pass all tests without import errors.

**Validates: Requirements 3.1-3.5**

### Property 5: Unused dependencies removed

*After remediation*, `package.json` SHALL NOT list any of the 8 removed packages, `requirements.txt` SHALL NOT list `djangorestframework-simplejwt`, and both frontend and backend SHALL build/pass tests.

**Validates: Requirements 8.1, 9.1-9.7**

### Property 6: Fallback email comes from settings

*For any* code path that sends an alert email, the recipient SHALL be resolved from `settings.ERROR_ALERT_EMAIL`, not from a hardcoded string literal.

**Validates: Requirements 12.1, 12.2**

### Property 7: No bare except-pass patterns in accounts views

*For any* `except Exception` block in `backend/apps/accounts/views.py`, the block SHALL contain a `logger.warning()` or `logger.exception()` call. No bare `pass` after `except Exception`.

**Validates: Requirements 10.1, 10.2, 10.3**

## Testing Strategy

### Frontend Tests (Vitest + fast-check)
- Property 1: Verify `EnhancedErrorHandling.tsx` source does not contain `/log-error`
- Property 4: Verify dead files don't exist (fs check in test)
- Property 5: Verify removed packages not in `package.json`
- Unit: Contact form submission calls apiClient with correct payload

### Backend Tests (pytest + hypothesis)
- Property 2: Mock DB to verify `transaction.atomic()` wraps bulk updates
- Property 3: Verify Documents views return generic errors, not `str(e)`
- Property 6: Verify all alert email paths use `settings.ERROR_ALERT_EMAIL`
- Property 7: Inspect source of accounts views for bare `except: pass`
- Unit: Status transition helper produces correct history records

## Error Handling

| Component | Error Scenario | Handling |
|-----------|---------------|----------|
| Error Boundary | `reportError()` throws | Silent catch — fallback UI unaffected |
| Contact Form | Network failure | Show error message, preserve form data |
| Bulk Status | Single app fails | `transaction.atomic()` rolls back entire batch |
| Documents View | File validation exception | Generic error response + server-side log |
| Accounts Views | JTI blacklist failure | `logger.warning()` + continue logout flow |
