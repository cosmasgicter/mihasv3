/**
 * Comprehensive Error Message System
 * 
 * Provides user-friendly, actionable error messages for all error scenarios.
 * 
 * Requirements: 14.4 - Display helpful error messages with suggested next steps
 * Task: 25.3 - Add comprehensive error messages
 * 
 * Error Message Principles:
 * 1. Explain what went wrong in plain language
 * 2. Suggest specific next steps
 * 3. Provide context when available
 * 4. Avoid technical jargon
 * 5. Be empathetic and helpful
 */

export interface ErrorMessage {
  title: string;
  description: string;
  action?: string;
  actionLabel?: string;
  technicalDetails?: string;
}

/**
 * Error categories
 */
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

/**
 * Get user-friendly error message based on error type
 */
export function getErrorMessage(error: any): ErrorMessage {
  // Network errors
  if (error.message?.includes('fetch') || error.message?.includes('network')) {
    return {
      title: 'Connection Problem',
      description: 'We couldn\'t connect to the server. This might be due to a poor internet connection.',
      action: 'retry',
      actionLabel: 'Try Again',
      technicalDetails: error.message,
    };
  }
  
  // Authentication errors
  if (error.status === 401 || error.message?.includes('unauthorized')) {
    return {
      title: 'Session Expired',
      description: 'Your session has expired. Please sign in again to continue.',
      action: '/auth/signin',
      actionLabel: 'Sign In',
      technicalDetails: error.message,
    };
  }
  
  // Authorization errors
  if (error.status === 403 || error.message?.includes('forbidden')) {
    return {
      title: 'Access Denied',
      description: 'You don\'t have permission to access this resource. If you believe this is an error, please contact support.',
      action: '/contact',
      actionLabel: 'Contact Support',
      technicalDetails: error.message,
    };
  }
  
  // Validation errors
  if (error.status === 400 || error.message?.includes('validation')) {
    return {
      title: 'Invalid Information',
      description: error.details || 'Some of the information you provided is invalid. Please check your entries and try again.',
      action: 'review',
      actionLabel: 'Review Form',
      technicalDetails: error.message,
    };
  }
  
  // Not found errors
  if (error.status === 404) {
    return {
      title: 'Not Found',
      description: 'The resource you\'re looking for doesn\'t exist or has been moved.',
      action: '/',
      actionLabel: 'Go Home',
      technicalDetails: error.message,
    };
  }
  
  // Server errors
  if (error.status >= 500) {
    return {
      title: 'Server Error',
      description: 'Something went wrong on our end. Our team has been notified and is working on it.',
      action: 'retry',
      actionLabel: 'Try Again',
      technicalDetails: error.message,
    };
  }
  
  // Timeout errors
  if (error.message?.includes('timeout')) {
    return {
      title: 'Request Timeout',
      description: 'The request took too long to complete. This might be due to a slow connection or server load.',
      action: 'retry',
      actionLabel: 'Try Again',
      technicalDetails: error.message,
    };
  }
  
  // Rate limit errors
  if (error.status === 429) {
    return {
      title: 'Too Many Requests',
      description: 'You\'ve made too many requests. Please wait a moment and try again.',
      action: 'wait',
      actionLabel: 'Wait and Retry',
      technicalDetails: error.message,
    };
  }
  
  // Default error
  return {
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
    action: 'retry',
    actionLabel: 'Try Again',
    technicalDetails: error.message || JSON.stringify(error),
  };
}

/**
 * Specific error messages for common scenarios
 */
export const ErrorMessages = {
  // Authentication
  auth: {
    invalidCredentials: {
      title: 'Invalid Credentials',
      description: 'The email or password you entered is incorrect. Please check and try again.',
      action: 'retry',
      actionLabel: 'Try Again',
    },
    emailNotVerified: {
      title: 'Email Not Verified',
      description: 'Please verify your email address before signing in. Check your inbox for the verification link.',
      action: '/auth/resend-verification',
      actionLabel: 'Resend Verification Email',
    },
    accountLocked: {
      title: 'Account Locked',
      description: 'Your account has been temporarily locked due to multiple failed login attempts. Please try again in 15 minutes or reset your password.',
      action: '/auth/forgot-password',
      actionLabel: 'Reset Password',
    },
    sessionExpired: {
      title: 'Session Expired',
      description: 'Your session has expired for security reasons. Please sign in again to continue.',
      action: '/auth/signin',
      actionLabel: 'Sign In',
    },
  },
  
  // Application submission
  application: {
    incompleteForm: {
      title: 'Incomplete Application',
      description: 'Please fill in all required fields before submitting your application.',
      action: 'review',
      actionLabel: 'Review Application',
    },
    documentsMissing: {
      title: 'Documents Required',
      description: 'Please upload all required documents before submitting your application.',
      action: 'upload',
      actionLabel: 'Upload Documents',
    },
    submissionFailed: {
      title: 'Submission Failed',
      description: 'We couldn\'t submit your application. Your progress has been saved as a draft. Please try again.',
      action: 'retry',
      actionLabel: 'Try Again',
    },
    alreadySubmitted: {
      title: 'Already Submitted',
      description: 'You\'ve already submitted an application for this intake. You can track its status on your dashboard.',
      action: '/student/dashboard',
      actionLabel: 'View Dashboard',
    },
  },
  
  // File upload
  fileUpload: {
    tooLarge: (maxSize: string) => ({
      title: 'File Too Large',
      description: `The file you're trying to upload is too large. Maximum file size is ${maxSize}.`,
      action: 'compress',
      actionLabel: 'Try a Smaller File',
    }),
    invalidType: (allowedTypes: string) => ({
      title: 'Invalid File Type',
      description: `This file type is not supported. Please upload one of: ${allowedTypes}.`,
      action: 'convert',
      actionLabel: 'Choose Another File',
    }),
    uploadFailed: {
      title: 'Upload Failed',
      description: 'We couldn\'t upload your file. Please check your connection and try again.',
      action: 'retry',
      actionLabel: 'Try Again',
    },
    virusScan: {
      title: 'Security Check Failed',
      description: 'The file you uploaded didn\'t pass our security scan. Please try a different file.',
      action: 'choose',
      actionLabel: 'Choose Another File',
    },
  },
  
  // Payment
  payment: {
    failed: {
      title: 'Payment Failed',
      description: 'Your payment couldn\'t be processed. Please check your payment details and try again.',
      action: 'retry',
      actionLabel: 'Try Again',
    },
    declined: {
      title: 'Payment Declined',
      description: 'Your payment was declined by your bank. Please contact your bank or try a different payment method.',
      action: 'contact',
      actionLabel: 'Contact Bank',
    },
    insufficientFunds: {
      title: 'Insufficient Funds',
      description: 'Your account doesn\'t have enough funds for this payment. Please add funds or use a different payment method.',
      action: 'retry',
      actionLabel: 'Try Another Method',
    },
    alreadyPaid: {
      title: 'Already Paid',
      description: 'You\'ve already paid for this application. You can view your payment receipt on your dashboard.',
      action: '/student/dashboard',
      actionLabel: 'View Dashboard',
    },
  },
  
  // Eligibility
  eligibility: {
    checkFailed: {
      title: 'Eligibility Check Failed',
      description: 'We couldn\'t verify your eligibility at this time. You can still proceed with your application, and we\'ll verify manually.',
      action: 'continue',
      actionLabel: 'Continue Anyway',
    },
    notEligible: (reason: string) => ({
      title: 'Eligibility Requirements Not Met',
      description: `Based on our records, you don't meet the eligibility requirements: ${reason}. Please contact admissions if you believe this is an error.`,
      action: '/contact',
      actionLabel: 'Contact Admissions',
    }),
    documentsRequired: {
      title: 'Additional Documents Required',
      description: 'We need additional documents to verify your eligibility. Please upload the requested documents.',
      action: 'upload',
      actionLabel: 'Upload Documents',
    },
  },
  
  // Network
  network: {
    offline: {
      title: 'You\'re Offline',
      description: 'No internet connection detected. Some features may not be available. Your changes will be saved and synced when you\'re back online.',
      action: 'wait',
      actionLabel: 'Retry Connection',
    },
    slowConnection: {
      title: 'Slow Connection',
      description: 'Your internet connection is slow. This may affect performance. Consider switching to a faster network.',
      action: 'continue',
      actionLabel: 'Continue Anyway',
    },
    serverUnreachable: {
      title: 'Server Unreachable',
      description: 'We can\'t reach our servers right now. This might be temporary. Please try again in a few moments.',
      action: 'retry',
      actionLabel: 'Try Again',
    },
  },
  
  // Data
  data: {
    loadFailed: {
      title: 'Failed to Load Data',
      description: 'We couldn\'t load the requested data. Please refresh the page or try again later.',
      action: 'refresh',
      actionLabel: 'Refresh Page',
    },
    saveFailed: {
      title: 'Failed to Save',
      description: 'We couldn\'t save your changes. Please check your connection and try again.',
      action: 'retry',
      actionLabel: 'Try Again',
    },
    deleteFailed: {
      title: 'Failed to Delete',
      description: 'We couldn\'t delete this item. Please try again or contact support if the problem persists.',
      action: 'retry',
      actionLabel: 'Try Again',
    },
    syncFailed: {
      title: 'Sync Failed',
      description: 'We couldn\'t sync your data. Your changes are saved locally and will sync when connection is restored.',
      action: 'retry',
      actionLabel: 'Retry Sync',
    },
  },
  
  // Validation
  validation: {
    required: (field: string) => ({
      title: 'Required Field',
      description: `${field} is required. Please provide this information to continue.`,
      action: 'review',
      actionLabel: 'Fill In Field',
    }),
    invalidFormat: (field: string, format: string) => ({
      title: 'Invalid Format',
      description: `${field} must be in ${format} format. Please check and try again.`,
      action: 'review',
      actionLabel: 'Correct Format',
    }),
    tooShort: (field: string, minLength: number) => ({
      title: 'Too Short',
      description: `${field} must be at least ${minLength} characters long.`,
      action: 'review',
      actionLabel: 'Add More Characters',
    }),
    tooLong: (field: string, maxLength: number) => ({
      title: 'Too Long',
      description: `${field} must be no more than ${maxLength} characters long.`,
      action: 'review',
      actionLabel: 'Shorten Text',
    }),
    invalidEmail: {
      title: 'Invalid Email',
      description: 'Please enter a valid email address (e.g., name@example.com).',
      action: 'review',
      actionLabel: 'Correct Email',
    },
    invalidPhone: {
      title: 'Invalid Phone Number',
      description: 'Please enter a valid Zambian phone number (e.g., +260 XXX XXX XXX).',
      action: 'review',
      actionLabel: 'Correct Phone',
    },
    passwordWeak: {
      title: 'Weak Password',
      description: 'Your password must be at least 8 characters and include uppercase, lowercase, numbers, and special characters.',
      action: 'review',
      actionLabel: 'Strengthen Password',
    },
    passwordMismatch: {
      title: 'Passwords Don\'t Match',
      description: 'The passwords you entered don\'t match. Please make sure both passwords are the same.',
      action: 'review',
      actionLabel: 'Re-enter Password',
    },
  },
};

/**
 * Format error for display
 */
export function formatError(error: any): ErrorMessage {
  // Check if it's a known error type
  if (error.code && ErrorMessages[error.code as keyof typeof ErrorMessages]) {
    return ErrorMessages[error.code as keyof typeof ErrorMessages] as ErrorMessage;
  }
  
  // Otherwise, use generic error message
  return getErrorMessage(error);
}

/**
 * Get error category from error
 */
export function getErrorCategory(error: any): ErrorCategory {
  if (error.message?.includes('fetch') || error.message?.includes('network')) {
    return ErrorCategory.NETWORK;
  }
  
  if (error.status === 401) return ErrorCategory.AUTHENTICATION;
  if (error.status === 403) return ErrorCategory.AUTHORIZATION;
  if (error.status === 400) return ErrorCategory.VALIDATION;
  if (error.status === 404) return ErrorCategory.NOT_FOUND;
  if (error.status === 429) return ErrorCategory.RATE_LIMIT;
  if (error.status >= 500) return ErrorCategory.SERVER;
  if (error.message?.includes('timeout')) return ErrorCategory.TIMEOUT;
  
  return ErrorCategory.UNKNOWN;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  const category = getErrorCategory(error);
  
  return [
    ErrorCategory.NETWORK,
    ErrorCategory.TIMEOUT,
    ErrorCategory.SERVER,
    ErrorCategory.RATE_LIMIT,
  ].includes(category);
}

/**
 * Get retry delay based on error type
 */
export function getRetryDelay(error: any, attempt: number): number {
  const category = getErrorCategory(error);
  
  // Exponential backoff
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds
  
  let delay = baseDelay * Math.pow(2, attempt - 1);
  
  // Add jitter to prevent thundering herd
  delay = delay + Math.random() * 1000;
  
  // Cap at max delay
  delay = Math.min(delay, maxDelay);
  
  // Rate limit errors should wait longer
  if (category === ErrorCategory.RATE_LIMIT) {
    delay = Math.max(delay, 60000); // At least 1 minute
  }
  
  return delay;
}
