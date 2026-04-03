// @ts-nocheck
/**
 * Admin Settings Page Verification Test
 *
 * Verifies the admin settings page renders its configuration sections
 * (guided controls and advanced keys) when the settings API returns data
 * with Django API shapes.
 *
 * Note: This test avoids React `act()` because the Settings component's
 * cascading state updates (useQuery → useEffect → setGuidedDrafts → useMemo)
 * create an infinite microtask loop inside act(). The other page tests don't
 * hit this because their components have simpler state graphs.
 *
 * Requirements: 8.7, 8.10, 8.11, 8.12
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
  useLocation: () => ({ pathname: '/admin/settings', search: '', hash: '', state: null }),
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

// ── Mock CanonicalSelect (Radix Select portals hang in jsdom) ─────────
vi.mock('@/components/ui/CanonicalSelect', () => ({
  CanonicalSelect: ({ label, value, options, onChange, onValueChange }: any) => (
    <div data-testid="canonical-select">
      {label && <label>{label}</label>}
      <select
        value={value}
        onChange={(e: any) => (onValueChange ?? onChange)?.(e.target.value)}
      >
        {options?.map((opt: any) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}))

// ── Mock ConfirmAlertDialog (Radix AlertDialog portals hang in jsdom) ─
vi.mock('@/components/ui/alert-dialog', () => ({
  ConfirmAlertDialog: () => null,
}))

// ── Mock admin settings API ───────────────────────────────────────────
const mockFetchSettings = vi.fn()

vi.mock('@/lib/api/adminApi', () => ({
  fetchSettings: (...args: unknown[]) => mockFetchSettings(...args),
  createSetting: vi.fn().mockResolvedValue(true),
  updateSetting: vi.fn().mockResolvedValue(true),
  deleteSetting: vi.fn().mockResolvedValue(true),
  importSettings: vi.fn().mockResolvedValue({ success: true }),
  resetSettings: vi.fn().mockResolvedValue({ success: true }),
}))

// ── Django API response shapes for admin settings ─────────────────────
const MOCK_DJANGO_SETTINGS = [
  {
    id: 'set-001',
    key: 'site_name',
    value: 'MIHAS Application System',
    description: 'Primary platform title shown across public and authenticated screens.',
    category: 'general',
    is_public: true,
    updated_by: 'admin-001',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-15T00:00:00Z',
  },
  {
    id: 'set-002',
    key: 'enable_online_applications',
    value: 'true',
    description: 'Controls whether students can start or continue applications online.',
    category: 'general',
    is_public: true,
    updated_by: 'admin-001',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-15T00:00:00Z',
  },
  {
    id: 'set-003',
    key: 'contact_email',
    value: '***REMOVED***',
    description: 'Primary email used for admissions contact.',
    category: 'contact',
    is_public: true,
    updated_by: 'admin-001',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-15T00:00:00Z',
  },
  {
    id: 'set-004',
    key: 'contact_phone',
    value: '+260-000-000-000',
    description: 'Primary phone number shown to applicants.',
    category: 'contact',
    is_public: true,
    updated_by: 'admin-001',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-15T00:00:00Z',
  },
  {
    id: 'set-005',
    key: 'application_fee',
    value: '153.00',
    description: 'Default admissions application fee.',
    category: 'finance',
    is_public: true,
    updated_by: 'admin-001',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-15T00:00:00Z',
  },
  {
    id: 'set-006',
    key: 'max_applications_per_user',
    value: '3',
    description: 'Maximum number of applications a student can submit.',
    category: 'limits',
    is_public: false,
    updated_by: 'admin-001',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-15T00:00:00Z',
  },
]

// ── Import the component under test ───────────────────────────────────
import AdminSettings from '@/pages/admin/Settings'

describe('Admin settings page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let queryClient: QueryClient

  beforeEach(() => {
    mockFetchSettings.mockClear()

    // Default: return valid settings data
    mockFetchSettings.mockResolvedValue(MOCK_DJANGO_SETTINGS)

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
    root.render(
      <QueryClientProvider client={queryClient}>
        <AdminSettings />
      </QueryClientProvider>
    )
    await new Promise((r) => setTimeout(r, ms))
  }

  // ── Page heading and layout ─────────────────────────────────────────

  it('renders without errors and shows the page heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Operational Settings')
  })

  it('renders the page subtitle', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Configure the admissions portal')
  })

  it('renders the back link to admin dashboard', async () => {
    await renderAndWait()
    const html = container.innerHTML || ''
    expect(html).toContain('href="/admin"')
    const text = container.textContent || ''
    expect(text).toContain('Back')
  })

  // ── Summary cards ───────────────────────────────────────────────────

  it('renders the summary cards with setting counts', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Guided Controls')
    expect(text).toContain('Public Settings')
    expect(text).toContain('Private Settings')
    expect(text).toContain('Advanced Keys')
  })

  // ── Guided configuration sections ───────────────────────────────────

  it('renders the guided configuration heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Guided Configuration')
  })

  it('renders the Portal Experience guided section', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Portal Experience')
    expect(text).toContain('Portal name')
    expect(text).toContain('Online applications')
  })

  it('renders the Admissions Contact guided section', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Admissions Contact')
    expect(text).toContain('Admissions email')
    expect(text).toContain('Admissions phone')
  })

  it('renders the Admissions Operations guided section', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Admissions Operations')
    expect(text).toContain('Application fee')
    expect(text).toContain('Application limit per student')
  })

  // ── Advanced Keys section ───────────────────────────────────────────

  it('renders the Advanced Keys section heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Advanced Keys')
  })

  // ── Empty state ─────────────────────────────────────────────────────

  it('renders guided sections with "Missing" badges when no settings exist', async () => {
    mockFetchSettings.mockResolvedValue([])

    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Missing')
  })

  // ── Error state ─────────────────────────────────────────────────────

  it('renders the page heading even when settings API fails', async () => {
    mockFetchSettings.mockRejectedValue(new Error('Network error'))

    await renderAndWait(800)

    // React Query will show error state — the page should still render
    // without crashing. The page heading should still be visible.
    const text = container.textContent || ''
    expect(text).toContain('Operational Settings')
  })
})
