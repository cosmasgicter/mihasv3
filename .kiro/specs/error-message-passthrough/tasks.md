# Implementation Plan: Error Message Passthrough & Unified Error UX

## Tasks

- [ ] 1. Fix ApiErrorHandler to preserve backend messages and consult ERROR_CODE_MESSAGES
  - [ ] 1.1 Add `errorCode` to `ApiErrorContext` interface
  - [ ] 1.2 Rewrite `enhanceError()` priority chain: code map → backend message → status fallback
  - [ ] 1.3 Ensure the built Error always carries `.code`, `.status`, `.fieldErrors`
  - [ ] 1.4 Add `isGenericMessage()` helper to detect non-actionable messages ("Bad Request", "Unauthorized", "API Error:", "Internal Server Error")
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2_

- [ ] 2. Update client.ts to propagate error code
  - [ ] 2.1 After parsing error response, pass `errorCode` to `ApiErrorHandler.enhanceError()`
  - [ ] 2.2 Ensure all throw paths (401 excluded, CSRF retry, 5xx retry) propagate the code
  - [ ] 2.3 Ensure the retry paths also extract and propagate error codes from retry responses
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Expand ERROR_CODE_MESSAGES with all backend codes
  - [ ] 3.1 Add all auth codes: INVALID_CREDENTIALS, ACCOUNT_LOCKED, TOO_MANY_ATTEMPTS, EMAIL_EXISTS
  - [ ] 3.2 Add all application codes: DUPLICATE_APPLICATION, INTAKE_DEADLINE_PASSED, INTAKE_CAPACITY_FULL, INVALID_STATUS_TRANSITION, WITHDRAWAL_INVALID_STATUS, AMENDMENT_INVALID_STATUS, MAX_PENDING_AMENDMENTS
  - [ ] 3.3 Add all payment codes: MAX_PAYMENT_ATTEMPTS_EXCEEDED, ALREADY_PAID, PAYMENT_AMOUNT_MISMATCH
  - [ ] 3.4 Add all batch/enrollment codes: BATCH_SIZE_EXCEEDED, CONFIRMATION_TOKEN_INVALID, DEADLINE_PASSED
  - [ ] 3.5 Update existing entries to use the backend's actual messages (match backend wording)
  - _Requirements: 1.2, 5.1, 5.2, 5.3, 5.4_

- [ ] 4. Simplify auth pages error display
  - [ ] 4.1 SignInPage: remove `getErrorMessage()`, display `signInMutation.error?.message` directly
  - [ ] 4.2 SignInPage: add contextual "Reset password" link when code is ACCOUNT_LOCKED
  - [ ] 4.3 SignInPage: add contextual "Sign in instead" link when code is EMAIL_EXISTS (on signup redirect)
  - [ ] 4.4 SignUpPage: remove `getErrorMessage()`, display error.message directly
  - [ ] 4.5 SignUpPage: add "Sign in instead" link when code is EMAIL_EXISTS
  - _Requirements: 2.3, 4.1, 4.2, 5.1, 5.4_

- [ ] 5. Fix error propagation in useSessionListener
  - [ ] 5.1 In `signIn()` catch block: preserve error.code on the returned `{ error }` object
  - [ ] 5.2 In `signUp()` catch block: preserve error.code
  - [ ] 5.3 In `resetPassword()` catch block: preserve error.code
  - _Requirements: 3.1, 3.4_

- [ ] 6. Fix hooks that swallow backend messages
  - [ ] 6.1 useApplicationPaymentAction: preserve error.message, use error.code for MAX_PAYMENT_ATTEMPTS_EXCEEDED UI
  - [ ] 6.2 useApplicationSubmit: preserve error.message instead of hardcoded "Failed to submit application"
  - [ ] 6.3 useDraftManager: preserve error.message instead of "Failed to delete draft"
  - [ ] 6.4 useAutoSave: preserve error.message instead of "Failed to sync with server"
  - [ ] 6.5 useApplicationsData (admin): preserve error.message instead of "Failed to load applications"
  - [ ] 6.6 useApplicationStatusUpdate (admin): preserve error.message in toast
  - [ ] 6.7 useEligibilityChecker: preserve error.message for all 6 catch blocks
  - [ ] 6.8 useUserManagement: preserve error.message for all 5 catch blocks
  - _Requirements: 2.3, 2.5_

- [ ] 7. Add contextual UI for specific error codes
  - [ ] 7.1 PaymentStep: show "Contact support" message for MAX_PAYMENT_ATTEMPTS_EXCEEDED
  - [ ] 7.2 PaymentStep: show "View receipt" link for ALREADY_PAID
  - [ ] 7.3 Application wizard: show "Resume existing" link for DUPLICATE_APPLICATION
  - _Requirements: 5.2, 5.3_

- [ ] 8. Ensure all error displays meet accessibility requirements
  - [ ] 8.1 Verify all `<Banner variant="error">` instances have `role="alert" aria-live="assertive"`
  - [ ] 8.2 Verify all toast errors use the correct ARIA pattern
  - [ ] 8.3 Verify error messages are not truncated (no `truncate` or `line-clamp` on error text)
  - _Requirements: 4.4, 4.5, 4.6_

- [ ] 9. Deprecate createUserFriendlyError in lib/utils.ts
  - [ ] 9.1 Find all callers of `createUserFriendlyError`
  - [ ] 9.2 Replace with direct `error.message` usage (the message is already user-friendly after ApiErrorHandler)
  - [ ] 9.3 Mark the function as `@deprecated` with a comment pointing to ApiErrorHandler
  - _Requirements: 2.4_

- [ ] 10. Verification
  - [ ] 10.1 Run `tsc --noEmit` — zero new errors
  - [ ] 10.2 Test login with wrong credentials → verify specific message appears
  - [ ] 10.3 Test login with locked account → verify lockout message + reset link
  - [ ] 10.4 Test payment with max attempts → verify specific message
  - [ ] 10.5 Test duplicate application creation → verify specific message + resume link
  - [ ] 10.6 Run existing frontend tests: `bun run test`
