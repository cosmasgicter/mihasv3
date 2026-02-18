/**
 * Feature: migration-recovery-hardening, Property 3: getCacheStrategy URL classification is correct and Supabase-free
 * 
 * Validates: Requirements 3.1, 3.2
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getCacheStrategy } from '@/lib/pwaConfig'

const alphaString = fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/[^a-z]/gi, 'a') || 'a')

describe('Property 3: getCacheStrategy URL classification is correct and Supabase-free', () => {
  it('PROPERTY: API paths return "api" strategy', () => {
    fc.assert(
      fc.property(alphaString, (segment) => {
        const url = `***REMOVED***/api/${segment}`
        expect(getCacheStrategy(url)).toBe('api')
      }),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: Image extensions return "images" strategy', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'),
        alphaString,
        (ext, name) => {
          const url = `***REMOVED***/assets/${name}.${ext}`
          expect(getCacheStrategy(url)).toBe('images')
        }
      ),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: Font extensions return "fonts" strategy', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('woff', 'woff2', 'ttf', 'eot'),
        alphaString,
        (ext, name) => {
          const url = `***REMOVED***/fonts/${name}.${ext}`
          expect(getCacheStrategy(url)).toBe('fonts')
        }
      ),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: Non-API, non-asset paths return "static" strategy', () => {
    fc.assert(
      fc.property(alphaString, (segment) => {
        const url = `***REMOVED***/${segment}`
        expect(getCacheStrategy(url)).toBe('static')
      }),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: supabase.co URLs are NOT classified as API', () => {
    fc.assert(
      fc.property(alphaString, (path) => {
        const url = `https://test.supabase.co/${path}`
        expect(getCacheStrategy(url)).not.toBe('api')
      }),
      { numRuns: 20 }
    )
  })
})
