import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { logPerformanceMetrics, PERFORMANCE_THRESHOLDS } from '@/lib/performance-utils'
import { logger } from '@/lib/logger'

/**
 * Validates: Requirements 2.4, 3.5
 *
 * Verifies that logPerformanceMetrics uses the canonical logger.debug
 * instead of raw console.log/console.group, and that each metric
 * produces the correct formatted output.
 */
describe('logPerformanceMetrics logger replacement', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleGroupSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleGroupSpy.mockRestore()
  })

  it('calls logger.debug with FCP metric string for { fcp: 450 }', () => {
    logPerformanceMetrics({ fcp: 450 })

    const calls = vi.mocked(logger.debug).mock.calls.map(c => c[0])

    expect(calls[0]).toBe('🚀 Performance Metrics')

    const fcpLine = calls.find(msg => msg.includes('FCP'))
    expect(fcpLine).toBeDefined()
    expect(fcpLine).toContain('450')
    expect(fcpLine).toContain(`${PERFORMANCE_THRESHOLDS.fcp}`)
    // 450 <= 500 → pass
    expect(fcpLine).toContain('✅')
  })

  it('calls logger.debug for each provided metric with { lcp: 1200, cls: 0.05 }', () => {
    logPerformanceMetrics({ lcp: 1200, cls: 0.05 })

    const calls = vi.mocked(logger.debug).mock.calls.map(c => c[0])

    // Header + LCP + CLS = 3 calls
    expect(calls).toHaveLength(3)
    expect(calls[0]).toBe('🚀 Performance Metrics')

    const lcpLine = calls.find(msg => msg.includes('LCP'))
    expect(lcpLine).toBeDefined()
    expect(lcpLine).toContain('1200')
    expect(lcpLine).toContain(`${PERFORMANCE_THRESHOLDS.lcp}`)
    // 1200 <= 1500 → pass
    expect(lcpLine).toContain('✅')

    const clsLine = calls.find(msg => msg.includes('CLS'))
    expect(clsLine).toBeDefined()
    expect(clsLine).toContain('0.050')
    expect(clsLine).toContain(`${PERFORMANCE_THRESHOLDS.cls}`)
    // 0.05 <= 0.1 → pass
    expect(clsLine).toContain('✅')
  })

  it('only logs the header when called with empty metrics {}', () => {
    logPerformanceMetrics({})

    const calls = vi.mocked(logger.debug).mock.calls.map(c => c[0])

    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe('🚀 Performance Metrics')
  })

  it('does NOT call console.log or console.group', () => {
    logPerformanceMetrics({ fcp: 450, lcp: 1200, cls: 0.05 })

    expect(consoleLogSpy).not.toHaveBeenCalled()
    expect(consoleGroupSpy).not.toHaveBeenCalled()
  })
})
