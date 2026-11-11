/**
 * R5 exploration: students can view their own documents.
 *
 * Spec: student-journey-repair task 1.5, clauses 1.19-1.25 (design R5-a to R5-f).
 *
 * At HEAD the status workspace lists two snapshot columns as raw links that stop
 * working after the signed-URL lifetime, the wizard panel has no View, desktop
 * navigation omits Application Status, the summary says "ready" for a document
 * that has not been issued, and the official-document hook opens a tab after a
 * chain of awaits (which the browser blocks).
 *
 * Every test asserts the expected behaviour. The `it.fails` markers were removed
 * at the R5 checkpoint (task 3.21); every case runs unmarked and passes.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listByApplication = vi.fn()
const getOfficialDocument = vi.fn()
const generateOfficialDocument = vi.fn()
const downloadOfficialDocument = vi.fn()

vi.mock('@/services/documents', () => ({
  documentService: {
    listByApplication: (...args: unknown[]) => listByApplication(...args),
    getSignedUrl: vi.fn(),
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
      downloadOfficialDocument: (...args: unknown[]) => downloadOfficialDocument(...args),
    },
  }
})

import { DocumentChecklist } from '@/components/student/applicationStatus/DocumentChecklist'
import { RequiredDocumentsPanel } from '@/components/student/RequiredDocumentsPanel'
import { useOfficialDocument } from '@/hooks/useOfficialDocument'
import {
  officialDocumentSummary,
  presentOfficialDocuments,
} from '@/lib/officialDocumentPresentation'
import { parseRequiredDocumentsContract } from '@/lib/requiredDocuments'
import { ROUTES } from '@/routes/routeRegistry'

const APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOC_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OPENER = '/student/documents/open'

function row(overrides: Record<string, unknown>) {
  return {
    id: DOC_ID,
    application: APP_ID,
    document_type: 'nursing_council_letter',
    document_name: 'letter.pdf',
    verification_status: 'pending',
    is_current: true,
    system_generated: false,
    file_url: 'https://signed.test/old?X-Amz-Signature=expired',
    ...overrides,
  }
}

function renderChecklist() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {/* HEAD takes two snapshot URLs; the fix takes the application id. */}
        <DocumentChecklist {...({ applicationId: APP_ID } as object)} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  listByApplication.mockReset()
  getOfficialDocument.mockReset()
  generateOfficialDocument.mockReset()
  downloadOfficialDocument.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the status workspace document list (clause 1.20)', () => {
  it('lists a custom type and condition evidence with View anchors to the opener', async () => {
    listByApplication.mockResolvedValue([
      row({}),
      row({
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        document_type: 'condition_evidence_cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        document_name: 'transcript.png',
      }),
    ])

    renderChecklist()

    expect(await screen.findByText(/nursing council letter/i)).toBeTruthy()
    const views = screen.getAllByRole('link', { name: /view/i })
    expect(views).toHaveLength(2)
    for (const link of views) {
      expect(link.getAttribute('href') ?? '').toMatch(new RegExp(`^${OPENER}\\?doc=[0-9a-f-]{36}$`))
      expect(link.getAttribute('target')).toBe('_blank')
    }
    // No stored (and by now expired) URL is ever rendered as a link.
    expect(document.body.innerHTML).not.toContain('X-Amz-Signature')
  })
})

describe('the wizard panel (clause 1.20)', () => {
  it('shows View for an uploaded requirement', () => {
    const contract = parseRequiredDocumentsContract({
      success: true,
      data: {
        application_id: APP_ID,
        configuration_version: 'cfg',
        requirements: [
          {
            document_type: 'result_slip',
            label: 'Grade 12 result slip',
            required: true,
            source: 'platform',
            accepts_document_types: ['result_slip'],
            accepted_mime_types: ['application/pdf'],
            accepted_extensions: ['.pdf'],
            max_size_bytes: 2 * 1024 * 1024,
            state: 'uploaded',
            document: {
              id: DOC_ID,
              document_type: 'result_slip',
              document_name: 'slip.pdf',
              verification_status: 'pending',
              file_size: 2048,
              mime_type: 'application/pdf',
              uploaded_at: '2026-11-08T09:30:00Z',
              version: 1,
              lifecycle_state: 'ready_for_review',
              checksum: 'a'.repeat(64),
            },
          },
        ],
      },
    })

    render(
      <MemoryRouter>
        <RequiredDocumentsPanel
          requirements={contract.requirements}
          uploadStates={{}}
          onSelectFile={() => undefined}
          onRetry={() => undefined}
          onLocalError={() => undefined}
          onBeginReplace={() => undefined}
          onCancelReplace={() => undefined}
        />
      </MemoryRouter>,
    )

    const view = screen.getByRole('link', { name: /view/i })
    expect(view.getAttribute('href')).toBe(`${OPENER}?doc=${DOC_ID}`)
  })
})

describe('desktop navigation (clause 1.21)', () => {
  it('keeps the documents within two activations of the dashboard (task 34.1 replaced the Status entry, D16)', () => {
    // "My application" is the dashboard and stays highlighted on the workspace; the
    // dashboard's application rows link to that workspace, which owns the documents card.
    expect(ROUTES.studentDashboard.nav?.desktop).toBe(true)
    expect(ROUTES.studentDashboard.nav?.activeMatchPaths).toContain(ROUTES.studentStatus.path)
  })
})

describe('summary copy (clause 1.25)', () => {
  it('says "ready" only for an issued type', () => {
    const input = { available: ['application_slip'], issued: [] as string[] }
    const issuable = officialDocumentSummary(presentOfficialDocuments(input as never))
    expect(issuable).not.toBeNull()
    expect(issuable).not.toMatch(/\bready\b/i)
    expect(issuable).toMatch(/can be prepared now/i)

    const issued = officialDocumentSummary(
      presentOfficialDocuments({ ...input, issued: ['application_slip'] } as never),
    )
    expect(issued).toMatch(/is ready to open/i)
  })
})

describe('the official-document hook (clauses 1.23, 1.24)', () => {
  it('never opens a tab or downloads after an await', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    generateOfficialDocument.mockResolvedValue({ status: 'ready', document_id: DOC_ID })
    getOfficialDocument.mockResolvedValue({
      status: 'ready',
      document_id: DOC_ID,
      download_url: 'https://signed.test/slip.pdf?X-Amz-Signature=fresh',
    })

    const { result } = renderHook(() => useOfficialDocument(APP_ID, 'application_slip'))
    const hook = result.current as unknown as {
      prepare?: () => Promise<unknown>
      openHref?: string | null
    }
    expect(typeof hook.prepare).toBe('function')
    await act(async () => {
      await hook.prepare?.()
    })

    expect(downloadOfficialDocument).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    const after = result.current as unknown as { openHref?: string | null }
    expect(after.openHref).toBe(`${OPENER}?app=${APP_ID}&type=application_slip`)
  })

  it('maps DOCUMENT_LINK_UNAVAILABLE to "can\'t be opened right now", not "not ready"', async () => {
    const { officialDocumentService } = await vi.importActual<
      typeof import('@/services/officialDocuments')
    >('@/services/officialDocuments')
    const { apiClient } = await import('@/services/client')
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      status: 'ready',
      document_id: DOC_ID,
      error_code: 'DOCUMENT_LINK_UNAVAILABLE',
    } as never)

    const outcome = await officialDocumentService
      .downloadOfficialDocument(APP_ID, 'application_slip')
      .then(
        () => null,
        (error: unknown) => error as Error,
      )

    expect(outcome).not.toBeNull()
    expect(outcome?.message).toMatch(/can.t be opened right now/i)
    expect(outcome?.message).not.toMatch(/not ready/i)
  })
})
