/**
 * R5 exploration: the document opener route signs at click time.
 *
 * Spec: student-journey-repair task 1.5, clauses 1.19 and 1.22 (design R5-a).
 *
 * The route `/student/documents/open` and its page do not exist at HEAD, so each
 * case fails on the missing module. The page contract under test (design R5-a):
 *   - query grammar `doc=<uuid>`, `doc=legacy:<result_slip|extra_kyc>:<app uuid>`,
 *     or `app=<uuid>&type=<official type>`, validated before any request;
 *   - signs at mount (GET only), then `window.location.replace(url)`;
 *   - never POSTs; renders loading, invalid, 404, retryable and rate-limited states.
 *
 * Every test is wrapped in `it.fails` (design "Marker scheme"); the R5
 * checkpoint, task 3.21, removes the wrapper.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSignedUrl = vi.fn()
const listByApplication = vi.fn()
const getOfficialDocument = vi.fn()
const generateOfficialDocument = vi.fn()

vi.mock('@/services/documents', () => ({
  documentService: {
    getSignedUrl: (...args: unknown[]) => getSignedUrl(...args),
    listByApplication: (...args: unknown[]) => listByApplication(...args),
  },
}))

vi.mock('@/services/officialDocuments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/officialDocuments')>()
  return {
    ...actual,
    officialDocumentService: {
      ...actual.officialDocumentService,
      getOfficialDocument: (...args: unknown[]) => getOfficialDocument(...args),
      generateOfficialDocument: (...args: unknown[]) => generateOfficialDocument(...args),
    },
  }
})

const DOC_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SIGNED = 'https://signed.test/documents/slip.pdf?X-Amz-Signature=fresh'

const replace = vi.fn()

async function renderOpener(search: string) {
  // `import.meta.glob` resolves to nothing while the page does not exist, so the
  // test fails on this assertion rather than on the build.
  const loaders = import.meta.glob('../../src/pages/student/DocumentOpen.tsx')
  const loader = Object.values(loaders)[0]
  expect(loader, 'src/pages/student/DocumentOpen.tsx must exist').toBeDefined()
  const mod = (await loader()) as { default?: ComponentType; DocumentOpen?: ComponentType }
  const Page = (mod.default ?? mod.DocumentOpen) as ComponentType
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/student/documents/open${search}`]}>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function failure(status: number, code?: string) {
  return Object.assign(new Error(`HTTP ${status}`), { status, code })
}

beforeEach(() => {
  for (const mock of [getSignedUrl, listByApplication, getOfficialDocument, generateOfficialDocument, replace]) {
    mock.mockReset()
  }
  vi.stubGlobal('location', { ...window.location, replace })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the document opener page (clauses 1.19, 1.22)', () => {
  it.fails('refuses an invalid query before sending any request', async () => {
    await renderOpener('?doc=not-a-uuid')

    expect(await screen.findByText(/This link isn.t valid/i)).toBeTruthy()
    expect(getSignedUrl).not.toHaveBeenCalled()
    expect(listByApplication).not.toHaveBeenCalled()
    expect(getOfficialDocument).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it.fails('signs an uploaded document at mount and replaces the location', async () => {
    getSignedUrl.mockResolvedValue({ url: SIGNED })

    await renderOpener(`?doc=${DOC_ID}`)

    await waitFor(() => expect(replace).toHaveBeenCalledWith(SIGNED))
    expect(getSignedUrl).toHaveBeenCalledTimes(1)
    expect(getSignedUrl).toHaveBeenCalledWith(DOC_ID)
  })

  it.fails('opens a legacy synthetic row from the freshly signed list entry', async () => {
    listByApplication.mockResolvedValue([
      {
        id: `legacy:extra_kyc:${APP_ID}`,
        document_type: 'extra_kyc',
        is_legacy_synthetic: true,
        file_url: SIGNED,
      },
    ])

    await renderOpener(`?doc=legacy:extra_kyc:${APP_ID}`)

    await waitFor(() => expect(replace).toHaveBeenCalledWith(SIGNED))
    expect(listByApplication).toHaveBeenCalledWith(APP_ID)
  })

  it.fails('opens a ready official document with one GET and never POSTs', async () => {
    getOfficialDocument.mockResolvedValue({
      status: 'ready',
      document_id: DOC_ID,
      download_url: SIGNED,
    })

    await renderOpener(`?app=${APP_ID}&type=application_slip`)

    await waitFor(() => expect(replace).toHaveBeenCalledWith(SIGNED))
    expect(getOfficialDocument).toHaveBeenCalledTimes(1)
    expect(generateOfficialDocument).not.toHaveBeenCalled()
  })

  it.fails('shows "isn\'t available" with a way back on a 404', async () => {
    getSignedUrl.mockRejectedValue(failure(404, 'NOT_FOUND'))

    await renderOpener(`?doc=${DOC_ID}`)

    expect(await screen.findByText(/This document isn.t available/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /back|status/i })).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it.fails('shows "can\'t be opened right now" with Retry on a server error', async () => {
    getSignedUrl.mockRejectedValue(failure(500, 'STORAGE_ERROR'))

    await renderOpener(`?doc=${DOC_ID}`)

    expect(await screen.findByText(/can.t be opened right now/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it.fails('maps DOCUMENT_LINK_UNAVAILABLE on a ready official document to the same state', async () => {
    getOfficialDocument.mockResolvedValue({
      status: 'ready',
      document_id: DOC_ID,
      error_code: 'DOCUMENT_LINK_UNAVAILABLE',
    })

    await renderOpener(`?app=${APP_ID}&type=application_slip`)

    expect(await screen.findByText(/can.t be opened right now/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it.fails('shows the shared rate-limit copy on a 429', async () => {
    getSignedUrl.mockRejectedValue(
      Object.assign(failure(429, 'RATE_LIMITED'), { retryAfterSeconds: 120 }),
    )

    await renderOpener(`?doc=${DOC_ID}`)

    expect(await screen.findByText(/Try again in about 2 minutes/i)).toBeTruthy()
  })
})
