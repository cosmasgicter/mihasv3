const PRODUCTION_APP_ORIGIN = '***REMOVED***'
const PRODUCTION_API_ORIGIN = '***REMOVED***'

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, '').replace(/\/api\/v1$/, '')
}

function isLocalBrowserOrigin(value: string): boolean {
  try {
    const { hostname } = new URL(value)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

/**
 * Resolves the API origin used by the admissions frontend.
 *
 * Priority order:
 * 1. Local browser origin -> same-origin Vite proxy
 * 2. Explicit `VITE_API_BASE_URL`
 * 3. Production admissions host -> production API host
 * 4. Browser origin fallback
 * 5. Production API fallback
 */
export function getApiBaseUrl(): string {
  const browserOrigin = typeof window !== 'undefined' && window.location?.origin
    ? normalizeBaseUrl(window.location.origin)
    : null

  // Local browser sessions should call the same origin so Vite can proxy /api
  // requests. This avoids CORS failures when a local .env points at production.
  if (browserOrigin && isLocalBrowserOrigin(browserOrigin)) {
    return browserOrigin
  }

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

  // Production: direct API origin (Vercel free plan doesn't support external rewrites)
  if (browserOrigin === PRODUCTION_APP_ORIGIN) {
    return PRODUCTION_API_ORIGIN
  }

  if (browserOrigin) {
    return browserOrigin
  }

  return PRODUCTION_API_ORIGIN
}
