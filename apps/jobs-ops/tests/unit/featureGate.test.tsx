import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: { apiBaseUrl: 'http://localhost:8000', demoMode: false },
}))
vi.mock('@/hooks/useVisibilityRevalidation', () => ({
  useVisibilityRevalidation: vi.fn(),
}))

import { FeatureGate } from '@/app/FeatureGate'
import { JobsOpsShell } from '@/app/layout/JobsOpsShell'

const BASE = 'http://localhost:8000'
const requested: string[] = []
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
beforeEach(() => {
  requested.length = 0
  server.events.on('request:start', ({ request }) => {
    requested.push(new URL(request.url).pathname)
  })
})
afterEach(() => server.events.removeAllListeners())

function metadata(jobsOps: boolean) {
  return HttpResponse.json({
    success: true,
    data: {
      product: 'Beanola Admissions Platform',
      creator: { name: 'Cosmas Kanchepa' },
      developer: { name: 'Beanola Technologies', url: 'https://beanola.com' },
      api_version: 'v1',
      features: { jobs_ops: jobsOps },
    },
  })
}

function renderGate() {
  // The real shell sits behind the gate: it fires four feature queries when it mounts.
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: createElement(FeatureGate, null, createElement(JobsOpsShell)),
        children: [{ index: true, element: createElement('div', { 'data-testid': 'page' }, 'page') }],
      },
    ],
    { initialEntries: ['/'] },
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(RouterProvider, { router }),
    ),
  )
}

const featureRequests = () =>
  requested.filter((path) => path.startsWith('/api/') && path !== '/api/v1/meta/platform/')

describe('FeatureGate (task 12.2, requirement 3.6)', () => {
  it('shows one not-enabled state naming the setting and fires no feature request', async () => {
    server.use(http.get(`${BASE}/api/v1/meta/platform/`, () => metadata(false)))
    renderGate()
    await screen.findByText('Jobs-ops is not enabled')
    expect(screen.getByText(/ENABLE_JOBS_OPS_ROUTES=true/)).toBeInTheDocument()
    expect(screen.queryByTestId('page')).not.toBeInTheDocument()
    expect(requested).toContain('/api/v1/meta/platform/')
    expect(featureRequests()).toEqual([])
  })

  it('mounts the dashboard when the backend reports jobs-ops enabled', async () => {
    server.use(
      http.get(`${BASE}/api/v1/meta/platform/`, () => metadata(true)),
      http.get(`${BASE}/api/v1/*`, () => HttpResponse.json({ success: true, data: [] })),
    )
    renderGate()
    await screen.findByTestId('page')
    expect(screen.queryByText('Jobs-ops is not enabled')).not.toBeInTheDocument()
  })

  it('shows an error state with Retry when the metadata call fails, still without feature requests', async () => {
    let failing = true
    server.use(
      http.get(`${BASE}/api/v1/meta/platform/`, () =>
        failing ? HttpResponse.json({ error: 'down' }, { status: 503 }) : metadata(false),
      ),
    )
    renderGate()
    // The API client retries a 503 with backoff before the query settles in error.
    const retry = await screen.findByRole('button', { name: /try again/i }, { timeout: 8000 })
    expect(featureRequests()).toEqual([])
    failing = false
    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByText('Jobs-ops is not enabled')).toBeInTheDocument())
    expect(featureRequests()).toEqual([])
  }, 15000)
})
