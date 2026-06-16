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

  it('sends errors only — no session or performance envelopes (GlitchTip 429 fix)', async () => {
    vi.stubEnv('VITE_GLITCHTIP_DSN', 'https://key@glitchtip.example.com/1')

    vi.doMock('@sentry/react', () => ({
      init: mockSentryInit,
      captureException: vi.fn(),
    }))

    const { initErrorReporter } = await import('@/lib/errorReporter')
    initErrorReporter()

    const config = mockSentryInit.mock.calls[0]![0]
    // Performance transaction envelopes are an envelope source — must be off.
    expect(config.tracesSampleRate).toBe(0)
    // Error sampling + dedup guards remain.
    expect(config.sampleRate).toBe(0.25)
    expect(typeof config.beforeSend).toBe('function')

    // The integrations filter drops the session + tracing integrations so no
    // session/transaction envelope is sent even on init/navigation. (Sentry v8+
    // has no autoSessionTracking option — sessions are owned by BrowserSession.)
    const filtered = config.integrations([
      { name: 'BrowserSession' },
      { name: 'BrowserTracing' },
      { name: 'GlobalHandlers' },
      { name: 'Breadcrumbs' },
    ])
    const names = filtered.map((i: { name: string }) => i.name)
    expect(names).not.toContain('BrowserSession')
    expect(names).not.toContain('BrowserTracing')
    expect(names).toContain('GlobalHandlers')
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
