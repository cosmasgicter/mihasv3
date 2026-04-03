const PRODUCTION_APP_ORIGIN = '***REMOVED***'
const PRODUCTION_API_ORIGIN = '***REMOVED***'

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, '').replace(/\/api\/v1$/, '')
}

/**
 * Resolves the API origin used by the admissions frontend.
 *
 * Priority order:
 * 1. Explicit `VITE_API_BASE_URL`
 * 2. Production admissions host -> production API host
 * 3. Browser origin for local/dev environments
 * 4. Production API fallback
 */
export function getApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configuredBaseUrl) {
    const normalized = normalizeBaseUrl(configuredBaseUrl)
    // Guard: if VITE_API_BASE_URL accidentally points to the frontend origin
    // (e.g. ***REMOVED***), fall through to the origin-based
    // resolution below instead of sending API traffic to the static site.
    if (normalized !== PRODUCTION_APP_ORIGIN) {
      return normalized
    }
  }

  const browserOrigin = typeof window !== 'undefined' && window.location?.origin
    ? normalizeBaseUrl(window.location.origin)
    : null

  if (browserOrigin === PRODUCTION_APP_ORIGIN) {
    return PRODUCTION_API_ORIGIN
  }

  if (browserOrigin) {
    return browserOrigin
  }

  return PRODUCTION_API_ORIGIN
}
