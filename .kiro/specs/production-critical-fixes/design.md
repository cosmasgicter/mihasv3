# Production Critical Fixes — Bugfix Design

## Overview

Five production bugs degrade the core student journey in the MIHAS admissions platform. This design formalizes each bug condition, hypothesizes root causes from the audited source, defines targeted fixes, and establishes correctness properties for validation. The fixes span Vite build config (CSP), React error handling (ApplicationStatus), async state management (wizard hydration), JWT middleware + API client (session 403), and a new backend endpoint + frontend wiring (email slip).

## Glossary

- **Bug_Condition (C)**: The input/state combination that triggers a specific bug
- **Property (P)**: The desired correct behavior when the bug condition holds
- **Preservation**: Existing behavior that must remain unchanged after each fix
- **`assetsInlineLimit`**: Vite build option in `apps/admissions/vite.config.ts` that inlines assets below the threshold as `data:` URIs
- **`JWTAuthenticationMiddleware`**: Django middleware in `backend/apps/common/middleware.py` that decodes JWT from cookies and sets `request.user`
- **`ApiClient`**: Frontend HTTP client in `apps/admissions/src/services/client.ts` with 401-intercept-refresh-retry logic
- **`hydrateServerGrades()`**: Async function in `useWizardController.ts` that fetches grades from the server during draft restoration
- **`slipService`**: Frontend service in `apps/admissions/src/lib/slipService.ts` that generates and optionally emails application slips
- **`send_email_task`**: Celery task in `backend/apps/common/tasks.py` that sends emails via Resend API

---

## Bug Details

### Bug 1: CSP Hardening — Print CSS Inlined as `data:` URI

#### Bug Condition

The bug manifests when Vite builds the admissions app and the print stylesheet (`src/styles/print.css`, ~2.2KB) falls below the `assetsInlineLimit: 4096` threshold. Vite inlines it as a `data:text/css;base64,...` URI. The current CSP in `vercel.json` includes `data:` in `style-src` and `style-src-elem` to work around this, but this weakens the security posture by allowing arbitrary `data:` style URIs. The fix eliminates the need for `data:` in style directives entirely.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug1(input)
  INPUT: input of type ViteBuildOutput
  OUTPUT: boolean

  RETURN input.cssFileSize < config.assetsInlineLimit
         AND input.cssImportedVia == '@import'
         AND config.cspStyleSrc NOT CONTAINS 'data:'
         AND input.outputFormat == 'data:text/css;base64,...'
END FUNCTION
```

#### Examples

- `print.css` (2.2KB) is imported in `index.css` → built as `data:` URI → blocked by CSP → no print styles applied
- A hypothetical 5KB CSS file would NOT be inlined (above 4096 threshold) → served as separate file → works fine
- Images below 4KB are inlined as `data:image/...` → allowed by `img-src 'self' data:` → no issue

---

### Bug 2: ApplicationStatus Catches Auth Errors as "Not Found"

#### Bug Condition

The bug manifests when a student navigates to `/student/application/{id}/status` (e.g., from the Payment page link) and their session has expired. The `queryFn` in `ApplicationStatus.tsx` catches ALL errors from `applicationService.getById(id)` and throws a generic "Application not found or access denied" error, masking 401/`AuthenticationError` responses that should trigger the auth redirect flow.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug2(input)
  INPUT: input of type { apiResponse: HttpResponse, sessionValid: boolean }
  OUTPUT: boolean

  RETURN input.apiResponse.status IN [401, 403]
         AND input.sessionValid == false
         AND errorCaughtAs == 'Application not found or access denied'
END FUNCTION
```

#### Examples

- Session expired → `getById()` throws `AuthenticationError` (401) → caught → shows "Application Not Found" instead of redirecting to login
- Session expired → backend returns 403 (expired JWT, anonymous user) → caught → shows "Application Not Found"
- Valid session, non-existent app ID → 404 → correctly shows "Application Not Found" (this is correct behavior)
- Valid session, valid app ID → 200 → loads status page normally

---

### Bug 3: Wizard Grade Hydration Race Condition

#### Bug Condition

The bug manifests when a student returns to the education step during draft restoration. `selectedGrades` is initialized as `[]` in `useWizardState.ts`, and `hydrateServerGrades()` is async. The validation logic in `index.tsx` runs synchronously checking `selectedGrades.filter(...)` which is still `[]` during hydration, producing a false "0 added" error.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug3(input)
  INPUT: input of type { currentStep: string, restoringDraft: boolean, gradesHydrated: boolean, serverGradeCount: number }
  OUTPUT: boolean

  RETURN input.currentStep == 'education'
         AND input.restoringDraft == true
         AND input.gradesHydrated == false
         AND input.serverGradeCount >= 5
END FUNCTION
```

#### Examples

- Draft with 7 server grades → education step → validation runs before hydration → "Minimum 5 subjects required (0 added)" → false error
- Fresh application, no grades → education step → "Minimum 5 subjects required (0 added)" → correct behavior
- Draft with 3 server grades → hydration completes → "Minimum 5 subjects required (3 added)" → correct behavior
- Draft with 7 grades → hydration completes → validation passes → correct behavior

---

### Bug 4: Session 403 — Expired JWT Causes Silent Auth Failure

#### Bug Condition

The bug manifests when the user's 15-minute access token expires. `JWTAuthenticationMiddleware._authenticate()` returns `None` on `ExpiredSignatureError`, leaving `request.user` as `AnonymousUser`. DRF's `IsAuthenticated` then returns 403 (not 401). The frontend `ApiClient` only intercepts 401 for refresh, so the 403 bypasses the refresh flow entirely.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug4(input)
  INPUT: input of type { accessTokenPresent: boolean, accessTokenExpired: boolean, responseStatus: number }
  OUTPUT: boolean

  RETURN input.accessTokenPresent == true
         AND input.accessTokenExpired == true
         AND input.responseStatus == 403
         AND NOT refreshFlowTriggered
END FUNCTION
```

#### Examples

- Access token expired → `GET /api/v1/auth/session/` → middleware returns None → DRF returns 403 → no refresh attempted → silent failure
- Access token expired → `GET /api/v1/applications/` → 403 → no refresh → broken page state
- Access token valid → any endpoint → normal 200 → no issue
- No token present → 403 → correct behavior (unauthenticated user)
- Valid token, user lacks permission → 403 → correct behavior (authorization denial, not auth failure)

---

### Bug 5: Email Slip Sending Not Implemented

#### Bug Condition

The bug manifests when a student requests to email their application slip. `slipService.ts` has a hardcoded error string instead of a backend call, and no backend endpoint exists.

**Formal Specification:**
```
FUNCTION isBugCondition_Bug5(input)
  INPUT: input of type { sendEmail: boolean, email: string }
  OUTPUT: boolean

  RETURN input.sendEmail == true
         AND input.email IS NOT EMPTY
         AND backendEndpoint('/api/v1/applications/{id}/email-slip/') NOT EXISTS
END FUNCTION
```

#### Examples

- Student clicks "Email slip" with valid email → hardcoded error "not implemented" → no email sent
- Student clicks "Download slip" → PDF generated locally → works fine (not affected)
- Student has no email → "Missing applicant email address" error → correct behavior

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Mouse/touch interactions with all UI elements must continue working
- CSS files larger than the inline limit must continue to be emitted as separate files
- Non-CSS assets (images, fonts, SVGs) below the inline limit must continue to be inlined
- Valid session + valid application ID must continue to load the full ApplicationStatus page
- Fresh applications with no grades must continue to show "0 added" validation
- Manual grade add/remove must continue to validate in real-time
- Valid (non-expired) access tokens must continue to authenticate normally
- Genuine 403 authorization denials (permission issues) must not trigger token refresh
- Direct PDF slip download must continue to work without changes
- "Missing email" error must continue to show when no email is on file

**Scope:**
All inputs that do NOT match the specific bug conditions above should be completely unaffected by these fixes. The fixes are targeted and minimal.

---

## Hypothesized Root Cause

### Bug 1: CSP/Print CSS
The root cause is confirmed: `assetsInlineLimit: 4096` in `vite.config.ts` (line ~107) causes Vite to inline `print.css` (2.2KB < 4KB) as a `data:` URI. The current CSP in `vercel.json` includes `data:` in `style-src 'self' 'unsafe-inline' data:` and `style-src-elem 'self' 'unsafe-inline' data:` to work around this inlining. This weakens the CSP unnecessarily. The fix is to set `assetsInlineLimit: 0` to prevent all asset inlining, then tighten the CSP by removing `data:` from `style-src` and `style-src-elem`.

### Bug 2: ApplicationStatus Error Handling
The root cause is in `ApplicationStatus.tsx` lines 75-82. The `queryFn` wraps `applicationService.getById(id)` in a try-catch that converts ALL errors to "Application not found or access denied". When `ApiClient` throws an `AuthenticationError` on 401, this catch block swallows it instead of letting it propagate to trigger the auth redirect flow.

### Bug 3: Wizard Grade Hydration Race
The root cause is a timing issue across three files:
1. `useWizardState.ts`: `selectedGrades` initialized as `[]`
2. `useWizardController.ts` line ~448: `hydrateServerGrades()` is async
3. `index.tsx` lines 155-159: validation runs synchronously on `selectedGrades` which is still `[]`

There is no mechanism to defer validation while hydration is in progress.

### Bug 4: Session 403 Silent Failure
The root cause spans backend and frontend:
1. `middleware.py` line ~262: `except pyjwt.ExpiredSignatureError: return None` — silently passes through
2. DRF's `IsAuthenticated` sees `AnonymousUser` → returns 403 (not 401)
3. `client.ts` line ~720: only intercepts 401 for refresh, not 403-with-expired-token

The backend returns the wrong status code for an expired-but-present token scenario.

### Bug 5: Email Slip Not Implemented
The root cause is straightforward: `slipService.ts` line ~91 has a hardcoded error string, and no backend endpoint exists. The infrastructure (Resend via `send_email_task`, `EmailQueue` model) is already in place for other email flows.

---

## Correctness Properties

Property 1: Bug Condition — CSP-Compliant Print CSS Output

_For any_ Vite build of the admissions app where `print.css` is imported, the build output SHALL emit the print stylesheet as a separate CSS file served from the same origin (not as a `data:` URI), so that it passes the existing CSP `style-src 'self' 'unsafe-inline'` directive without violation.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Non-CSS Asset Inlining Unchanged

_For any_ non-CSS asset (images, fonts, SVGs) below the original inline threshold, the build output SHALL continue to inline them as `data:` URIs, preserving existing `img-src 'self' data:` behavior.

**Validates: Requirements 3.1, 3.2**

Property 3: Bug Condition — Auth Errors Propagate in ApplicationStatus

_For any_ API response where `applicationService.getById()` throws an `AuthenticationError` (status 401) or the underlying response indicates an expired session, the `ApplicationStatus` component SHALL allow the error to propagate so the existing auth redirect flow handles it, rather than displaying "Application Not Found".

**Validates: Requirements 2.3, 2.4**

Property 4: Preservation — Valid 404 Still Shows Not Found

_For any_ API response where the application genuinely does not exist (404) or the user lacks access, the `ApplicationStatus` component SHALL continue to display the "Application Not Found" error with retry and dashboard link.

**Validates: Requirements 3.3, 3.4**

Property 5: Bug Condition — Grade Validation Deferred During Hydration

_For any_ wizard state where the current step is 'education' AND grade hydration is in progress (async `hydrateServerGrades` has not resolved), the validation logic SHALL either skip grade count validation or display a loading indicator, rather than validating against the empty initial `selectedGrades` array.

**Validates: Requirements 2.5, 2.6**

Property 6: Preservation — Grade Validation Enforced After Hydration

_For any_ wizard state where grade hydration has completed (or was never started for fresh applications), the validation logic SHALL continue to enforce the minimum 5 valid subjects requirement and display the correct count.

**Validates: Requirements 3.5, 3.6, 3.7**

Property 7: Bug Condition — 403 With Expired Token Triggers Refresh

_For any_ API response where the HTTP status is 403 AND the cause is an expired access token (token was present but expired), the `ApiClient` SHALL attempt a token refresh (same as the existing 401 flow) before treating the response as a permanent failure.

**Validates: Requirements 2.7, 2.8, 2.9**

Property 8: Preservation — Genuine 403 Authorization Denials Unchanged

_For any_ API response where the HTTP status is 403 AND the cause is a genuine authorization denial (user lacks permission, CSRF failure on non-auth endpoint), the `ApiClient` SHALL NOT attempt a token refresh and SHALL continue to handle the error through existing 403/CSRF logic.

**Validates: Requirements 3.8, 3.9, 3.10**

Property 9: Bug Condition — Email Slip Sends Via Backend

_For any_ request to email an application slip where the applicant has a valid email address, the system SHALL call `POST /api/v1/applications/{id}/email-slip/` which generates the slip and queues it for delivery via the existing `send_email_task` + Resend infrastructure, returning a success or error response.

**Validates: Requirements 2.10, 2.11, 2.12**

Property 10: Preservation — Direct Slip Download Unchanged

_For any_ request to download an application slip (without email), the system SHALL continue to generate the PDF locally via `generateApplicationSlip()` and trigger a browser download, completely unaffected by the email slip changes.

**Validates: Requirements 3.11, 3.12**

---

## Fix Implementation

### Changes Required

#### Bug 1: CSP/Print CSS

**File**: `apps/admissions/vite.config.ts`

**Specific Changes**:
1. **Set `assetsInlineLimit: 0`**: Change from `4096` to `0` to prevent Vite from inlining any assets as `data:` URIs. This eliminates the need for `data:` in the CSP style directives. The trade-off is slightly more HTTP requests for small assets, but this is negligible with HTTP/2 and immutable cache headers already configured in `vercel.json`.

**File**: `apps/admissions/vercel.json`

**Specific Changes**:
2. **Remove `data:` from `style-src` and `style-src-elem`**: Tighten the CSP by changing `style-src 'self' 'unsafe-inline' data:` to `style-src 'self' 'unsafe-inline'` and `style-src-elem 'self' 'unsafe-inline' data:` to `style-src-elem 'self' 'unsafe-inline'`. This is now safe because no CSS will be inlined as `data:` URIs after the Vite config change.

#### Bug 2: ApplicationStatus Error Handling

**File**: `apps/admissions/src/pages/student/ApplicationStatus.tsx`

**Function**: `queryFn` in the `useQuery` call (~line 75)

**Specific Changes**:
1. **Import `AuthenticationError`** from `@/services/client`
2. **Re-throw `AuthenticationError`**: Before the generic catch, check if the error is an `AuthenticationError` and re-throw it so React Query's error handling and the global auth flow can process it
3. **Keep generic catch for other errors**: 404 and other non-auth errors continue to show "Application not found"

#### Bug 3: Wizard Grade Hydration Race

**File**: `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/state/useWizardState.ts`

**Specific Changes**:
1. **Add `gradesHydrating` boolean state**: Initialize as `false`, set to `true` before hydration starts, `false` after it completes

**File**: `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts`

**Specific Changes**:
2. **Set `gradesHydrating = true`** before calling `hydrateServerGrades()` in the draft restoration flow
3. **Set `gradesHydrating = false`** after `hydrateServerGrades()` resolves (in both success and error paths)
4. **Expose `gradesHydrating`** in the controller return value

**File**: `apps/admissions/src/pages/student/applicationWizard/index.tsx`

**Specific Changes**:
5. **Skip grade validation while `gradesHydrating` is true**: In the education step validation block, check `gradesHydrating` and either skip the grade count check or show a loading message instead of the "0 added" error

#### Bug 4: Session 403 Silent Auth Failure

**File**: `backend/apps/common/middleware.py`

**Function**: `JWTAuthenticationMiddleware.__call__` and `_authenticate`

**Specific Changes**:
1. **Set expired-token flag**: When `ExpiredSignatureError` is caught, set `request._jwt_expired = True` on the request object before returning `None`

**File**: `backend/apps/common/middleware.py` (or a new small middleware/DRF authentication class)

**Specific Changes**:
2. **Return 401 for expired-but-present tokens**: Add logic (either in existing middleware or a small DRF authentication class) that checks `request._jwt_expired` and returns 401 instead of letting DRF return 403 for `AnonymousUser` when the token was present but expired

**File**: `apps/admissions/src/services/client.ts`

**Specific Changes**:
3. **Handle auth-related 403 on GET requests**: As a defense-in-depth measure, also trigger the refresh flow when a GET request to a session/auth endpoint returns 403 without a CSRF error code. This handles edge cases where the backend fix hasn't deployed yet or other 403-as-auth-failure scenarios.

#### Bug 5: Email Slip Backend + Frontend Wiring

**File**: `backend/apps/applications/views.py` (new view)

**Specific Changes**:
1. **Create `EmailSlipView`**: `POST /api/v1/applications/{id}/email-slip/` endpoint that:
   - Validates the requesting user owns the application
   - Accepts `{ email }` in the request body
   - Generates slip data from the application record
   - Renders an HTML email body with slip details
   - Creates an `EmailQueue` record and dispatches via `send_email_task.delay()`
   - Returns `{ success: true, data: { queued_id } }` or appropriate error

**File**: `backend/apps/applications/urls.py`

**Specific Changes**:
2. **Register the new endpoint**: Add URL pattern for `applications/{id}/email-slip/`

**File**: `apps/admissions/src/lib/slipService.ts`

**Specific Changes**:
3. **Replace hardcoded error with API call**: When `sendEmail` is true and email is present, call `apiClient.request('/applications/{id}/email-slip/', { method: 'POST', body: JSON.stringify({ email }) })` instead of returning the hardcoded error string
4. **Handle success/failure**: Set `emailed = true` and `queuedId` on success; set `emailError` with the backend error message on failure

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing fixes. Confirm or refute the root cause analysis for each bug.

**Test Plan**: Write targeted tests for each bug condition and run them against the unfixed codebase to observe failures.

**Test Cases**:
1. **Bug 1 — CSP Build Test**: Build the admissions app with current config and inspect output for `data:text/css` URIs in the CSS bundle (will find inlined CSS on unfixed code)
2. **Bug 2 — Auth Error Swallowed Test**: Mock `applicationService.getById()` to throw `AuthenticationError` and verify the `queryFn` re-throws it (will fail on unfixed code — error is caught)
3. **Bug 3 — Hydration Race Test**: Simulate draft restoration with async grade hydration and run validation before hydration resolves (will show "0 added" on unfixed code)
4. **Bug 4 — Expired Token 403 Test**: Send a request with an expired JWT and verify the response status code from the middleware (will return 403 instead of 401 on unfixed code)
5. **Bug 5 — Email Slip Endpoint Test**: Call `POST /api/v1/applications/{id}/email-slip/` (will 404 on unfixed code)

**Expected Counterexamples**:
- Bug 1: Build output contains `data:text/css;base64` in the HTML or JS bundle
- Bug 2: `AuthenticationError` is caught and replaced with "Application not found"
- Bug 3: `selectedGrades` is `[]` when validation runs during hydration
- Bug 4: Response status is 403 when access token is expired but present
- Bug 5: Endpoint returns 404 or hardcoded error string

### Fix Checking

**Goal**: Verify that for all inputs where each bug condition holds, the fixed code produces the expected behavior.

**Pseudocode:**
```
FOR EACH bug IN [Bug1, Bug2, Bug3, Bug4, Bug5] DO
  FOR ALL input WHERE isBugCondition_{bug}(input) DO
    result := fixedFunction_{bug}(input)
    ASSERT expectedBehavior_{bug}(result)
  END FOR
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug conditions do NOT hold, the fixed code produces the same result as the original code.

**Pseudocode:**
```
FOR EACH bug IN [Bug1, Bug2, Bug3, Bug4, Bug5] DO
  FOR ALL input WHERE NOT isBugCondition_{bug}(input) DO
    ASSERT originalFunction_{bug}(input) = fixedFunction_{bug}(input)
  END FOR
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Bug 1 Preservation**: Verify non-CSS assets (images, SVGs) are still inlined when below threshold after config change
2. **Bug 2 Preservation**: Verify 404 errors still show "Application Not Found" and valid sessions still load the page
3. **Bug 3 Preservation**: Verify fresh applications with no grades still show "0 added" and manual grade changes still validate correctly
4. **Bug 4 Preservation**: Verify valid tokens still authenticate normally and genuine permission 403s are not intercepted
5. **Bug 5 Preservation**: Verify direct PDF download still works and missing-email error still shows

### Unit Tests

- Bug 1: Vite config test asserting `assetsInlineLimit` is 0
- Bug 2: Test `ApplicationStatus` queryFn re-throws `AuthenticationError` but catches 404
- Bug 3: Test that validation skips grade check when `gradesHydrating` is true
- Bug 3: Test that validation enforces grade check when `gradesHydrating` is false
- Bug 4 (backend): Test `JWTAuthenticationMiddleware` sets `_jwt_expired` flag on expired tokens
- Bug 4 (frontend): Test `ApiClient` triggers refresh on auth-related 403
- Bug 5 (backend): Test `EmailSlipView` creates `EmailQueue` record and dispatches `send_email_task`
- Bug 5 (frontend): Test `slipService` calls backend endpoint when `sendEmail` is true

### Property-Based Tests

- Bug 2: For any error type thrown by `getById()`, if it is an `AuthenticationError` it propagates; if it is any other error, it is caught as "not found" (fast-check)
- Bug 3: For any combination of `gradesHydrating` and `selectedGrades` states, validation produces correct results (fast-check)
- Bug 4 (backend): For any JWT token state (valid, expired, invalid, missing), the middleware + auth class returns the correct HTTP status code (hypothesis)
- Bug 4 (frontend): For any HTTP status and error code combination, the ApiClient correctly decides whether to attempt refresh (fast-check)
- Bug 5 (backend): For any valid application + email combination, the endpoint creates an EmailQueue record before dispatching the task (hypothesis)

### Integration Tests

- Bug 1: Full build + CSP header validation (verify no `data:` URIs in style output)
- Bug 2: Navigate from Payment page to ApplicationStatus with expired session → verify redirect to login
- Bug 3: Restore a draft with server grades → navigate to education step → verify no false "0 added" error
- Bug 4: Let access token expire → make API call → verify refresh is attempted and request succeeds
- Bug 5: Submit application → request email slip → verify email is queued and confirmation shown
