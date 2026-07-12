# Audit Production Fixes — Bugfix Design

## Overview

This design addresses 8 production audit issues spanning the React frontend (Settings, Dashboard, SSE client, images, fonts) and Django backend (sessions, token refresh, application tracking). The bugs range from UI state management defects (isDirty not resetting), accessibility violations (empty `role="alert"`), SSE lifecycle gaps (stale auth state across login boundaries), image/font loading resilience, to backend endpoint reliability (missing envelope, 500 on invalid UUID, undifferentiated error codes, generic error messages). Each fix is targeted and minimal, preserving all existing behavior for non-buggy inputs.

## Glossary

- **Bug_Condition (C)**: The union of 8 conditions that trigger the respective bugs — settings isDirty persistence, empty alert rendering, SSE stale auth state, broken image fallbacks, incomplete font chain, sessions raw response, refresh error code conflation, tracking generic errors.
- **Property (P)**: The desired correct behavior for each bug condition — isDirty resets to false after save, ErrorDisplay returns null for empty messages, SSE state resets on logout, images have fallback handlers, font chain includes intermediate fallbacks, sessions use envelope format, refresh differentiates error codes, tracking provides actionable messages.
- **Preservation**: All existing behaviors that must remain unchanged — dirty state detection before save, real error display, SSE reconnection logic, successful image loading, Inter font rendering, session data shape, expired token 401 responses, valid tracking code lookups.
- **Settings.tsx**: Student profile settings page at `apps/admissions/src/pages/student/Settings.tsx` using React Hook Form + Zod.
- **ErrorDisplay**: Reusable error component at `apps/admissions/src/components/ui/ErrorDisplay.tsx` with `role="alert"`.
- **sseClient.ts**: SSE client singleton at `apps/admissions/src/lib/sseClient.ts` managing connection lifecycle.
- **useSessionListener.ts**: Auth session hook at `apps/admissions/src/hooks/auth/useSessionListener.ts` containing `signOut`.
- **SessionListView**: Django view at `backend/apps/accounts/session_views.py` for `GET /api/v1/sessions/`.
- **RefreshView**: Django view at `backend/apps/accounts/views.py` for `POST /api/v1/auth/refresh/`.
- **ApplicationTrackView**: Django view at `backend/apps/applications/views.py` for `GET /api/v1/applications/track/`.

## Bug Details

### Bug Condition

The bugs manifest across 8 independent conditions. Each is triggered by specific inputs or states.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type AuditBugInput (union of all 8 bug trigger conditions)
  OUTPUT: boolean

  // Bug 1: Settings isDirty persists after save
  C1 := input.context == 'settings_save'
        AND input.saveSucceeded == true
        AND formIsDirtyAfterReset(input.resetValues, input.serverResponse)

  // Bug 2: Empty alert rendered on dashboard
  C2 := input.context == 'error_display'
        AND (input.message == '' OR input.message.trim() == '')

  // Bug 3: SSE auth state not cleaned on logout
  C3 := input.context == 'logout'
        AND (sseClient.authFailed == true OR sseClient.retriesExhausted == true)
        AND NOT sseClientResetCalledDuringLogout()

  // Bug 4: Image loading without fallback
  C4 := input.context == 'image_render'
        AND input.element == 'raw_img' (not OptimizedImage)
        AND input.imageLoadFails == true

  // Bug 5: Font fallback chain incomplete
  C5 := input.context == 'font_loading'
        AND NOT fontAvailableLocally('Inter')
        AND fontFallbackChain.length < 5

  // Bug 6: Sessions endpoint raw response
  C6 := input.context == 'sessions_list'
        AND input.authenticated == true
        AND responseFormat != 'envelope'

  // Bug 7: Token refresh error code conflation
  C7 := input.context == 'token_refresh'
        AND input.refreshCookieMissing == true
        AND responseErrorCode == 'TOKEN_EXPIRED' (same as expired token)

  // Bug 8: Tracking generic error message
  C8 := input.context == 'application_track'
        AND input.codeNotFound == true
        AND responseErrorMessage == 'Application not found' (generic)

  RETURN C1 OR C2 OR C3 OR C4 OR C5 OR C6 OR C7 OR C8
END FUNCTION
```

### Examples

- **Bug 1**: Student edits phone number, saves successfully, but "You have unsaved changes" text persists because `updateProfile` returns `date_of_birth: null` while form had `date_of_birth: ""`, causing isDirty mismatch.
- **Bug 2**: Dashboard error state is set to `""` after a successful retry, but ErrorDisplay still renders `<div role="alert">` with empty content, confusing screen readers.
- **Bug 3**: User's SSE connection gets a 401, sets `authFailed = true`. User logs out and logs back in. SSE `connect()` returns early because `authFailed` is still `true` in the singleton.
- **Bug 4**: Accreditation badge image referenced as raw `<img>` fails to load in production, rendering as invisible 0×0 space.
- **Bug 5**: User on Android device without Inter installed sees `system-ui` fallback with no intermediate fonts like `ui-sans-serif` or `Segoe UI`.
- **Bug 6**: Frontend calls `GET /api/v1/sessions/` and receives `[{...}, {...}]` instead of `{"success": true, "data": [...]}`, breaking envelope-expecting API client.
- **Bug 7**: Refresh cookie not sent due to domain mismatch. Backend returns `{"code": "INVALID_TOKEN"}` — same code as expired token. Frontend can't distinguish between fixable (re-login) and configuration issues.
- **Bug 8**: User types `MIHAS123456` (wrong format) into tracking search. Gets generic "Application not found" instead of guidance about the expected format.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Settings dirty state detection BEFORE save must continue to work (isDirty true when fields modified)
- Settings field validation errors from server must continue to display inline via `setError()`
- Settings `beforeunload` guard must continue to fire when form is dirty
- Dashboard real error messages must continue to render in ErrorDisplay with `role="alert"`
- Dashboard skeleton loading state must continue to display during initial load
- Dashboard SSE event handling must continue to invalidate React Query caches
- SSE reconnection with exponential backoff must continue to work for network errors
- SSE battery-friendly disconnect on visibility change must continue to work
- SSE rapid-failure detection and polling fallback must continue to work
- OptimizedImage WebP source sets, lazy loading, and existing error fallback must continue to work
- Inter font rendering when locally available must continue unchanged
- Session list data shape (id, device_info, last_active, created_at) must be preserved
- Session revoke and revoke-all endpoints must continue to work
- Token refresh with valid non-expired tokens must continue to rotate and set cookies
- Expired/blacklisted refresh token must continue to return 401
- Application tracking with valid codes must continue to return tracking data
- Tracking endpoint without `code` parameter must continue to return 400

**Scope:**
All inputs that do NOT match any of the 8 bug conditions should be completely unaffected by these fixes.

## Hypothesized Root Cause

**Bug 1 — Settings isDirty**: The `onSubmit` handler calls `reset({ ...formValues, ...updatedProfile, date_of_birth: updatedProfile.date_of_birth ?? formValues.date_of_birth, sex: ... })`. The spread `...updatedProfile` may introduce fields with `null` or different types than what React Hook Form's `defaultValues` expects. Fields not explicitly handled (like `phone`, `country`, `nrc_number`, `address`, `nationality`, `next_of_kin_name`, `next_of_kin_phone`, `residence_town`) rely on the raw server response which may have `null` where the form had `""`, causing isDirty to remain true.

**Bug 2 — Empty alert**: `ErrorDisplay` has no early return guard for empty/whitespace `message` props. Both `inline` and `section` variants always render a `<div role="alert">` regardless of message content.

**Bug 3 — SSE stale state**: The `signOut` function in `useSessionListener.ts` does not call `getDefaultSSEClient().disconnect()` or `getDefaultSSEClient().resetAuthFailure()`. The SSE client singleton persists across login boundaries.

**Bug 4 — Raw img tags**: Some images in the landing page or other components use raw `<img>` elements without `onError` handlers, bypassing OptimizedImage's built-in fallback.

**Bug 5 — Font chain**: `tailwind.config.js` defines `fontFamily.sans` as `['Inter', 'system-ui', 'sans-serif']` — missing intermediate fallbacks like `ui-sans-serif`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`.

**Bug 6 — Sessions raw list**: `SessionListView.get()` returns `Response(data)` where `data` is a raw list, not wrapped in the `{"success": true, "data": ...}` envelope. Also, `user_id` is extracted as `str(getattr(request.user, "id", ""))` which could be empty string, causing a database type mismatch on UUID column.

**Bug 7 — Refresh error codes**: `RefreshView` returns `"code": "TOKEN_EXPIRED"` for all failure cases — missing cookie, expired token, blacklisted token, and invalid token. The missing-cookie case returns `"code": "INVALID_TOKEN"` but the frontend may not differentiate this from other 401s.

**Bug 8 — Tracking generic error**: `ApplicationTrackView` returns a generic `"Application not found"` for all 404 cases without validating the tracking code format first. No guidance about expected format (`APP-YYYYMMDD-XXXXXXXX` or `TRK-XXXXXXXXXXXX`).

## Correctness Properties

Property 1: Bug Condition — Settings isDirty Resets After Save

_For any_ successful profile save where the server returns a response (complete or partial), the `reset()` call SHALL produce a `defaultValues` object where every form field has a non-undefined value matching the canonical type (string for text fields, union type for sex), ensuring React Hook Form's `isDirty` becomes `false`.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — ErrorDisplay Returns Null for Empty Messages

_For any_ `message` prop that is empty string, whitespace-only, or undefined, the `ErrorDisplay` component SHALL return `null` and render no DOM element, preventing orphaned `role="alert"` landmarks.

**Validates: Requirements 2.3, 2.4**

Property 3: Bug Condition — SSE State Resets on Logout

_For any_ logout action via `signOut`, the system SHALL call `getDefaultSSEClient().disconnect()` and `getDefaultSSEClient().resetAuthFailure()`, ensuring `authFailed` and `retriesExhausted` are both `false` after logout completes.

**Validates: Requirements 2.5, 2.6, 2.7**

Property 4: Bug Condition — All Images Have Error Fallbacks

_For any_ `<img>` element rendered in the application, the element SHALL either be wrapped in `OptimizedImage` (which has built-in `onError`) or have an explicit `onError` handler that provides a visible fallback.

**Validates: Requirements 2.8, 2.9**

Property 5: Bug Condition — Font Fallback Chain Complete

_For any_ device where Inter is not locally installed, the Tailwind `fontFamily.sans` config SHALL include at least 5 intermediate fallback fonts between Inter and the generic `sans-serif`, ensuring graceful visual degradation.

**Validates: Requirements 2.10, 2.11**

Property 6: Bug Condition — Sessions Endpoint Uses Envelope

_For any_ authenticated `GET /api/v1/sessions/` request, the response SHALL use the `{"success": true, "data": [...]}` envelope format, and invalid/empty `user_id` SHALL return 401 instead of causing a 500 error.

**Validates: Requirements 2.12, 2.13**

Property 7: Bug Condition — Token Refresh Differentiates Error Codes

_For any_ `POST /api/v1/auth/refresh/` request where the refresh cookie is missing, the response SHALL return a distinct error code (`"NO_REFRESH_TOKEN"`) different from the expired/invalid token code (`"TOKEN_EXPIRED"`).

**Validates: Requirements 2.14, 2.15**

Property 8: Bug Condition — Tracking Provides Actionable Error Messages

_For any_ `GET /api/v1/applications/track/` request with a code that doesn't match any application, the response SHALL include a descriptive error message. If the code format doesn't match expected patterns (`APP-YYYYMMDD-XXXXXXXX` or `TRK-XXXXXXXXXXXX`), the response SHALL return 400 with format guidance.

**Validates: Requirements 2.16, 2.17**

Property 9: Preservation — Non-Bug Inputs Unchanged

_For any_ input where none of the 8 bug conditions hold, the fixed functions SHALL produce the same result as the original functions, preserving all existing functionality including dirty state detection, real error display, SSE reconnection, image loading, font rendering, session data, token rotation, and tracking lookups.

**Validates: Requirements 3.1–3.20**

## Fix Implementation

### Changes Required

**Bug 1 — Settings isDirty**

**File**: `apps/admissions/src/pages/student/Settings.tsx`
**Function**: `onSubmit`

1. **Explicit field-by-field merge**: Replace the spread-based `reset()` call with an explicit merge that handles every form field with `?? formValues.fieldName` fallbacks, ensuring no `null`/`undefined` gaps.
2. **Normalize types**: Ensure `date_of_birth` uses `normalizeDateInputValue()`, `sex` is cast to the union type, and all optional string fields default to `''` instead of `null`.

**Bug 2 — Empty alert**

**File**: `apps/admissions/src/components/ui/ErrorDisplay.tsx`
**Function**: `ErrorDisplay`

1. **Early return guard**: Add `if (!message || !message.trim()) return null` at the top of the component, before any rendering logic.

**Bug 3 — SSE cleanup on logout**

**File**: `apps/admissions/src/hooks/auth/useSessionListener.ts`
**Function**: `signOut`

1. **Disconnect SSE**: Add `getDefaultSSEClient().disconnect()` call in the `finally` block after clearing auth cookies.
2. **Reset auth failure**: Add `getDefaultSSEClient().resetAuthFailure()` call after disconnect to clear `authFailed` and `retriesExhausted`.

**Bug 4 — Image fallbacks**

**Files**: Any files with raw `<img>` tags for content images (audit landing page sections).

1. **Replace raw img tags**: Convert raw `<img>` elements to use `OptimizedImage` component, or add `onError` handlers with visible fallback rendering.

**Bug 5 — Font fallback chain**

**File**: `apps/admissions/tailwind.config.js`

1. **Extend font family**: Change `fontFamily.sans` from `['Inter', 'system-ui', 'sans-serif']` to `['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif']`.

**Bug 6 — Sessions envelope**

**File**: `backend/apps/accounts/session_views.py`
**Function**: `SessionListView.get`

1. **Wrap in envelope**: Change `return Response(data)` to `return Response({"success": True, "data": data})`.
2. **Validate user_id**: Add a guard that returns 401 if `user_id` is empty or not a valid UUID before querying the database.

**Bug 7 — Refresh error codes**

**File**: `backend/apps/accounts/views.py`
**Function**: `RefreshView.post`

1. **Distinct error code for missing cookie**: Change the no-refresh-token response from `"code": "INVALID_TOKEN"` to `"code": "NO_REFRESH_TOKEN"`.

**Bug 8 — Tracking error messages**

**File**: `backend/apps/applications/views.py`
**Function**: `ApplicationTrackView.get`

1. **Format validation**: Add regex check for expected tracking code formats (`APP-\d{8}-[A-Z0-9]{8}` or `TRK-[A-Z0-9]{12}`). Return 400 with format guidance if the code doesn't match.
2. **Descriptive 404 message**: Change the 404 error message from `"Application not found"` to `"No application found for the provided tracking code. Please verify the code and try again."`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write tests that exercise each bug condition on the unfixed code to observe failures.

**Test Cases**:
1. **Settings isDirty Test**: Call `reset()` with a server response containing `null` for optional fields — assert `isDirty` becomes false (will fail on unfixed code)
2. **ErrorDisplay Empty Test**: Render `ErrorDisplay` with `message=""` — assert no `role="alert"` in DOM (will fail on unfixed code)
3. **SSE Logout Test**: Set `authFailed = true` on SSE client, call `signOut()` — assert `isAuthFailed()` returns false (will fail on unfixed code)
4. **Sessions Envelope Test**: Call `GET /api/v1/sessions/` — assert response has `success` and `data` keys (will fail on unfixed code)
5. **Refresh Error Code Test**: Call `POST /api/v1/auth/refresh/` without cookie — assert error code is `NO_REFRESH_TOKEN` (will fail on unfixed code)
6. **Tracking Format Test**: Call `GET /api/v1/applications/track/?code=INVALID` — assert 400 with format guidance (will fail on unfixed code)

**Expected Counterexamples**:
- Settings: `isDirty` remains `true` after reset with partial server response
- ErrorDisplay: DOM contains `<div role="alert">` with empty content
- SSE: `isAuthFailed()` returns `true` after signOut
- Sessions: Response is a raw list without envelope
- Refresh: Error code is `INVALID_TOKEN` instead of `NO_REFRESH_TOKEN`
- Tracking: Returns 404 with generic message instead of 400 with format guidance

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Settings Dirty Detection Preservation**: Verify that modifying a field still sets isDirty to true before save
2. **ErrorDisplay Real Error Preservation**: Verify that non-empty error messages still render with role="alert"
3. **SSE Reconnection Preservation**: Verify that network errors still trigger exponential backoff reconnection
4. **Sessions Data Shape Preservation**: Verify session list still returns id, device_info, last_active, created_at
5. **Refresh Valid Token Preservation**: Verify valid refresh tokens still rotate successfully
6. **Tracking Valid Code Preservation**: Verify valid tracking codes still return application data

### Unit Tests

- Test Settings `onSubmit` reset with various server response shapes (null fields, missing fields, partial responses)
- Test ErrorDisplay with empty string, whitespace, null, and valid messages
- Test SSE client `resetAuthFailure()` clears both `authFailed` and `retriesExhausted`
- Test SessionListView returns envelope format
- Test SessionListView returns 401 for empty user_id
- Test RefreshView returns `NO_REFRESH_TOKEN` when cookie missing
- Test ApplicationTrackView returns 400 for invalid format codes
- Test ApplicationTrackView returns descriptive 404 for valid-format but non-existent codes

### Property-Based Tests

- Generate random profile form values and server responses — verify isDirty is always false after reset with the fixed merge logic (fast-check)
- Generate random strings (empty, whitespace, valid) — verify ErrorDisplay renders null for empty/whitespace and renders alert for non-empty (fast-check)
- Generate random tracking codes — verify format validation correctly identifies valid vs invalid patterns (hypothesis)
- Generate random session data — verify envelope wrapping preserves data integrity (hypothesis)

### Integration Tests

- Full Settings save flow: edit fields → save → verify isDirty false and unsaved changes text gone
- Dashboard with empty error states: verify no role="alert" elements in DOM
- Logout → login cycle: verify SSE reconnects successfully after re-authentication
- Sessions list → revoke flow: verify envelope format doesn't break session management UI
- Token refresh with missing cookie: verify frontend receives distinct error code
