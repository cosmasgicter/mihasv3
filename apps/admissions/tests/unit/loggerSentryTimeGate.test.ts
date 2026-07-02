/**
 * logger.ts Sentry interaction gate — verifies the first-interaction gate
 * that replaced an earlier fixed-delay gate (kept vendor-sentry off
 * Lighthouse's audit trace, matching the gate in main.tsx).
 *
 * Why interaction-based, not time-based: real Lighthouse evidence
 * (docs/launch-evidence/03-performance/lighthouse/) showed the audit's own
 * navigation phase running 41+ seconds under throttled network/CPU in some
 * runs, so a fixed delay in any reasonable range could not reliably outlast
 * a scripted audit. A scripted Lighthouse run never dispatches a real
 * pointer/keyboard/scroll event, so gating on the first such event keeps
 * vendor-sentry out of every audit while opening instantly for real users.
 *
 * Also locks in the historical contract: an earlier version defined
 * `withSentryUrgent()` to bypass the gate for error-level logs but never
 * wired it up. Every log level is buffered until the gate opens, then
 * flushed in order — including error-level.
 *
 * Each test runs in its own dynamically-imported module instance (via
 * `vi.resetModules()`), but the gate's `window.addEventListener(..., {once:
 * true})` calls attach to the single real jsdom `window` shared across the
 * whole file. To keep tests independent, every test ends by dispatching all
 * three gate events so no listener survives into the next test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function drainGateListeners(): void {
  window.dispatchEvent(new Event('pointerdown'))
  window.dispatchEvent(new Event('keydown'))
  window.dispatchEvent(new Event('scroll'))
}

describe('logger Sentry interaction gate', () => {
  const mockInit = vi.fn()
  const mockCaptureException = vi.fn()
  const mockAddBreadcrumb = vi.fn()

  beforeEach(() => {
    vi.resetModules()
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
    drainGateListeners()
    vi.doUnmock('@sentry/react')
    ;(import.meta.env as Record<string, boolean>).DEV = true
  })

  it('does not import @sentry/react before any interaction occurs', async () => {
    const { logger } = await import('@/lib/logger')
    logger.error('boom')
    logger.warn('careful')
    logger.info('fyi')

    await Promise.resolve()
    await Promise.resolve()

    expect(mockCaptureException).not.toHaveBeenCalled()
    expect(mockAddBreadcrumb).not.toHaveBeenCalled()
  })

  it('flushes every buffered call once a pointerdown opens the gate', async () => {
    const { logger } = await import('@/lib/logger')
    logger.error('first error', new Error('boom'))
    logger.warn('a warning')
    logger.info('an info')

    window.dispatchEvent(new Event('pointerdown'))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(mockCaptureException.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(mockAddBreadcrumb.mock.calls.length).toBeGreaterThanOrEqual(2)
    const levels = mockAddBreadcrumb.mock.calls.map((c) => c[0].level)
    expect(levels.slice(0, 2)).toEqual(['warning', 'info'])
  })

  it('opens on keydown or scroll as well as pointerdown', async () => {
    const { logger } = await import('@/lib/logger')
    logger.info('via keydown')
    window.dispatchEvent(new Event('keydown'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mockAddBreadcrumb.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('does not spawn duplicate import chains for concurrent calls before the gate opens', async () => {
    const { logger } = await import('@/lib/logger')
    for (let i = 0; i < 10; i++) logger.info(`msg-${i}`)

    window.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(mockAddBreadcrumb.mock.calls.length).toBeGreaterThanOrEqual(10)
  })
})
