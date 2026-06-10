/**
 * Mirror of `backend/apps/common/error_codes.py::ERROR_CODES`.
 *
 * This fixture is the frontend's reference copy of the canonical backend
 * error catalog. The drift-guard test (`errorCodesDriftGuard.test.ts`)
 * reads the backend Python source and compares keys against this fixture.
 *
 * When the backend catalog adds a new code, update this fixture — the
 * drift test will flag both additions and removals.
 */

export const BACKEND_ERROR_CODES: Record<string, { http_status: number; message: string; category: string }> = {
  // Payment (from payment_error_codes.py)
  NOT_OWNER: { http_status: 403, message: 'Not authorized', category: 'payment' },
  APPLICATION_NOT_FOUND: { http_status: 404, message: 'Application not found', category: 'payment' },
  APPLICATION_NOT_PAYABLE: { http_status: 400, message: 'Application is not payable', category: 'payment' },
  ALREADY_PAID: { http_status: 200, message: 'Application is already paid', category: 'payment' },
  MAX_PAYMENT_ATTEMPTS_EXCEEDED: { http_status: 400, message: 'Maximum payment attempts exceeded. Please contact support.', category: 'payment' },
  PAYMENT_PENDING: { http_status: 200, message: 'Payment is still being processed', category: 'payment' },
  PAYMENT_CONFIRMED: { http_status: 200, message: 'Payment confirmed', category: 'payment' },
  AMOUNT_MISMATCH: { http_status: 200, message: 'Payment amount does not match expected fee', category: 'payment' },
  CURRENCY_MISMATCH: { http_status: 200, message: 'Payment currency does not match expected currency', category: 'payment' },
  MISSING_PROVIDER_REFERENCE: { http_status: 200, message: 'Payment provider reference is missing', category: 'payment' },
  PROVIDER_UNAVAILABLE: { http_status: 200, message: 'Payment provider is temporarily unavailable. Please try again.', category: 'payment' },
  PAYMENT_UNAVAILABLE: { http_status: 503, message: 'Payment processing is unavailable', category: 'payment' },
  FEE_UNAVAILABLE: { http_status: 404, message: 'Fee is not available for this program and residency', category: 'payment' },
  PAYMENT_SENSITIVE_FIELDS_LOCKED: { http_status: 409, message: 'Payment-sensitive fields cannot be changed while payment activity exists', category: 'payment' },
  DRAFT_DELETE_BLOCKED_BY_PAYMENT: { http_status: 409, message: 'Draft cannot be deleted while a payment record exists', category: 'payment' },
  CANNOT_REVERSE_SUCCESSFUL_PAYMENT: { http_status: 409, message: 'A successful payment cannot be reversed', category: 'payment' },
  OVERRIDE_REASON_REQUIRED: { http_status: 400, message: 'A reason of at least 10 characters is required', category: 'payment' },
  RECEIPT_NOT_ELIGIBLE: { http_status: 409, message: 'Receipt is not available for this payment', category: 'payment' },
  // Common
  NOT_FOUND: { http_status: 404, message: 'Resource not found', category: 'common' },
  RATE_LIMITED: { http_status: 429, message: 'Too many requests. Please wait and try again.', category: 'common' },
  // Auth
  INSUFFICIENT_PERMISSIONS: { http_status: 403, message: 'You do not have permission for this action', category: 'auth' },
  AUTHENTICATION_REQUIRED: { http_status: 401, message: 'Authentication required', category: 'auth' },
  CSRF_MISSING: { http_status: 403, message: 'CSRF token missing', category: 'auth' },
  CSRF_INVALID: { http_status: 403, message: 'CSRF token invalid', category: 'auth' },
  NO_REFRESH_TOKEN: { http_status: 401, message: 'Refresh token not provided', category: 'auth' },
  TOKEN_EXPIRED: { http_status: 401, message: 'Token has expired', category: 'auth' },
  INVALID_TOKEN: { http_status: 401, message: 'Invalid token', category: 'auth' },
  AUTH_SERVICE_ERROR: { http_status: 500, message: 'Authentication service error', category: 'auth' },
  PRIVILEGE_ESCALATION: { http_status: 403, message: 'Cannot assign a role higher than your own', category: 'auth' },
  INSUFFICIENT_PRIVILEGES: { http_status: 403, message: 'Insufficient privileges for this operation', category: 'auth' },
  SELF_DEACTIVATION_FORBIDDEN: { http_status: 403, message: 'Cannot deactivate your own account', category: 'auth' },
  DUPLICATE_EMAIL: { http_status: 409, message: 'An account with this email already exists', category: 'auth' },
  // Validation
  VALIDATION_ERROR: { http_status: 400, message: 'Validation failed', category: 'validation' },
  INVALID_FORMAT: { http_status: 400, message: 'Invalid format', category: 'validation' },
  INVALID_STATUS_TRANSITION: { http_status: 400, message: 'Invalid status transition', category: 'validation' },
  // Application
  DUPLICATE_APPLICATION: { http_status: 409, message: 'An application for this program already exists', category: 'application' },
  DUPLICATE_SUBMITTED_APPLICATION: { http_status: 409, message: 'A submitted application for this program already exists', category: 'application' },
  PAYMENT_REQUIRED: { http_status: 402, message: 'Payment is required before submission', category: 'application' },
  IDENTITY_DOCUMENT_REQUIRED: { http_status: 400, message: 'NRC or Passport document is required', category: 'application' },
  LATE_FEE_REQUIRED: { http_status: 402, message: 'Late application fee is required', category: 'application' },
  LATE_FEE_CHECK_FAILED: { http_status: 400, message: 'Late fee check failed', category: 'application' },
  ALREADY_SUBMITTED: { http_status: 409, message: 'Application has already been submitted', category: 'application' },
  INTAKE_DEADLINE_PASSED: { http_status: 400, message: 'The intake deadline has passed', category: 'application' },
  INTAKE_NOT_OPEN: { http_status: 400, message: 'This intake is not currently open', category: 'application' },
  INTAKE_CAPACITY_REACHED: { http_status: 400, message: 'Intake capacity has been reached', category: 'application' },
  PROGRAM_CAPACITY_REACHED: { http_status: 400, message: 'Program capacity has been reached', category: 'application' },
  APPLICATION_NOT_EDITABLE: { http_status: 409, message: 'Application cannot be edited in its current state', category: 'application' },
  CONFIRM_SUBMISSION_REQUIRED: { http_status: 400, message: 'Submission confirmation is required', category: 'application' },
  DRAFT_HAS_PAYMENT_ACTIVITY: { http_status: 409, message: 'Draft has payment activity and cannot be modified', category: 'application' },
  APPLICATION_DELETE_FAILED: { http_status: 400, message: 'Application could not be deleted', category: 'application' },
  NOT_WAITLISTED: { http_status: 400, message: 'Application is not in waitlisted status', category: 'application' },
  INVALID_STATUS_FOR_CONDITIONS: { http_status: 400, message: 'Conditions cannot be set for this application status', category: 'application' },
  NO_CONDITIONS_PROVIDED: { http_status: 400, message: 'At least one condition must be provided', category: 'application' },
  MISSING_DESCRIPTION: { http_status: 400, message: 'Description is required', category: 'application' },
  MISSING_DEADLINE: { http_status: 400, message: 'Deadline is required', category: 'application' },
  INVALID_CONDITION_TYPE: { http_status: 400, message: 'Invalid condition type', category: 'application' },
  CONDITION_NOT_PENDING: { http_status: 400, message: 'Condition is not in pending status', category: 'application' },
  INVALID_CONDITION_STATUS: { http_status: 400, message: 'Invalid condition status', category: 'application' },
  // Auth (extended) — Stream 7 Wave 5 additions
  ACCOUNT_LOCKED: { http_status: 423, message: 'Account is temporarily locked due to too many failed login attempts', category: 'auth' },
  INVALID_CREDENTIALS: { http_status: 401, message: 'Invalid email or password', category: 'auth' },
  TOO_MANY_ATTEMPTS: { http_status: 429, message: 'Too many attempts. Please wait and try again.', category: 'auth' },
  TOKEN_ALREADY_USED: { http_status: 400, message: 'This token has already been used', category: 'auth' },
  // Bulk operations
  BATCH_SIZE_EXCEEDED: { http_status: 400, message: 'Batch size exceeds the maximum allowed', category: 'validation' },
  BATCH_TOO_LARGE: { http_status: 400, message: 'Batch is too large', category: 'validation' },
  BATCH_VALIDATION_FAILED: { http_status: 400, message: 'Batch validation failed', category: 'validation' },
  BULK_UPDATE_ERROR: { http_status: 500, message: 'Bulk update failed', category: 'validation' },
  INVALID_CONFIRMATION_TOKEN: { http_status: 400, message: 'Invalid confirmation token', category: 'validation' },
  // Document & file uploads
  FILE_TOO_LARGE: { http_status: 413, message: 'File exceeds maximum upload size', category: 'document' },
  INVALID_FILE: { http_status: 400, message: 'Invalid file format or content', category: 'document' },
  NO_FILE: { http_status: 400, message: 'No file provided', category: 'document' },
  STORAGE_ERROR: { http_status: 500, message: 'File storage operation failed', category: 'document' },
  ASSET_INVALID: { http_status: 400, message: 'Asset file failed MIME, magic-byte, or size validation', category: 'document' },
  TEMPLATE_TOKEN_REJECTED: { http_status: 400, message: 'Disallowed section or token in document template', category: 'document' },
  // Catalog
  INACTIVE_INTAKE: { http_status: 400, message: 'The selected intake is not active', category: 'common' },
  INVALID_INSTITUTION: { http_status: 400, message: 'Invalid institution', category: 'common' },
  INVALID_PROGRAM_INTAKE: { http_status: 400, message: 'The program is not available for this intake', category: 'common' },
  // Offering assignment (multi-tenant Beanola — submission revalidation)
  NO_ELIGIBLE_OFFERING: { http_status: 409, message: 'No eligible school offering is available for this program and intake', category: 'application' },
  OFFERING_NO_LONGER_AVAILABLE: { http_status: 409, message: 'The previously assigned school offering is no longer available', category: 'application' },
  OFFERING_CAPACITY_FULL: { http_status: 409, message: "The assigned offering's capacity filled before submission", category: 'application' },
  // Interview
  INTERVIEWER_CONFLICT: { http_status: 409, message: 'Interviewer schedule conflict', category: 'application' },
  INVALID_MODE: { http_status: 400, message: 'Invalid interview mode', category: 'application' },
  INVALID_STATUS: { http_status: 400, message: 'Invalid status', category: 'application' },
  // Reviewer assignment
  INVALID_REVIEWER_ROLE: { http_status: 400, message: 'User does not have a reviewer role', category: 'application' },
  NO_REVIEWERS: { http_status: 400, message: 'No reviewers available for assignment', category: 'application' },
  REVIEWER_NOT_FOUND: { http_status: 404, message: 'Reviewer not found', category: 'application' },
  // Application review
  INVALID_TRANSITION: { http_status: 400, message: 'Invalid status transition', category: 'application' },
  PAYMENT_RECORD_REQUIRED: { http_status: 400, message: 'Payment record required to perform this action', category: 'payment' },
  PAYMENT_UNVERIFIED: { http_status: 400, message: 'Payment has not been verified', category: 'payment' },
  // Validation (extended)
  DUPLICATE_KEY: { http_status: 409, message: 'Duplicate key — record already exists', category: 'validation' },
  DUPLICATE_SUBJECT: { http_status: 400, message: 'Subject already exists in the application', category: 'validation' },
  MINIMUM_AGE_NOT_MET: { http_status: 400, message: 'Minimum age requirement not met', category: 'validation' },
  MINIMUM_SUBJECTS_REQUIRED: { http_status: 400, message: 'Minimum number of subjects required', category: 'validation' },
  // Payment (extended)
  PAYMENT_ERROR: { http_status: 400, message: 'Payment processing error', category: 'payment' },
  VERIFICATION_ERROR: { http_status: 500, message: 'Payment verification failed', category: 'payment' },
  // Common operational
  DASHBOARD_ERROR: { http_status: 500, message: 'Dashboard data could not be loaded', category: 'common' },
  SERVICE_UNAVAILABLE: { http_status: 503, message: 'Service temporarily unavailable', category: 'common' },
  // Security hardening
  BLACKLIST_UNAVAILABLE: { http_status: 503, message: 'Token blacklist service unavailable', category: 'auth' },
  DRAFT_TOO_LARGE: { http_status: 413, message: 'Draft data exceeds maximum size', category: 'application' },
  DRAFT_TOO_NESTED: { http_status: 400, message: 'Draft data exceeds maximum nesting depth', category: 'application' },
  INVALID_DRAFT_DATA: { http_status: 400, message: 'Draft data is not valid JSON', category: 'application' },
  FIELD_NAME_TOO_LONG: { http_status: 400, message: 'Field name exceeds maximum length', category: 'application' },
  VALUE_TOO_LONG: { http_status: 400, message: 'Value exceeds maximum length', category: 'application' },
  REASON_TOO_LONG: { http_status: 400, message: 'Reason exceeds maximum length', category: 'application' },
}

/** Sorted list of all canonical error code keys */
export const BACKEND_ERROR_CODE_KEYS = Object.keys(BACKEND_ERROR_CODES).sort()
