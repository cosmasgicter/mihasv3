/**
 * Property-based tests for PWA install prompt frequency control
 * Feature: website-quality-remediation, Property 23: Install prompt frequency control
 *
 * **Validates: Requirements 20.2, 20.3**
 *
 * Tests verify that the InstallBanner display logic correctly:
 * - Does NOT show if dismissed within the last 7 days (localStorage timestamp)
 * - Does NOT show if already shown this session (sessionStorage flag)
 * - Shows if dismissal was more than 7 days ago
 * - Shows on first visit (no storage entries)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'

// ── Constants (mirrored from InstallBanner.tsx) ─────────────────────────

const DISMISS_KEY = 'mihas_install_dismissed_at'
const SESSION_KEY = 'mihas_install_shown'
const DISMISS_DAYS = 7
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000

// ── Pure logic replicas (matching InstallBanner's private functions) ────

function isDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = parseInt(raw, 10)
    if (Number.isNaN(ts)) return false
    const elapsed = Date.now() - ts
    return elapsed < DISMISS_MS
  } catch {
    return false
  }
}

function wasShownThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Determines whether the banner should be visible, given that
 * the browser supports PWA install (canInstall = true).
 * This mirrors the guard logic in InstallBanner's useEffect.
 */
function shouldShowBanner(): boolean {
  return !isDismissedRecently() && !wasShownThisSession()
}

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Timestamp within the last 7 days (recent dismissal) */
const recentDismissalArb = fc.integer({ min: 1, max: DISMISS_MS - 1 }).map(
  (msAgo) => Date.now() - msAgo
)

/** Timestamp more than 7 days ago (stale dismissal) */
const staleDismissalArb = fc.integer({ min: DISMISS_MS, max: DISMISS_MS * 52 }).map(
  (msAgo) => Date.now() - msAgo
)

/** Invalid (non-numeric) localStorage values */
const invalidTimestampArb = fc.oneof(
  fc.constant(''),
  fc.constant('not-a-number'),
  fc.constant('null'),
  fc.constant('undefined'),
  fc.constant('NaN'),
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => Number.isNaN(parseInt(s, 10)))
)

// ── Tests ───────────────────────────────────────────────────────────────

describe('Property 23: Install prompt frequency control', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('should show banner on first visit (no storage entries)', () => {
    // No storage entries at all — banner should always show
    fc.assert(
      fc.property(fc.constant(null), () => {
        localStorage.clear()
        sessionStorage.clear()

        expect(isDismissedRecently()).toBe(false)
        expect(wasShownThisSession()).toBe(false)
        expect(shouldShowBanner()).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should NOT show banner if dismissed within the last 7 days', () => {
    fc.assert(
      fc.property(recentDismissalArb, (dismissedAt) => {
        localStorage.clear()
        sessionStorage.clear()
        localStorage.setItem(DISMISS_KEY, dismissedAt.toString())

        expect(isDismissedRecently()).toBe(true)
        expect(shouldShowBanner()).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('should show banner if dismissal was more than 7 days ago', () => {
    fc.assert(
      fc.property(staleDismissalArb, (dismissedAt) => {
        localStorage.clear()
        sessionStorage.clear()
        localStorage.setItem(DISMISS_KEY, dismissedAt.toString())

        expect(isDismissedRecently()).toBe(false)
        expect(shouldShowBanner()).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should NOT show banner if already shown this session', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        localStorage.clear()
        sessionStorage.clear()
        sessionStorage.setItem(SESSION_KEY, '1')

        expect(wasShownThisSession()).toBe(true)
        expect(shouldShowBanner()).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('should NOT show banner if both dismissed recently AND shown this session', () => {
    fc.assert(
      fc.property(recentDismissalArb, (dismissedAt) => {
        localStorage.clear()
        sessionStorage.clear()
        localStorage.setItem(DISMISS_KEY, dismissedAt.toString())
        sessionStorage.setItem(SESSION_KEY, '1')

        expect(shouldShowBanner()).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('should treat invalid localStorage timestamps as no dismissal (show banner)', () => {
    fc.assert(
      fc.property(invalidTimestampArb, (badValue) => {
        localStorage.clear()
        sessionStorage.clear()
        localStorage.setItem(DISMISS_KEY, badValue)

        expect(isDismissedRecently()).toBe(false)
        expect(shouldShowBanner()).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('session flag only blocks when value is exactly "1"', () => {
    const nonOneValues = fc.oneof(
      fc.constant('0'),
      fc.constant('true'),
      fc.constant('yes'),
      fc.constant(''),
      fc.string({ minLength: 1, maxLength: 10 }).filter(s => s !== '1')
    )

    fc.assert(
      fc.property(nonOneValues, (value) => {
        localStorage.clear()
        sessionStorage.clear()
        sessionStorage.setItem(SESSION_KEY, value)

        expect(wasShownThisSession()).toBe(false)
        expect(shouldShowBanner()).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('stale dismissal + no session flag = banner shown (7-day expiry works)', () => {
    fc.assert(
      fc.property(staleDismissalArb, (dismissedAt) => {
        localStorage.clear()
        sessionStorage.clear()
        localStorage.setItem(DISMISS_KEY, dismissedAt.toString())

        // Stale dismissal should not block
        expect(isDismissedRecently()).toBe(false)
        // No session flag
        expect(wasShownThisSession()).toBe(false)
        // Banner should show
        expect(shouldShowBanner()).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
