/**
 * API Error Toast Integration
 *
 * Provides a utility to display toast notifications for API errors
 * with an optional retry callback. Works with the Zustand toast store
 * so it can be called from anywhere (inside or outside React components).
 */

import { useToastStore } from '@/components/ui/Toast';
import { ApiErrorHandler } from '@/lib/apiErrorHandler';

/**
 * Show a toast notification for an API error.
 * If the error is retryable and a retry callback is provided,
 * the toast will include a "Retry" button.
 */
export function showApiErrorToast(
  error: unknown,
  onRetry?: () => void
): void {
  const store = useToastStore.getState();
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.';

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
