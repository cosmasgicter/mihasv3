import { getApiBaseUrl } from '@/lib/apiConfig'
import { resolveBuildKey } from '@/lib/reloadControl'

const API_BASE = getApiBaseUrl()

let backendVersionCache: string | null = null
let backendVersionPromise: Promise<string> | null = null

export function getFrontendBuildVersion(): string {
  return resolveBuildKey()
}

export async function getBackendBuildVersion(): Promise<string> {
  if (backendVersionCache) {
    return backendVersionCache
  }

  if (backendVersionPromise) {
    return backendVersionPromise
  }

  backendVersionPromise = fetch(`${API_BASE}/health/live/`, {
    method: 'GET',
    credentials: 'include',
  })
    .then((response) => {
      const version = response.headers.get('X-Backend-Version') || 'unknown'
      backendVersionCache = version
      return version
    })
    .catch(() => 'unavailable')
    .finally(() => {
      backendVersionPromise = null
    })

  return backendVersionPromise
}

export function formatBuildVersion(version: string): string {
  if (!version || version === 'unknown' || version === 'unavailable') {
    return version || 'unknown'
  }

  return version.length > 12 ? version.slice(0, 12) : version
}
