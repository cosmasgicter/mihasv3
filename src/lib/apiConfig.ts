/**
 * Resolves the API base URL using configuration with sensible fallbacks.
 *
 * Priority order:
 * 1. Explicit VITE_API_BASE_URL environment override
 * 2. Browser origin when available (Cloudflare Pages compatibility)
 * 3. Production fallback
 */
export function getApiBaseUrl(): string {
  const normalizeBaseUrl = (value: string) => value.replace(/\/$/, '')
  const getOrigin = (value: string) => {
    try {
      return new URL(value).origin
    } catch {
      return null
    }
  }
  const browserOrigin = typeof window !== 'undefined' && window.location?.origin
    ? normalizeBaseUrl(window.location.origin)
    : null
  
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredBaseUrl) {
    const normalizedConfiguredBaseUrl = normalizeBaseUrl(configuredBaseUrl)

    // Cookie-based auth requires same-origin API calls in production.
    // If a stale env value points to another origin, login succeeds but
    // cookies are stored on the wrong domain and session checks fail.
    if (browserOrigin) {
      const configuredOrigin = getOrigin(normalizedConfiguredBaseUrl)
      const currentOrigin = getOrigin(browserOrigin)

      if (configuredOrigin && currentOrigin && configuredOrigin !== currentOrigin) {
        return browserOrigin
      }
    }

    return normalizedConfiguredBaseUrl
  }

  if (browserOrigin) {
    return browserOrigin
  }

  return normalizeBaseUrl('https://apply.mihas.edu.zm')
}
