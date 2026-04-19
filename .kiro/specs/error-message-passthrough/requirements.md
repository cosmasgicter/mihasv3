# Requirements: Error Message Passthrough & Unified Error UX

## Introduction

The MIHAS admissions frontend has a systemic error handling problem: the backend returns specific, actionable error messages with error codes, but the frontend overwrites them with generic messages at multiple layers. This creates a poor user experience where students see "Authentication required. Please sign in again." instead of "The email or password you entered is incorrect."

The root cause is three competing error handling systems that don't coordinate:

1. **`ApiErrorHandler.enhanceError()`** (client.ts layer) — intercepts all API errors and replaces backend messages with hardcoded generic text based on HTTP status code alone.
2. **`ERROR_CODE_MESSAGES`** (errorMessages.ts) — a code-to-message map that is never consulted by the API client.
3. **Per-component fallbacks** — 40+ hooks/pages each define their own `getErrorMessage()` or hardcoded "Failed to..." strings.

The result: backend engineers write specific error messages, but students never see them.

## Problem Evidence

| Backend returns | Frontend shows | Root cause |
|----------------|---------------|------------|
| `"The email or password you entered is incorrect."` (401) | "Authentication required. Please sign in again." | `apiErrorHandler.ts:60` overwrites 401 |
| `"Your account has been temporarily locked..."` (429) | "Too many requests. Please wait a moment." | `apiErrorHandler.ts:68` overwrites 429 |
| `"Application fee has already been paid."` (400) | "Invalid request. Please check your input." | `apiErrorHandler.ts:54` overwrites 400 when message starts with "API Error:" |
| `"Intake deadline has passed."` (400, code: INTAKE_DEADLINE_PASSED) | "Invalid request. Please check your input." | Same — `hasActionableValidationMessage` check fails on prefixed messages |
| `"Maximum 3 pending amendments allowed."` (400) | Correct (passes through) | Works when message doesn't start with "API Error:" |

## Requirements

### Requirement 1: Backend Error Messages Must Pass Through to the UI

**User Story:** As a student, I want to see the exact error message the system generated for my specific situation, so that I know what went wrong and how to fix it.

#### Acceptance Criteria

1. WHEN the backend returns a JSON response with an `error` field containing a non-empty string, THE frontend SHALL display that exact string to the user without modification.
2. WHEN the backend returns a JSON response with a `code` field, THE frontend SHALL first check `ERROR_CODE_MESSAGES` for a mapped message. IF a mapping exists, use it. OTHERWISE, use the `error` field value.
3. THE `ApiErrorHandler.enhanceError()` SHALL only generate a generic message when the backend response contains NO actionable error text (empty `error` field, or the error text is a raw HTTP status phrase like "Bad Request" or "Unauthorized").
4. THE `ApiErrorHandler.enhanceError()` SHALL preserve the `code` field from the backend response on the enhanced Error object.
5. WHEN a network error occurs (no server response), THE frontend SHALL display the network-specific message from `NETWORK_ERROR_MESSAGE`.
6. WHEN a timeout occurs, THE frontend SHALL display `TIMEOUT_ERROR_MESSAGE`.

### Requirement 2: Eliminate Duplicate Error Handling Systems

**User Story:** As a developer, I want a single error handling path so that error messages are consistent and maintainable.

#### Acceptance Criteria

1. THE `ApiErrorHandler.enhanceError()` SHALL be the single point of error message resolution for all API errors.
2. `ApiErrorHandler.enhanceError()` SHALL consult `ERROR_CODE_MESSAGES` when a `code` is present on the original error, using the mapped message if available.
3. Per-component `getErrorMessage()` functions (in SignInPage, SignUpPage, etc.) SHALL be removed or simplified to just read `error.message` directly — they SHALL NOT re-interpret or override the message.
4. THE `createUserFriendlyError()` function in `lib/utils.ts` SHALL be deprecated in favor of `ApiErrorHandler.enhanceError()`.
5. ALL hooks that catch errors and produce fallback messages (e.g., "Failed to delete draft") SHALL use the pattern: `error instanceof Error ? error.message : 'Fallback message'` — preserving the backend message when available.

### Requirement 3: Error Code Propagation

**User Story:** As a frontend developer, I want access to the backend error code so that I can implement code-specific UI behavior (e.g., showing a "Reset Password" link for ACCOUNT_LOCKED).

#### Acceptance Criteria

1. THE Error object thrown by `apiClient.request()` SHALL include a `code` property containing the backend's error code string (e.g., "INVALID_CREDENTIALS", "ACCOUNT_LOCKED", "INTAKE_DEADLINE_PASSED").
2. THE Error object SHALL include a `status` property containing the HTTP status code.
3. THE Error object SHALL include a `fieldErrors` property (when present) containing field-level validation errors from the backend's `details` object.
4. Components MAY use `error.code` to render contextual UI (e.g., a "Forgot password?" link when code is "INVALID_CREDENTIALS", a countdown timer when code is "ACCOUNT_LOCKED").

### Requirement 4: Error Display Consistency

**User Story:** As a student, I want error messages to appear in a consistent location and style across all pages, so that I always know where to look when something goes wrong.

#### Acceptance Criteria

1. ALL page-level API errors SHALL be displayed using the `<Banner variant="error">` component.
2. ALL mutation errors in forms SHALL be displayed above the form's submit button using `<Banner>` or `<InlineFormFeedback>`.
3. ALL toast-based error notifications SHALL use the `addToast('error', ...)` pattern with the backend's error message.
4. Error messages SHALL NOT be truncated or ellipsized — the full backend message SHALL be visible.
5. Error banners SHALL be dismissible via a close button.
6. Error banners SHALL include `role="alert" aria-live="assertive"` for screen reader announcement.

### Requirement 5: Specific Error Scenarios

#### 5.1 Login Errors
1. WHEN credentials are invalid (code: INVALID_CREDENTIALS), show: "The email or password you entered is incorrect. Please check your credentials and try again."
2. WHEN account is locked (code: ACCOUNT_LOCKED), show the backend message AND a "Reset your password" link.
3. WHEN rate-limited (code: TOO_MANY_ATTEMPTS), show the backend message with the wait duration.

#### 5.2 Payment Errors
1. WHEN max attempts exceeded (code: MAX_PAYMENT_ATTEMPTS_EXCEEDED), show the backend message AND the remaining attempts count.
2. WHEN payment already completed (code: ALREADY_PAID), show: "Application fee has already been paid." with a "View receipt" link.

#### 5.3 Application Errors
1. WHEN duplicate detected (code: DUPLICATE_APPLICATION), show the backend message AND a "Resume existing application" link.
2. WHEN intake deadline passed (code: INTAKE_DEADLINE_PASSED), show the backend message clearly.
3. WHEN withdrawal reason too short, show inline validation (not a banner).

#### 5.4 Registration Errors
1. WHEN email already exists (code: EMAIL_EXISTS), show: "An account with this email already exists." AND a "Sign in instead" link.
2. WHEN password too weak, show the specific requirement that failed.

## Scope

### Files to modify:
- `src/lib/apiErrorHandler.ts` — primary fix: preserve backend messages, consult ERROR_CODE_MESSAGES
- `src/services/client.ts` — propagate `code` on Error objects
- `src/lib/errorMessages.ts` — expand ERROR_CODE_MESSAGES with all backend codes
- `src/pages/auth/SignInPage.tsx` — simplify error display, add contextual links
- `src/pages/auth/SignUpPage.tsx` — simplify error display, add contextual links
- `src/hooks/auth/useSessionListener.ts` — preserve error.code through the chain
- `src/hooks/useApplicationPaymentAction.ts` — use error.code for specific UI
- `src/hooks/useApplicationSubmit.ts` — preserve backend messages
- `src/hooks/useDraftManager.ts` — preserve backend messages
- `src/hooks/useAutoSave.ts` — preserve backend messages
- `src/hooks/admin/useApplicationsData.ts` — preserve backend messages
- `src/hooks/admin/useApplicationStatusUpdate.ts` — preserve backend messages
- `src/pages/student/applicationWizard/steps/PaymentStep.tsx` — code-specific UI

### Backend error codes to map (from backend views.py, services.py, payment_service.py):
- VALIDATION_ERROR, INVALID_CREDENTIALS, ACCOUNT_LOCKED, TOO_MANY_ATTEMPTS
- DUPLICATE_APPLICATION, INTAKE_DEADLINE_PASSED, INTAKE_CAPACITY_FULL
- MAX_PAYMENT_ATTEMPTS_EXCEEDED, ALREADY_PAID, PAYMENT_AMOUNT_MISMATCH
- INVALID_STATUS_TRANSITION, WITHDRAWAL_INVALID_STATUS, AMENDMENT_INVALID_STATUS
- MAX_PENDING_AMENDMENTS, BATCH_SIZE_EXCEEDED, CONFIRMATION_TOKEN_INVALID
- DEADLINE_PASSED, CONDITION_NOT_FOUND, APPLICATION_NOT_FOUND
- REVIEWER_INVALID_ROLE, REVIEWER_WORKLOAD_EXCEEDED
