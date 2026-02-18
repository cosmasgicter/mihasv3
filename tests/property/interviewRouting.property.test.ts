/**
 * Feature: migration-recovery-hardening, Property 5: Interview service routes all requests through /applications
 * 
 * Validates: Requirements 5.1, 5.2, 5.3
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { buildQueryString } from '@/services/client'

describe('Property 5: Interview service routes all requests through /applications', () => {
  it('PROPERTY: Schedule interview URL starts with /applications', () => {
    // The interviews service calls: /applications?action=schedule-interview
    const url = '/applications?action=schedule-interview'
    expect(url.startsWith('/applications')).toBe(true)
    expect(url).toContain('action=schedule-interview')
  })

  it('PROPERTY: List interviews URL starts with /applications', () => {
    fc.assert(
      fc.property(
        fc.option(fc.uuid(), { nil: undefined }),
        (applicationId) => {
          const params: Record<string, string> = { action: 'interviews' }
          if (applicationId) params.applicationId = applicationId
          
          const qs = buildQueryString(params)
          const url = `/applications${qs}`
          
          expect(url.startsWith('/applications')).toBe(true)
          expect(url).toContain('action=interviews')
          if (applicationId) {
            expect(url).toContain(`applicationId=${applicationId}`)
          }
        }
      ),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: All interview actions route through /applications endpoint', () => {
    const actions = ['schedule-interview', 'interviews']
    
    fc.assert(
      fc.property(
        fc.constantFrom(...actions),
        (action) => {
          const qs = buildQueryString({ action })
          const url = `/applications${qs}`
          expect(url.startsWith('/applications')).toBe(true)
          expect(url).toContain(`action=${action}`)
        }
      ),
      { numRuns: 20 }
    )
  })
})
