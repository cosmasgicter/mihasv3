/**
 * Unit tests for error reporter initialization gating.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockSentryInit = vi.fn()

vi.mock('@sentry/react', () => ({
  init: mockSentryInit,
  captureException: vi.fn(),
}))

describe('errorReporter init gating', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSentryInit.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('enables reporting by default when VITE_GLITCHTIP_DSN is set', async () => {
    vi.stubEnv('VITE_GLITCHTIP_DSN', 'https://key@glitchtip.example.com/1')

    vi.doMock('@sentry/react', () => ({
      init: mockSentryInit,
      captureException: vi.fn(),
    }))

    const { initErrorReporter } = await import('@/lib/errorReporter')
    initErrorReporter()

    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://key@glitchtip.example.com/1' })
    )
  })

  it('disables reporting when VITE_GLITCHTIP_DSN is absent', async () => {
    vi.stubEnv('VITE_GLITCHTIP_DSN', '')

    vi.doMock('@sentry/react', () => ({
      init: mockSentryInit,
      captureException: vi.fn(),
    }))

    const { initErrorReporter } = await import('@/lib/errorReporter')
    initErrorReporter()

    expect(mockSentryInit).not.toHaveBeenCalled()
  })
})
