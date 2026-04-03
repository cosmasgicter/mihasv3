import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('api cache host allowlist', () => {
  beforeEach(() => {
    vi.resetModules()
    ;(globalThis as { __MIHAS_IMPORT_META_ENV__?: Record<string, string> }).__MIHAS_IMPORT_META_ENV__ = {
      VITE_API_BASE_URL: '***REMOVED***'
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        })
      )
    )
  })

  afterEach(() => {
    delete (globalThis as { __MIHAS_IMPORT_META_ENV__?: Record<string, string> }).__MIHAS_IMPORT_META_ENV__
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('allows GET requests to the configured API host', async () => {
    const { fetchWithCache } = await import('@/utils/api-cache')

    const result = await fetchWithCache<{ success: boolean }>(
      '***REMOVED***/api/v1/admin/dashboard/',
      {
        method: 'GET',
        useLocalCache: false
      }
    )

    expect(fetch).toHaveBeenCalledOnce()
    expect(result).toEqual({ success: true })
  })
})
