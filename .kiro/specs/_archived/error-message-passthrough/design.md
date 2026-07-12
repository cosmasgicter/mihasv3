# Design: Error Message Passthrough & Unified Error UX

## Architecture Decision: Single Error Resolution Point

The `ApiErrorHandler.enhanceError()` becomes the **sole** error message resolver. It follows this priority chain:

```
1. Backend `code` → lookup in ERROR_CODE_MESSAGES → use mapped message
2. Backend `error` field → if non-generic (not "Bad Request", "Unauthorized", etc.) → use as-is
3. HTTP status → generate generic fallback
```

This ensures backend-specific messages always win over generic frontend fallbacks.

## Error Object Shape

```typescript
interface ApiError extends Error {
  message: string          // User-facing message (from backend or mapped)
  status?: number          // HTTP status code
  code?: string            // Backend error code (e.g., "INVALID_CREDENTIALS")
  fieldErrors?: Record<string, string>  // Field-level validation errors
  endpoint?: string        // API endpoint that failed
  method?: string          // HTTP method
}
```

## Resolution Flow

```
Backend Response (JSON)
  ├── { error: "...", code: "...", details: {...} }
  │
  ▼
client.ts: parseErrorResponse()
  ├── Extracts: errorMessage, errorCode, fieldErrors
  ├── Creates: Error with .message, .status, .code, .fieldErrors
  │
  ▼
ApiErrorHandler.enhanceError()
  ├── IF code exists AND ERROR_CODE_MESSAGES[code] → use mapped message
  ├── ELSE IF originalMessage is actionable → preserve it
  ├── ELSE → generate status-based fallback
  ├── Always preserves: .code, .status, .fieldErrors
  │
  ▼
Component Layer
  ├── Displays error.message in <Banner> or toast
  ├── Optionally checks error.code for contextual UI
  └── Optionally displays error.fieldErrors inline
```

## Changes Required

### 1. `src/lib/apiErrorHandler.ts`

```typescript
// Add code to the context interface
export interface ApiErrorContext {
  endpoint: string
  method: string
  statusCode?: number
  originalError: unknown
  errorCode?: string  // NEW: backend error code
}

// In enhanceError():
// 1. Check ERROR_CODE_MESSAGES first
// 2. Then check originalMessage
// 3. Then fall back to status-based generic

static enhanceError(context: ApiErrorContext): Error {
  const { errorCode, originalError, statusCode } = context
  
  // Priority 1: Mapped error code
  if (errorCode && ERROR_CODE_MESSAGES[errorCode]) {
    return buildError(ERROR_CODE_MESSAGES[errorCode], errorCode)
  }
  
  // Priority 2: Backend's own message (if actionable)
  if (hasActionableMessage) {
    return buildError(originalMessage, errorCode)
  }
  
  // Priority 3: Status-based fallback
  // ... existing switch/case
}
```

### 2. `src/services/client.ts`

Pass `errorCode` through to `ApiErrorHandler.enhanceError()`:

```typescript
const enhancedError = ApiErrorHandler.enhanceError({
  endpoint: normalizedEndpoint,
  method,
  statusCode: response.status,
  originalError: statusError,
  errorCode,  // NEW
});
```

### 3. `src/lib/errorMessages.ts`

Expand `ERROR_CODE_MESSAGES` with all backend codes:

```typescript
export const ERROR_CODE_MESSAGES: Record<string, string> = {
  // Auth
  INVALID_CREDENTIALS: 'The email or password you entered is incorrect. Please check your credentials and try again.',
  ACCOUNT_LOCKED: 'Your account has been temporarily locked due to too many failed attempts. Please try again in 30 minutes or reset your password.',
  TOO_MANY_ATTEMPTS: 'Too many login attempts. Please wait before trying again.',
  EMAIL_EXISTS: 'An account with this email already exists.',
  
  // Application
  DUPLICATE_APPLICATION: 'You already have an active application for this program.',
  INTAKE_DEADLINE_PASSED: 'The application deadline for this intake has passed.',
  INTAKE_CAPACITY_FULL: 'This intake has reached its maximum capacity.',
  INVALID_STATUS_TRANSITION: 'This action is not available for the current application status.',
  
  // Payment
  MAX_PAYMENT_ATTEMPTS_EXCEEDED: 'Maximum payment attempts reached. Please contact support.',
  ALREADY_PAID: 'The application fee has already been paid.',
  PAYMENT_AMOUNT_MISMATCH: 'Payment amount does not match the expected fee.',
  
  // Amendments
  MAX_PENDING_AMENDMENTS: 'Maximum of 3 pending amendments allowed.',
  AMENDMENT_INVALID_STATUS: 'Amendments can only be requested for submitted applications.',
  
  // Batch
  BATCH_SIZE_EXCEEDED: 'Maximum batch size of 25 applications exceeded.',
  CONFIRMATION_TOKEN_INVALID: 'Invalid confirmation token. Please retry the operation.',
  
  // Enrollment
  DEADLINE_PASSED: 'The enrollment confirmation deadline has passed.',
  
  // Withdrawal
  WITHDRAWAL_INVALID_STATUS: 'This application cannot be withdrawn in its current status.',
  
  // General
  CSRF_VALIDATION_FAILED: 'Your session security token has expired. Please try again.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please wait a moment.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  SERVER_ERROR: 'Something went wrong on our end. Please try again later.',
}
```

### 4. Component Simplification

Remove per-page `getErrorMessage()` functions. Replace with direct `error.message` usage:

```tsx
// BEFORE (SignInPage.tsx)
const getErrorMessage = (error: Error | null) => {
  if (!error) return '';
  const message = error.message || 'Failed to sign in. Please try again.';
  return message;
};

// AFTER
// Just use signInMutation.error?.message directly in the Banner
```

### 5. Contextual UI Based on Error Code

```tsx
// SignInPage.tsx — show "Reset password" link for locked accounts
{signInMutation.error && (signInMutation.error as ApiError).code === 'ACCOUNT_LOCKED' && (
  <Link to="/auth/forgot-password" className="text-sm text-primary">
    Reset your password
  </Link>
)}

// PaymentStep.tsx — show remaining attempts
{error?.code === 'MAX_PAYMENT_ATTEMPTS_EXCEEDED' && (
  <p>Contact admissions support for assistance.</p>
)}
```

## Non-Goals

- This spec does NOT change backend error messages or codes.
- This spec does NOT add new error codes to the backend.
- This spec does NOT change the HTTP status codes returned by the backend.
- This spec does NOT add error tracking/reporting (that's a separate concern).
