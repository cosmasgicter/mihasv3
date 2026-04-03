// @ts-nocheck
/**
 * Not Found Page Verification Test
 *
 * Verifies the 404 page renders its error content and navigation links without errors.
 * The NotFoundPage uses useAuth for role-aware suggestions and useLocation for the
 * attempted path display. No API calls — purely static/computed content.
 *
 * Requirements: 8.3, 8.10, 8.11, 8.12
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// ── Polyfill window.matchMedia for jsdom ──────────────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// ── Polyfill scrollIntoView for jsdom ─────────────────────────────────
Element.prototype.scrollIntoView = vi.fn()

// ── Mock react-router-dom ──────────────────────────────────────────────
const mockLocation = {
  pathname: '/some/nonexistent/page',
  search: '',
  hash: '',
  state: null,
}

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useLocation: () => mockLocation,
}))

// ── Mock AuthContext (unauthenticated by default) ─────────────────────
const mockUseAuth = vi.fn()

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

// ── Mock heavy child components ───────────────────────────────────────
vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="public-layout">{children}</div>
  ),
}))

// ── Mock logApiError (no-op for tests) ────────────────────────────────
vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// ── Import the component under test ───────────────────────────────────
import NotFoundPage from '@/pages/NotFoundPage'

describe('Not found page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    mockLocation.pathname = '/some/nonexistent/page'
    mockLocation.search = ''
    mockLocation.hash = ''
    mockLocation.state = null

    // Default: unauthenticated visitor
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      isAdmin: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    vi.clearAllMocks()
  })

  async function renderAndWait(ms = 300) {
    root.render(<NotFoundPage />)
    await new Promise((r) => setTimeout(r, ms))
  }

  // ── 404 content ─────────────────────────────────────────────────────

  it('renders without errors and shows the 404 indicator', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('404')
    expect(text).toContain('Page Not Found')
  })

  it('displays the attempted path', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('/some/nonexistent/page')
  })

  it('shows the descriptive message', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain("doesn't exist or has been moved")
  })

  // ── Navigation link back to home ────────────────────────────────────

  it('renders a navigation link back to home', async () => {
    await renderAndWait()
    const html = container.innerHTML || ''
    expect(html).toContain('href="/"')
    const text = container.textContent || ''
    expect(text).toContain('Go to Home')
  })

  it('renders a go-back button', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Go Back')
  })

  // ── Suggested pages for unauthenticated users ───────────────────────

  it('shows suggested pages including Home and Track Application for unauthenticated users', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('You might be looking for')
    expect(text).toContain('Home')
    expect(text).toContain('Track Application')
  })

  // ── Suggested pages for authenticated student ───────────────────────

  it('shows student dashboard suggestion for authenticated students', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-001', email: 'student@example.com', role: 'student' },
      loading: false,
      isAdmin: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    })

    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('My Dashboard')
  })

  // ── Suggested pages for authenticated admin ─────────────────────────

  it('shows admin dashboard suggestion for authenticated admins', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-002', email: 'admin@example.com', role: 'admin' },
      loading: false,
      isAdmin: true,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    })

    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Admin Dashboard')
  })

  // ── Help text ───────────────────────────────────────────────────────

  it('renders the help/support text', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('contact support')
  })
})
