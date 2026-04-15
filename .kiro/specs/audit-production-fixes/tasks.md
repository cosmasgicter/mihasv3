# Implementation Plan — Audit Production Fixes

- [x] 1. Write bug condition exploration tests (BEFORE implementing fixes)
  - **Properties 1–8: Bug Conditions** — All 8 audit issues
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**

  - [x] 1.1 Frontend bug condition tests
    - Place in `apps/admissions/tests/property/auditProductionBugCondition.property.test.ts`
    - **Bug 1 — Settings isDirty**: Simulate `reset()` with a server response containing `null` for optional fields (e.g. `date_of_birth: null`, `phone: null`). Assert `isDirty` becomes `false` after reset. On UNFIXED code this will FAIL because null vs empty string mismatch keeps isDirty true.
    - **Bug 2 — ErrorDisplay empty alert**: Render `ErrorDisplay` with `message=""` and `message="   "`. Assert no element with `role="alert"` exists in the DOM. On UNFIXED code this will FAIL because ErrorDisplay always renders the alert div.
    - **Bug 3 — SSE logout cleanup**: Create an SSE client, set `authFailed` state by simulating auth failure, then verify that `signOut` flow calls `disconnect()` and `resetAuthFailure()`. Assert `isAuthFailed()` returns `false` after logout. On UNFIXED code this will FAIL because signOut does not touch the SSE client.
    - **Bug 5 — Font fallback chain**: Read `tailwind.config.js` fontFamily.sans array. Assert it contains at least `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, and `Segoe UI`. On UNFIXED code this will FAIL because only `Inter`, `system-ui`, `sans-serif` are present.
    - Run tests on UNFIXED code — expect FAILURE
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.10, 1.11_

  - [x] 1.2 Backend bug condition tests
    - Place in `backend/tests/unit/test_audit_production_bug_conditions.py`
    - **Bug 6 — Sessions envelope**: Call `GET /api/v1/sessions/` with authenticated user. Assert response body has `success` and `data` keys. On UNFIXED code this will FAIL because response is a raw list.
    - **Bug 6b — Sessions empty user_id**: Simulate request with empty/invalid user_id. Assert response is 401, not 500. On UNFIXED code this will FAIL with a database error.
    - **Bug 7 — Refresh error code**: Call `POST /api/v1/auth/refresh/` without refresh_token cookie. Assert error code is `NO_REFRESH_TOKEN`, not `INVALID_TOKEN`. On UNFIXED code this will FAIL because code is `INVALID_TOKEN`.
    - **Bug 8 — Tracking format validation**: Call `GET /api/v1/applications/track/?code=INVALID123` with a code that doesn't match expected patterns. Assert response is 400 with format guidance. On UNFIXED code this will FAIL because it returns 404 with generic message.
    - **Bug 8b — Tracking descriptive 404**: Call with a valid-format code that doesn't exist. Assert 404 message is descriptive (not just "Application not found"). On UNFIXED code this will FAIL.
    - Run tests on UNFIXED code — expect FAILURE
    - _Requirements: 1.12, 1.13, 1.14, 1.15, 1.16, 1.17_

- [x] 2. Write preservation tests (BEFORE implementing fixes)
  - **Property 9: Preservation** — All existing behaviors must remain unchanged
  - **IMPORTANT**: Follow observation-first methodology — these tests MUST PASS on unfixed code

  - [x] 2.1 Frontend preservation tests
    - Place in `apps/admissions/tests/property/auditProductionPreservation.property.test.ts`
    - **Settings dirty detection**: Verify that modifying a form field (e.g. changing `full_name`) sets `isDirty` to `true` before save
    - **Settings validation errors**: Verify that server field errors via `setError()` still display inline
    - **ErrorDisplay real errors**: Render `ErrorDisplay` with `message="Network error"` — verify `role="alert"` element exists and contains the message text
    - **SSE reconnection**: Verify that `scheduleReconnect` is called on network errors when `authFailed` is false
    - **OptimizedImage fallback**: Verify that `OptimizedImage` renders fallback placeholder when `onError` fires
    - Run tests on UNFIXED code — expect ALL PASS
    - _Requirements: 3.1, 3.2, 3.5, 3.9, 3.13_

  - [x] 2.2 Backend preservation tests
    - Place in `backend/tests/unit/test_audit_production_preservation.py`
    - **Sessions data shape**: Call `GET /api/v1/sessions/` — verify response contains session objects with `id`, `device_info`, `last_active`, `created_at` fields
    - **Session revoke**: Call `POST /api/v1/sessions/{id}/revoke/` — verify session is deactivated
    - **Refresh valid token**: Call `POST /api/v1/auth/refresh/` with valid refresh cookie — verify 200 response with new cookies
    - **Tracking valid code**: Call `GET /api/v1/applications/track/?code=<valid>` — verify tracking data returned
    - **Tracking missing code**: Call `GET /api/v1/applications/track/` without code — verify 400 response
    - Run tests on UNFIXED code — expect ALL PASS
    - _Requirements: 3.15, 3.16, 3.17, 3.18, 3.19_

- [x] 3. Fix frontend bugs (Settings, ErrorDisplay, SSE, Images, Fonts)
  - [x] 3.1 Fix Settings isDirty persistence after save
    - **File**: `apps/admissions/src/pages/student/Settings.tsx`
    - **Function**: `onSubmit` handler
    - Replace the spread-based `reset()` call with an explicit field-by-field merge:
      ```
      reset({
        full_name: updatedProfile.full_name ?? formValues.full_name,
        phone: updatedProfile.phone ?? formValues.phone ?? '',
        date_of_birth: normalizeDateInputValue(updatedProfile.date_of_birth ?? formValues.date_of_birth ?? ''),
        sex: (updatedProfile.sex as 'Male' | 'Female') ?? formValues.sex,
        residence_town: updatedProfile.residence_town ?? formValues.residence_town ?? '',
        country: updatedProfile.country ?? formValues.country ?? '',
        nrc_number: updatedProfile.nrc_number ?? formValues.nrc_number ?? '',
        address: updatedProfile.address ?? formValues.address ?? '',
        nationality: updatedProfile.nationality ?? formValues.nationality ?? 'Zambian',
        next_of_kin_name: updatedProfile.next_of_kin_name ?? formValues.next_of_kin_name ?? '',
        next_of_kin_phone: updatedProfile.next_of_kin_phone ?? formValues.next_of_kin_phone ?? '',
      })
      ```
    - This ensures every field has a non-null, type-correct value so React Hook Form's deep comparison finds no differences
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Fix ErrorDisplay empty alert rendering
    - **File**: `apps/admissions/src/components/ui/ErrorDisplay.tsx`
    - **Function**: `ErrorDisplay`
    - Add early return guard at the top of the component body:
      ```typescript
      if (!message || !message.trim()) return null
      ```
    - This prevents rendering `role="alert"` divs when the message is empty or whitespace-only
    - _Requirements: 2.3, 2.4_

  - [x] 3.3 Fix SSE client cleanup on logout
    - **File**: `apps/admissions/src/hooks/auth/useSessionListener.ts`
    - **Function**: `signOut`
    - Add SSE cleanup in the `finally` block, after clearing CSRF token and query data, before clearing secure storage:
      ```typescript
      // Clean up SSE connection state across login boundaries
      try {
        const sseClient = getDefaultSSEClient()
        sseClient.disconnect()
        sseClient.resetAuthFailure()
      } catch {
        // SSE cleanup is best-effort
      }
      ```
    - Add import for `getDefaultSSEClient` from `@/lib/sseClient`
    - _Requirements: 2.5, 2.6, 2.7_

  - [x] 3.4 Ensure all images have error fallbacks
    - Audit `apps/admissions/src/` for raw `<img>` tags used for content images (not icons/SVGs)
    - For any raw `<img>` elements displaying content images (campus photos, badges, logos), either:
      - Replace with `OptimizedImage` component, OR
      - Add `onError` handler with visible fallback
    - Skip SVG icons and inline data URIs — these don't need fallbacks
    - _Requirements: 2.8, 2.9_

  - [x] 3.5 Fix font fallback chain in Tailwind config
    - **File**: `apps/admissions/tailwind.config.js`
    - Change `fontFamily.sans` from:
      ```js
      ['Inter', 'system-ui', 'sans-serif']
      ```
    - To:
      ```js
      ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif']
      ```
    - This matches the Tailwind CSS default sans-serif stack with Inter prepended
    - _Requirements: 2.10, 2.11_

  - [x] 3.6 Verify frontend bug condition tests now pass
    - Re-run the SAME tests from task 1.1 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms frontend bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.10, 2.11_

  - [x] 3.7 Verify frontend preservation tests still pass
    - Re-run the SAME tests from task 2.1 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no frontend regressions)
    - _Requirements: 3.1, 3.2, 3.5, 3.9, 3.13_

- [x] 4. Fix backend bugs (Sessions, Refresh, Tracking)
  - [x] 4.1 Fix sessions endpoint to use envelope format
    - **File**: `backend/apps/accounts/session_views.py`
    - **Function**: `SessionListView.get`
    - Add user_id validation before querying:
      ```python
      user_id = str(getattr(request.user, "id", ""))
      if not user_id:
          return Response(
              {"success": False, "error": "Authentication required", "code": "AUTHENTICATION_REQUIRED"},
              status=status.HTTP_401_UNAUTHORIZED,
          )
      ```
    - Wrap the response in the standard envelope:
      ```python
      return Response({"success": True, "data": data})
      ```
    - _Requirements: 2.12, 2.13_

  - [x] 4.2 Fix token refresh error code differentiation
    - **File**: `backend/apps/accounts/views.py`
    - **Function**: `RefreshView.post`
    - Change the no-refresh-token response error code from `"INVALID_TOKEN"` to `"NO_REFRESH_TOKEN"`:
      ```python
      return Response(
          {"success": False, "error": "No refresh token provided", "code": "NO_REFRESH_TOKEN"},
          status=status.HTTP_401_UNAUTHORIZED,
      )
      ```
    - Keep all other error responses unchanged (expired, blacklisted, invalid tokens still use `"TOKEN_EXPIRED"`)
    - _Requirements: 2.14, 2.15_

  - [x] 4.3 Fix application tracking error messaging
    - **File**: `backend/apps/applications/views.py`
    - **Function**: `ApplicationTrackView.get`
    - Add format validation after the empty-code check using a regex pattern that matches `APP-YYYYMMDD-XXXXXXXX` or `TRK-XXXXXXXXXXXX` formats
    - If the code does not match the expected pattern, return 400 with `"code": "INVALID_FORMAT"` and a message explaining the expected formats
    - Change the 404 error message to be descriptive:
      ```python
      return Response(
          {
              "success": False,
              "error": "No application found for the provided tracking code. Please verify the code and try again.",
              "code": "NOT_FOUND",
          },
          status=status.HTTP_404_NOT_FOUND,
      )
      ```
    - _Requirements: 2.16, 2.17_

  - [x] 4.4 Verify backend bug condition tests now pass
    - Re-run the SAME tests from task 1.2 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms backend bugs are fixed)
    - _Requirements: 2.12, 2.13, 2.14, 2.15, 2.16, 2.17_

  - [x] 4.5 Verify backend preservation tests still pass
    - Re-run the SAME tests from task 2.2 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no backend regressions)
    - _Requirements: 3.15, 3.16, 3.17, 3.18, 3.19_

- [x] 5. Write property-based tests for fix validation
  - [x] 5.1 Frontend property-based tests (fast-check)
    - Place in `apps/admissions/tests/property/auditProductionFixValidation.property.test.ts`
    - **Settings reset merge**: Generate random profile form values and random server responses (with null/undefined/missing fields). Apply the fixed merge logic. Assert isDirty is always false after reset.
    - **ErrorDisplay rendering**: Generate random strings (empty, whitespace, valid text). Assert ErrorDisplay returns null for empty/whitespace and renders alert for non-empty.
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.2 Backend property-based tests (hypothesis)
    - Place in `backend/tests/property/test_audit_production_properties.py`
    - **Tracking format validation**: Generate random strings. Assert that strings matching `APP-\d{8}-[A-Z0-9]{8}` or `TRK-[A-Z0-9]{12}` pass format validation, and all others are rejected.
    - **Sessions envelope**: Generate random session data lists. Assert envelope wrapping always produces `{"success": True, "data": <list>}` structure.
    - _Requirements: 2.12, 2.16, 2.17_

- [x] 6. Checkpoint — Verify all tests pass and no regressions
  - Run `cd apps/admissions && bun run test` to verify all frontend tests pass
  - Run `cd apps/admissions && bun run lint` to verify no lint regressions
  - Run `cd apps/admissions && bun run build` to verify production build succeeds
  - Run `cd backend && python3 -m pytest tests/unit/test_audit_production_bug_conditions.py tests/unit/test_audit_production_preservation.py tests/property/test_audit_production_properties.py -v` to verify all backend tests pass
  - Run `cd backend && python3 manage.py check` to verify Django system checks pass
  - _Requirements: 2.1–2.17, 3.1–3.20_
