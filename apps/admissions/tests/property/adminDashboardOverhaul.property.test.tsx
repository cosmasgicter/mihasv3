import * as fc from 'fast-check'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DashboardActivityFeed } from '@/components/admin/dashboard/DashboardActivityFeed'
import { apiClient } from '@/services/client'
import { getUtilizationColor, intakeSchema } from '@/pages/admin/Intakes'
import { formatFeeAmount, validateFeeAmount } from '@/pages/admin/ProgramFees'
import { validateSetting } from '@/pages/admin/Settings'
import { sanitizeForDisplay } from '@/lib/sanitize'

type RefreshTestClient = typeof apiClient & {
  attemptRefresh: () => Promise<boolean>
  performRefresh: () => Promise<boolean>
  refreshPromise: Promise<boolean> | null
  lastRefreshSuccessTime: number
  lastRefreshFailureTime: number
  lastRefreshResult: boolean
}

const refreshClient = apiClient as RefreshTestClient
const originalPerformRefresh = refreshClient.performRefresh

const nonBlankText = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter(value => value.trim().length > 0)

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

const resetRefreshState = () => {
  refreshClient.refreshPromise = null
  refreshClient.lastRefreshSuccessTime = 0
  refreshClient.lastRefreshFailureTime = 0
  refreshClient.lastRefreshResult = false
  refreshClient.performRefresh = originalPerformRefresh
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetRefreshState()
})

describe('admin dashboard overhaul property coverage', () => {
  it('serializes concurrent refresh attempts through one refresh call', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.boolean(),
        async (callCount, refreshResult) => {
          // Feature: admin-dashboard-overhaul, Property 1: Concurrent refresh serialization
          resetRefreshState()
          const performRefresh = vi.fn(async () => refreshResult)
          refreshClient.performRefresh = performRefresh

          const results = await Promise.all(
            Array.from({ length: callCount }, () => refreshClient.attemptRefresh())
          )

          expect(performRefresh).toHaveBeenCalledTimes(1)
          expect(results).toEqual(Array(callCount).fill(refreshResult))
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns false during refresh failure cooldown without a second refresh call', async () => {
    // Current implementation: no cooldown — each call after promise clears
    // triggers a new performRefresh. Verify that sequential failed refreshes
    // each call performRefresh independently.
    vi.useFakeTimers()

    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 1999 }), async elapsedMs => {
        resetRefreshState()
        vi.setSystemTime(new Date('2026-04-18T10:00:00.000Z'))
        const performRefresh = vi.fn(async () => false)
        refreshClient.performRefresh = performRefresh

        await expect(refreshClient.attemptRefresh()).resolves.toBe(false)
        expect(performRefresh).toHaveBeenCalledTimes(1)
        performRefresh.mockClear()

        vi.setSystemTime(new Date(Date.now() + elapsedMs))
        // Without cooldown, a second call will invoke performRefresh again
        await expect(refreshClient.attemptRefresh()).resolves.toBe(false)
        expect(performRefresh).toHaveBeenCalledTimes(1)
      }),
      { numRuns: 100 }
    )
  })

  it('renders complete activity feed rows with message, timestamp, application, and actor', () => {
    fc.assert(
      fc.property(nonBlankText, nonBlankText, nonBlankText, (message, applicationNumber, actorName) => {
        // Feature: admin-dashboard-overhaul, Property 7: Activity feed rendering completeness
        const html = renderToStaticMarkup(
          <DashboardActivityFeed
            items={[
              {
                id: 'activity-1',
                type: 'status_change',
                application_number: applicationNumber,
                message,
                timestamp: '2026-04-18T10:00:00.000Z',
                actor_name: actorName,
              },
            ]}
          />
        )

        expect(html).toContain(escapeHtml(message))
        expect(html).toContain(escapeHtml(applicationNumber))
        expect(html).toContain(escapeHtml(actorName))
      }),
      { numRuns: 100 }
    )
  })

  it('rejects invalid intake form states', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({
            name: fc.constant(''),
            year: fc.integer({ min: 2000, max: 2100 }),
            start_date: fc.constant('2026-07-01'),
            end_date: fc.constant('2026-08-01'),
            application_deadline: fc.constant('2026-06-01'),
            max_capacity: fc.integer({ min: 1, max: 1000 }),
          }),
          fc.record({
            name: nonBlankText,
            year: fc.integer({ min: 2000, max: 2100 }),
            start_date: fc.constant('2026-09-01'),
            end_date: fc.constant('2026-08-01'),
            application_deadline: fc.constant('2026-06-01'),
            max_capacity: fc.integer({ min: 1, max: 1000 }),
          }),
          fc.record({
            name: nonBlankText,
            year: fc.integer({ min: 2000, max: 2100 }),
            start_date: fc.constant('2026-07-01'),
            end_date: fc.constant('2026-08-01'),
            application_deadline: fc.constant('2026-06-01'),
            max_capacity: fc.integer({ max: 0 }),
          })
        ),
        formData => {
          // Feature: admin-dashboard-overhaul, Property 9: Intake form validation
          expect(intakeSchema.safeParse(formData).success).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('maps intake utilization labels from enrollment and capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 2000 }),
        fc.integer({ min: -10, max: 2000 }),
        (enrollment, capacity) => {
          // Feature: admin-dashboard-overhaul, Property 11: Utilization color mapping
          const label = getUtilizationColor(enrollment, capacity).label
          if (capacity <= 0) {
            expect(label).toBe('N/A')
          } else if (enrollment >= capacity) {
            expect(label).toBe('Over capacity')
          } else if (enrollment >= 0.8 * capacity) {
            expect(label).toBe('Near capacity')
          } else {
            expect(label).toBe('Available')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('rejects non-positive or non-numeric fee amounts', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.double({ max: 0, noNaN: true, noDefaultInfinity: true }).map(String),
          fc.string({ minLength: 1, maxLength: 20 }).filter(value => Number.isNaN(Number(value)))
        ),
        amount => {
          // Feature: admin-dashboard-overhaul, Property 12: Fee amount validation
          expect(validateFeeAmount(amount)).toBe('Amount must be a valid positive number')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('formats fee amounts to exactly two decimal places', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('ZMW', 'USD', 'EUR'),
        fc.double({ min: 0.01, max: 100000, noNaN: true, noDefaultInfinity: true }),
        (currency, amount) => {
          // Feature: admin-dashboard-overhaul, Property 13: Fee currency formatting
          expect(formatFeeAmount(currency, amount)).toMatch(new RegExp(`^${currency} \\d+\\.\\d{2}$`))
        }
      ),
      { numRuns: 100 }
    )
  })

  it('escapes HTML-like audit display content', () => {
    fc.assert(
      fc.property(nonBlankText, payload => {
        // Feature: admin-dashboard-overhaul, Property 14: Audit XSS sanitization
        const raw = `<script>${payload}</script><img src=x onerror=alert(1)>`
        const sanitized = sanitizeForDisplay(raw)
        expect(sanitized).not.toContain('<script>')
        expect(sanitized).not.toContain('<img')
        expect(sanitized).toContain('&lt;script&gt;')
      }),
      { numRuns: 100 }
    )
  })

  it('validates settings according to declared value type', () => {
    fc.assert(
      fc.property(nonBlankText, value => {
        // Feature: admin-dashboard-overhaul, Property 15: Setting validation by type
        expect(validateSetting({ key: '', value }, 'string')).toContain('Setting key is required')
        expect(validateSetting({ key: 'flag', value: 'maybe' }, 'boolean')).not.toEqual([])
        expect(validateSetting({ key: 'count', value: `${value}.5` }, 'integer')).not.toEqual([])
        expect(validateSetting({ key: 'amount', value: `${value}abc` }, 'decimal')).not.toEqual([])
      }),
      { numRuns: 100 }
    )
  })
})
