/**
 * The review is a route (platform-simplification tasks 30.2 and 30.3, R17.2, R17.3).
 *
 * `/admin/applications/:applicationId` renders the queue's own page. Beside the
 * queue at 1024px and wider; as a page below that, with a way back that keeps
 * the queue's query string. A non-UUID id is the not-found page.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pathFor, routeByPath } from '@/routes/routeRegistry'
import { useAdminQueueViewStore } from '@/stores/adminQueueViewStore'

const APP_ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'

vi.mock('@/components/admin/applications/ApplicationReviewWorkspace', () => ({
  ApplicationReviewWorkspace: (props: { applicationId: string; layout: string; onClose: () => void }) => (
    <div data-testid="review-workspace" data-layout={props.layout} data-id={props.applicationId}>
      <button type="button" onClick={props.onClose}>
        Close review stub
      </button>
    </div>
  ),
}))

const row = {
  id: APP_ID,
  user_id: 'u1',
  application_number: 'APP-20260101-AAAAAAAA',
  full_name: 'Chipo Banda',
  email: 'chipo@example.com',
  phone: null,
  program: 'Clinical Medicine',
  intake: 'July 2026',
  institution: 'Example College',
  status: 'submitted',
  payment_status: 'verified',
  submitted_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  assigned_reviewer_id: null,
  is_late_submission: false,
}

vi.mock('@/hooks/admin/useApplicationsData', () => ({
  useApplicationsData: () => ({
    applications: [row],
    isInitialLoading: false,
    isRefreshing: false,
    error: null,
    pagination: { currentPage: 1, totalPages: 1, totalCount: 1, loadedCount: 1 },
    aggregates: null,
    facets: {},
    unknownParameters: [],
    canExport: false,
    rowVersions: {},
    goToPage: vi.fn(),
    refreshCurrentPage: vi.fn(),
    exportRoster: vi.fn(),
    updateStatus: vi.fn(),
    updatePaymentStatus: vi.fn(),
  }),
}))

import Applications from '@/pages/admin/Applications'

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>
}

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0)
    return {
      matches: width >= min,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  }) as typeof window.matchMedia
}

function renderAt(url: string) {
  // The page reads `window.location.search` when it writes filters back to the
  // address, so a memory router alone would leave it disagreeing with the router.
  window.history.replaceState({}, '', url)
  return render(
    <MemoryRouter initialEntries={[url]}>
      <LocationProbe />
      <Routes>
        <Route path="/admin/applications" element={<Applications />} />
        <Route path="/admin/applications/:applicationId" element={<Applications />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => useAdminQueueViewStore.getState().reset())
afterEach(() => cleanup())

describe('the review route is registered', () => {
  it('resolves in the registry behind the admin guard, with no navigation entry', () => {
    const route = routeByPath(`/admin/applications/${APP_ID}`)
    expect(route?.id).toBe('admin.applicationReview')
    expect(route?.guard).toBe('admin')
    expect(route?.nav).toBeUndefined()
    expect(pathFor('admin.applicationReview')).toBe('/admin/applications/:applicationId')
  })

  it('leaves the queue route as it was', () => {
    expect(routeByPath('/admin/applications')?.id).toBe('admin.applications')
  })
})

describe('at 1024px and wider the review sits beside the queue', () => {
  it('shows the queue and the pane together', () => {
    setWidth(1440)
    renderAt(`/admin/applications/${APP_ID}`)
    expect(screen.getByTestId('review-workspace').getAttribute('data-layout')).toBe('pane')
    expect(screen.getByTestId('review-workspace').getAttribute('data-id')).toBe(APP_ID)
    // The queue is still on screen.
    expect(screen.getAllByText('Chipo Banda').length).toBeGreaterThan(0)
    expect(document.querySelector('[data-review-layout="split"]')).not.toBeNull()
  })

  it('closing the pane returns to the queue and keeps the query string', () => {
    setWidth(1440)
    renderAt(`/admin/applications/${APP_ID}?status=submitted`)
    fireEvent.click(screen.getByText('Close review stub'))
    expect(screen.getByTestId('location').textContent).toContain('/admin/applications')
    expect(screen.getByTestId('location').textContent).not.toContain(APP_ID)
    expect(screen.getByTestId('location').textContent).toContain('status=submitted')
    expect(screen.queryByTestId('review-workspace')).toBeNull()
  })
})

describe('below 1024px the review is a page (task 30.3)', () => {
  it('renders the workspace as the page, not beside the queue', () => {
    setWidth(390)
    renderAt(`/admin/applications/${APP_ID}`)
    expect(screen.getByTestId('review-workspace').getAttribute('data-layout')).toBe('page')
    expect(document.querySelector('[data-review-layout="split"]')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Applications' })).toBeNull()
  })

  it('also applies from 640 to 1023px', () => {
    setWidth(800)
    renderAt(`/admin/applications/${APP_ID}`)
    expect(screen.getByTestId('review-workspace').getAttribute('data-layout')).toBe('page')
  })

  it('going back restores the queue with the same query string', () => {
    setWidth(390)
    renderAt(`/admin/applications/${APP_ID}?status=submitted&search=chipo`)
    fireEvent.click(screen.getByText('Close review stub'))
    const where = screen.getByTestId('location').textContent ?? ''
    expect(where.startsWith('/admin/applications?')).toBe(true)
    expect(where).toContain('status=submitted')
    expect(where).toContain('search=chipo')
  })
})

describe('an address that is not an application', () => {
  it('shows the not-found page for an id that is not a UUID, at any width', () => {
    for (const width of [390, 1440]) {
      setWidth(width)
      const view = renderAt('/admin/applications/not-a-uuid?status=submitted')
      expect(screen.getByTestId('review-not-found')).toBeTruthy()
      expect(screen.queryByTestId('review-workspace')).toBeNull()
      const link = screen.getByRole('link', { name: 'Back to applications' })
      expect(link.getAttribute('href')).toBe('/admin/applications?status=submitted')
      view.unmount()
    }
  })
})

