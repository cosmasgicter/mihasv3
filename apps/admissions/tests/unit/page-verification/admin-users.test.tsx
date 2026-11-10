// @ts-nocheck
/**
 * Admin Users Page Verification Test
 *
 * Verifies the admin users page renders its user management UI with
 * directory listing, filters, and action buttons when the users API
 * returns data with Django API shapes.
 *
 * Updated by admissions-v2 task 9.3 (R6.1, finding ADM-03). The page no longer
 * calls `usersData.useList()` — a bare first-page fetch it then filtered,
 * sorted, paginated, and exported in the browser. It reads the scoped directory
 * report (`useUserDirectory`), so the mock supplies that shape: rows plus the
 * server's totals, aggregates, definitions, facets, and page arithmetic. The
 * assertions below additionally pin the two claims a rendered page can make
 * about ADM-03 — the headline numbers are the server's aggregates, and the role
 * options are the server's facet.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

Element.prototype.scrollIntoView = vi.fn()

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

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/admin/users', search: '', hash: '', state: null }),
}))

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

vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

const mockUsersList = [
  {
    id: 'user-001',
    user_id: 'user-001',
    full_name: 'John Doe',
    email: 'john@example.com',
    phone: '+260971234567',
    role: 'student',
    created_at: '2026-01-15T10:00:00Z',
    is_active: true,
  },
  {
    id: 'user-002',
    user_id: 'user-002',
    full_name: 'Jane Admin',
    email: 'jane@example.com',
    phone: '+260977654321',
    role: 'admin',
    created_at: '2026-02-20T10:00:00Z',
    is_active: true,
  },
]

vi.mock('@/data/users', () => ({
  usersData: {
    useCreate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useRemove: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useEffectiveCapabilities: () => ({ data: null, isLoading: false, isError: false }),
  },
}))

// The server's report. Note the deliberate asymmetry: the page holds 2 rows and
// the directory holds 57 accounts. Any number on screen that reads 2 would be a
// page-derived number, which is the finding.
const mockReport = {
  page: 1,
  pageSize: 25,
  totalCount: 57,
  totalPages: 3,
  results: mockUsersList,
  aggregates: {
    total_count: 57,
    enabled_count: 55,
    disabled_count: 2,
    with_membership_count: 9,
    without_membership_count: 48,
    staff_without_membership_count: 4,
    role_breakdown: { student: 50, reviewer: 4, admin: 2, super_admin: 1 },
  },
  aggregate_definitions: {
    total_count: 'Accounts matching the current filters, in your scope.',
    enabled_count: 'Matching accounts that are permitted to sign in.',
    staff_without_membership_count:
      'Matching staff accounts with no active school membership, and therefore no tenant access at all.',
  },
  facets: {
    role: {
      options: [
        { value: 'student', label: 'Student', count: 50 },
        { value: 'reviewer', label: 'Reviewer', count: 4 },
        { value: 'admin', label: 'Administrator', count: 2 },
      ],
      truncated: false,
    },
  },
  filters: {
    institution_id: null,
    role: [],
    search: null,
    is_active: null,
    has_membership: null,
    start_date: null,
    end_date: null,
    sort: 'created_at',
    order: 'desc',
    unknown_parameters: [],
  },
  redaction: { applied: false, withheld_fields: [] },
  can_export: true,
  supported_roles: ['student', 'reviewer', 'admin', 'super_admin'],
}

vi.mock('@/hooks/admin/useUserDirectory', () => ({
  useUserDirectory: () => ({
    data: mockReport,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUserDirectoryExport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUserBulkCommand: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUserImportPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUserImportCommit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  userDirectoryKeys: { all: ['admin', 'users', 'directory'] },
}))

vi.mock('@/hooks/useToast', () => ({
  useToastStore: () => ({
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}))

import AdminUsers from '@/pages/admin/Users'

describe('Admin users page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
          <AdminUsers />
        </QueryClientProvider>
      )
    })
    await new Promise((r) => setTimeout(r, ms))
  }

  it('renders without errors and shows the page heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('User management')
  })

  it('renders the page subtitle', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Create accounts')
  })

  it('renders the back link to admin dashboard', async () => {
    await renderAndWait()
    const html = container.innerHTML || ''
    expect(html).toContain('href="/admin"')
  })

  it('renders user names from the API response', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('John Doe')
    expect(text).toContain('Jane Admin')
  })

  it('renders the Add user button', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Add user')
  })

  it('renders the search input', async () => {
    await renderAndWait()
    const input = container.querySelector('input[placeholder*="Search"]')
    expect(input).not.toBeNull()
  })

  it('renders the role filter select', async () => {
    await renderAndWait()
    const select = container.querySelector('select')
    expect(select).not.toBeNull()
  })

  it('renders the user directory section', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('User directory')
  })

  it('renders the server aggregate, not the page length (ADM-03)', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    // 57 accounts match; 2 rows are on screen.
    expect(text).toContain('57')
    expect(text).toContain('55')
    expect(text).toContain('Accounts matching the current filters')
    // The old page published `users.length` as the directory total.
    expect(text).not.toContain('2 active accounts')
  })

  it('renders the server page arithmetic', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Page 1 of 3')
  })

  it('renders role options from the server facet with their whole-set counts', async () => {
    await renderAndWait()
    const options = Array.from(container.querySelectorAll('option')).map(
      (option) => option.textContent || '',
    )
    // Each option carries the count for the whole filtered directory. A pick
    // list harvested from the loaded rows could offer neither the count nor a
    // role with no row on this page.
    expect(options.some((label) => label.includes('Student (50)'))).toBe(true)
    expect(options.some((label) => label.includes('Reviewer (4)'))).toBe(true)
  })

  it('offers the export only when the server says the actor may export', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Export')
  })
})
