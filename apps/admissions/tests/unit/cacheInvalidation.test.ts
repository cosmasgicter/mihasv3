// @vitest-environment node
/**
 * Unit tests for React Query cache invalidation patterns.
 *
 * Validates that getQueryInvalidationPatterns() returns the correct
 * React Query keys for each endpoint+method combination, and that
 * queryClient.clear() is only used on login/logout paths.
 *
 * Requirements: 1.10, 1.11
 */
import { describe, it, expect } from 'vitest'
import { apiClient } from '@/services/client'

// Access the public method on the singleton
const getPatterns = (endpoint: string, method: string) =>
  (apiClient as any).getQueryInvalidationPatterns(endpoint, method)

describe('getQueryInvalidationPatterns', () => {
  describe('Application mutations invalidate student dashboard + applications', () => {
    it('PUT /api/v1/applications/abc-123/ invalidates student-dashboard-polling, applications, and specific app', () => {
      const keys = getPatterns('/api/v1/applications/abc-123/', 'PUT')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('applications')
      expect(flat).toContain('student-dashboard-polling')
      expect(flat).toContain('application-stats')
      expect(flat).toContain('applications/abc-123')
    })

    it('POST /api/v1/applications/ invalidates student-dashboard-polling and applications', () => {
      const keys = getPatterns('/api/v1/applications/', 'POST')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('applications')
      expect(flat).toContain('student-dashboard-polling')
    })

    it('PATCH /api/v1/applications/app-1/review/ invalidates applications and specific app', () => {
      const keys = getPatterns('/api/v1/applications/app-1/review/', 'PATCH')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('applications')
      expect(flat).toContain('student-dashboard-polling')
      expect(flat).toContain('application-stats')
      expect(flat).toContain('applications/app-1')
    })
  })

  describe('Admin mutations invalidate admin lists', () => {
    it('POST /api/v1/admin/users/ invalidates admin-applications and admin-dashboard-polling', () => {
      const keys = getPatterns('/api/v1/admin/users/', 'POST')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('admin-applications')
      expect(flat).toContain('admin-dashboard-polling')
      expect(flat).toContain('application-stats')
    })

    it('PUT /api/v1/admin/settings/123/ invalidates admin caches', () => {
      const keys = getPatterns('/api/v1/admin/settings/123/', 'PUT')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('admin-applications')
      expect(flat).toContain('admin-dashboard-polling')
    })
  })

  describe('Auth endpoints return empty patterns (login/logout handled by queryClient.clear)', () => {
    it('POST /api/v1/auth/login/ returns empty patterns', () => {
      expect(getPatterns('/api/v1/auth/login/', 'POST')).toEqual([])
    })

    it('POST /api/v1/auth/logout/ returns empty patterns', () => {
      expect(getPatterns('/api/v1/auth/logout/', 'POST')).toEqual([])
    })

    it('POST /api/v1/auth/register/ returns empty patterns', () => {
      expect(getPatterns('/api/v1/auth/register/', 'POST')).toEqual([])
    })

    it('POST /api/v1/auth/refresh/ returns empty patterns (never invalidate data caches)', () => {
      expect(getPatterns('/api/v1/auth/refresh/', 'POST')).toEqual([])
    })
  })

  describe('Other mutation patterns', () => {
    it('POST /api/v1/documents/upload/ invalidates applications and documents', () => {
      const keys = getPatterns('/api/v1/documents/upload/', 'POST')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('applications')
      expect(flat).toContain('documents')
    })

    it('POST /api/v1/payments/123/verify/ invalidates applications and payment-status', () => {
      const keys = getPatterns('/api/v1/payments/123/verify/', 'POST')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('applications')
      expect(flat).toContain('payment-status')
    })

    it('PUT /api/v1/notifications/preferences/ invalidates notification_preferences', () => {
      const keys = getPatterns('/api/v1/notifications/preferences/', 'PUT')
      const flat = keys.map((k: string[]) => k.join('/'))
      expect(flat).toContain('notification_preferences')
    })

    it('GET requests return empty patterns (reads do not invalidate)', () => {
      expect(getPatterns('/api/v1/applications/', 'GET')).toEqual([])
      expect(getPatterns('/api/v1/admin/dashboard/', 'GET')).toEqual([])
    })
  })
})
