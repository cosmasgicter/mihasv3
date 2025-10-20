// User-friendly error messages
export const ERROR_MESSAGES = {
  NETWORK: 'Unable to connect. Please check your internet connection and try again.',
  TIMEOUT: 'Request timed out. Please try again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: 'You don\'t have permission to perform this action.',
  NOT_FOUND: 'The requested information could not be found.',
  SERVER_ERROR: 'Something went wrong on our end. Please try again later.',
  VALIDATION: 'Please check your information and try again.',
  FILE_TOO_LARGE: 'File is too large. Maximum size is 5MB.',
  INVALID_FILE_TYPE: 'Invalid file type. Please upload a PDF, JPG, or PNG file.',
  UPLOAD_FAILED: 'File upload failed. Please try again.',
  FORM_INCOMPLETE: 'Please fill in all required fields.',
  GENERIC: 'An error occurred. Please try again.',
}

export function getUserFriendlyError(error: any): string {
  if (!error) return ERROR_MESSAGES.GENERIC

  const message = error.message || error.toString()

  if (message.includes('network') || message.includes('fetch')) {
    return ERROR_MESSAGES.NETWORK
  }
  if (message.includes('timeout')) {
    return ERROR_MESSAGES.TIMEOUT
  }
  if (message.includes('401') || message.includes('unauthorized')) {
    return ERROR_MESSAGES.UNAUTHORIZED
  }
  if (message.includes('403') || message.includes('forbidden')) {
    return ERROR_MESSAGES.FORBIDDEN
  }
  if (message.includes('404') || message.includes('not found')) {
    return ERROR_MESSAGES.NOT_FOUND
  }
  if (message.includes('500') || message.includes('server')) {
    return ERROR_MESSAGES.SERVER_ERROR
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return ERROR_MESSAGES.VALIDATION
  }

  return ERROR_MESSAGES.GENERIC
}
