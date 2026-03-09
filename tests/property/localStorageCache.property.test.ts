/**
 * Property Tests for localStorage Cache — P18
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  cachedGetItem,
  cachedSetItem,
  cachedRemoveItem,
  resetCache,
} from '@/lib/localStorageCache'

const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')

describe('localStorage Cache Property Tests (P18)', () => {
  beforeEach(() => {
    resetCache()
    localStorage.clear()
    getItemSpy.mockClear()
  })

  describe('P18.1: First read hits localStorage once', () => {
    it('calls getItem once on first access per key', () => {
      fc.assert(
        fc.property(
          fc.webSegment().filter(s => s.length > 0),
          fc.string({ minLength: 0, maxLength: 50 }),
          (key, value) => {
            resetCache()
            localStorage.clear()
            getItemSpy.mockClear()
            localStorage.setItem(key, value)
            getItemSpy.mockClear()
            const result = cachedGetItem(key)
            expect(result).toBe(value)
            expect(getItemSpy).toHaveBeenCalledTimes(1)
          }
        ),
        { numRuns: 10 }
      )
    })
  })

  describe('P18.2: Subsequent reads skip localStorage', () => {
    it('serves from cache on repeated reads', () => {
      fc.assert(
        fc.property(
          fc.webSegment().filter(s => s.length > 0),
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.integer({ min: 2, max: 8 }),
          (key, value, n) => {
            resetCache()
            localStorage.clear()
            localStorage.setItem(key, value)
            getItemSpy.mockClear()
            cachedGetItem(key)
            getItemSpy.mockClear()
            for (let i = 0; i < n; i++) {
              expect(cachedGetItem(key)).toBe(value)
            }
            expect(getItemSpy).toHaveBeenCalledTimes(0)
          }
        ),
        { numRuns: 10 }
      )
    })
  })

  describe('P18.3: Writes update cache immediately', () => {
    it('reflects value without localStorage read', () => {
      fc.assert(
        fc.property(
          fc.webSegment().filter(s => s.length > 0),
          fc.string({ minLength: 1, maxLength: 50 }),
          (key, value) => {
            resetCache()
            getItemSpy.mockClear()
            cachedSetItem(key, value)
            getItemSpy.mockClear()
            expect(cachedGetItem(key)).toBe(value)
            expect(getItemSpy).toHaveBeenCalledTimes(0)
          }
        ),
        { numRuns: 10 }
      )
    })
  })

  describe('P18.4: Remove marks key null', () => {
    it('returns null after removal without localStorage read', () => {
      fc.assert(
        fc.property(
          fc.webSegment().filter(s => s.length > 0),
          fc.string({ minLength: 1, maxLength: 50 }),
          (key, value) => {
            resetCache()
            cachedSetItem(key, value)
            cachedRemoveItem(key)
            getItemSpy.mockClear()
            expect(cachedGetItem(key)).toBeNull()
            expect(getItemSpy).toHaveBeenCalledTimes(0)
          }
        ),
        { numRuns: 10 }
      )
    })
  })

  describe('P18.5: Round-trip consistency', () => {
    it('returns last written value', () => {
      fc.assert(
        fc.property(
          fc.webSegment().filter(s => s.length > 0),
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
          (key, values) => {
            resetCache()
            for (const v of values) cachedSetItem(key, v)
            expect(cachedGetItem(key)).toBe(values[values.length - 1])
          }
        ),
        { numRuns: 10 }
      )
    })
  })
})
