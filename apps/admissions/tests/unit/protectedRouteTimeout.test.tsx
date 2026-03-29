// @ts-nocheck
/**
 * Unit tests for ProtectedRoute 5-second loading timeout safety net.
 *
 * Verifies that when isLoading persists beyond 5 seconds after login,
 * the component forces invalidateQueries(['auth', 'session']) and
 * shows a "Taking longer than expected..." message with a retry button.
 *
 * Requirements: 34.3, 14.7
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

// Suppress "not configured to support act(...)" warnings in jsdom
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// --- Mocks ---

const mockInvalidateQueries = vi.fn()
const mockUseAuthCheck = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

vi.mock('@/hooks/auth/useSessionListener', () => ({
  useAuthCheck: () => mockUseAuthCheck(),
}))

vi.mock('react-router-dom', () => ({
  Navigate: (props: { to: string; state?: unknown; replace?: boolean }) =>
    React.createElement('mock-navigate', props),
  useLocation: () => ({ pathname: '/student/dashboard' }),
}))

import { ProtectedRoute } from '@/components/ProtectedRoute'

function makeAuthCheckState(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: false,
    isLoading: false,
    user: null,
    retrySessionCheck: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

// Helper to render into a container and return cleanup + container
function renderInto(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(element)
  })

  return {
    container,
    rerender(el: React.ReactElement) {
      act(() => {
        root.render(el)
      })
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('ProtectedRoute loading timeout safety net', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockUseAuthCheck.mockReset()
    mockInvalidateQueries.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('does not show timeout message before 5 seconds', () => {
    mockUseAuthCheck.mockReturnValue(makeAuthCheckState({ isLoading: true }))

    const { container, unmount } = renderInto(
      <ProtectedRoute>
        <div>Dashboard</div>
      </ProtectedRoute>
    )

    act(() => {
      vi.advanceTimersByTime(4999)
    })

    expect(mockInvalidateQueries).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('Taking longer than expected')

    unmount()
  })

  it('triggers invalidateQueries after 5 seconds of persistent loading', () => {
    mockUseAuthCheck.mockReturnValue(makeAuthCheckState({ isLoading: true }))

    const { unmount } = renderInto(
      <ProtectedRoute>
        <div>Dashboard</div>
      </ProtectedRoute>
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['auth', 'session'],
    })

    unmount()
  })

  it('shows "Taking longer than expected..." message after timeout', () => {
    mockUseAuthCheck.mockReturnValue(makeAuthCheckState({ isLoading: true }))

    const { container, unmount } = renderInto(
      <ProtectedRoute>
        <div>Dashboard</div>
      </ProtectedRoute>
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(container.textContent).toContain('Taking longer than expected')

    unmount()
  })

  it('renders a reload button after timeout', () => {
    mockUseAuthCheck.mockReturnValue(makeAuthCheckState({ isLoading: true }))

    const { container, unmount } = renderInto(
      <ProtectedRoute>
        <div>Dashboard</div>
      </ProtectedRoute>
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    const button = container.querySelector('button')
    expect(button).not.toBeNull()
    expect(button?.textContent).toContain('Retry session')

    unmount()
  })

  it('clears timeout on unmount (no memory leak)', () => {
    mockUseAuthCheck.mockReturnValue(makeAuthCheckState({ isLoading: true }))

    const { unmount } = renderInto(
      <ProtectedRoute>
        <div>Dashboard</div>
      </ProtectedRoute>
    )

    // Unmount before timeout fires
    unmount()

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    // invalidateQueries should NOT have been called since we unmounted
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })

  it('clears timeout message when loading resolves', () => {
    mockUseAuthCheck.mockReturnValue(makeAuthCheckState({ isLoading: true }))

    const { container, rerender, unmount } = renderInto(
      <ProtectedRoute>
        <div>Dashboard</div>
      </ProtectedRoute>
    )

    // Trigger timeout
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(container.textContent).toContain('Taking longer than expected')

    // Now loading resolves — user is authenticated
    mockUseAuthCheck.mockReturnValue(
      makeAuthCheckState({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1', email: 'test@example.com' },
      })
    )

    rerender(
      <ProtectedRoute>
        <div>Dashboard</div>
      </ProtectedRoute>
    )

    // Timeout message should be gone, children should render
    expect(container.textContent).not.toContain('Taking longer than expected')
    expect(container.textContent).toContain('Dashboard')

    unmount()
  })

  it('renders children when authenticated and not loading', () => {
    mockUseAuthCheck.mockReturnValue(
      makeAuthCheckState({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1', email: 'test@example.com' },
      })
    )

    const { container, unmount } = renderInto(
      <ProtectedRoute>
        <div>Dashboard Content</div>
      </ProtectedRoute>
    )

    expect(container.textContent).toContain('Dashboard Content')
    expect(mockInvalidateQueries).not.toHaveBeenCalled()

    unmount()
  })

  it('redirects to signin after session recovery window when not authenticated and not loading', async () => {
    const retrySessionCheck = vi.fn().mockResolvedValue(undefined)
    mockUseAuthCheck.mockReturnValue(
      makeAuthCheckState({
        retrySessionCheck,
      })
    )

    const { container, unmount } = renderInto(
      <ProtectedRoute>
        <div>Dashboard</div>
      </ProtectedRoute>
    )

    expect(container.querySelector('mock-navigate')).toBeNull()
    expect(retrySessionCheck).toHaveBeenCalledTimes(1)

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      vi.advanceTimersByTime(1199)
    })
    expect(container.querySelector('mock-navigate')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    const navigate = container.querySelector('mock-navigate')
    expect(navigate).not.toBeNull()
    expect(navigate?.getAttribute('to')).toBe('/auth/signin')

    unmount()
  })
})
