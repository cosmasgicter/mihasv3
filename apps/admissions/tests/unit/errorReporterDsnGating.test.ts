/**
 * Error reporter DSN gating.
 *
 * initErrorReporter() must short-circuit when VITE_GLITCHTIP_DSN is
 * unset — otherwise @sentry/react would still be imported into the
 * entry chunk (defeating the Phase A FCP win) and real production
 * builds would hit Sentry with a bogus DSN.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const initMock = vi.fn()

vi.mock('@sentry/react', () => ({
  init: initMock,
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

describe('errorReporter DSN gating', () => {
  const originalDsn = import.meta.env.VITE_GLITCHTIP_DSN

  beforeEach(() => {
    initMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    ;(import.meta.env as Record<string, string | undefined>).VITE_GLITCHTIP_DSN =
      originalDsn
  })

  it('does NOT call Sentry.init when DSN is absent', async () => {
    ;(import.meta.env as Record<string, string | undefined>).VITE_GLITCHTIP_DSN =
      ''
    const mod = await import('@/lib/errorReporter')
    await mod.initErrorReporter()
    expect(initMock).not.toHaveBeenCalled()
  })

  it('does NOT call Sentry.init when DSN is undefined', async () => {
    delete (import.meta.env as Record<string, string | undefined>)
      .VITE_GLITCHTIP_DSN
    const mod = await import('@/lib/errorReporter')
    await mod.initErrorReporter()
    expect(initMock).not.toHaveBeenCalled()
  })

  it('calls Sentry.init exactly once when DSN is present', async () => {
    ;(import.meta.env as Record<string, string | undefined>).VITE_GLITCHTIP_DSN =
      'https://key@example.test/1'
    const mod = await import('@/lib/errorReporter')
    await mod.initErrorReporter()
    expect(initMock).toHaveBeenCalledTimes(1)
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://key@example.test/1' }),
    )
  })
})
