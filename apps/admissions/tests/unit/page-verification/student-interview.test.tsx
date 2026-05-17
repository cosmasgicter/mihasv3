// @ts-nocheck
/**
 * Student Interview Page Verification Test
 *
 * Verifies the student interview page renders its scheduling UI with
 * upcoming and past interviews when the interviews API returns data with
 * Django API shapes.
 *
 * Requirements: 8.9, 8.10, 8.11, 8.12
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
  useLocation: () => ({ pathname: '/student/interviews', search: '', hash: '', state: null }),
}))

// ── Mock AuthContext ───────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'student-001', email: 'student@example.com', role: 'student' },
    loading: false,
    isAdmin: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

// ── Mock logApiError (no-op for tests) ────────────────────────────────
vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// ── Mock interviews service ───────────────────────────────────────────
const mockInterviewsList = vi.fn()

vi.mock('@/services/interviews', () => ({
  interviewsService: {
    list: (...args: unknown[]) => mockInterviewsList(...args),
    schedule: vi.fn().mockResolvedValue({ interview: null }),
  },
}))

// ── Django API response shapes for interviews ─────────────────────────
const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const pastDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

const MOCK_DJANGO_INTERVIEWS_RESPONSE = {
  interviews: [
    {
      id: 'interview-001',
      application_id: 'app-001',
      scheduled_at: futureDate,
      mode: 'in_person',
      location: 'MIHAS Campus, Room 201',
      status: 'scheduled',
      notes: null,
      program: 'Diploma in Clinical Medicine',
      application_number: 'APP-2025-001',
    },
    {
      id: 'interview-002',
      application_id: 'app-002',
      scheduled_at: pastDate,
      mode: 'virtual',
      location: null,
      status: 'completed',
      notes: 'Meeting link: https://meet.google.com/abc-defg-hij',
      program: 'Diploma in Registered Nursing',
      application_number: 'APP-2025-002',
    },
  ],
}

// ── Import the component under test ───────────────────────────────────
import InterviewPage from '@/pages/student/Interview'

describe('Student interview page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let queryClient: QueryClient

  beforeEach(() => {
    mockInterviewsList.mockClear()

    // Default: return valid interview data
    mockInterviewsList.mockResolvedValue(MOCK_DJANGO_INTERVIEWS_RESPONSE)

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
          <InterviewPage />
        </QueryClientProvider>
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms))
    })
  }

  // ── Page heading and layout ─────────────────────────────────────────

  it('renders without errors and shows the page heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Interview Schedule')
  })

  it('renders the page subtitle', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('View your scheduled interviews')
  })

  it('renders the back link to student dashboard', async () => {
    await renderAndWait()
    const html = container.innerHTML || ''
    expect(html).toContain('href="/student/dashboard"')
    const text = container.textContent || ''
    expect(text).toContain('Back to Dashboard')
  })

  // ── Upcoming interviews section ─────────────────────────────────────

  it('renders the upcoming interviews section with interview data', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Upcoming Interviews')
    expect(text).toContain('Diploma in Clinical Medicine')
  })

  it('renders interview mode for upcoming in-person interview', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('In Person')
  })

  it('renders interview location for in-person interview', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('MIHAS Campus, Room 201')
  })

  it('renders interview status badge', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Scheduled')
  })

  // ── Past interviews section ─────────────────────────────────────────

  it('renders the past interviews section with completed interview', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Past Interviews')
    expect(text).toContain('Diploma in Registered Nursing')
  })

  it('renders completed status for past interview', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Completed')
  })

  // ── Help card ───────────────────────────────────────────────────────

  it('renders the help card with contact information', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Need to reschedule your interview?')
    expect(text).toContain('***REMOVED***')
  })

  // ── Empty state ─────────────────────────────────────────────────────

  it('renders empty state when no interviews exist', async () => {
    mockInterviewsList.mockResolvedValue({ interviews: [] })

    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('No Scheduled Interviews')
  })

  // ── Error state ─────────────────────────────────────────────────────

  it('renders error state when interviews API fails', async () => {
    mockInterviewsList.mockRejectedValue(Object.assign(new Error('Network error'), { status: 429 }))

    await renderAndWait(800)

    // The page should still render without crashing and show an error message
    const text = container.textContent || ''
    expect(text).toContain('Unable to load interview information')
    expect(text).toContain('Network error')
  })
})
