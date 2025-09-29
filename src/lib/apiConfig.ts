/**
 * Resolves the API base URL using configuration with sensible fallbacks.
 *
 * Priority order:
 * 1. Explicit VITE_API_BASE_URL environment override
 * 2. Development mode: use local Netlify dev server
 * 3. Browser origin when available (ensures compatibility with Netlify hosted apps)
 * 4. Production SSR fallback
 */
export function getApiBaseUrl(): string {
  const normalizeBaseUrl = (value: string) => value.replace(/\/$/, '')
  
  // In development mode, always use local Netlify dev server
  if (import.meta.env.DEV) {
    return normalizeBaseUrl('http://localhost:8888')
  }
  
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl)
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizeBaseUrl(window.location.origin)
  }

  return normalizeBaseUrl('https://apply.mihas.edu.zm')
}