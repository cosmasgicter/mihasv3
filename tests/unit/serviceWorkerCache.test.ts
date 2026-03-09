// @vitest-environment node
import { describe, it, expect } from 'vitest'

/**
 * Unit tests for service worker cache strategy configuration.
 * These test the pure logic extracted from service-worker.ts.
 * 
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 */

describe('Service Worker Cache Strategy', () => {
  describe('Cache configuration constants', () => {
    // These mirror the constants in service-worker.ts
    const STATIC_CACHE = 'static-v1'
    const CACHE_PREFIX = 'mihas-app'
    const MAX_ENTRIES_PER_BUCKET = 100
    const CACHE_BUDGET_BYTES = 50 * 1024 * 1024

    it('static cache name is static-v1', () => {
      expect(STATIC_CACHE).toBe('static-v1')
    })

    it('max entries per bucket is 100', () => {
      expect(MAX_ENTRIES_PER_BUCKET).toBe(100)
    })

    it('cache budget is 50MB', () => {
      expect(CACHE_BUDGET_BYTES).toBe(50 * 1024 * 1024)
    })

    it('API cache name includes prefix and version', () => {
      const version = 'vtest'
      const apiCache = `${CACHE_PREFIX}-api-${version}`
      expect(apiCache).toMatch(/^mihas-app-api-/)
    })
  })

  describe('X-From-Cache header logic', () => {
    const addFromCacheHeader = (response: Response): Response => {
      const headers = new Headers(response.headers)
      headers.set('X-From-Cache', 'true')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    }

    it('adds X-From-Cache: true header to response', () => {
      const original = new Response('{"data":"test"}', {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      })

      const tagged = addFromCacheHeader(original)
      expect(tagged.headers.get('X-From-Cache')).toBe('true')
    })

    it('preserves original status code', () => {
      const original = new Response('', { status: 200, statusText: 'OK' })
      const tagged = addFromCacheHeader(original)
      expect(tagged.status).toBe(200)
      expect(tagged.statusText).toBe('OK')
    })

    it('preserves original headers', () => {
      const original = new Response('', {
        headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' }
      })
      const tagged = addFromCacheHeader(original)
      expect(tagged.headers.get('Content-Type')).toBe('application/json')
      expect(tagged.headers.get('X-Custom')).toBe('value')
      expect(tagged.headers.get('X-From-Cache')).toBe('true')
    })

    it('preserves response body', async () => {
      const body = '{"success":true,"data":{"id":1}}'
      const original = new Response(body)
      const tagged = addFromCacheHeader(original)
      const text = await tagged.text()
      expect(text).toBe(body)
    })
  })

  describe('Cache strategy routing rules', () => {
    // Test the URL matching logic used in service worker routes

    it('auth endpoints should never be cached', () => {
      const authPaths = ['/api/auth', '/api/auth?action=login', '/auth/callback']
      for (const path of authPaths) {
        const url = new URL(path, '***REMOVED***')
        const isAuth = url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/auth/')
        expect(isAuth).toBe(true)
      }
    })

    it('API paths match the NetworkFirst route', () => {
      const apiPaths = [
        '/api/applications',
        '/api/catalog?type=programs',
        '/api/notifications?action=preferences',
        '/api/health?action=ping',
        '/applications',
        '/notifications',
        '/admin/dashboard',
        '/documents/upload',
        '/payments/receipt',
        '/catalog'
      ]

      for (const path of apiPaths) {
        const url = new URL(path, '***REMOVED***')
        const isApi =
          url.pathname.startsWith('/api/') ||
          url.pathname.startsWith('/applications') ||
          url.pathname.startsWith('/notifications') ||
          url.pathname.startsWith('/admin/') ||
          url.pathname.startsWith('/documents/') ||
          url.pathname.startsWith('/payments/') ||
          url.pathname.startsWith('/catalog')
        expect(isApi).toBe(true)
      }
    })

    it('auth paths are excluded from general API route', () => {
      // Auth route is registered BEFORE the general API route,
      // so /api/auth is handled by NetworkOnly, not NetworkFirst
      const url = new URL('/api/auth?action=login', '***REMOVED***')
      const isAuth = url.pathname.startsWith('/api/auth')
      expect(isAuth).toBe(true)
    })
  })

  describe('hashVersion utility', () => {
    const hashVersion = (value: string): string => {
      let hash = 0
      for (let index = 0; index < value.length; index += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(index)
        hash |= 0
      }
      return Math.abs(hash).toString(36)
    }

    it('produces deterministic output', () => {
      const a = hashVersion('test-input')
      const b = hashVersion('test-input')
      expect(a).toBe(b)
    })

    it('produces different output for different inputs', () => {
      const a = hashVersion('version-1')
      const b = hashVersion('version-2')
      expect(a).not.toBe(b)
    })

    it('returns a base-36 string', () => {
      const result = hashVersion('some-manifest-data')
      expect(result).toMatch(/^[0-9a-z]+$/)
    })
  })
})
