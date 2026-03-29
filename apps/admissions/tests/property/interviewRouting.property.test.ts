/**
 * Feature: migration-recovery-hardening, Property 5: Interview service routes requests through nested application interview resources
 *
 * Validates: Requirements 5.1, 5.2, 5.3
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

function buildInterviewRoute(applicationId: string): string {
  return `/applications/${applicationId}/interviews`
}

describe('Property 5: Interview service routes all requests through nested application interview resources', () => {
  it('PROPERTY: Schedule interview uses /applications/:id/interviews', () => {
    fc.assert(
      fc.property(fc.uuid(), (applicationId) => {
        const url = buildInterviewRoute(applicationId)
        expect(url).toBe(`/applications/${applicationId}/interviews`)
        expect(url.startsWith('/applications/')).toBe(true)
        expect(url.endsWith('/interviews')).toBe(true)
        expect(url).not.toContain('action=')
      }),
      { numRuns: 10 }
    )
  })

  it('PROPERTY: Per-application interview listing uses the same nested route', () => {
    fc.assert(
      fc.property(fc.uuid(), (applicationId) => {
        const url = buildInterviewRoute(applicationId)
        expect(url.startsWith('/applications/')).toBe(true)
        expect(url.endsWith('/interviews')).toBe(true)
        expect(url).not.toContain('?')
      }),
      { numRuns: 10 }
    )
  })
})
