/**
 * Error Code → User-Friendly Message Map
 *
 * Maps API error codes to clear, actionable messages for students.
 * Translates raw error codes into human-readable text.
 *
 * Requirements: 16.1, 16.2, 16.3
 */

/** Map of API error codes to user-friendly messages.
 *
 * Mirrors the canonical backend catalog at
 * `backend/apps/common/error_codes.py::ERROR_CODES`.
 * Drift is detected by `tests/unit/errorCodesDriftGuard.test.ts`.
 */
export const ERROR_CODE_MESSAGES: Record<string, string> = {
  // Legacy codes (kept for backward compat)
  CSRF_VALIDATION_FAILED: 'Your session has expired. Please try again.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please wait a moment.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  ACCOUNT_LOCKED: 'Account temporarily locked. Try again in 30 minutes.',
  VERSION_CONFLICT: 'Your changes conflict with a newer version.',
  FILE_TYPE_NOT_ALLOWED: 'Only PDF, JPEG, and PNG files are accepted.',
  FILE_TOO_LARGE: 'File must be smaller than 10MB.',
  FILE_CONTENT_MISMATCH: 'File content does not match the declared type.',
  SECURITY_VIOLATION: 'Request blocked for security reasons. Please try again.',
  INVALID_INPUT: 'Invalid input. Please check your data and try again.',
  PROGRAM_CAPACITY_REACHED: 'This program for the selected intake is full. Please choose another intake or program.',
  RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'Something went wrong. Please try again.',

  // --- Canonical codes (from backend/apps/common/error_codes.py) ---

  // Payment
  NOT_OWNER: 'You do not have permission to perform this action.',
  APPLICATION_NOT_FOUND: 'Application not found.',
  APPLICATION_NOT_PAYABLE: 'This application cannot be paid for yet.',
  ALREADY_PAID: 'Payment for this application is already complete.',
  MAX_PAYMENT_ATTEMPTS_EXCEEDED: 'Maximum payment attempts exceeded. Please contact support.',
  PAYMENT_PENDING: 'Your payment is still being processed.',
  PAYMENT_CONFIRMED: 'Payment confirmed.',
  AMOUNT_MISMATCH: 'Payment amount does not match the expected fee.',
  CURRENCY_MISMATCH: 'Payment currency does not match the expected currency.',
  MISSING_PROVIDER_REFERENCE: 'Payment provider reference is missing.',
  PROVIDER_UNAVAILABLE: 'Payment service is temporarily unavailable. Please try again.',
  PAYMENT_UNAVAILABLE: 'Payment processing is not available right now.',
  FEE_UNAVAILABLE: 'Fee is not available for this program.',
  PAYMENT_SENSITIVE_FIELDS_LOCKED: 'These fields cannot be changed while payment activity exists.',
  DRAFT_DELETE_BLOCKED_BY_PAYMENT: 'Draft cannot be deleted while a payment record exists.',
  CANNOT_REVERSE_SUCCESSFUL_PAYMENT: 'A successful payment cannot be reversed.',
  OVERRIDE_REASON_REQUIRED: 'A reason of at least 10 characters is required.',
  RECEIPT_NOT_ELIGIBLE: 'Receipt is not available for this payment.',

  // Common
  NOT_FOUND: 'The requested resource was not found.',
  RATE_LIMITED: 'Too many requests. Please wait and try again.',

  // Auth
  INSUFFICIENT_PERMISSIONS: "You don't have permission for this action.",
  AUTHENTICATION_REQUIRED: 'Please sign in to continue.',
  CSRF_MISSING: 'Your session has expired. Please refresh the page.',
  CSRF_INVALID: 'Your session has expired. Please refresh the page.',
  NO_REFRESH_TOKEN: 'Your session has expired. Please sign in again.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  INVALID_TOKEN: 'Your session is invalid. Please sign in again.',
  AUTH_SERVICE_ERROR: 'Authentication service error. Please try again.',
  PRIVILEGE_ESCALATION: 'Cannot assign a role higher than your own.',
  INSUFFICIENT_PRIVILEGES: 'Insufficient privileges for this operation.',
  SELF_DEACTIVATION_FORBIDDEN: 'You cannot deactivate your own account.',
  DUPLICATE_EMAIL: 'An account with this email already exists.',

  // Enterprise tenant authority (capability resolution + scoped staff management)
  CAPABILITY_RESOLUTION_FAILED: 'Your access could not be verified. Please try again or contact your administrator.',
  STAFF_INVITE_FORBIDDEN: 'You cannot invite a user with that role into that institution.',
  STAFF_CREATION_FAILED: 'The staff account could not be created. No changes were saved.',
  INSTITUTION_OVERRIDE_NOT_PERMITTED: 'The selected institution does not match this school. Please try again.',

  // Validation
  VALIDATION_ERROR: 'Some of the details are not valid. Please review and try again.',
  INVALID_FORMAT: 'Invalid format. Please check your input.',
  INVALID_STATUS_TRANSITION: 'This status change is not allowed.',

  // Application
  DUPLICATE_APPLICATION: 'An application for this program already exists.',
  DUPLICATE_SUBMITTED_APPLICATION: 'A submitted application for this program already exists.',
  PAYMENT_REQUIRED: 'Payment is required before submission.',
  IDENTITY_DOCUMENT_REQUIRED: 'NRC or Passport document is required.',
  LATE_FEE_REQUIRED: 'Late application fee is required.',
  LATE_FEE_CHECK_FAILED: 'Late fee check failed.',
  ALREADY_SUBMITTED: 'This application has already been submitted.',
  INTAKE_DEADLINE_PASSED: 'The intake deadline has passed.',
  INTAKE_NOT_OPEN: 'This intake is not currently open.',
  INTAKE_CAPACITY_REACHED: 'Intake capacity has been reached.',
  APPLICATION_NOT_EDITABLE: 'Application cannot be edited in its current state.',
  CONFIRM_SUBMISSION_REQUIRED: 'Please confirm your submission.',
  DRAFT_HAS_PAYMENT_ACTIVITY: 'Draft has payment activity and cannot be modified.',
  APPLICATION_DELETE_FAILED: 'Application could not be deleted.',
  NOT_WAITLISTED: 'Application is not in waitlisted status.',
  INVALID_STATUS_FOR_CONDITIONS: 'Conditions cannot be set for this application status.',
  NO_CONDITIONS_PROVIDED: 'At least one condition must be provided.',
  MISSING_DESCRIPTION: 'Description is required.',
  MISSING_DEADLINE: 'Deadline is required.',
  INVALID_CONDITION_TYPE: 'Invalid condition type.',
  CONDITION_NOT_PENDING: 'Condition is not in pending status.',
  INVALID_CONDITION_STATUS: 'Invalid condition status.',

  // Auth (extended)
  TOO_MANY_ATTEMPTS: 'Too many attempts. Please wait and try again.',
  TOKEN_ALREADY_USED: 'This token has already been used.',

  // Bulk operations
  BATCH_SIZE_EXCEEDED: 'Batch size exceeds the maximum allowed.',
  BATCH_TOO_LARGE: 'Batch is too large.',
  BATCH_VALIDATION_FAILED: 'Batch validation failed.',
  BULK_UPDATE_ERROR: 'Bulk update failed. Please try again.',
  INVALID_CONFIRMATION_TOKEN: 'Invalid confirmation token.',

  // Document & file uploads
  INVALID_FILE: 'Invalid file format or content.',
  NO_FILE: 'No file provided.',
  STORAGE_ERROR: 'File storage operation failed. Please try again.',
  OFFICIAL_DOCUMENT_IMMUTABLE: 'Official generated documents cannot be deleted.',
  DOCUMENT_PROFILE_NOT_CONFIGURED: 'This document is not available yet — its template has not been configured. Please contact the admissions office.',
  ASSET_INVALID: 'This asset must be a PNG, JPEG, WebP, or SVG under 2MB.',
  TEMPLATE_TOKEN_REJECTED: 'Disallowed section or token in document template.',

  // Catalog
  INACTIVE_INTAKE: 'The selected intake is not active.',
  INVALID_INSTITUTION: 'Invalid institution.',
  INVALID_PROGRAM_INTAKE: 'The program is not available for this intake.',

  // Offering assignment (multi-tenant Beanola — submission revalidation)
  NO_ELIGIBLE_OFFERING: 'No school offering is available for this program and intake. Try another intake or contact admissions.',
  OFFERING_NO_LONGER_AVAILABLE: 'The assigned school offering is no longer available. Try another intake or contact admissions.',
  OFFERING_CAPACITY_FULL: 'The assigned offering filled before submission. You can join the waitlist or choose another intake.',

  // Interview
  INTERVIEWER_CONFLICT: 'Interviewer schedule conflict.',
  INVALID_MODE: 'Invalid interview mode.',
  INVALID_STATUS: 'Invalid status.',

  // Reviewer assignment
  INVALID_REVIEWER_ROLE: 'User does not have a reviewer role.',
  NO_REVIEWERS: 'No reviewers available for assignment.',
  REVIEWER_NOT_FOUND: 'Reviewer not found.',

  // Application review
  INVALID_TRANSITION: 'Invalid status transition.',
  PAYMENT_RECORD_REQUIRED: 'Payment record required to perform this action.',
  PAYMENT_UNVERIFIED: 'Payment has not been verified.',

  // Validation (extended)
  DUPLICATE_KEY: 'This record already exists.',
  DUPLICATE_SUBJECT: 'This subject is already in your application.',
  MINIMUM_AGE_NOT_MET: 'Minimum age requirement not met.',
  MINIMUM_SUBJECTS_REQUIRED: 'Please add the minimum number of required subjects.',

  // Payment (extended)
  PAYMENT_ERROR: 'Payment processing error. Please try again.',
  VERIFICATION_ERROR: 'Payment verification failed. Please try again.',

  // Common operational
  DASHBOARD_ERROR: 'Dashboard data could not be loaded. Please try again.',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable. Please try again later.',

  // Security hardening
  BLACKLIST_UNAVAILABLE: 'Token service temporarily unavailable. Please try again.',
  DRAFT_TOO_LARGE: 'Draft data exceeds maximum size. Please reduce the content.',
  DRAFT_TOO_NESTED: 'Draft data is too complex. Please simplify the structure.',
  INVALID_DRAFT_DATA: 'Draft data is invalid. Please try again.',
  FIELD_NAME_TOO_LONG: 'Field name exceeds maximum length.',
  VALUE_TOO_LONG: 'Value exceeds maximum length.',
  REASON_TOO_LONG: 'Reason exceeds maximum length.',
}

/** Default message for network errors (no server response) */
export const NETWORK_ERROR_MESSAGE =
  'Connection error. Please check your internet and try again.'

/** Default message for request timeout */
export const TIMEOUT_ERROR_MESSAGE =
  'Request timed out. Please try again.'

/** Default message for unknown error codes */
export const DEFAULT_ERROR_MESSAGE =
  'An unexpected error occurred. Please try again.'

/**
 * Resolve an API error code to a user-friendly message.
 * Falls back to the raw message or a generic default.
 */
export function getErrorMessageForCode(
  code: string | undefined,
  fallbackMessage?: string
): string {
  if (code && ERROR_CODE_MESSAGES[code]) {
    return ERROR_CODE_MESSAGES[code]
  }
  return fallbackMessage || DEFAULT_ERROR_MESSAGE
}

/**
 * Determine if an error represents a network failure (no server response).
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return true
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('load failed') ||
      msg.includes('net::err')
    )
  }
  return false
}


// ─── Rich Error Message System (merged from src/utils/errorMessages.ts) ───

export interface ErrorMessage {
  title: string;
  description: string;
  action?: string;
  actionLabel?: string;
  technicalDetails?: string;
}

export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  SERVER = 'server',
  CLIENT = 'client',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  FILE_UPLOAD = 'file_upload',
  PAYMENT = 'payment',
  DATABASE = 'database',
  UNKNOWN = 'unknown',
}

interface ErrorLike {
  message?: string
  status?: number
  details?: string
}

export function getErrorMessage(error: ErrorLike): ErrorMessage {
  if (error.message?.includes('fetch') || error.message?.includes('network')) {
    return { title: 'Connection Problem', description: 'We couldn\'t connect to the server.', action: 'retry', actionLabel: 'Try Again', technicalDetails: error.message };
  }
  if (error.status === 401 || error.message?.includes('unauthorized')) {
    return { title: 'Session Expired', description: 'Your session has expired. Please sign in again.', action: '/auth/signin', actionLabel: 'Sign In', technicalDetails: error.message };
  }
  if (error.status === 403 || error.message?.includes('forbidden')) {
    return { title: 'Access Denied', description: 'You don\'t have permission to access this resource.', action: '/contact', actionLabel: 'Contact Support', technicalDetails: error.message };
  }
  if (error.status === 400 || error.message?.includes('validation')) {
    return { title: 'Invalid Information', description: error.details || 'Some information is invalid. Please check and try again.', action: 'review', actionLabel: 'Review Form', technicalDetails: error.message };
  }
  if (error.status === 404) {
    return { title: 'Not Found', description: 'The resource you\'re looking for doesn\'t exist.', action: '/', actionLabel: 'Go Home', technicalDetails: error.message };
  }
  if (error.status && error.status >= 500) {
    return { title: 'Server Error', description: 'Something went wrong on our end.', action: 'retry', actionLabel: 'Try Again', technicalDetails: error.message };
  }
  if (error.message?.includes('timeout')) {
    return { title: 'Request Timeout', description: 'The request took too long.', action: 'retry', actionLabel: 'Try Again', technicalDetails: error.message };
  }
  if (error.status === 429) {
    return { title: 'Too Many Requests', description: 'Please wait a moment and try again.', action: 'wait', actionLabel: 'Wait and Retry', technicalDetails: error.message };
  }
  return { title: 'Something Went Wrong', description: 'An unexpected error occurred.', action: 'retry', actionLabel: 'Try Again', technicalDetails: error.message || JSON.stringify(error) };
}

export function getErrorCategory(error: ErrorLike): ErrorCategory {
  if (error.message?.includes('fetch') || error.message?.includes('network')) return ErrorCategory.NETWORK;
  if (error.status === 401) return ErrorCategory.AUTHENTICATION;
  if (error.status === 403) return ErrorCategory.AUTHORIZATION;
  if (error.status === 400) return ErrorCategory.VALIDATION;
  if (error.status === 404) return ErrorCategory.NOT_FOUND;
  if (error.status === 429) return ErrorCategory.RATE_LIMIT;
  if (error.status && error.status >= 500) return ErrorCategory.SERVER;
  if (error.message?.includes('timeout')) return ErrorCategory.TIMEOUT;
  return ErrorCategory.UNKNOWN;
}

export function formatError(error: ErrorLike): ErrorMessage {
  return getErrorMessage(error);
}

export function isRetryableError(error: ErrorLike): boolean {
  const category = getErrorCategory(error);
  return [ErrorCategory.NETWORK, ErrorCategory.TIMEOUT, ErrorCategory.SERVER, ErrorCategory.RATE_LIMIT].includes(category);
}

export function getRetryDelay(error: ErrorLike, attempt: number): number {
  const category = getErrorCategory(error);
  const baseDelay = 1000;
  const maxDelay = 30000;
  let delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
  delay = Math.min(delay, maxDelay);
  if (category === ErrorCategory.RATE_LIMIT) delay = Math.max(delay, 60000);
  return delay;
}
