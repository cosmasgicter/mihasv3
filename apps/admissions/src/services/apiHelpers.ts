/**
 * API path normalization, service name extraction, and query string helpers.
 *
 * @module apiHelpers
 */

export const API_V1_PREFIX = '/api/v1';

/**
 * Normalize an endpoint path to include the `/api/v1` prefix.
 * - Absolute URLs (http:// or https://) pass through unchanged.
 * - Paths already starting with `/api/v1/` are returned as-is (idempotent).
 * - All other paths get `/api/v1` prepended.
 * - Consecutive slashes are deduplicated.
 */
export function toApiV1Path(path: string): string {
  // Absolute URLs pass through unchanged
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Already prefixed — return as-is (idempotent)
  if (path.startsWith('/api/v1/') || path.startsWith('/api/v1?')) {
    return path.replace(/\/{2,}/g, '/');
  }

  const trimmedPath = path.replace(/^\/+/, '');
  return `${API_V1_PREFIX}/${trimmedPath}`.replace(/\/{2,}/g, '/');
}

/**
 * Extract the primary resource name from a normalized `/api/v1/...` endpoint.
 * Used for logging/metrics only.
 */
export function getServiceName(endpoint: string): string {
  const stripped = endpoint.replace(/^\/api\/v1\//, '').replace(/^\//, '');
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
