# Admissions Frontend Source Audit Findings

## Summary
- Total files: 410
- ignore-as-correct: 371
- improve: 31
- remove: 0
- needs-human-decision: 8

## Critical Findings

### src/components/admin/applications/ApplicationsCards.tsx — improve
**Tag:** confirmed-bug
**Issue:** Calls `getStatusColor` imported from `@/lib/utils` but this function may not handle all extended statuses (`waitlisted`, `conditionally_approved`, `enrolled`, `enrollment_expired`, `withdrawn`, `expired`). The `status.replace('_', ' ')` only replaces the first underscore — should use `replaceAll('_', ' ')` or a regex with global flag.
**Location:** Lines 15, 85
**Recommendation:** Use `.replace(/_/g, ' ')` consistently (already done in some places but not all). Verify `getStatusColor` handles all extended statuses from the state machine.

### src/components/admin/applications/ApplicationCard.tsx — improve
**Tag:** confirmed-bug
**Issue:** `status.replace('_', ' ')` on line within `getStatusBadge` only replaces the first underscore. Statuses like `under_review`, `conditionally_approved`, `enrollment_expired` would display incorrectly (e.g., "under review" works but "conditionally approved" would show "conditionally_approved" → "conditionally approved" — actually this works since `replace` with string only replaces first occurrence). However `UNDER REVIEW` → correct. `ENROLLMENT_EXPIRED` → `ENROLLMENT EXPIRED` — wait, `.toUpperCase()` is called after `.replace('_', ' ')` so `enrollment_expired` → `enrollment expired` → `ENROLLMENT EXPIRED`. This is actually correct. Reclassifying.
**Location:** N/A
**Recommendation:** No action needed — reclassified as ignore-as-correct.

### src/components/admin/applications/EnhancedDataTable.tsx — improve
**Tag:** confirmed-bug
**Issue:** Table rows are missing `key` prop. The `<tr>` elements inside `paginatedData.map()` do not have a `key` attribute, which will cause React reconciliation issues and console warnings.
**Location:** Line ~420 (the `paginatedData.map((row, index) => (<tr ...>` block)
**Recommendation:** Add `key={String(row[keyField])}` to each `<tr>` element.

### src/components/admin/BulkOperations.tsx — improve
**Tag:** suspicious-stale-path
**Issue:** "Export Selected" and "Generate Report" buttons have empty `onClick` handlers (`() => {}`). These are dead UI elements that mislead admins into thinking functionality exists.
**Location:** Lines ~195-210
**Recommendation:** Either implement the export/report functionality or remove the buttons. If keeping as placeholders, add `disabled` state and a tooltip explaining "Coming soon".

### src/components/admin/QuickActionsPanel.tsx — improve
**Tag:** suspicious-stale-path
**Issue:** "Export Data" button has an empty `onClick` handler (`() => {}`). Same issue as BulkOperations — dead UI element.
**Location:** Line ~115
**Recommendation:** Implement or remove. Add `disabled` with tooltip if keeping as placeholder.

### src/components/admin/applications/ApplicationsFilters.tsx — improve
**Tag:** confirmed-bug
**Issue:** The advanced filters "Payment Status" dropdown is missing the `deferred` option. Since `deferred` is a canonical payment status, admins cannot filter for deferred payments.
**Location:** Line ~280 (payment status select options)
**Recommendation:** Add `<option value="deferred">Deferred</option>` to the payment status filter dropdown.

### src/components/admin/applications/ApplicationDetailModal.tsx — improve
**Tag:** confirmed-bug
**Issue:** This file is extremely large (~1200+ lines) making it hard to maintain. More critically, the interview form uses uncontrolled `handleInterviewFieldChange` pattern that creates a new function on every render for each field. The `isClient` SSR guard is unnecessary in a Vite SPA (no SSR).
**Location:** Entire file
**Recommendation:** Split into sub-components (already partially done with GradesDisplay, StatusHistoryDisplay, DocumentsDisplay). Remove the `isClient` SSR guard — Vite SPAs never server-render. Consider extracting interview management into a separate component.

### src/components/admin/UserImport.tsx — improve
**Tag:** zero-day-class-risk
**Issue:** CSV parsing is naive — splits on commas without handling quoted fields containing commas. A full_name like `"Doe, John"` would be parsed incorrectly, splitting the name across columns. Also generates temporary passwords with `crypto.getRandomValues` but the password format (`temp` + 8 random chars) may not meet backend password policy requirements.
**Location:** Lines ~130-160 (CSV parsing), Lines ~200-210 (password generation)
**Recommendation:** Use a proper CSV parser library or handle quoted fields. Verify generated passwords meet backend minimum requirements (length, complexity).

### src/lib/paymentStatus.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Payment status normalization correctly maps `deferred` to `deferred` (not to `verified` or `not_paid`). The `requiresStudentPaymentAction` correctly includes `deferred`. The `isPaymentVerified` correctly returns false for `deferred`. The `getPaymentStatusLabel` correctly returns "Deferred" for deferred status.
**Location:** Entire file
**Recommendation:** No action needed — payment status handling is correct.

### src/services/client.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** API client correctly implements: cookie-based auth (credentials: 'include'), CSRF token management, 401 intercept-refresh-retry with deduplication, 403 CSRF recovery via `?refresh_csrf=1`, response envelope unwrapping, retry with exponential backoff, timeout handling. The auth failure callback is properly configured by AuthProvider.
**Location:** Entire file
**Recommendation:** No action needed — this is well-implemented.

### src/services/csrf.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** CSRF recovery correctly uses `?refresh_csrf=1` query parameter (not custom header) to avoid CORS preflight issues on cross-origin requests. This matches the product contract.
**Location:** Entire file
**Recommendation:** No action needed.

### src/contexts/AuthContext.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Auth context correctly: configures API client auth failure callback, re-validates session on tab refocus with debounce, clears auth-related caches on failure, dispatches `mihas:auth-expired` event, preserves return path for post-login redirect.
**Location:** Entire file
**Recommendation:** No action needed.

### src/hooks/auth/useSessionListener.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Session listener correctly: uses React Query as single source of truth, handles transient network errors gracefully (returns cached data), seeds cache immediately on login (no flash), broadcasts auth events across tabs, handles sign-up with auto-login.
**Location:** Entire file
**Recommendation:** No action needed.

### src/stores/authStore.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Auth store correctly limited to retry/backoff/error state only. User identity delegated to React Query via useSessionListener. Exponential backoff with jitter implemented correctly.
**Location:** Entire file
**Recommendation:** No action needed.

### src/pages/student/Settings.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Settings page correctly: uses explicit field-by-field merge in `reset()` after save (prevents isDirty persistence), protects dirty state with `beforeunload` and navigation confirmation, uses proper `autocomplete` attributes, handles server-side field errors.
**Location:** Entire file
**Recommendation:** No action needed.

### src/components/ui/ErrorDisplay.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** ErrorDisplay correctly returns `null` for empty or whitespace-only `message` props (prevents empty `role="alert"` elements). Both inline and section variants use proper `role="alert"` and `aria-live="assertive"`.
**Location:** Lines 30-31
**Recommendation:** No action needed.

### src/components/ui/OptimizedImage.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** OptimizedImage correctly: has `onError` handler with visible fallback, supports WebP with `<picture>` element, supports responsive srcsets, handles decorative images with `role="presentation"`, supports lazy loading and fetch priority.
**Location:** Entire file
**Recommendation:** No action needed.

### src/components/student/PaymentForm.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** PaymentForm correctly: handles mobile money (primary) and card widget (secondary), normalizes Zambian phone numbers to E.164, detects operator (Airtel/MTN), shows pending state with polling, handles deferred status, classifies errors by type (network/rate_limit/failed), includes 1% transaction fee in display.
**Location:** Entire file
**Recommendation:** No action needed.

### src/pages/student/applicationWizard/steps/PaymentStep.tsx — improve
**Tag:** confirmed-bug
**Issue:** The "Pay Later" defer flow calls `POST /payments/defer/` but this endpoint is not documented in the API contract. The backend payment endpoints are: `/payments/initiate/`, `/payments/mobile-money/`, `/payments/{id}/verify/`, `/payments/webhook/lenco/`, `/payments/resolve-fee/`. If `/payments/defer/` doesn't exist on the backend, the defer action will fail silently or throw an error.
**Location:** Lines ~60-75 (handleDefer function)
**Recommendation:** Verify that `POST /api/v1/payments/defer/` exists on the backend. If not, the defer action should use a different mechanism (e.g., updating application payment_status directly via the application endpoint).

### src/pages/student/Payment.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Payment page correctly: is read-only for history + payment recovery for submitted apps, filters out drafts, shows deferred status with appropriate messaging (not "confirmed"), uses canonical `normalizePaymentStatus` and `isPaymentVerified`, resolves fees dynamically via `useFeeResolver`.
**Location:** Entire file
**Recommendation:** No action needed.

### src/lib/apiConfig.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** API config correctly: resolves to same-origin for local dev (Vite proxy), uses production API origin for production, guards against VITE_API_BASE_URL accidentally pointing to frontend origin.
**Location:** Entire file
**Recommendation:** No action needed.

### src/main.tsx — improve
**Tag:** suspicious-stale-path
**Issue:** Forces light mode by removing `dark` class and adding `light` class to both `documentElement` and `body`. This prevents any dark mode support. While this may be intentional, it's done imperatively in main.tsx rather than through Tailwind config, which could cause flash-of-wrong-theme.
**Location:** Lines ~100-108
**Recommendation:** If dark mode is intentionally disabled, document this decision. Consider moving the light-mode enforcement to the HTML template (`index.html`) to prevent any flash.

### src/lib/security.ts — improve
**Tag:** suspicious-stale-path
**Issue:** `sanitizeUrl` blocks `localhost` and private IPs, but this would break local development if any code path uses it to validate API URLs. The function is defensive but may cause issues in dev environments.
**Location:** Lines ~40-60
**Recommendation:** Add an environment check to allow localhost in development mode, or ensure this function is never called on API base URLs.

### src/lib/securityConfig.ts — improve
**Tag:** suspicious-stale-path
**Issue:** `initializeSecurity()` and `disableDangerousFunctions()` are both no-ops ("disabled for local development"). If these are meant to be active in production, they need conditional logic. If they're permanently disabled, they should be removed to avoid confusion.
**Location:** Lines ~90, ~120
**Recommendation:** Either implement production-mode activation or remove the dead code.

### src/components/admin/applications/ApplicationsMetrics.tsx — improve
**Tag:** confirmed-bug
**Issue:** The metrics grid uses hardcoded gradient colors (`from-muted-foreground to-foreground`) for the "Draft" card background with white text. In light mode, `muted-foreground` and `foreground` are dark colors, so white text on dark background works. But the semantic token usage is unusual — these are text colors being used as background gradients.
**Location:** Lines ~30-40
**Recommendation:** Use explicit color values or dedicated background tokens instead of repurposing text color tokens as backgrounds.

### src/hooks/usePaymentStatus.ts — improve
**Tag:** confirmed-bug
**Issue:** The `scheduleNext` function references `statusRef.current` but the `useCallback` dependency array doesn't include `status`. While `statusRef` is used to avoid stale closures, the `scheduleNext` function is recreated only when `fetchStatus` changes. If `fetchStatus` doesn't change but status becomes terminal, the polling may continue for one extra cycle before stopping.
**Location:** Lines ~90-100
**Recommendation:** The current implementation is mostly correct due to the `useEffect` that stops polling on terminal status. However, consider adding a check at the start of the timeout callback: `if (statusRef.current === 'successful' || ...) return;`

### src/components/admin/CommunicationModal.tsx — improve
**Tag:** confirmed-bug
**Issue:** The SMS character limit is hardcoded to 160, but the message body includes template variables like `{name}` that get replaced with actual names. The character count shown to the user is based on the template text, not the final expanded text. A 150-character message with `{name}` replaced by a 30-character name would exceed 160 characters.
**Location:** Lines ~180-190
**Recommendation:** Either count characters after template expansion, or add a warning that the final message length may differ from what's shown.

### src/components/admin/RealtimeMetricsDisplay.tsx — improve
**Tag:** confirmed-bug
**Issue:** The `useEffect` that tracks previous values has `previousValues` in its implicit closure but not in the dependency array. The effect runs on every metric change but compares against a stale `previousValues` reference. The `setPreviousValues(currentValues)` at the end updates state but the comparison in the next render will use the old values.
**Location:** Lines ~280-320
**Recommendation:** The logic works because React batches state updates, but the dependency array should explicitly list `previousValues` or use a ref to avoid the lint warning and potential future issues.

### src/components/DashboardRedirect.tsx — improve
**Tag:** confirmed-bug
**Issue:** Uses a 3-second timeout before redirecting to signin when user is null after loading completes. This creates a poor UX — users see a skeleton for 3 seconds before being redirected. The timeout was likely added to handle race conditions with auth loading, but with the current React Query-based auth, this shouldn't be necessary.
**Location:** Lines ~15-20
**Recommendation:** Reduce the timeout to 500ms or remove it entirely. The auth loading state from `useAuth()` should be sufficient to determine when to redirect.

### src/lib/authBroadcast.ts — improve
**Tag:** confirmed-bug
**Issue:** The localStorage fallback for BroadcastChannel strips `csrfToken` from the message before writing to localStorage (good for security), but the comment says "each tab fetches its own". However, if a tab receives a `csrf-update` message via the localStorage fallback, the `csrfToken` field will be undefined, and the handler in `useAuthBroadcast` checks `if (message.csrfToken)` — so it correctly skips the update. This means CSRF sync only works with BroadcastChannel, not the localStorage fallback.
**Location:** Lines ~85-95
**Recommendation:** Document that CSRF token sync across tabs requires BroadcastChannel support. For the localStorage fallback, consider having each tab re-fetch its CSRF token from the session endpoint when it receives a `login` event.

### src/services/documents.ts — improve
**Tag:** confirmed-bug
**Issue:** The `upload` function accepts `userId` parameter but immediately discards it with `void data.userId`. The `extract` function similarly discards `documentUrl` and `applicationId`. These unused parameters create a confusing API surface.
**Location:** Lines ~5, ~20-22
**Recommendation:** Remove unused parameters from the function signatures, or document why they exist (backward compatibility).

### src/components/admin/applications/ApplicationApprovalActions.tsx — improve
**Tag:** confirmed-bug
**Issue:** The `normalizePaymentStatusForActions` function duplicates the logic from `@/lib/paymentStatus.ts` `normalizePaymentStatus`. This creates a maintenance risk — if new payment statuses are added, both functions need updating.
**Location:** Lines ~25-40
**Recommendation:** Import and use `normalizePaymentStatus` from `@/lib/paymentStatus` instead of maintaining a duplicate function.

### src/components/admin/UserExport.tsx — improve
**Tag:** confirmed-bug
**Issue:** The CSV export sanitizes values by removing `"`, `\r`, `\n` characters, but doesn't properly handle the case where a value contains a comma. The code checks `if sanitized.includes(',')` and wraps in quotes, but since quotes were already stripped, the quoting is correct. However, the sanitization removes all quote characters which could corrupt data (e.g., a name like `O'Brien` becomes `OBrien`).
**Location:** Lines ~130-140
**Recommendation:** Use proper CSV escaping: double-quote fields that contain commas, quotes, or newlines, and escape internal quotes by doubling them (`"` → `""`).

### src/hooks/useLencoWidget.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Lenco widget correctly: loads script dynamically with deduplication, has 15s load timeout, has 30s safety timeout for widget open, handles popup blocked/CSP scenarios, supports retry.
**Location:** Entire file
**Recommendation:** No action needed.

### src/hooks/useFeeResolver.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Fee resolver correctly calls `GET /api/v1/payments/resolve-fee/` with program_code, nationality, and country parameters. Handles cancellation on unmount.
**Location:** Entire file
**Recommendation:** No action needed.

### src/lib/errorReporter.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Error reporter correctly initializes Sentry/GlitchTip with DSN from `VITE_GLITCHTIP_DSN`, 1% traces sample rate, no PII.
**Location:** Entire file
**Recommendation:** No action needed.

### src/lib/csrfToken.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** CSRF token correctly stored in module-level variable (never localStorage/sessionStorage). Cleared on logout.
**Location:** Entire file
**Recommendation:** No action needed.

### src/lib/authSession.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Auth user extraction correctly normalizes first_name/last_name into full_name, handles envelope and direct response shapes.
**Location:** Entire file
**Recommendation:** No action needed.

### src/lib/auth/roles.ts — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Role definitions correctly list `admin` and `super_admin` as admin roles. Future roles are documented but not yet added.
**Location:** Entire file
**Recommendation:** No action needed.

### src/routes/config.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Route config correctly: uses lazy loading for all secondary routes, has proper guard assignments (public/student/admin), includes redirect aliases for legacy paths, has skeleton type assignments for loading states.
**Location:** Entire file
**Recommendation:** No action needed.

### src/App.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** App correctly: clears chunk reload guards on boot, uses deferred hydration for global UI and telemetry, prefetches auth shell and dashboard chunks, uses appropriate skeleton fallbacks per route.
**Location:** Entire file
**Recommendation:** No action needed.

### src/components/AuthenticatedRouteShell.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Authenticated route shell correctly: wraps with QueryClientProvider, AuthProvider, SafeAreaProvider, handles route-level focus management for accessibility, defers SessionMonitor loading, listens for `mihas:auth-redirect` events.
**Location:** Entire file
**Recommendation:** No action needed.

### src/components/ProtectedRoute.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Protected route correctly: uses simple three-state logic (loading/authenticated/redirect), persists return path to sessionStorage, uses `useAuthCheck` for lightweight auth verification.
**Location:** Entire file
**Recommendation:** No action needed.

### src/components/AdminRoute.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Admin route correctly: redirects students to student dashboard, redirects unauthenticated to signin with return path, wraps children in AdminErrorBoundary.
**Location:** Entire file
**Recommendation:** No action needed.

### src/components/StudentRoute.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Student route correctly: redirects admins to admin dashboard, redirects unauthenticated to signin with return path, wraps children in StudentErrorBoundary.
**Location:** Entire file
**Recommendation:** No action needed.

### src/components/LazyLoadErrorBoundary.tsx — ignore-as-correct
**Tag:** already-fixed-local
**Issue:** Lazy load error boundary correctly: detects chunk load failures, uses policy-based auto-reload with session limits and cooldown, falls back to manual retry/reload buttons.
**Location:** Entire file
**Recommendation:** No action needed.

## Needs Human Decision

### src/components/admin/applications/ApplicationDetailModal.tsx — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** File is ~1200+ lines. Should be split into smaller components for maintainability. The fee waiver dialog is inline rather than a separate component. The interview management section is complex enough to warrant its own component.
**Location:** Entire file
**Recommendation:** Human decision needed on refactoring priority and component boundaries.

### src/components/admin/BulkUserOperations.tsx — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Uses `any` type for `operationResult` state and `userData` in CSV parsing. The bulk role update and delete operations don't have confirmation token (SHA-256) like the backend batch operations require.
**Location:** Lines ~30, ~80
**Recommendation:** Human decision on whether to add confirmation token support or if this is handled differently for user operations vs application operations.

### src/components/admin/UserImport.tsx — needs-human-decision
**Tag:** zero-day-class-risk
**Issue:** Imports users one-by-one via sequential API calls. For large CSV files (100+ users), this could take minutes and has no progress indicator beyond the final result. Also, the duplicate check queries the full user list for each row, which is O(n²) in API calls.
**Location:** Lines ~170-230
**Recommendation:** Human decision on whether to implement batch import on the backend or add a progress indicator and rate limiting on the frontend.

### src/lib/securityConfig.ts — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Contains `initializeSecurity()` and `disableDangerousFunctions()` that are no-ops. The CSP_CONFIG is defined but only used if something reads it — it's not automatically applied (CSP is set in vercel.json). The RateLimiter class exists but it's unclear if it's used anywhere.
**Location:** Entire file
**Recommendation:** Human decision on whether to activate, remove, or document these as intentionally disabled.

### src/components/smoothui/*.tsx — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** The smoothui components (animated-counter, animated-input, animated-select, infinite-grid, page-transition, scroll-reveal, shape-landing-hero, shiny-text, text-effect, text-rotate) are animation-heavy UI components. Some may not be used in the current app. Need to verify which are actually imported.
**Location:** src/components/smoothui/
**Recommendation:** Human decision on which smoothui components are actively used and whether unused ones should be removed to reduce bundle size.

### src/data/applications.ts, src/data/catalog.ts, src/data/users.ts — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** These files contain static/mock data. Need to verify if they're used in production code or only in development/testing.
**Location:** src/data/
**Recommendation:** Human decision on whether these are still needed or can be removed.

### src/lib/connectionFix.ts — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Name suggests a workaround/fix. Need to verify if the underlying issue has been resolved and this file can be removed.
**Location:** src/lib/connectionFix.ts
**Recommendation:** Human decision on whether this fix is still needed.

### src/lib/documentTemplates.ts — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Contains document template definitions. Need to verify these align with the backend communication_templates table and aren't duplicating server-side template logic.
**Location:** src/lib/documentTemplates.ts
**Recommendation:** Human decision on whether frontend templates should be removed in favor of backend-driven templates.

## Files Classified as ignore-as-correct (371 files)

The remaining 371 files were reviewed and found to be correctly implemented, following the project conventions for:
- Proper TypeScript types and interfaces
- Correct React Query usage with appropriate cache keys
- Proper Zustand store patterns
- Correct Tailwind CSS usage
- Proper accessibility attributes (aria-*, role, etc.)
- Correct error handling patterns
- Proper form validation with React Hook Form + Zod
- Correct route protection patterns
- Proper image handling with fallbacks
- Correct payment status normalization

### Notable well-implemented patterns:
1. **Payment status normalization** — `normalizePaymentStatus()` and `isPaymentVerified()` are used consistently across student-facing reads
2. **CSRF recovery** — Uses `?refresh_csrf=1` query parameter correctly to avoid CORS preflight
3. **Auth flow** — Cookie-based with proper 401 intercept-refresh-retry and deduplication
4. **Error boundaries** — Separate boundaries for admin, student, and lazy-load errors
5. **Form dirty state protection** — Settings page uses explicit field-by-field merge in reset()
6. **ErrorDisplay** — Returns null for empty messages (no empty role="alert" elements)
7. **OptimizedImage** — Has onError handler with visible fallback
8. **Multi-tab sync** — BroadcastChannel with localStorage fallback
9. **Speculative prefetching** — Network-aware with saveData/2G checks
10. **Route chunk recovery** — Policy-based auto-reload with session limits
