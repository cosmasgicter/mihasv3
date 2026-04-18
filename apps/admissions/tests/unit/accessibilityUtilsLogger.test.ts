import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { logContrastValidation } from '@/lib/accessibility-utils'
import { logger } from '@/lib/logger'

/**
 * Validates: Requirements 2.5, 3.6
 *
 * Verifies that logContrastValidation uses the canonical logger.debug
 * instead of raw console.log, and that high-contrast and low-contrast
 * color pairs produce the correct formatted output.
 */
describe('logContrastValidation logger replacement', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('calls logger.debug with PASS status for high-contrast colors (#000 on #fff)', () => {
    logContrastValidation('test', '#000', '#fff')

    const calls = vi.mocked(logger.debug).mock.calls.map(c => c[0])

    // High contrast → single logger.debug call with ✅
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('✅')
    expect(calls[0]).toContain('test')
    expect(calls[0]).toContain('21.00:1')
    expect(calls[0]).toContain('Normal')
  })

  it('calls logger.debug with FAIL status and suggestion for low-contrast colors (#777 on #888)', () => {
    logContrastValidation('test', '#777', '#888')

    const calls = vi.mocked(logger.debug).mock.calls.map(c => c[0])

    // Low contrast → two logger.debug calls: status line + suggestion
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('❌')
    expect(calls[0]).toContain('test')
    expect(calls[0]).toContain('FAIL')
    expect(calls[1]).toContain('💡 Suggested:')
  })

  it('does NOT call console.log', () => {
    logContrastValidation('test', '#000', '#fff')
    logContrastValidation('test', '#777', '#888')

    expect(consoleLogSpy).not.toHaveBeenCalled()
  })
})
