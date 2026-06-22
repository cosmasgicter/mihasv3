/**
 * Bug Condition Exploration — Stale Chunk Recovery
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 *
 * This test encodes the EXPECTED (fixed) behavior. It MUST FAIL on
 * unfixed code — failure confirms the bug exists.
 *
 * Bug: LazyLoadErrorBoundary catches chunk load errors and identifies them
 * correctly (isChunkError = true), but only renders manual "Try again" /
 * "Reload page" buttons. It never consults `evaluateChunkAutoReloadPolicy`
 * or triggers an automatic `window.location.reload()`.
 *
 * On UNFIXED code: `window.location.reload` is never called automatically
 * when a chunk error is caught — the boundary has no integration with the
 * auto-reload policy. Tests FAIL.
 *
 * On FIXED code: The boundary evaluates the reload policy and, when allowed,
 * automatically calls `window.location.reload()` and persists reload state
 * to sessionStorage. Tests PASS.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { LazyLoadErrorBoundary } from '@/components/LazyLoadErrorBoundary'

// Session storage keys used by the chunk auto-reload system
const SS_RELOAD_COUNT = 'beanola_chunk_reload_count'
const SS_RELOAD_TS = 'beanola_chunk_reload_ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates an error that mimics a chunk load failure */
function createChunkError(message: string): Error {
  const error = new Error(message)
  error.name = 'ChunkLoadError'
  return error
}

/** A child component that throws on render */
function ThrowingChild({ error }: { error: Error }) {
  throw error
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates chunk error message patterns that LazyLoadErrorBoundary recognizes */
const arbChunkErrorMessage = fc.oneof(
  fc.constant('Loading chunk abc123 failed'),
  fc.constant('Failed to fetch dynamically imported module /assets/Applications-BmdqbC1l.js'),
  fc.constant('Importing a module script failed'),
  // Generate with varying chunk identifiers
  fc.stringMatching(/^[a-zA-Z0-9]{1,30}$/).map(
    (s) => `Loading chunk ${s} failed`
  ),
  fc.stringMatching(/^[a-zA-Z0-9]{1,30}$/).map(
    (s) => `Failed to fetch dynamically imported module /assets/${s}.js`
  ),
  fc.constant('Importing a module script failed: the server responded with a non-JavaScript MIME type'),
)

/** Generates non-idle route paths where auto-reload should be allowed */
const arbNonIdleRoute = fc.oneof(
  fc.constant('/student/application/123'),
  fc.constant('/student/settings'),
  fc.constant('/admin/applications'),
  fc.constant('/student/payment'),
  fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/).map(
    (s) => `/student/${s}`
  ),
)

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — Chunk Error Auto-Reload Not Triggered
// ---------------------------------------------------------------------------

describe('[PBT] Bug Condition — Chunk Error Auto-Reload Not Triggered', () => {
  let container: HTMLDivElement
  let root: Root
  let reloadSpy: ReturnType<typeof vi.fn>
  let originalSessionStorage: Storage
  let mockStorage: Record<string, string>

  beforeEach(() => {
    // Set up DOM container
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    // Mock window.location.reload
    reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        reload: reloadSpy,
        pathname: '/student/application/123',
      },
    })

    // Mock sessionStorage with fresh state (no prior reloads)
    mockStorage = {}
    originalSessionStorage = window.sessionStorage
    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value }),
      removeItem: vi.fn((key: string) => { delete mockStorage[key] }),
      clear: vi.fn(() => { mockStorage = {} }),
      get length() { return Object.keys(mockStorage).length },
      key: vi.fn((index: number) => Object.keys(mockStorage)[index] ?? null),
    }
    Object.defineProperty(window, 'sessionStorage', {
      writable: true,
      value: storageMock,
    })

    // Suppress React error boundary console errors during test
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    act(() => { root.unmount() })
    document.body.removeChild(container)
    Object.defineProperty(window, 'sessionStorage', {
      writable: true,
      value: originalSessionStorage,
    })
    vi.restoreAllMocks()
  })

  it('window.location.reload() is called automatically when a chunk error occurs and policy allows', () => {
    /**
     * EXPECTED (fixed): When a chunk load error is caught and the reload policy
     * allows it (fresh session, no prior reloads, non-idle route), the boundary
     * should automatically call window.location.reload().
     *
     * On UNFIXED code: The boundary only renders manual buttons and never calls
     * window.location.reload() → FAILS
     */
    fc.assert(
      fc.property(arbChunkErrorMessage, arbNonIdleRoute, (errorMessage, route) => {
        // Reset state for each property run
        reloadSpy.mockClear()
        mockStorage = {} // Fresh session — no prior reloads

        // Set route to a non-idle path
        Object.defineProperty(window.location, 'pathname', {
          writable: true,
          value: route,
        })

        // Create a fresh container for each run
        const runContainer = document.createElement('div')
        document.body.appendChild(runContainer)
        const runRoot = createRoot(runContainer)

        const error = createChunkError(errorMessage)

        act(() => {
          runRoot.render(
            React.createElement(
              LazyLoadErrorBoundary,
              null,
              React.createElement(ThrowingChild, { error })
            )
          )
        })

        // EXPECTED: window.location.reload() is called automatically
        // On UNFIXED code: reload is never called — boundary only shows buttons
        expect(reloadSpy).toHaveBeenCalled()

        act(() => { runRoot.unmount() })
        document.body.removeChild(runContainer)
      }),
      { numRuns: 5 },
    )
  })

  it('sessionStorage beanola_chunk_reload_count is incremented after auto-reload trigger', () => {
    /**
     * EXPECTED (fixed): After auto-reload is triggered, the boundary should
     * persist the reload count to sessionStorage so the policy can track it.
     *
     * On UNFIXED code: The boundary never writes to sessionStorage → FAILS
     */
    fc.assert(
      fc.property(arbChunkErrorMessage, (errorMessage) => {
        // Reset state
        reloadSpy.mockClear()
        mockStorage = {} // Fresh session

        Object.defineProperty(window.location, 'pathname', {
          writable: true,
          value: '/student/application/123',
        })

        const runContainer = document.createElement('div')
        document.body.appendChild(runContainer)
        const runRoot = createRoot(runContainer)

        const error = createChunkError(errorMessage)

        act(() => {
          runRoot.render(
            React.createElement(
              LazyLoadErrorBoundary,
              null,
              React.createElement(ThrowingChild, { error })
            )
          )
        })

        // EXPECTED: sessionStorage reload count is set to "1"
        // On UNFIXED code: sessionStorage is never written → FAILS
        expect(mockStorage[SS_RELOAD_COUNT]).toBe('1')

        act(() => { runRoot.unmount() })
        document.body.removeChild(runContainer)
      }),
      { numRuns: 5 },
    )
  })

  it('sessionStorage beanola_chunk_reload_ts is set to a recent timestamp after auto-reload trigger', () => {
    /**
     * EXPECTED (fixed): After auto-reload is triggered, the boundary should
     * persist the reload timestamp to sessionStorage for cooldown tracking.
     *
     * On UNFIXED code: The boundary never writes timestamps → FAILS
     */
    fc.assert(
      fc.property(arbChunkErrorMessage, (errorMessage) => {
        reloadSpy.mockClear()
        mockStorage = {}

        Object.defineProperty(window.location, 'pathname', {
          writable: true,
          value: '/student/settings',
        })

        const beforeMs = Date.now()

        const runContainer = document.createElement('div')
        document.body.appendChild(runContainer)
        const runRoot = createRoot(runContainer)

        const error = createChunkError(errorMessage)

        act(() => {
          runRoot.render(
            React.createElement(
              LazyLoadErrorBoundary,
              null,
              React.createElement(ThrowingChild, { error })
            )
          )
        })

        const afterMs = Date.now()

        // EXPECTED: sessionStorage reload timestamp is set to a recent value
        // On UNFIXED code: sessionStorage is never written → FAILS
        const storedTs = mockStorage[SS_RELOAD_TS]
        expect(storedTs).toBeDefined()
        const tsValue = Number(storedTs)
        expect(tsValue).toBeGreaterThanOrEqual(beforeMs)
        expect(tsValue).toBeLessThanOrEqual(afterMs)

        act(() => { runRoot.unmount() })
        document.body.removeChild(runContainer)
      }),
      { numRuns: 5 },
    )
  })
})
