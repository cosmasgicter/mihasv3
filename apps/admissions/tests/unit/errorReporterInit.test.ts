/**
 * Unit tests for error reporter initialization gating.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('errorReporter init gating', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    window.onerror = null
    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('enables reporting by default when VITE_ERROR_REPORT_ENABLED is unset', async () => {
    vi.stubEnv('VITE_ERROR_REPORT_ENABLED', '')

    const { initErrorReporter } = await import('@/lib/errorReporter')
    initErrorReporter()

    expect(typeof window.onerror).toBe('function')
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function),
    )
  })

  it('disables reporting only when VITE_ERROR_REPORT_ENABLED is false', async () => {
    vi.stubEnv('VITE_ERROR_REPORT_ENABLED', 'false')

    const { initErrorReporter } = await import('@/lib/errorReporter')
    initErrorReporter()

    expect(window.onerror).toBeNull()
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function),
    )
  })
})
