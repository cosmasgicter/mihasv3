// @vitest-environment node
/**
 * Property Tests: SSE Removal — Notification Polling & Cleanup
 * Feature: sse-removal-simplification
 *
 * Properties 2–5 covering dashboard fingerprint deduplication,
 * notification unread count, polling pause on hidden tab, and
 * signOut cleanup step preservation.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ---- Direct imports for testable pure functions ----
import { computeUnreadCount, getRefetchInterval } from '@/hooks/useNotificationPolling'

// ---- Types ----

interface StudentApplication {
  id: string
  status: string
  payment_status: string
}

interface StudentNotification {
  id: string
  title: string
  content: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  created_at: string
}

// ---- Generators ----

const applicationStatusArb = fc.constantFrom(
  'draft', 'submitted', 'under_review', 'interview_scheduled',
  'accepted', 'rejected', 'waitlisted', 'withdrawn',
)

const paymentStatusArb = fc.constantFrom(
  'pending', 'paid', 'verified', 'failed', 'refunded',
)

const applicationArb: fc.Arbitrary<StudentApplication> = fc.record({
  id: fc.uuid(),
  status: applicationStatusArb,
  payment_status: paymentStatusArb,
})

const notificationTypeArb = fc.constantFrom('info', 'success', 'warning', 'error') as fc.Arbitrary<'info' | 'success' | 'warning' | 'error'>

const isoDateArb = fc
  .integer({ min: 1704067200000, max: 1767225600000 })
  .map((ts) => new Date(ts).toISOString())

const notificationArb: fc.Arbitrary<StudentNotification> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  content: fc.string({ minLength: 1, maxLength: 200 }),
  type: notificationTypeArb,
  read: fc.boolean(),
  created_at: isoDateArb,
})

// ---- Fingerprint function (mirrors useStudentDashboardPolling.ts) ----

function applicationsFingerprint(apps: StudentApplication[]): string {
  const sorted = [...apps].sort((a, b) => a.id.localeCompare(b.id))
  return sorted.map((app) => `${app.id}:${app.status}:${app.payment_status}`).join('|')
}

// ============================================================================
// Property 2: Dashboard fingerprint deduplication prevents redundant updates
// ============================================================================

describe('Feature: sse-removal-simplification, Property 2: Dashboard fingerprint deduplication prevents redundant updates', () => {
  it('identical application lists produce the same fingerprint', () => {
    /**
     * **Validates: Requirements 5.2**
     *
     * For any application list, computing the fingerprint twice on the same
     * data must yield the same string — ensuring deduplication works.
     */
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 0, maxLength: 15 }),
        (apps) => {
          const fp1 = applicationsFingerprint(apps)
          const fp2 = applicationsFingerprint(apps)
          expect(fp1).toBe(fp2)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('order-independent: shuffled lists produce the same fingerprint', () => {
    /**
     * **Validates: Requirements 5.2**
     *
     * The fingerprint sorts by ID before hashing, so any permutation of the
     * same application list must produce an identical fingerprint.
     */
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 2, maxLength: 10 }),
        (apps) => {
          const shuffled = [...apps].sort(() => Math.random() - 0.5)
          expect(applicationsFingerprint(apps)).toBe(applicationsFingerprint(shuffled))
        },
      ),
      { numRuns: 100 },
    )
  })

  it('different status or payment_status produces a different fingerprint', () => {
    /**
     * **Validates: Requirements 5.2**
     *
     * If any application's status or payment_status changes, the fingerprint
     * must differ — triggering onDataChange.
     */
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 10 }),
        fc.nat(),
        applicationStatusArb,
        paymentStatusArb,
        (apps, indexHint, newStatus, newPayment) => {
          const idx = indexHint % apps.length
          const original = apps[idx]

          // Mutate status
          if (original.status !== newStatus) {
            const mutated = apps.map((a, i) =>
              i === idx ? { ...a, status: newStatus } : a,
            )
            expect(applicationsFingerprint(apps)).not.toBe(applicationsFingerprint(mutated))
          }

          // Mutate payment_status
          if (original.payment_status !== newPayment) {
            const mutated = apps.map((a, i) =>
              i === idx ? { ...a, payment_status: newPayment } : a,
            )
            expect(applicationsFingerprint(apps)).not.toBe(applicationsFingerprint(mutated))
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ============================================================================
// Property 3: Notification unread count matches unread notifications
// ============================================================================

describe('Feature: sse-removal-simplification, Property 3: Notification unread count matches unread notifications', () => {
  it('computeUnreadCount equals the number of notifications where read === false', () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * For any list of notifications with random read states,
     * computeUnreadCount must return exactly the count of unread items.
     */
    fc.assert(
      fc.property(
        fc.array(notificationArb, { minLength: 0, maxLength: 30 }),
        (notifications) => {
          const expected = notifications.filter((n) => n.read === false).length
          expect(computeUnreadCount(notifications as any)).toBe(expected)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('all-read list returns zero unread count', () => {
    /**
     * **Validates: Requirements 6.2**
     */
    fc.assert(
      fc.property(
        fc.array(notificationArb, { minLength: 0, maxLength: 20 }),
        (notifications) => {
          const allRead = notifications.map((n) => ({ ...n, read: true }))
          expect(computeUnreadCount(allRead as any)).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('all-unread list returns full length as unread count', () => {
    /**
     * **Validates: Requirements 6.2**
     */
    fc.assert(
      fc.property(
        fc.array(notificationArb, { minLength: 0, maxLength: 20 }),
        (notifications) => {
          const allUnread = notifications.map((n) => ({ ...n, read: false }))
          expect(computeUnreadCount(allUnread as any)).toBe(allUnread.length)
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ============================================================================
// Property 4: Notification polling pauses when tab is hidden beyond threshold
// ============================================================================

describe('Feature: sse-removal-simplification, Property 4: Notification polling pauses when tab is hidden beyond threshold', () => {
  const HIDDEN_PAUSE_THRESHOLD = 300_000 // 5 minutes
  const BASE_INTERVAL = 60_000

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hidden duration >= 300000ms returns false (paused)', () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * When the tab has been hidden for 5 minutes or more, getRefetchInterval
     * must return false to pause polling entirely.
     */
    // Mock document.visibilityState to 'hidden'
    vi.stubGlobal('document', { visibilityState: 'hidden' })

    fc.assert(
      fc.property(
        fc.integer({ min: HIDDEN_PAUSE_THRESHOLD, max: 600_000 }),
        (hiddenDuration) => {
          const hiddenSince = Date.now() - hiddenDuration
          const result = getRefetchInterval(hiddenSince, BASE_INTERVAL)
          expect(result).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('hidden duration < 300000ms returns a positive number (doubled interval)', () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * When the tab has been hidden for less than 5 minutes, getRefetchInterval
     * must return a positive number (the doubled polling interval).
     */
    vi.stubGlobal('document', { visibilityState: 'hidden' })

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: HIDDEN_PAUSE_THRESHOLD - 1 }),
        (hiddenDuration) => {
          const hiddenSince = Date.now() - hiddenDuration
          const result = getRefetchInterval(hiddenSince, BASE_INTERVAL)
          expect(typeof result).toBe('number')
          expect(result).toBeGreaterThan(0)
          expect(result).toBe(BASE_INTERVAL * 2)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('visible tab always returns the base polling interval', () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * When the tab is visible, getRefetchInterval must return the base
     * polling interval regardless of hiddenSince value.
     */
    vi.stubGlobal('document', { visibilityState: 'visible' })

    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 600_000 }).map((d) => Date.now() - d), { nil: null }),
        fc.integer({ min: 10_000, max: 120_000 }),
        (hiddenSince, interval) => {
          const result = getRefetchInterval(hiddenSince, interval)
          expect(result).toBe(interval)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ============================================================================
// Property 5: SignOut flow preserves all non-SSE cleanup steps
// ============================================================================

describe('Feature: sse-removal-simplification, Property 5: SignOut flow preserves all non-SSE cleanup steps', () => {
  it('useSessionListener.ts signOut contains all required cleanup steps', () => {
    /**
     * **Validates: Requirements 7.2**
     *
     * The signOut callback must perform all non-SSE cleanup steps.
     * We read the source file and verify each required pattern is present.
     */
    const sourcePath = path.resolve(
      __dirname,
      '../../src/hooks/auth/useSessionListener.ts',
    )
    const source = fs.readFileSync(sourcePath, 'utf-8')

    const requiredPatterns = [
      'clearCsrfToken',
      "setQueryData(['auth', 'session'], null)",
      "setQueryData(['user-profile',",
      'queryClient.clear()',
      'secureStorage.clearSession()',
      'localStorage.removeItem',
      'authSignedOut',
      'broadcastLogout',
      'mihas:auth-redirect',
    ]

    // Property: for every required cleanup step, the source must contain it
    fc.assert(
      fc.property(
        fc.constantFrom(...requiredPatterns),
        (pattern) => {
          expect(source).toContain(pattern)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('signOut does NOT reference SSE client', () => {
    /**
     * **Validates: Requirements 7.2**
     *
     * After SSE removal, the signOut flow must not import or call
     * any SSE-related functions.
     */
    const sourcePath = path.resolve(
      __dirname,
      '../../src/hooks/auth/useSessionListener.ts',
    )
    const source = fs.readFileSync(sourcePath, 'utf-8')

    const forbiddenPatterns = [
      'getDefaultSSEClient',
      'sseClient',
      'disconnect()',
      'resetAuthFailure',
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...forbiddenPatterns),
        (pattern) => {
          expect(source).not.toContain(pattern)
        },
      ),
      { numRuns: 100 },
    )
  })
})
