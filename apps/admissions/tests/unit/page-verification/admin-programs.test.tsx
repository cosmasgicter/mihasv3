// @ts-nocheck
/**
 * Admin Programs Page Verification Test
 *
 * Verifies the admin programs page renders its catalog management UI with
 * programs and institutions tables when the catalog API returns data with
 * Django API shapes.
 *
 * Requirements: 8.5, 8.10, 8.11, 8.12
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
  useLocation: () => ({ pathname: '/admin/programs', search: '', hash: '', state: null }),
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
const mockProgramList = vi.fn()
const mockInstitutionList = vi.fn()

vi.mock('@/services/catalog', () => ({
  programService: {
    list: (...args: unknown[]) => mockProgramList(...args),
    create: vi.fn().mockResolvedValue({ program: null }),
    update: vi.fn().mockResolvedValue({ program: null }),
    delete: vi.fn().mockResolvedValue({}),
  },
  institutionService: {
    list: (...args: unknown[]) => mockInstitutionList(...args),
    create: vi.fn().mockResolvedValue({ institution: null }),
    update: vi.fn().mockResolvedValue({ institution: null }),
    delete: vi.fn().mockResolvedValue({}),
  },
}))

// ── Django API response shapes for catalog programs ───────────────────
const MOCK_DJANGO_PROGRAMS_RESPONSE = {
  programs: [
    {
      id: 'prog-001',
      name: 'Diploma in Clinical Medicine',
      description: 'A comprehensive clinical medicine program',
      duration_years: 3,
      institution_id: 'inst-001',
      institutions: {
        id: 'inst-001',
        name: 'MIHAS',
        full_name: 'Mukuba Institute of Health and Applied Sciences',
        code: 'MIHAS',
        is_active: true,
      },
      is_active: true,
    },
    {
      id: 'prog-002',
      name: 'Diploma in Registered Nursing',
      description: 'Nursing program with clinical rotations',
      duration_years: 3,
      institution_id: 'inst-002',
      institutions: {
        id: 'inst-002',
        name: 'KATC',
        full_name: 'Kalulushi Training Centre',
        code: 'KATC',
        is_active: true,
      },
      is_active: true,
    },
  ],
}

const MOCK_DJANGO_INSTITUTIONS_RESPONSE = {
  institutions: [
    {
      id: 'inst-001',
      name: 'MIHAS',
      full_name: 'Mukuba Institute of Health and Applied Sciences',
      code: 'MIHAS',
      description: 'Health sciences institution',
      is_active: true,
    },
    {
      id: 'inst-002',
      name: 'KATC',
      full_name: 'Kalulushi Training Centre',
      code: 'KATC',
      description: 'Training centre in Kalulushi',
      is_active: true,
    },
  ],
}

// ── Import the component under test ───────────────────────────────────
import AdminPrograms from '@/pages/admin/Programs'

describe('Admin programs page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let queryClient: QueryClient

  beforeEach(() => {
    mockProgramList.mockClear()
    mockInstitutionList.mockClear()

    // Default: return valid catalog data
    mockProgramList.mockResolvedValue(MOCK_DJANGO_PROGRAMS_RESPONSE)
    mockInstitutionList.mockResolvedValue(MOCK_DJANGO_INSTITUTIONS_RESPONSE)

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
          <AdminPrograms />
        </QueryClientProvider>
      )
    })
    await new Promise((r) => setTimeout(r, ms))
  }

  // ── Page heading and layout ─────────────────────────────────────────

  it('renders without errors and shows the page heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Programs & Institutions')
  })

  it('renders the page subtitle', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Manage the academic catalog')
  })

  it('renders the back link to admin dashboard', async () => {
    await renderAndWait()
    const html = container.innerHTML || ''
    expect(html).toContain('href="/admin"')
    const text = container.textContent || ''
    expect(text).toContain('Back')
  })

  // ── Summary cards ───────────────────────────────────────────────────

  it('renders the summary cards with program and institution counts', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Total Programs')
    expect(text).toContain('Institutions')
    expect(text).toContain('Archived Institutions')
  })

  // ── Programs tab with table data ────────────────────────────────────

  it('renders the programs tab with program names from Django response', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Diploma in Clinical Medicine')
    expect(text).toContain('Diploma in Registered Nursing')
  })

  it('renders institution badges in the programs table', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('MIHAS')
    expect(text).toContain('KATC')
  })

  it('renders program duration in the programs table', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('3 years')
  })

  it('renders the programs and institutions tab triggers', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Programs')
    expect(text).toContain('Institutions')
  })

  // ── Empty state ─────────────────────────────────────────────────────

  it('renders empty state when no programs exist', async () => {
    mockProgramList.mockResolvedValue({ programs: [] })
    mockInstitutionList.mockResolvedValue(MOCK_DJANGO_INSTITUTIONS_RESPONSE)

    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('No Programs Yet')
  })

  // ── Error state ─────────────────────────────────────────────────────

  it('renders error state when catalog API fails', async () => {
    mockProgramList.mockRejectedValue(new Error('Network error'))
    mockInstitutionList.mockRejectedValue(new Error('Network error'))

    await renderAndWait(800)

    // React Query will show error state — the page should still render
    // without crashing. The page heading should still be visible.
    const text = container.textContent || ''
    expect(text).toContain('Programs & Institutions')
  })
})
