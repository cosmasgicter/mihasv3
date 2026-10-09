/**
 * API path normalization, service name extraction, and query string helpers.
 *
 * @module apiHelpers
 */

export const API_V1_PREFIX = '/api/v1';

/**
 * Matches a path that already declares its own API major version, e.g.
 * `/api/v1/...` or `/api/v2/...`.
 *
 * Admissions-v2 task 11.1: the V2 namespace (`backend/apps/common/v2/urls.py`,
 * mounted at `/api/v2/`) carries contracts V1 does not — the authoritative
 * readiness query task 6.5 added is the first one a student surface consumes. A
 * caller that has already named its version must not have a second one
 * prepended: `toApiV1Path('/api/v2/x/')` used to answer `/api/v1/api/v2/x/`,
 * which is not a route this platform serves.
 *
 * This widens *nothing* for existing callers — no first-party caller passes a
 * versioned path other than `/api/v1/`, so the behaviour of every current
 * request is byte-identical (`apiVersionedPathPassthrough.test.ts` pins both
 * halves).
 */
const VERSIONED_API_PATH = /^\/api\/v\d+(\/|\?|$)/;

/**
 * Normalize an endpoint path to include the `/api/v1` prefix.
 * - Absolute URLs (http:// or https://) pass through unchanged.
 * - Paths that already declare an API major version (`/api/v1/`, `/api/v2/`, …)
 *   are returned as-is (idempotent).
 * - All other paths get `/api/v1` prepended.
 * - Consecutive slashes are deduplicated.
 */
export function toApiV1Path(path: string): string {
  // Absolute URLs pass through unchanged
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Already versioned — return as-is (idempotent)
  if (VERSIONED_API_PATH.test(path)) {
    return path.replace(/\/{2,}/g, '/');
  }

  const trimmedPath = path.replace(/^\/+/, '');
  return `${API_V1_PREFIX}/${trimmedPath}`.replace(/\/{2,}/g, '/');
}

/**
 * Extract the primary resource name from a normalized `/api/vN/...` endpoint.
 * Used for logging/metrics only.
 */
export function getServiceName(endpoint: string): string {
  const stripped = endpoint.replace(/^\/api\/v\d+\//, '').replace(/^\//, '');
  return stripped.split('/')[0] || 'unknown';
}

export type QueryParamValue = string | number | boolean;

export type QueryParams = Record<string, QueryParamValue | QueryParamValue[] | null | undefined>;

export function buildQueryString(params: QueryParams = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (Array.isArray(value)) {
      const validItems = value.filter(item => item !== undefined && item !== null && item !== '');
      if (validItems.length > 0) {
        query.set(key, validItems.join(','));
      }
      return;
    }

    // Django pagination is 1-based — clamp page to >= 1
    if (key === 'page') {
      const pageNum = Number(value);
      query.set(key, String(Math.max(pageNum || 1, 1)));
      return;
    }

    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}
