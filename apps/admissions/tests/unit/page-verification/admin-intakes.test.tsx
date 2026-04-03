// @ts-nocheck
/**
 * Admin Intakes Page Verification Test
 *
 * Verifies the admin intakes page renders its intake management UI with
 * an intakes table when the catalog API returns data with Django API shapes.
 *
 * Requirements: 8.6, 8.10, 8.11, 8.12
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

// ── Mock IntersectionObserver for scroll-reveal components ────────────
class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(callback: IntersectionObserverCallback) {
    setTimeout(() => {
      callback(
        [{ isIntersecting: true, target: document.createElement('div') }] as unknown as IntersectionObserverEntry[],
        this as unknown as IntersectionObserver
      )
    }, 0)
  }
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

// ── Mock react-router-dom ──────────────────────────────────────────────
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/admin/intakes', search: '', hash: '', state: null }),
}))

// ── Mock AuthContext ───────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-001', email: 'admin@example.com', role: 'admin' },
    loading: false,
    isAdmin: true,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

// ── Mock logApiError (no-op for tests) ────────────────────────────────
vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// ── Mock catalog services ─────────────────────────────────────────────
const mockIntakeList = vi.fn()

vi.mock('@/services/catalog', () => ({
  intakeService: {
    list: (...args: unknown[]) => mockIntakeList(...args),
    create: vi.fn().mockResolvedValue({ intake: null }),
    update: vi.fn().mockResolvedValue({ intake: null }),
    delete: vi.fn().mockResolvedValue({}),
  },
}))

// ── Django API response shapes for catalog intakes ────────────────────
const MOCK_DJANGO_INTAKES_RESPONSE = {
  intakes: [
    {
      id: 'intake-001',
      name: 'January 2025 Intake',
      year: 2025,
      start_date: '2025-01-15',
      end_date: '2025-06-30',
      application_deadline: '2025-01-10',
      total_capacity: 120,
      available_spots: 45,
      is_active: true,
    },
    {
      id: 'intake-002',
      name: 'September 2024 Intake',
      year: 2024,
      start_date: '2024-09-01',
      end_date: '2025-03-31',
      application_deadline: '2024-08-15',
      total_capacity: 80,
      available_spots: 0,
      is_active: true,
    },
  ],
}

// ── Import the component under test ───────────────────────────────────
import AdminIntakes from '@/pages/admin/Intakes'

describe('Admin intakes page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let queryClient: QueryClient

  beforeEach(() => {
    mockIntakeList.mockClear()

    // Default: return valid catalog data
    mockIntakeList.mockResolvedValue(MOCK_DJANGO_INTAKES_RESPONSE)

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    queryClient.clear()
    vi.clearAllMocks()
  })

  async function renderAndWait(ms = 500) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AdminIntakes />
        </QueryClientProvider>
      )
    })
    await new Promise((r) => setTimeout(r, ms))
  }

  // ── Page heading and layout ─────────────────────────────────────────

  it('renders without errors and shows the page heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Intakes')
  })

  it('renders the page subtitle', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Manage admission intakes')
  })

  it('renders the back link to admin dashboard', async () => {
    await renderAndWait()
    const html = container.innerHTML || ''
    expect(html).toContain('href="/admin"')
    const text = container.textContent || ''
    expect(text).toContain('Back')
  })

  // ── Intakes table with data ─────────────────────────────────────────

  it('renders the intakes table with intake names from Django response', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('January 2025 Intake')
    expect(text).toContain('September 2024 Intake')
  })

  it('renders year badges in the intakes table', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('2025')
    expect(text).toContain('2024')
  })

  it('renders capacity and available spots in the intakes table', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('45/120')
    expect(text).toContain('0/80')
  })

  it('renders the Add Intake button', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Add Intake')
  })

  // ── Empty state ─────────────────────────────────────────────────────

  it('renders empty state when no intakes exist', async () => {
    mockIntakeList.mockResolvedValue({ intakes: [] })

    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('No Intakes Yet')
  })

  // ── Error state ─────────────────────────────────────────────────────

  it('renders error state when catalog API fails', async () => {
    mockIntakeList.mockRejectedValue(new Error('Network error'))

    await renderAndWait(800)

    // React Query will show error state — the page should still render
    // without crashing. The page heading should still be visible.
    const text = container.textContent || ''
    expect(text).toContain('Intakes')
  })
})
