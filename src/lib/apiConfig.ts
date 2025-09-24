/**
 * Resolves the API base URL using configuration with sensible fallbacks.
 *
 * Priority order:
 * 1. Explicit VITE_API_BASE_URL environment override
 * 2. Browser origin when available (ensures compatibility with Netlify hosted apps)
 * 3. Development fallback for SSR and local tooling
 * 4. Production SSR fallback
 */
export function getApiBaseUrl(): string {
  const normalizeBaseUrl = (value: string) => value.replace(/\/$/, '')
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl)
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizeBaseUrl(window.location.origin)
  }

  if (import.meta.env.DEV) {
    return normalizeBaseUrl('http://localhost:8888')
  }

  return normalizeBaseUrl('***REMOVED***')
}
