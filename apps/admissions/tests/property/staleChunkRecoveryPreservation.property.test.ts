/**
 * Preservation Property Tests — Stale Chunk Recovery
 *
 * **Validates: Requirements 3.1, 3.3**
 *
 * These tests capture the BASELINE behavior of `LazyLoadErrorBoundary` on
 * UNFIXED code. They MUST PASS before and after the fix — any failure after
 * the fix indicates a regression.
 *
 * Preservation Property 3 (design): Non-chunk errors never trigger auto-reload.
 *   → Boundary renders "Try again" button only, NO "Reload page" button,
 *     `window.location.reload` is never called.
 *
 * Preservation Property 2 (design): Policy-denied chunk errors show manual UI.
 *   → On unfixed code the boundary has no policy integration, so ALL chunk
 *     errors render "Try again" + "Reload page" buttons with NO auto-reload.
 *     This is the correct fallback behavior that must be preserved when the
 *     policy denies a reload after the fix.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { LazyLoadErrorBoundary } from '@/components/LazyLoadErrorBoundary'

// Chunk error message patterns the boundary recognises
const CHUNK_ERROR_PATTERNS = [
  'Loading chunk',
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A child component that throws on render */
function ThrowingChild({ error }: { error: Error }) {
  throw error
}

/** Creates a chunk-style error */
function createChunkError(message: string): Error {
  const error = new Error(message)
  error.name = 'ChunkLoadError'
  return error
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates arbitrary error messages that do NOT match any chunk error pattern.
 * These represent runtime crashes, network errors, type errors, etc.
 */
const arbNonChunkErrorMessage = fc
  .string({ minLength: 1, maxLength: 120 })
  .filter((msg) => !CHUNK_ERROR_PATTERNS.some((p) => msg.includes(p)))

/**
 * Generates chunk error messages the boundary recognises.
 */
const arbChunkErrorMessage = fc.oneof(
  fc.constant('Loading chunk abc123 failed'),
  fc.constant('Failed to fetch dynamically imported module /assets/App-xyz.js'),
  fc.constant('Importing a module script failed'),
  fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/).map((s) => `Loading chunk ${s} failed`),
  fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/).map(
    (s) => `Failed to fetch dynamically imported module /assets/${s}.js`,
  ),
)

/**
 * Generates a reloadCount that exceeds the session limit (maxPerSession = 3).
 * This ensures the policy would deny with cause 'session-limit'.
 */
const arbExceededReloadCount = fc.integer({ min: 3, max: 100 })

/**
 * Generates cooldown-active scenarios: cooldownMs and sinceLastReloadMs where
 * sinceLastReloadMs < cooldownMs, so the policy would deny with 'cooldown-active'.
 */
const arbCooldownActive = fc.record({
  cooldownMs: fc.integer({ min: 1000, max: 120_000 }),
  sinceLastReloadMs: fc.integer({ min: 0, max: 999 }),
})

/**
 * Generates idle-protected route paths.
 */
const arbIdleProtectedRoute = fc.oneof(
  fc.constant('/'),
  fc.constant('/dashboard'),
  fc.constant('/student/dashboard'),
  fc.constant('/admin/dashboard'),
)

// ---------------------------------------------------------------------------
// Preservation Property 3: Non-Chunk Errors Never Auto-Reload
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — Non-Chunk Errors Never Auto-Reload', () => {
  let container: HTMLDivElement
  let root: Root
  let reloadSpy: ReturnType<typeof vi.fn>
  let originalSessionStorage: Storage

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        reload: reloadSpy,
        pathname: '/student/application/123',
      },
    })

    originalSessionStorage = window.sessionStorage
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

  it('non-chunk errors render "Try again" without "Reload page" and never call window.location.reload', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * For all non-chunk error messages, the boundary must:
     * 1. Render a "Try again" button
     * 2. NOT render a "Reload page" button
     * 3. NOT call window.location.reload()
     */
    fc.assert(
      fc.property(arbNonChunkErrorMessage, (errorMessage) => {
        reloadSpy.mockClear()

        const runContainer = document.createElement('div')
        document.body.appendChild(runContainer)
        const runRoot = createRoot(runContainer)

        const error = new Error(errorMessage)

        act(() => {
          runRoot.render(
            React.createElement(
              LazyLoadErrorBoundary,
              null,
              React.createElement(ThrowingChild, { error }),
            ),
          )
        })

        // Must render "Try again" button
        const buttons = runContainer.querySelectorAll('button')
        const buttonTexts = Array.from(buttons).map((b) => b.textContent)
        expect(buttonTexts).toContain('Try again')

        // Must NOT render "Reload page" button
        expect(buttonTexts).not.toContain('Reload page')

        // Must NOT call window.location.reload
        expect(reloadSpy).not.toHaveBeenCalled()

        // Must render the alert role
        const alert = runContainer.querySelector('[role="alert"]')
        expect(alert).not.toBeNull()

        act(() => { runRoot.unmount() })
        document.body.removeChild(runContainer)
      }),
      { numRuns: 5 },
    )
  })
})

// ---------------------------------------------------------------------------
// Preservation Property 2: Policy-Denied Chunk Errors Show Manual UI
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — Policy-Denied Chunk Errors Show Manual UI', () => {
  let container: HTMLDivElement
  let root: Root
  let reloadSpy: ReturnType<typeof vi.fn>
  let originalSessionStorage: Storage
  let mockStorage: Record<string, string>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        reload: reloadSpy,
        pathname: '/student/application/123',
      },
    })

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

  it('chunk errors with session-limit exceeded render manual retry/reload UI without auto-reload', () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * When reloadCount >= maxPerSession (policy would deny with 'session-limit'),
     * the boundary renders both "Try again" and "Reload page" buttons.
     * No automatic reload is triggered.
     *
     * On unfixed code: boundary has no policy integration, so it always shows
     * both buttons for chunk errors — this is the correct fallback behavior.
     */
    fc.assert(
      fc.property(
        arbChunkErrorMessage,
        arbExceededReloadCount,
        (errorMessage, reloadCount) => {
          reloadSpy.mockClear()

          // Set up session storage to reflect exceeded reload count
          mockStorage = {
            beanola_chunk_reload_count: String(reloadCount),
            beanola_chunk_reload_ts: String(Date.now() - 60_000),
          }

          const runContainer = document.createElement('div')
          document.body.appendChild(runContainer)
          const runRoot = createRoot(runContainer)

          const error = createChunkError(errorMessage)

          act(() => {
            runRoot.render(
              React.createElement(
                LazyLoadErrorBoundary,
                null,
                React.createElement(ThrowingChild, { error }),
              ),
            )
          })

          const buttons = runContainer.querySelectorAll('button')
          const buttonTexts = Array.from(buttons).map((b) => b.textContent)

          // Must render both manual buttons
          expect(buttonTexts).toContain('Try again')
          expect(buttonTexts).toContain('Reload page')

          // Must NOT auto-reload
          expect(reloadSpy).not.toHaveBeenCalled()

          act(() => { runRoot.unmount() })
          document.body.removeChild(runContainer)
        },
      ),
      { numRuns: 5 },
    )
  })

  it('chunk errors with cooldown active render manual retry/reload UI without auto-reload', () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * When sinceLastReloadMs < cooldownMs (policy would deny with 'cooldown-active'),
     * the boundary renders both "Try again" and "Reload page" buttons.
     * No automatic reload is triggered.
     */
    fc.assert(
      fc.property(
        arbChunkErrorMessage,
        arbCooldownActive,
        (errorMessage, { cooldownMs, sinceLastReloadMs }) => {
          reloadSpy.mockClear()

          // Set up session storage to reflect a recent reload (cooldown active)
          const now = Date.now()
          mockStorage = {
            beanola_chunk_reload_count: '1',
            beanola_chunk_reload_ts: String(now - sinceLastReloadMs),
          }

          const runContainer = document.createElement('div')
          document.body.appendChild(runContainer)
          const runRoot = createRoot(runContainer)

          const error = createChunkError(errorMessage)

          act(() => {
            runRoot.render(
              React.createElement(
                LazyLoadErrorBoundary,
                null,
                React.createElement(ThrowingChild, { error }),
              ),
            )
          })

          const buttons = runContainer.querySelectorAll('button')
          const buttonTexts = Array.from(buttons).map((b) => b.textContent)

          // Must render both manual buttons
          expect(buttonTexts).toContain('Try again')
          expect(buttonTexts).toContain('Reload page')

          // Must NOT auto-reload
          expect(reloadSpy).not.toHaveBeenCalled()

          act(() => { runRoot.unmount() })
          document.body.removeChild(runContainer)
        },
      ),
      { numRuns: 5 },
    )
  })

  it('chunk errors on idle-protected routes render manual retry/reload UI without auto-reload', () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * When the route is idle-protected (policy would deny with 'idle-route-protection'),
     * the boundary renders both "Try again" and "Reload page" buttons.
     * No automatic reload is triggered.
     */
    fc.assert(
      fc.property(
        arbChunkErrorMessage,
        arbIdleProtectedRoute,
        (errorMessage, route) => {
          reloadSpy.mockClear()

          // Set route to an idle-protected path
          Object.defineProperty(window.location, 'pathname', {
            writable: true,
            value: route,
          })

          // Fresh session — but on an idle-protected route
          mockStorage = {}

          const runContainer = document.createElement('div')
          document.body.appendChild(runContainer)
          const runRoot = createRoot(runContainer)

          const error = createChunkError(errorMessage)

          act(() => {
            runRoot.render(
              React.createElement(
                LazyLoadErrorBoundary,
                null,
                React.createElement(ThrowingChild, { error }),
              ),
            )
          })

          const buttons = runContainer.querySelectorAll('button')
          const buttonTexts = Array.from(buttons).map((b) => b.textContent)

          // Must render both manual buttons
          expect(buttonTexts).toContain('Try again')
          expect(buttonTexts).toContain('Reload page')

          // Must NOT auto-reload
          expect(reloadSpy).not.toHaveBeenCalled()

          act(() => { runRoot.unmount() })
          document.body.removeChild(runContainer)
        },
      ),
      { numRuns: 5 },
    )
  })
})
