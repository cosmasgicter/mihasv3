/**
 * **GATE-13.3-10 in the DOM** — task 13.6 remediation L6, blocking item **B8**.
 *
 * R16.8: *"THE student next action, current status, autosave state, payment
 * action, and error recovery SHALL remain understandable under 400 percent text
 * zoom, reduced motion, slow network, and offline/reconnect scenarios."*
 *
 * Task 13.3 cut the connection while the application wizard was mounted and
 * measured what the student was shown:
 *
 * > **Something went wrong** · *Cannot read properties of undefined (reading
 * > 'SessionMonitor')* · **Try Again** · **Contact Support**
 *
 * The claim asserted here is the rendered one, which is the only one that answers
 * the question 13.3 asked: whatever the boundary shows, it **names the connection**
 * and it **never prints an internal error**. `tests/property/ui-ux-error-handling.test.ts`
 * Property 9 covers the pure classifier over its whole input space and the source
 * guard that `error.message` cannot come back; this file covers the mount.
 *
 * Deliberately not mocked: a real `ErrorBoundary` catches a real throw, and the
 * assertion reads `container.textContent` — the same thing a student reads.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { leaksInternalError } from '@/lib/errorBoundaryCopy'

/** The exact exception 13.3 recorded on the offline path. */
function Boom(): JSX.Element {
  throw new TypeError("Cannot read properties of undefined (reading 'SessionMonitor')")
}

function withOnline<T>(online: boolean, run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'onLine')
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true })
  try {
    return run()
  } finally {
    if (descriptor) Object.defineProperty(window.navigator, 'onLine', descriptor)
    else Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
  }
}

describe('GATE-13.3-10 — an error boundary never prints an internal error at a student', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  for (const level of ['page', 'section'] as const) {
    it(`${level}-level: offline names the connection and leaks nothing`, () => {
      // React logs the caught error; that is telemetry, not copy.
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const text = withOnline(false, () => {
        const { container } = render(
          <ErrorBoundary level={level}>
            <Boom />
          </ErrorBoundary>,
        )
        return (container.textContent ?? '').replace(/\s+/g, ' ').trim()
      })

      expect(text.length, 'the boundary must render a fallback').toBeGreaterThan(0)
      // R16.8's positive claim.
      expect(text, `must name the connection; rendered: "${text}"`).toMatch(
        /offline|connection|network|internet|reconnect/i,
      )
      // R16.8's negative claim — GATE-13.3-10's actual counter-example.
      expect(leaksInternalError(text), `leaked an internal error: "${text}"`).toBe(false)
      expect(text).not.toContain('SessionMonitor')
      // A recovery affordance is still offered, which 13.3 confirmed already worked.
      expect(text).toMatch(/try again/i)
    })

    it(`${level}-level: a chunk failure while online still names the cause`, () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})

      function ChunkBoom(): JSX.Element {
        throw new Error(
          'Failed to fetch dynamically imported module: /assets/js/SessionMonitor-abc123.js',
        )
      }

      const text = withOnline(true, () => {
        const { container } = render(
          <ErrorBoundary level={level}>
            <ChunkBoom />
          </ErrorBoundary>,
        )
        return (container.textContent ?? '').replace(/\s+/g, ' ').trim()
      })

      expect(text).toMatch(/connection|network|downloaded/i)
      expect(leaksInternalError(text), `leaked an internal error: "${text}"`).toBe(false)
      expect(text).not.toContain('/assets/js/')
      expect(text).not.toContain('SessionMonitor')
    })
  }

  it('an unrecognised failure keeps the original friendly heading and admits no cause', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    function Odd(): JSX.Element {
      throw new Error('k')
    }

    const text = withOnline(true, () => {
      const { container } = render(
        <ErrorBoundary level="section">
          <Odd />
        </ErrorBoundary>,
      )
      return (container.textContent ?? '').replace(/\s+/g, ' ').trim()
    })

    expect(text).toContain('Something went wrong')
    // It must not claim a connection problem it has no evidence for.
    expect(text).not.toMatch(/you appear to be offline/i)
    expect(leaksInternalError(text)).toBe(false)
  })
})
