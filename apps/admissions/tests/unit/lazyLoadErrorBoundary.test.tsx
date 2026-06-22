/**
 * Unit tests for LazyLoadErrorBoundary auto-reload behavior.
 *
 * Tests the integration between LazyLoadErrorBoundary and
 * evaluateChunkAutoReloadPolicy — auto-reload when policy allows,
 * manual fallback UI when policy denies, and non-chunk error handling.
 *
 * Validates: Requirements 2.1, 2.2, 3.1, 3.3
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { LazyLoadErrorBoundary } from '@/components/LazyLoadErrorBoundary'

// Mock the policy module so we can control decisions per test
vi.mock('@/lib/chunkAutoReloadPolicy', () => ({
  evaluateChunkAutoReloadPolicy: vi.fn(),
}))

// Mock logger to suppress output and allow assertions
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

import { evaluateChunkAutoReloadPolicy } from '@/lib/chunkAutoReloadPolicy'

const mockedPolicy = vi.mocked(evaluateChunkAutoReloadPolicy)

// Session storage keys
const SS_RELOAD_COUNT = 'beanola_chunk_reload_count'
const SS_RELOAD_TS = 'beanola_chunk_reload_ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ThrowingChild({ error }: { error: Error }): React.ReactNode {
  throw error
}

function createChunkError(message: string): Error {
  const error = new Error(message)
  error.name = 'ChunkLoadError'
  return error
}

// ---------------------------------------------------------------------------
// Shared test setup
// ---------------------------------------------------------------------------

let reloadSpy: ReturnType<typeof vi.fn>
let originalSessionStorage: Storage
let mockStorage: Record<string, string>

function setupMockSessionStorage() {
  mockStorage = {}
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
}

function renderWithError(error: Error, props?: { fallbackMessage?: string }): {
  container: HTMLDivElement
  root: Root
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      React.createElement(
        LazyLoadErrorBoundary,
        { children: null, ...props },
        React.createElement(ThrowingChild, { error }),
      ),
    )
  })

  return { container, root }
}

function cleanup(container: HTMLDivElement, root: Root) {
  act(() => { root.unmount() })
  document.body.removeChild(container)
}

function getButtonTexts(container: HTMLDivElement): string[] {
  const buttons = container.querySelectorAll('button')
  return Array.from(buttons).map((b) => b.textContent ?? '')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LazyLoadErrorBoundary auto-reload behavior', () => {
  beforeEach(() => {
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
    setupMockSessionStorage()

    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedPolicy.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(window, 'sessionStorage', {
      writable: true,
      value: originalSessionStorage,
    })
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // Auto-reload when policy allows (Req 2.1, 2.2)
  // -----------------------------------------------------------------------

  it('calls window.location.reload() when chunk error occurs and policy allows', () => {
    mockedPolicy.mockReturnValue({ allow: true })

    const error = createChunkError('Loading chunk abc123 failed')
    const { container, root } = renderWithError(error)

    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(mockedPolicy).toHaveBeenCalledTimes(1)

    cleanup(container, root)
  })

  it('increments beanola_chunk_reload_count in sessionStorage after auto-reload', () => {
    mockedPolicy.mockReturnValue({ allow: true })

    const error = createChunkError('Failed to fetch dynamically imported module /assets/App.js')
    const { container, root } = renderWithError(error)

    expect(mockStorage[SS_RELOAD_COUNT]).toBe('1')

    cleanup(container, root)
  })

  it('sets beanola_chunk_reload_ts to a recent timestamp after auto-reload', () => {
    mockedPolicy.mockReturnValue({ allow: true })

    const before = Date.now()
    const error = createChunkError('Importing a module script failed')
    const { container, root } = renderWithError(error)
    const after = Date.now()

    const storedTs = Number(mockStorage[SS_RELOAD_TS])
    expect(storedTs).toBeGreaterThanOrEqual(before)
    expect(storedTs).toBeLessThanOrEqual(after)

    cleanup(container, root)
  })

  // -----------------------------------------------------------------------
  // Policy denial: session-limit (Req 3.1)
  // -----------------------------------------------------------------------

  it('renders manual UI with "Try again" and "Reload page" when policy denies with session-limit', () => {
    mockedPolicy.mockReturnValue({
      allow: false,
      cause: 'session-limit',
      context: { reloadCount: 3, maxPerSession: 3 },
    })

    const error = createChunkError('Loading chunk xyz failed')
    const { container, root } = renderWithError(error)

    const buttonTexts = getButtonTexts(container)
    expect(buttonTexts).toContain('Try again')
    expect(buttonTexts).toContain('Reload page')
    expect(reloadSpy).not.toHaveBeenCalled()

    cleanup(container, root)
  })

  // -----------------------------------------------------------------------
  // Policy denial: cooldown-active (Req 3.1)
  // -----------------------------------------------------------------------

  it('renders manual UI when policy denies with cooldown-active', () => {
    mockedPolicy.mockReturnValue({
      allow: false,
      cause: 'cooldown-active',
      context: { sinceLastReloadMs: 5000, cooldownMs: 30000 },
    })

    const error = createChunkError('Loading chunk abc failed')
    const { container, root } = renderWithError(error)

    const buttonTexts = getButtonTexts(container)
    expect(buttonTexts).toContain('Try again')
    expect(buttonTexts).toContain('Reload page')
    expect(reloadSpy).not.toHaveBeenCalled()

    cleanup(container, root)
  })

  // -----------------------------------------------------------------------
  // Policy denial: idle-route-protection (Req 3.1)
  // -----------------------------------------------------------------------

  it('renders manual UI when policy denies with idle-route-protection', () => {
    mockedPolicy.mockReturnValue({
      allow: false,
      cause: 'idle-route-protection',
      context: { idleMs: 60000, cooldownMs: 30000, route: '/dashboard' },
    })

    const error = createChunkError('Failed to fetch dynamically imported module /assets/Dash.js')
    const { container, root } = renderWithError(error)

    const buttonTexts = getButtonTexts(container)
    expect(buttonTexts).toContain('Try again')
    expect(buttonTexts).toContain('Reload page')
    expect(reloadSpy).not.toHaveBeenCalled()

    cleanup(container, root)
  })

  // -----------------------------------------------------------------------
  // Non-chunk errors (Req 3.3)
  // -----------------------------------------------------------------------

  it('renders standard error fallback for non-chunk errors without auto-reload or "Reload page" button', () => {
    const error = new Error('Cannot read properties of undefined')

    const { container, root } = renderWithError(error)

    const buttonTexts = getButtonTexts(container)
    expect(buttonTexts).toContain('Try again')
    expect(buttonTexts).not.toContain('Reload page')
    expect(reloadSpy).not.toHaveBeenCalled()
    // Policy should NOT be called for non-chunk errors
    expect(mockedPolicy).not.toHaveBeenCalled()

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()

    cleanup(container, root)
  })

  // -----------------------------------------------------------------------
  // Custom fallbackMessage prop (Req 3.1, 3.3)
  // -----------------------------------------------------------------------

  it('uses custom fallbackMessage for chunk errors when policy denies', () => {
    mockedPolicy.mockReturnValue({
      allow: false,
      cause: 'session-limit',
      context: { reloadCount: 3, maxPerSession: 3 },
    })

    const error = createChunkError('Loading chunk abc failed')
    const { container, root } = renderWithError(error, {
      fallbackMessage: 'Custom chunk error message',
    })

    expect(container.textContent).toContain('Custom chunk error message')
    expect(container.textContent).not.toContain('newer version of the app')

    cleanup(container, root)
  })

  it('uses custom fallbackMessage for non-chunk errors', () => {
    const error = new Error('Runtime crash')

    const { container, root } = renderWithError(error, {
      fallbackMessage: 'Custom non-chunk error message',
    })

    expect(container.textContent).toContain('Custom non-chunk error message')
    expect(container.textContent).not.toContain('Something went wrong')

    cleanup(container, root)
  })
})
