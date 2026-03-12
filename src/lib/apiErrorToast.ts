/**
 * API Error Toast Integration
 *
 * Provides a utility to display toast notifications for API errors
 * with an optional retry callback. Works with the Zustand toast store
 * so it can be called from anywhere (inside or outside React components).
 *
 * Uses the error code → user-friendly message map from errorMessages.ts
 * to translate raw API error codes into clear, actionable messages.
 *
 * Requirements: 16.1, 16.2, 16.3
 */

import { useToastStore } from '@/hooks/useToast';
import { ApiErrorHandler } from '@/lib/apiErrorHandler';
import {
  getErrorMessageForCode,
  isNetworkError,
  NETWORK_ERROR_MESSAGE,
} from '@/lib/errorMessages';

/**
 * Extract the error code from an API error response.
 * The ApiClient attaches `code` on the Error object when the API
 * returns `{ success: false, error: "...", code: "SOME_CODE" }`.
 */
function extractErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

/**
 * Show a toast notification for an API error.
 * If the error is retryable and a retry callback is provided,
 * the toast will include a "Retry" button.
 *
 * - Network errors → "Connection error..." + retry button (Req 16.3)
 * - Known error codes → user-friendly mapped message (Req 16.2)
 * - Unknown errors → generic fallback
 */
export function showApiErrorToast(
  error: unknown,
  onRetry?: () => void
): void {
  const store = useToastStore.getState();

  // Network errors get a specific message + retry (Req 16.3)
  if (isNetworkError(error)) {
    if (onRetry) {
      store.errorWithRetry('Connection error', onRetry, NETWORK_ERROR_MESSAGE);
    } else {
      store.error('Connection error', NETWORK_ERROR_MESSAGE);
    }
    return;
  }

  // Try to resolve a user-friendly message from the error code (Req 16.2)
  const code = extractErrorCode(error);
  const rawMessage =
    error instanceof Error ? error.message : undefined;
  const message = getErrorMessageForCode(code, rawMessage) ||
    'An unexpected error occurred. Please try again.';

  const retryable = onRetry && ApiErrorHandler.isRetryableError(error);

  if (retryable && onRetry) {
    store.errorWithRetry('Request failed', onRetry, message);
  } else {
    store.error('Request failed', message);
  }
}

/**
 * Wraps an async API call with automatic toast error notification.
 * Returns the result on success, or null on failure (after showing the toast).
 *
 * Usage:
 *   const data = await withErrorToast(() => apiClient.request('/endpoint'));
 *   const data = await withErrorToast(
 *     () => apiClient.request('/endpoint'),
 *     () => refetch()  // retry callback shown in toast
 *   );
 */
export async function withErrorToast<T>(
  fn: () => Promise<T>,
  onRetry?: () => void
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    showApiErrorToast(error, onRetry);
    return null;
  }
}
