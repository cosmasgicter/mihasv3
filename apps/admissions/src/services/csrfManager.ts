/**
 * CSRF Manager — unified entry point for all CSRF token operations.
 *
 * Re-exports the in-memory token store (get/set/clear) and the recovery
 * flow (403 retry, external sync) so consumers can import everything
 * CSRF-related from a single path.
 *
 * @module csrfManager
 */

// In-memory CSRF token store
export { getCsrfToken, setCsrfToken, clearCsrfToken } from '@/lib/csrfToken';

// CSRF recovery flow and sync helpers
export { recoverCsrfAndRetry, syncApiClientCsrfToken } from './csrf';
