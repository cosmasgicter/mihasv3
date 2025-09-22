/**
 * Resolves the API base URL from environment variables with fallback
 */
export function getApiBaseUrl(): string {
  // For development, use Netlify dev server
  if (import.meta.env.DEV) {
    return 'http://localhost:8888'
  }

  // Check for environment override first
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }

  // Fallback to window.location.origin in browser
  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  // SSR fallback
  return 'https://application.mihas.edu.zm'
}