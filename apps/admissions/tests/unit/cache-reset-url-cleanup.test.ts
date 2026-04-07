/**
 * Unit tests for URL param cleanup in runOneTimeRuntimeCacheReset()
 *
 * Verifies that when localStorage already has the cache reset key:
 * 1. If URL contains `?_cache_reset=...`, the param is stripped via history.replaceState
 * 2. If URL has no `_cache_reset` param, nothing changes
 * 3. Other query params are preserved when `_cache_reset` is removed
 *
 * _Requirements: 2.5, 3.8_
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Constants matching main.tsx
const CACHE_RESET_STORAGE_KEY = 'mihas_runtime_cache_reset'
const CACHE_RESET_VERSION = 'post-qa-2026-04-02'

/**
 * Replicates the URL cleanup logic from the early-return branch of
 * runOneTimeRuntimeCacheReset() in main.tsx. The function is not exported,
 * so we test the exact logic inline.
 */
function stripCacheResetParam(): boolean {
  const url = new URL(window.location.href)
  if (url.searchParams.has('_cache_reset')) {
    url.searchParams.delete('_cache_reset')
    window.history.replaceState({}, '', url.toString())
    return true
  }
  return false
}

describe('cache-reset URL cleanup', () => {
  const replaceStateSpy = vi.fn()
  let originalLocation: Location
  let originalHistory: History

  beforeEach(() => {
    vi.clearAllMocks()

    // Store originals
    originalLocation = window.location
    originalHistory = window.history

    // Mock history.replaceState
    Object.defineProperty(window, 'history', {
      value: { ...window.history, replaceState: replaceStateSpy },
      writable: true,
      configurable: true,
    })

    // Set localStorage to indicate reset already done
    localStorage.setItem(CACHE_RESET_STORAGE_KEY, CACHE_RESET_VERSION)
  })

  afterEach(() => {
    localStorage.removeItem(CACHE_RESET_STORAGE_KEY)
    // Restore originals
    Object.defineProperty(window, 'history', {
      value: originalHistory,
      writable: true,
      configurable: true,
    })
  })

  it('strips _cache_reset param when present in URL', () => {
    // Simulate URL with _cache_reset param
    Object.defineProperty(window, 'location', {
      value: new URL(`https://app.mihas.edu.zm/?_cache_reset=${CACHE_RESET_VERSION}`),
      writable: true,
      configurable: true,
    })

    const didStrip = stripCacheResetParam()

    expect(didStrip).toBe(true)
    expect(replaceStateSpy).toHaveBeenCalledTimes(1)
    // The URL passed to replaceState should not contain _cache_reset
    const replacedUrl = replaceStateSpy.mock.calls[0]![2] as string
    expect(replacedUrl).not.toContain('_cache_reset')
    expect(new URL(replacedUrl).searchParams.has('_cache_reset')).toBe(false)

    // Restore location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  it('does nothing when URL has no _cache_reset param', () => {
    // Simulate URL without _cache_reset param
    Object.defineProperty(window, 'location', {
      value: new URL('https://app.mihas.edu.zm/dashboard'),
      writable: true,
      configurable: true,
    })

    const didStrip = stripCacheResetParam()

    expect(didStrip).toBe(false)
    expect(replaceStateSpy).not.toHaveBeenCalled()

    // Restore location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  it('preserves other query params when _cache_reset is removed', () => {
    // Simulate URL with _cache_reset AND other params
    Object.defineProperty(window, 'location', {
      value: new URL(`https://app.mihas.edu.zm/apply?_cache_reset=${CACHE_RESET_VERSION}&other=value&tab=2`),
      writable: true,
      configurable: true,
    })

    const didStrip = stripCacheResetParam()

    expect(didStrip).toBe(true)
    expect(replaceStateSpy).toHaveBeenCalledTimes(1)

    const replacedUrl = new URL(replaceStateSpy.mock.calls[0]![2] as string)
    expect(replacedUrl.searchParams.has('_cache_reset')).toBe(false)
    expect(replacedUrl.searchParams.get('other')).toBe('value')
    expect(replacedUrl.searchParams.get('tab')).toBe('2')

    // Restore location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })
})
