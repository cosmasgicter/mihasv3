/**
 * Feature: migration-recovery-hardening, Property 4: Reload guard allows at most one auto-reload per error fingerprint
 * 
 * Validates: Requirements 4.1, 4.2
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { consumeAutoReloadGuard, type ReloadReason } from '@/lib/reloadControl'

// Mock sessionStorage for testing
const mockStorage = new Map<string, string>()

beforeEach(() => {
  mockStorage.clear()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => mockStorage.set(key, value),
      removeItem: (key: string) => mockStorage.delete(key),
      clear: () => mockStorage.clear(),
      get length() { return mockStorage.size },
      key: (_index: number) => null
    },
    writable: true,
    configurable: true
  })
})

const reasonArb = fc.constantFrom<ReloadReason>(
  'chunk_preload_error',
  'chunk_import_error',
  'chunk_mime_error',
  'sw_controller_change'
)

const alphaString = fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/[^a-z0-9]/gi, 'a') || 'build1')

describe('Property 4: Reload guard allows at most one auto-reload per error fingerprint', () => {
  it('PROPERTY: First call returns true, subsequent calls return false', () => {
    fc.assert(
      fc.property(alphaString, reasonArb, alphaString, (buildKey, reason, fingerprint) => {
        mockStorage.clear()
        
        const first = consumeAutoReloadGuard({ reason, buildKey, fingerprint })
        expect(first).toBe(true)
        
        const second = consumeAutoReloadGuard({ reason, buildKey, fingerprint })
        expect(second).toBe(false)
        
        const third = consumeAutoReloadGuard({ reason, buildKey, fingerprint })
        expect(third).toBe(false)
      }),
      { numRuns: 10 }
    )
  })

  it('PROPERTY: Different fingerprints get independent guards', () => {
    fc.assert(
      fc.property(alphaString, reasonArb, alphaString, alphaString, (buildKey, reason, fp1, fp2) => {
        fc.pre(fp1 !== fp2)
        mockStorage.clear()
        
        const first1 = consumeAutoReloadGuard({ reason, buildKey, fingerprint: fp1 })
        expect(first1).toBe(true)
        
        const first2 = consumeAutoReloadGuard({ reason, buildKey, fingerprint: fp2 })
        expect(first2).toBe(true)
        
        // Both should now be consumed
        expect(consumeAutoReloadGuard({ reason, buildKey, fingerprint: fp1 })).toBe(false)
        expect(consumeAutoReloadGuard({ reason, buildKey, fingerprint: fp2 })).toBe(false)
      }),
      { numRuns: 10 }
    )
  })
})
