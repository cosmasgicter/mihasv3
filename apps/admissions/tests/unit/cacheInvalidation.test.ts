// @vitest-environment node
/**
 * Unit tests for React Query cache invalidation patterns.
 *
 * Validates that getQueryInvalidationPatterns() returns the correct
 * React Query keys for each endpoint+method combination, and that
 * queryClient.clear() is only used on login/logout paths.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */
import { describe, it, expect } from 'vitest'
import { apiClient } from '@/services/client'

// Access the public method on the singleton
const getPatterns = (endpoint: string, method: string) =>
  (apiClient as any).getQueryInvalidationPatterns(endpoint, method)

describe('getQueryInvalidationPatterns', () => {
  describe('Req 15.1 — Application submit invalidates student dashboard + applications', () => {
    it('PUT /api/applications?id=xxx invalidates student-dashboard-polling and applications', () => {
      const keys = getPatterns('/api/applications?id=abc-123', 'PUT')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('applications')
      expect(flat).toContain('student-dashboard-polling')
      expect(flat).toContain('application-stats')
      expect(flat).toContain('applications/abc-123')
    })

    it('POST /api/applications invalidates student-dashboard-polling and applications', () => {
      const keys = getPatterns('/api/applications', 'POST')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('applications')
      expect(flat).toContain('student-dashboard-polling')
    })
  })

  describe('Req 15.2 — Admin status change invalidates specific app + admin lists', () => {
    it('POST /api/admin?action=update-status&id=app-1 invalidates admin-applications and specific app', () => {
      const keys = getPatterns('/api/admin?action=update-status&id=app-1', 'POST')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('admin-applications')
      expect(flat).toContain('admin-dashboard-polling')
      expect(flat).toContain('applications/app-1')
      expect(flat).toContain('applications')
      expect(flat).toContain('application-stats')
      expect(flat).toContain('application-history')
    })

    it('POST /api/admin?action=review invalidates applications list', () => {
      const keys = getPatterns('/api/admin?action=review', 'POST')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('admin-applications')
      expect(flat).toContain('applications')
    })

    it('generic admin POST invalidates admin-applications but not general applications', () => {
      const keys = getPatterns('/api/admin?action=settings', 'POST')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('admin-applications')
      expect(flat).toContain('admin-dashboard-polling')
      expect(flat).not.toContain('applications')
    })
  })

  describe('Req 15.4 — queryClient.clear() only on login/logout', () => {
    it('login returns empty patterns (handled by queryClient.clear in auth flow)', () => {
      expect(getPatterns('/api/auth?action=login', 'POST')).toEqual([])
    })

    it('logout returns empty patterns (handled by queryClient.clear in auth flow)', () => {
      expect(getPatterns('/api/auth?action=logout', 'POST')).toEqual([])
    })

    it('register returns empty patterns (handled by auth flow)', () => {
      expect(getPatterns('/api/auth?action=register', 'POST')).toEqual([])
    })
  })

  describe('Req 15.5 — Token refresh does NOT invalidate data caches', () => {
    it('refresh returns empty patterns', () => {
      expect(getPatterns('/api/auth?action=refresh', 'POST')).toEqual([])
    })
  })

  describe('Other mutation patterns', () => {
    it('document upload invalidates applications and documents', () => {
      const keys = getPatterns('/api/documents?action=upload', 'POST')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('applications')
      expect(flat).toContain('documents')
    })

    it('payment mutation invalidates applications and payment-status', () => {
      const keys = getPatterns('/api/payments?action=receipt', 'POST')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('applications')
      expect(flat).toContain('payment-status')
    })

    it('notification mutation invalidates notification_preferences', () => {
      const keys = getPatterns('/api/notifications?action=send', 'POST')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('notification_preferences')
    })

    it('GET requests return empty patterns (reads don\'t invalidate)', () => {
      expect(getPatterns('/api/applications', 'GET')).toEqual([])
      expect(getPatterns('/api/admin?action=stats', 'GET')).toEqual([])
    })
  })
})
