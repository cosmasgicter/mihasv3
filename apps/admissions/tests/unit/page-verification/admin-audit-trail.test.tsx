// @ts-nocheck
/**
 * Admin Audit Trail Page Verification Test
 *
 * Verifies the admin audit trail page renders its audit log table with
 * entries when the audit API returns data with Django API shapes.
 *
 * Requirements: 8.8, 8.10, 8.11, 8.12
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
  useLocation: () => ({ pathname: '/admin/audit', search: '', hash: '', state: null }),
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

// ── Mock audit exports (no-op for tests) ──────────────────────────────
vi.mock('@/lib/auditExports', () => ({
  exportAuditEntriesToCsv: vi.fn(),
  exportAuditEntriesToJson: vi.fn(),
  exportAuditEntriesToPdf: vi.fn(),
}))

// ── Mock admin audit service ──────────────────────────────────────────
const mockAuditList = vi.fn()

vi.mock('@/services/admin/audit', () => ({
  adminAuditService: {
    list: (...args: unknown[]) => mockAuditList(...args),
  },
  getAuditCategory: (action: string) => 'General',
  getAuditCategoryLabel: (category: string) => category,
}))

// ── Django API response shapes for audit logs ─────────────────────────
const MOCK_DJANGO_AUDIT_RESPONSE = {
  entries: [
    {
      id: 'audit-001',
      actorId: 'user-001',
      actorEmail: 'admin@mihas.edu.zm',
      actorName: 'Admin User',
      actorRoles: ['admin'],
      action: 'Updated application status',
      category: 'Data',
      entityType: 'applications',
      entityId: 'app-001',
      changes: { status: { from: 'pending', to: 'approved' } },
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      createdAt: '2024-12-01T10:30:00Z',
      targetTable: 'applications',
      targetId: 'app-001',
      requestIp: '192.168.1.1',
      metadata: { status: { from: 'pending', to: 'approved' } },
    },
    {
      id: 'audit-002',
      actorId: 'user-002',
      actorEmail: 'staff@mihas.edu.zm',
      actorName: 'Staff Member',
      actorRoles: ['reviewer'],
      action: 'Viewed student profile',
      category: 'Access',
      entityType: 'profiles',
      entityId: 'profile-001',
      changes: null,
      ipAddress: '10.0.0.5',
      userAgent: 'Mozilla/5.0',
      createdAt: '2024-12-01T09:15:00Z',
      targetTable: 'profiles',
      targetId: 'profile-001',
      requestIp: '10.0.0.5',
      metadata: null,
    },
  ],
  page: 1,
  pageSize: 20,
  totalPages: 1,
  totalCount: 2,
  summary: {
    uniqueActors: 2,
    categoryBreakdown: { Data: 1, Access: 1 },
    entityBreakdown: [
      { label: 'applications', count: 1 },
      { label: 'profiles', count: 1 },
    ],
    actionBreakdown: [
      { label: 'Updated application status', count: 1 },
      { label: 'Viewed student profile', count: 1 },
    ],
  },
}

// ── Import the component under test ───────────────────────────────────
import AuditTrailPage from '@/pages/admin/AuditTrail'

describe('Admin audit trail page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let queryClient: QueryClient

  beforeEach(() => {
    mockAuditList.mockClear()

    // Default: return valid audit data
    mockAuditList.mockResolvedValue(MOCK_DJANGO_AUDIT_RESPONSE)

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
          <AuditTrailPage />
        </QueryClientProvider>
      )
    })
    await new Promise((r) => setTimeout(r, ms))
  }

  // ── Page heading and layout ─────────────────────────────────────────

  it('renders without errors and shows the page heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Audit Trail')
  })

  it('renders the page subtitle', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Review real operational history')
  })

  it('renders the back link to admin dashboard', async () => {
    await renderAndWait()
    const html = container.innerHTML || ''
    expect(html).toContain('href="/admin"')
    const text = container.textContent || ''
    expect(text).toContain('Back')
  })

  // ── Summary cards ───────────────────────────────────────────────────

  it('renders the summary cards with event counts', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Total events')
    expect(text).toContain('Unique actors')
  })

  // ── Audit log entries ───────────────────────────────────────────────

  it('renders audit log entries with action text from the response', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Updated application status')
    expect(text).toContain('Viewed student profile')
  })

  it('renders actor information in audit entries', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Admin User')
    expect(text).toContain('Staff Member')
  })

  it('renders category badges on audit entries', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Data')
    expect(text).toContain('Access')
  })

  it('renders the category breakdown section', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Category breakdown')
  })

  // ── Filter controls ─────────────────────────────────────────────────

  it('renders the filter controls', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Filter activity')
    expect(text).toContain('Apply filters')
  })

  // ── Empty state ─────────────────────────────────────────────────────

  it('renders empty state when no audit entries exist', async () => {
    mockAuditList.mockResolvedValue({
      entries: [],
      page: 1,
      pageSize: 20,
      totalPages: 1,
      totalCount: 0,
      summary: {
        uniqueActors: 0,
        categoryBreakdown: {},
        entityBreakdown: [],
        actionBreakdown: [],
      },
    })

    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('No audit activity found')
  })

  // ── Error state ─────────────────────────────────────────────────────

  it('renders error state when audit API fails', async () => {
    mockAuditList.mockRejectedValue(new Error('Network error'))

    await renderAndWait(800)

    // React Query will show error state — the page should still render
    // without crashing. The page heading should still be visible.
    const text = container.textContent || ''
    expect(text).toContain('Audit Trail')
    expect(text).toContain('Audit activity could not be loaded')
  })
})
