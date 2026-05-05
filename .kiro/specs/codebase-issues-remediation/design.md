# Design Document: Codebase Issues Remediation

## Overview

This design addresses 18 requirements across 5 phases to close all gaps identified in the frontend, backend, and database analysis. The work is prioritized: Phase 1 fixes jobs-ops production blockers (error handling, auth refresh, testing, accessibility), Phase 2 remediates backend audit findings (envelope consistency, rate limiting, security), Phase 3 handles database hygiene (stale scripts, N+1 queries), Phase 4 hardens the jobs-ops frontend (loading states, dirty state, chunk reload), and Phase 5 improves the admissions frontend (API client split, error boundaries).

## Architecture

### Phase 1: Jobs-Ops Critical Path

```
┌─────────────────────────────────────────────────────┐
│ Jobs-Ops App Shell                                   │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ErrorBoundary (app-level)                        │ │
│ │ ┌───────────────────────────────────────────────┐│ │
│ │ │ AuthContext (session + refresh interceptor)    ││ │
│ │ │ ┌─────────────────────────────────────────────┤│ │
│ │ │ │ QueryClientProvider                         ││ │
│ │ │ │ ┌───────────────────────────────────────────┤│ │
│ │ │ │ │ RouterProvider (lazy routes)              ││ │
│ │ │ │ │   ├── Feature pages with loading states  ││ │
│ │ │ │ │   └── ErrorDisplay on query errors       ││ │
│ │ │ │ └──────────────────────────────────────────┘│ │
│ │ │ └────────────────────────────────────────────┘│ │
│ │ └──────────────────────────────────────────────┘│ │
│ └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Phase 2: Backend Envelope + Security

```
Request → RateLimitMiddleware → AuditMiddleware (with entity_id) → View
                                                                    │
                                                          ┌─────────┴──────────┐
                                                          │ EnvelopeRenderer   │
                                                          │ {"success": true,  │
                                                          │  "data": ...}      │
                                                          └────────────────────┘
```

## Components and Interfaces

### 1. Jobs-Ops ErrorBoundary and ErrorDisplay (Requirement 1)

**New files:**
- `apps/jobs-ops/src/components/ui/ErrorBoundary.tsx`
- `apps/jobs-ops/src/components/ui/ErrorDisplay.tsx`

**ErrorBoundary** — Class component following the same pattern as the admissions app:

```tsx
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  level?: 'page' | 'section';
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}
```

- Catches errors via `componentDidCatch`
- Renders `ErrorDisplay` as default fallback
- Logs to console and GlitchTip (if `@sentry/react` is configured)
- Page-level variant shows full-page fallback; section-level shows inline

**ErrorDisplay** — Functional component:

```tsx
interface ErrorDisplayProps {
  message?: string;
  variant?: 'page' | 'section' | 'inline';
  onRetry?: () => void;
  onGoBack?: () => void;
  showSupport?: boolean;
}
```

- Returns `null` for empty/whitespace-only messages (matching admissions convention)
- Uses `role="alert"` only when message is non-empty
- Retry button calls `onRetry` or reloads the page
- Go-back button calls `onGoBack` or `history.back()`

**Integration:** Wrap `<Outlet />` in `JobsOpsShell.tsx` with `<ErrorBoundary level="page">`.

### 2. Jobs-Ops Auth Refresh Interceptor (Requirement 2)

**Modified file:** `apps/jobs-ops/src/services/api/client.ts`

Port the 401 intercept-refresh-retry logic from the admissions API client:

```typescript
// Shared refresh state
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // Deduplicate: if a refresh is already in-flight, wait for it
  if (refreshPromise) return refreshPromise;
  
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });
      if (!res.ok) return false;
      // Capture new CSRF token from response
      const newCsrf = res.headers.get('X-CSRF-Token');
      if (newCsrf) setCsrfToken(newCsrf);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  
  return refreshPromise;
}
```

**CSRF token management** — Add in-memory CSRF store:

```typescript
let csrfToken: string | null = null;
export function getCsrfToken() { return csrfToken; }
export function setCsrfToken(token: string) { csrfToken = token; }
export function clearCsrfToken() { csrfToken = null; }
```

Capture CSRF token from `X-CSRF-Token` response header on every API response.

**403 CSRF recovery** — On 403 with CSRF error, fetch `GET /api/v1/auth/session/?refresh_csrf=1` to get a fresh token, then retry.

### 3. Jobs-Ops Session Re-validation (Requirement 3)

**New file:** `apps/jobs-ops/src/hooks/useVisibilityRevalidation.ts`

```typescript
export function useVisibilityRevalidation(onInvalid: () => void) {
  const lastCheckRef = useRef(0);
  
  useEffect(() => {
    const handler = async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheckRef.current < 30_000) return; // throttle 30s
      lastCheckRef.current = Date.now();
      
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/session/`, {
          credentials: 'include',
        });
        if (!res.ok) onInvalid();
      } catch {
        // Network error — don't invalidate, user may be offline
      }
    };
    
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [onInvalid]);
}
```

**Integration:** Call in `AuthContext` provider, passing the logout/redirect function as `onInvalid`.

### 4. Jobs-Ops Test Setup (Requirement 4)

**New/modified files:**
- `apps/jobs-ops/package.json` — add Vitest, `@testing-library/react`, `@testing-library/jest-dom` as dev dependencies
- `apps/jobs-ops/vitest.config.ts` — Vitest config with jsdom environment
- `apps/jobs-ops/tests/unit/apiClient.test.ts` — API client tests
- `apps/jobs-ops/tests/unit/authContext.test.ts` — Auth context tests
- `apps/jobs-ops/tests/unit/router.test.ts` — Router config tests

**API client tests:**
- 401 triggers refresh and retries original request
- Concurrent 401s deduplicate refresh calls
- Failed refresh clears auth and redirects
- CSRF token captured from response headers
- 403 CSRF error triggers recovery flow
- Envelope unwrapping extracts `data` field

**Auth context tests:**
- Session bootstrap calls `GET /api/v1/auth/session/?refresh_csrf=1`
- Logout clears React Query cache and CSRF token
- Auth failure callback redirects to sign-in

**Router tests:**
- All defined routes resolve to components
- Protected routes redirect unauthenticated users

### 5. Jobs-Ops Accessibility Baseline (Requirement 5)

**Modified files:**
- `apps/jobs-ops/src/app/layout/JobsOpsShell.tsx` — Add ARIA landmarks
- `apps/jobs-ops/src/app/layout/Sidebar.tsx` — Add keyboard navigation, focus indicators
- `apps/jobs-ops/src/app/layout/Header.tsx` — Add accessible labels
- `apps/jobs-ops/src/components/ui/CommandPalette.tsx` — Add focus trap

**Shell landmarks:**
```tsx
<div className="flex h-screen">
  <nav aria-label="Main navigation">{/* Sidebar */}</nav>
  <main id="main-content" role="main">{/* Outlet */}</main>
  <aside aria-label="Platform info">{/* Right panel */}</aside>
</div>
```

**Sidebar keyboard navigation:**
- All nav items focusable via Tab
- Active item indicated with `aria-current="page"`
- Collapse toggle has `aria-expanded` and `aria-label`

**Command palette focus trap:**
- On open: focus moves to search input
- Tab cycles within the palette (search → results → close)
- Escape closes and returns focus to trigger button
- `role="dialog"` with `aria-modal="true"` and `aria-label`

**Icon buttons:**
- All icon-only buttons get `aria-label` describing the action
- Sidebar quick stats get `aria-label` for screen readers

### 6. API Envelope Consistency (Requirement 6)

**Modified files:**
- `backend/apps/accounts/session_views.py` — Wrap unauthenticated response in envelope
- `backend/apps/catalog/views.py` — Ensure all list views use envelope renderer
- `backend/apps/analytics/views.py` — Wrap responses in envelope
- `backend/apps/integrations/views.py` — Wrap responses in envelope

**Approach:** The DRF custom renderer already handles envelope wrapping for most views. The issue is that some views bypass the renderer by returning `Response(data)` directly instead of letting the renderer wrap it. Fix by ensuring all views use the standard renderer pipeline.

For `SessionView.get()` unauthenticated case:
```python
# Before (non-envelope):
return Response({"authenticated": False})

# After (envelope):
return Response({"success": True, "data": {"authenticated": False}})
```

For catalog/analytics/integrations views, ensure they use the `EnvelopeRenderer` by not overriding `renderer_classes` and returning data through the standard DRF response pipeline.

### 7. Payment Endpoint Rate Limiting (Requirement 7)

**Modified files:**
- `backend/apps/documents/views.py` — Add throttle classes to payment views

**Approach:** Use DRF's built-in `UserRateThrottle` with custom scopes:

```python
from rest_framework.throttling import UserRateThrottle

class PaymentInitiateThrottle(UserRateThrottle):
    scope = 'payment_initiate'
    rate = '5/min'

class PaymentVerifyThrottle(UserRateThrottle):
    scope = 'payment_verify'
    rate = '10/min'

class MobileMoneyThrottle(UserRateThrottle):
    scope = 'mobile_money_initiate'
    rate = '5/min'
```

Add to settings:
```python
REST_FRAMEWORK = {
    ...
    'DEFAULT_THROTTLE_RATES': {
        ...
        'payment_initiate': '5/min',
        'payment_verify': '10/min',
        'mobile_money_initiate': '5/min',
    }
}
```

Apply to views:
```python
class PaymentInitiateView(APIView):
    throttle_classes = [PaymentInitiateThrottle]
    ...
```

### 8. Remove IsAuthenticatedOrDebug (Requirement 8)

**Modified files:**
- `backend/apps/common/permissions.py` — Remove `IsAuthenticatedOrDebug` class
- All views referencing it — Replace with `IsAuthenticated`

**Approach:** Search for all usages, replace with `IsAuthenticated`, then delete the class. Run tests to verify no breakage.

### 9. Fix Idempotency Task Name (Requirement 9)

**Modified file:** `backend/config/settings/base.py`

```python
# Before:
'cleanup-idempotency-keys': {
    'task': 'cleanup_idempotency_keys',
    ...
}

# After:
'cleanup-idempotency-keys': {
    'task': 'apps.common.tasks.cleanup_idempotency_keys',
    ...
}
```

### 10. AuditMiddleware Entity ID (Requirement 10)

**Modified file:** `backend/apps/common/middleware.py`

Add entity ID extraction in `AuditMiddleware.process_response()`:

```python
import re

ENTITY_ID_PATTERN = re.compile(r'/api/v1/\w+/([0-9a-f-]+)/')

def _extract_entity_id(self, path: str) -> str | None:
    match = self.ENTITY_ID_PATTERN.search(path)
    return match.group(1) if match else None
```

Call in the audit log creation:
```python
entity_id = self._extract_entity_id(request.path)
AuditLog.objects.create(..., entity_id=entity_id)
```

### 11. ReadOnlyMiddleware Optimization (Requirement 11)

**Modified file:** `backend/apps/common/middleware.py`

```python
class ReadOnlyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        # Cache the env var check at init time
        self.is_read_only = os.environ.get('READ_ONLY_MODE', '').lower() in ('true', '1', 'yes')

    def __call__(self, request):
        if not self.is_read_only:
            return self.get_response(request)  # Fast path: no DB query
        # ... existing write-blocking logic
```

### 12. Archive Stale SQL Scripts (Requirement 12)

**Actions:**
- Create `backend/scripts/archive/` directory
- Move 7 stale scripts to archive
- Add `backend/scripts/archive/README.md`
- Add re-run guard to `idempotency_redesign.sql`:

```sql
-- Re-run guard: only drop if table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'old_idempotency_keys') THEN
        DROP TABLE old_idempotency_keys;
    END IF;
END $$;
```

### 13. N+1 Query Optimization (Requirement 13)

**Modified files:**
- `backend/apps/applications/admin_views.py` — Add `select_related`/`prefetch_related` to list queryset
- `backend/apps/applications/student_views.py` — Add `select_related` to student views
- `backend/apps/applications/interview_views.py` — Add `select_related`
- `backend/apps/applications/document_views.py` — Add `select_related`
- `backend/apps/jobs/views.py` — Add `select_related` to job application list

**Pattern:**
```python
class ApplicationListView(ListAPIView):
    def get_queryset(self):
        return Application.objects.select_related(
            'program', 'intake', 'user', 'user__profile'
        ).prefetch_related(
            'documents', 'conditions', 'amendments'
        ).filter(...)
```

### 14-16. Jobs-Ops Loading States, Dirty State, Chunk Reload (Requirements 14-16)

**Loading states** — New component `apps/jobs-ops/src/components/ui/PageSkeleton.tsx`:
```tsx
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-8 bg-zinc-800 rounded w-1/3" />
      <div className="h-4 bg-zinc-800 rounded w-2/3" />
      <div className="grid grid-cols-3 gap-4 mt-6">
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-zinc-800 rounded" />)}
      </div>
    </div>
  );
}
```

Apply to all feature pages that use React Query — show `PageSkeleton` when `isLoading`, `ErrorDisplay` when `isError`.

**Dirty state protection** — New hook `apps/jobs-ops/src/hooks/useUnsavedChanges.ts`:
```tsx
export function useUnsavedChanges(isDirty: boolean) {
  // beforeunload handler
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
  
  // React Router blocker
  const blocker = useBlocker(isDirty);
  // Render confirmation dialog when blocker is active
}
```

**Chunk auto-reload** — In `apps/jobs-ops/src/main.tsx`:
```tsx
// Handle stale chunk errors after deployment
window.addEventListener('error', (event) => {
  if (
    event.message?.includes('Failed to fetch dynamically imported module') ||
    event.message?.includes('Loading chunk')
  ) {
    const reloaded = sessionStorage.getItem('chunk-reload');
    if (!reloaded) {
      sessionStorage.setItem('chunk-reload', '1');
      window.location.reload();
    }
  }
});
```

### 17. Split Admissions API Client (Requirement 17)

**New files:**
- `apps/admissions/src/services/httpClient.ts` — Core fetch wrapper with timeout, retry, base URL
- `apps/admissions/src/services/authInterceptor.ts` — 401 refresh, 403 CSRF recovery, promise dedup
- `apps/admissions/src/services/csrfManager.ts` — In-memory CSRF token store, capture, recovery

**Modified file:**
- `apps/admissions/src/services/client.ts` — Reduced to re-exports from the three modules

All existing imports from `services/client` continue to work via re-exports.

### 18. Admissions Feature-Level Error Boundaries (Requirement 18)

**Modified files:** Wrap key feature sections in existing `ErrorBoundary`:

- Wizard steps: Each step component wrapped in `<ErrorBoundary level="section">`
- Dashboard cards: Each card section wrapped
- Admin panels: Review panel, metrics panel wrapped

**Pattern:**
```tsx
<ErrorBoundary level="section" onError={reportToGlitchTip}>
  <EducationStep {...props} />
</ErrorBoundary>
```

## Data Models

No new database tables are introduced. All changes use existing tables, in-memory state, or configuration.

### Modified Interfaces

**DRF throttle rates added to settings:**
```python
'DEFAULT_THROTTLE_RATES': {
    'payment_initiate': '5/min',
    'payment_verify': '10/min',
    'mobile_money_initiate': '5/min',
}
```

**AuditLog entity_id population:**
- Existing `entity_id` field now populated from URL path segments
- No schema change required

## Error Handling

### Jobs-Ops ErrorBoundary
- Catches all unhandled errors in the component tree
- Renders fallback UI with retry action
- Reports to GlitchTip if configured, otherwise console.error only
- Never throws — the boundary itself must be bulletproof

### Auth Refresh Interceptor
- Refresh failure: clear auth state, redirect to sign-in
- Network error during refresh: treat as failure, redirect
- Concurrent refresh deduplication prevents race conditions

### Rate Limiting
- 429 responses include `Retry-After` header
- Frontend should display user-friendly "too many requests" message

### N+1 Query Fixes
- If `select_related` field doesn't exist on a record (nullable FK), Django handles gracefully
- No risk of breaking existing queries — `select_related` only adds JOINs

## Testing Strategy

### Jobs-Ops Tests (Requirement 4)
- **Framework:** Vitest with jsdom environment (matching admissions setup)
- **Dependencies:** `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `msw` for API mocking
- **Test files:**
  - `apps/jobs-ops/tests/unit/apiClient.test.ts` — 401 refresh, CSRF, envelope unwrapping
  - `apps/jobs-ops/tests/unit/authContext.test.ts` — Session bootstrap, logout
  - `apps/jobs-ops/tests/unit/router.test.ts` — Route resolution, protected routes
  - `apps/jobs-ops/tests/unit/errorBoundary.test.ts` — Error catching, fallback rendering
  - `apps/jobs-ops/tests/unit/errorDisplay.test.ts` — Empty message returns null, retry action

### Backend Tests
- **Envelope consistency:** Add tests to `backend/tests/unit/` verifying envelope format for SessionView, catalog, analytics, integrations views
- **Rate limiting:** Add tests verifying 429 responses after exceeding limits
- **IsAuthenticatedOrDebug removal:** Verify no tests depend on debug auth bypass
- **AuditMiddleware entity_id:** Test extraction from various URL patterns
- **ReadOnlyMiddleware:** Test fast path when env var is unset
- **Idempotency task name:** Verify task is discoverable by Celery

### N+1 Query Verification
- Use Django's `assertNumQueries` in tests for list endpoints
- Verify query count is O(1) not O(N) for list views with related data
