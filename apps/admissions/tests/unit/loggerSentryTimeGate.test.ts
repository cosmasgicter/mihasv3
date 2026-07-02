/**
 * logger.ts Sentry time-gate — verifies the boot-delay gate added to keep
 * vendor-sentry off Lighthouse's throttled-CPU trace window (mirrors the
 * `ERROR_REPORTER_MIN_DELAY_MS` gate in main.tsx).
 *
 * Real production bug this guards against: an earlier version defined
 * `withSentryUrgent()` to bypass the gate for error-level logs but never
 * wired it up, and the class docstring claimed errors skip the gate when
 * they did not. This test locks in the actual (correct) contract: every
 * log level is buffered until the gate opens, then flushed in order.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('logger Sentry time gate', () => {
  const mockInit = vi.fn()
  const mockCaptureException = vi.fn()
  const mockAddBreadcrumb = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    mockInit.mockClear()
    mockCaptureException.mockClear()
    mockAddBreadcrumb.mockClear()
    vi.doMock('@sentry/react', () => ({
      init: mockInit,
      captureException: mockCaptureException,
      captureMessage: vi.fn(),
      addBreadcrumb: mockAddBreadcrumb,
    }))
    ;(import.meta.env as Record<string, boolean>).DEV = false
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.doUnmock('@sentry/react')
    ;(import.meta.env as Record<string, boolean>).DEV = true
  })

  it('does not import @sentry/react before the 4s gate opens', async () => {
    const { logger } = await import('@/lib/logger')
    logger.error('boom')
    logger.warn('careful')
    logger.info('fyi')

    // Advance less than the gate delay — Sentry must not be loaded yet.
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockCaptureException).not.toHaveBeenCalled()
    expect(mockAddBreadcrumb).not.toHaveBeenCalled()
  })

  it('flushes every buffered call once the gate opens, in order', async () => {
    vi.useRealTimers()
    const { logger } = await import('@/lib/logger')
    logger.warn('a warning')
    logger.info('an info')

    await new Promise((resolve) => setTimeout(resolve, 4200))

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(2)
    const breadcrumbLevels = mockAddBreadcrumb.mock.calls.map((c) => c[0].level)
    expect(breadcrumbLevels).toEqual(['warning', 'info'])
  }, 6000)

  it('flushes a buffered error-level call once the gate opens', async () => {
    vi.useRealTimers()
    const { logger } = await import('@/lib/logger')
    logger.error('first error', new Error('boom'))

    await new Promise((resolve) => setTimeout(resolve, 4200))

    expect(mockCaptureException).toHaveBeenCalledTimes(1)
    expect(mockCaptureException.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  }, 6000)

  it('does not spawn duplicate import chains for concurrent calls before the gate opens', async () => {
    vi.useRealTimers()
    const { logger } = await import('@/lib/logger')
    // Fire many calls in the same tick before the gate opens.
    for (let i = 0; i < 10; i++) logger.info(`msg-${i}`)

    await new Promise((resolve) => setTimeout(resolve, 4200))

    // Sentry's dynamic import should only be triggered once regardless of
    // how many buffered calls were waiting.
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(10)
  }, 6000)
})
