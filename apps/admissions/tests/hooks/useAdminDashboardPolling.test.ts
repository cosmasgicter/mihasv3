import { describe, expect, it } from 'vitest'
import {
  estimateMaxDashboardRequestsOverWindow,
  getDashboardRetryDelay,
} from '../../src/hooks/useAdminDashboardPolling'

describe('useAdminDashboardPolling retry budgeting', () => {
  it('uses bounded exponential backoff delays', () => {
    expect(getDashboardRetryDelay(0)).toBe(1000)
    expect(getDashboardRetryDelay(1)).toBe(2000)
    expect(getDashboardRetryDelay(2)).toBe(4000)
    expect(getDashboardRetryDelay(10)).toBe(10000)
  })

  it('caps request frequency over a 5-minute window', () => {
    const fiveMinutesMs = 5 * 60 * 1000
    const pollingIntervalMs = 30 * 1000

    // 11 poll cycles (initial + every 30s through minute 5), each allowing up to
    // 2 retries => 3 requests max per cycle.
    expect(estimateMaxDashboardRequestsOverWindow(fiveMinutesMs, pollingIntervalMs)).toBe(33)
  })
})
