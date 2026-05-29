// @ts-nocheck
/**
 * Admin Users Page Verification Test
 *
 * Verifies the admin users page renders its user management UI with
 * directory listing, filters, and action buttons when the users API
 * returns data with Django API shapes.
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
    useList: () => ({
      data: { users: mockUsersList, totalCount: 2 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useCreate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useRemove: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdatePermissions: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePermissions: () => ({ data: null, isLoading: false }),
  },
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
    expect(text).toContain('User Management')
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

  it('renders the active user directory section', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Active user directory')
  })
})
