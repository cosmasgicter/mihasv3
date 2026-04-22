/**
 * Retry, backoff, and timeout utilities for the API client.
 *
 * @module retry
 */

import { TIMEOUT_ERROR_MESSAGE } from '@/lib/errorMessages';

/** Default request timeout in milliseconds (30s) */
export const DEFAULT_TIMEOUT = 30_000;
/** Shorter timeout for health check and session validation requests (10s) */
export const SHORT_TIMEOUT = 10_000;
/** Maximum retry attempts for network/5xx errors */
export const MAX_RETRIES = 3;
/** Backoff delays in ms for each retry attempt (2s, 5s, 10s) */
export const RETRY_DELAYS = [2_000, 5_000, 10_000];

/** Endpoints that use the shorter timeout */
export const SHORT_TIMEOUT_PATTERNS = ['/api/v1/health/', '/api/v1/auth/session/'];

/**
 * Determine the appropriate timeout for a given endpoint.
 * Health checks and session validation use 10s; everything else uses 30s.
 */
export function getTimeoutForEndpoint(endpoint: string): number {
  for (const pattern of SHORT_TIMEOUT_PATTERNS) {
    if (endpoint.startsWith(pattern) || endpoint.includes(pattern)) {
      return SHORT_TIMEOUT;
    }
  }
  return DEFAULT_TIMEOUT;
}

/**
 * Check whether a failed request should be retried.
 * Retries network errors and 5xx server errors.
 * Does NOT retry 4xx client errors or user-aborted requests.
 */
export function isRetryableFailure(error: unknown): boolean {
  // Never retry user-aborted requests
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  if (error instanceof Error && error.name === 'AbortError') return false;

  // Timeout errors (our custom TimeoutError) are retryable
  if (error instanceof Error && error.name === 'TimeoutError') return true;

  // Network errors (TypeError from fetch) are retryable
  if (error instanceof TypeError) return true;

  // Check for 5xx status in error metadata
  const errWithStatus = error as { status?: number };
  if (typeof errWithStatus?.status === 'number') {
    return errWithStatus.status >= 500;
  }

  // Check error message for network-related failures
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('load failed') ||
      msg.includes('net::err')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Create an AbortController that auto-aborts after `ms` milliseconds.
 * If an external signal is provided, it is linked so that external abort
 * also cancels the timeout controller.
 */
export function createTimeoutController(
  ms: number,
  externalSignal?: AbortSignal | null
): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    const err = new DOMException(TIMEOUT_ERROR_MESSAGE, 'TimeoutError');
    controller.abort(err);
  }, ms);

  const clear = () => clearTimeout(timer);

  // If the caller already has an AbortSignal (e.g. from navigation), link it
  if (externalSignal) {
    if (externalSignal.aborted) {
      clear();
      controller.abort(externalSignal.reason);
    } else {
      const onExternalAbort = () => {
        clear();
        controller.abort(externalSignal.reason);
      };
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return { controller, clear };
}
