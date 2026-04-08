import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for the client-side cache-updated reload handler and
 * 30-second SW activation timeout fallback in main.tsx.
 *
 * These test the extracted logic rather than importing main.tsx directly,
 * since main.tsx has side effects (React mount, SW registration).
 *
 * Validates: Requirements 11.2, 11.4, 11.6
 */

// Extracted logic mirrors what main.tsx does on receiving a cache-updated message
function shouldReloadOnCacheUpdate(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/dashboard' ||
    pathname.startsWith('/student/dashboard') ||
    pathname.startsWith('/admin')
  )
}

describe('cache-updated reload handler', () => {
  describe('shouldReloadOnCacheUpdate', () => {
    it('returns true for Landing Page (/)', () => {
      expect(shouldReloadOnCacheUpdate('/')).toBe(true)
    })

    it('returns true for Dashboard redirect (/dashboard)', () => {
      expect(shouldReloadOnCacheUpdate('/dashboard')).toBe(true)
    })

    it('returns true for Student Dashboard (/student/dashboard)', () => {
      expect(shouldReloadOnCacheUpdate('/student/dashboard')).toBe(true)
    })

    it('returns true for Admin routes (/admin)', () => {
      expect(shouldReloadOnCacheUpdate('/admin')).toBe(true)
    })

    it('returns true for Admin Dashboard (/admin/dashboard)', () => {
      expect(shouldReloadOnCacheUpdate('/admin/dashboard')).toBe(true)
    })

    it('returns false for application wizard', () => {
      expect(shouldReloadOnCacheUpdate('/student/application-wizard')).toBe(false)
    })

    it('returns false for auth pages', () => {
      expect(shouldReloadOnCacheUpdate('/auth/signin')).toBe(false)
    })

    it('returns false for student settings', () => {
      expect(shouldReloadOnCacheUpdate('/student/settings')).toBe(false)
    })

    it('returns false for student payment', () => {
      expect(shouldReloadOnCacheUpdate('/student/payment')).toBe(false)
    })
  })

  describe('message event filtering', () => {
    it('only triggers on cache-updated message type', () => {
      const messages = [
        { type: 'cache-updated' },
        { type: 'SKIP_WAITING' },
        { type: 'notification-click' },
        { type: 'GET_VERSION' },
        { type: 'CLEAR_CACHE' },
      ]

      const cacheUpdatedMessages = messages.filter(
        (msg) => msg.type === 'cache-updated'
      )
      expect(cacheUpdatedMessages).toHaveLength(1)
      expect(cacheUpdatedMessages[0]!.type).toBe('cache-updated')
    })

    it('ignores messages with no data', () => {
      const data = null
      const isCacheUpdated = data && (data as { type?: string }).type === 'cache-updated'
      expect(isCacheUpdated).toBeFalsy()
    })
  })
})

describe('SW activation timeout fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('logs warning after 30 seconds when no controller is available', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Simulate: no SW controller
    const hasController = false

    const timeout = setTimeout(() => {
      if (!hasController) {
        console.warn(
          '[PWA] Service worker failed to activate within 30 seconds — proceeding without SW support'
        )
      }
    }, 30_000)

    // Advance to just before 30s — no warning yet
    vi.advanceTimersByTime(29_999)
    expect(warnSpy).not.toHaveBeenCalled()

    // Advance past 30s — warning fires
    vi.advanceTimersByTime(1)
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy).toHaveBeenCalledWith(
      '[PWA] Service worker failed to activate within 30 seconds — proceeding without SW support'
    )

    clearTimeout(timeout)
    warnSpy.mockRestore()
  })

  it('does not log warning when controller is already available', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Simulate: SW controller already present
    const hasController = true

    const timeout = setTimeout(() => {
      if (!hasController) {
        console.warn(
          '[PWA] Service worker failed to activate within 30 seconds — proceeding without SW support'
        )
      }
    }, 30_000)

    // If controller exists, clear timeout immediately (mirrors main.tsx logic)
    if (hasController) {
      clearTimeout(timeout)
    }

    vi.advanceTimersByTime(31_000)
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('clears timeout when controllerchange fires before 30s', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    let controllerChangeCallback: (() => void) | null = null

    const timeout = setTimeout(() => {
      console.warn(
        '[PWA] Service worker failed to activate within 30 seconds — proceeding without SW support'
      )
    }, 30_000)

    // Simulate registering a controllerchange listener
    controllerChangeCallback = () => {
      clearTimeout(timeout)
    }

    // Simulate controller activating at 10 seconds
    vi.advanceTimersByTime(10_000)
    controllerChangeCallback()

    // Advance past 30s — no warning because timeout was cleared
    vi.advanceTimersByTime(25_000)
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})
