/**
 * Server-backed replace and remove commands (admissions-v2 task **7.3**).
 *
 * Requirements: R11.7 (immutable versions with checksum + lifecycle),
 *               R11.8 (replace/delete are server commands that preserve prior
 *               evidence; exactly one version is current).
 * Findings:     **STU-19** — "Document storage and database updates are not
 *               compensated atomically, current/superseded versions are not
 *               enforced, and 'Replace' may clear only local UI state."
 * Design:       §9.3.
 * Evidence:     `docs/v2-evidence/7.3/`. The server half lives in
 *               `backend/tests/integration/test_document_evidence_compensation_7_3.py`.
 *
 * These drive the shipped hook and the shipped panel against a mocked transport.
 * The point of each case is the same: what the student sees after a replace or a
 * remove is what the *server* now holds, and a command that fails on the server
 * leaves the stored evidence visible instead of quietly clearing the UI.
 *
 * Validates: Requirements R11.7, R11.8
 */
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: {
    request: (...args: unknown[]) => request(...args),
    // SJR task 3.6: uploads now go through `apiClient.upload`, not `request`. The
    // mock gains `upload` and routes it to the same handler, so every assertion
    // below still matches on ('/documents/upload/') unchanged; only the mock
    // shape follows the new transport.
    upload: (endpoint: string, body: unknown, options: unknown) =>
      request(endpoint, { method: 'POST', body, ...(options as object) }),
  },
}))

const { RequiredDocumentsPanel } = await import('@/components/student/RequiredDocumentsPanel')
const { useRequiredDocuments } = await import('@/hooks/useRequiredDocuments')

const APPLICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONTRACT_ENDPOINT = `/applications/${APPLICATION_ID}/required-documents/`
const V1_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const V2_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const DELETE_ENDPOINT = `/documents/${V1_ID}/delete/`

function requirement(overrides: Record<string, unknown> = {}) {
  return {
    document_type: 'result_slip',
    label: 'Grade 12 result slip',
    required: true,
    source: 'platform',
    accepts_document_types: ['result_slip'],
    accepted_mime_types: ['application/pdf'],
    accepted_extensions: ['.pdf'],
    max_size_bytes: 2 * 1024 * 1024,
    state: 'uploaded',
    history: [],
    ...overrides,
  }
}

function version(id: string, versionNumber: number, name: string) {
  return {
    id,
    document_type: 'result_slip',
    document_name: name,
    verification_status: 'pending',
    file_size: 1024,
    mime_type: 'application/pdf',
    uploaded_at: '2026-07-26T09:00:00Z',
    version: versionNumber,
    lifecycle_state: 'ready_for_review',
    checksum: `${versionNumber}`.repeat(64),
  }
}

function contractPayload(requirements: unknown[]) {
  return {
    application_id: APPLICATION_ID,
    configuration_version: 'cfg-7-3',
    requirements,
  }
}

function Harness() {
  const documents = useRequiredDocuments({ applicationId: APPLICATION_ID })
  return (
    <RequiredDocumentsPanel
      requirements={documents.requirements}
      uploadStates={documents.uploadStates}
      loading={documents.loading}
      contractError={documents.contractError}
      contractErrorRetryable={documents.contractErrorRetryable}
      onReload={documents.reload}
      onSelectFile={(documentType, file) => {
        void documents.selectFile(documentType, file)
      }}
      onRetry={(documentType) => {
        void documents.retry(documentType)
      }}
      onLocalError={documents.reportLocalError}
      onBeginReplace={documents.beginReplace}
      onCancelReplace={documents.cancelReplace}
      onRemove={(documentType) => {
        void documents.removeDocument(documentType)
      }}
    />
  )
}

function pdf(name: string, size = 1024) {
  return new File([new Uint8Array(size)], name, { type: 'application/pdf' })
}

async function selectFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  expect(input).not.toBeNull()
  Object.defineProperty(input!, 'files', { configurable: true, value: [file] })
  await act(async () => {
    input!.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function statusError(status: number, code: string, message: string) {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = status
  error.code = code
  return error
}

beforeEach(() => {
  request.mockReset()
})

describe('document version commands (R11.7, R11.8, STU-19)', () => {
  it('shows the new server version and the preserved prior version after a replace', async () => {
    let replaced = false
    request.mockImplementation(async (endpoint: string) => {
      if (endpoint === CONTRACT_ENDPOINT) {
        return contractPayload([
          replaced
            ? requirement({
                document: version(V2_ID, 2, 'slip-v2.pdf'),
                history: [
                  {
                    id: V1_ID,
                    document_type: 'result_slip',
                    version: 1,
                    lifecycle_state: 'superseded',
                    uploaded_at: '2026-07-26T09:00:00Z',
                    superseded_at: '2026-07-26T09:30:00Z',
                  },
                ],
              })
            : requirement({ document: version(V1_ID, 1, 'slip-v1.pdf') }),
        ])
      }
      if (endpoint === '/documents/upload/') {
        replaced = true
        return { id: V2_ID, file_url: null, version: 2, is_current: true }
      }
      throw new Error(`unexpected call ${endpoint}`)
    })

    render(<Harness />)
    await waitFor(() => expect(screen.getByText(/slip-v1\.pdf/)).toBeTruthy())
    // Version 1 is the record, and nothing is described as history yet.
    expect(screen.getByText(/Version 1/)).toBeTruthy()
    expect(screen.queryByText(/earlier version/i)).toBeNull()

    await act(async () => {
      screen.getByRole('button', { name: /replace file/i }).click()
    })
    await selectFile(pdf('slip-v2.pdf'))

    // The server record changed: a new version number, and the prior version is
    // preserved rather than overwritten. A local reset cannot produce either.
    await waitFor(() => expect(screen.getByText(/Version 2/)).toBeTruthy(), { timeout: 10000 })
    expect(screen.getByText(/slip-v2\.pdf/)).toBeTruthy()
    expect(screen.getByText(/1 earlier version kept/i)).toBeTruthy()
  })

  it('remove issues the server delete command and re-reads the contract', async () => {
    let removed = false
    request.mockImplementation(async (endpoint: string, options?: { method?: string }) => {
      if (endpoint === CONTRACT_ENDPOINT) {
        return contractPayload([
          removed
            ? requirement({
                state: 'missing',
                document: null,
                history: [
                  {
                    id: V1_ID,
                    document_type: 'result_slip',
                    version: 1,
                    lifecycle_state: 'deleted',
                    uploaded_at: '2026-07-26T09:00:00Z',
                    superseded_at: '2026-07-26T09:40:00Z',
                  },
                ],
              })
            : requirement({ document: version(V1_ID, 1, 'slip-v1.pdf') }),
        ])
      }
      if (endpoint === DELETE_ENDPOINT) {
        expect(options?.method).toBe('DELETE')
        removed = true
        return { id: V1_ID, lifecycle_state: 'deleted' }
      }
      throw new Error(`unexpected call ${endpoint}`)
    })

    render(<Harness />)
    await waitFor(() => expect(screen.getByText(/slip-v1\.pdf/)).toBeTruthy())

    await act(async () => {
      screen.getByRole('button', { name: /remove/i }).click()
    })

    await waitFor(() =>
      expect(request.mock.calls.some(([endpoint]) => endpoint === DELETE_ENDPOINT)).toBe(true),
    )
    // The requirement returns to "needs a file" only because the *server* says so.
    await waitFor(() => expect(screen.getByLabelText('Upload Grade 12 result slip')).toBeTruthy(), {
      timeout: 10000,
    })
    expect(screen.queryByText(/slip-v1\.pdf/)).toBeNull()
    expect(screen.getByText(/1 earlier version kept/i)).toBeTruthy()
  })

  it('a failed remove keeps the stored evidence and offers a retry', async () => {
    request.mockImplementation(async (endpoint: string) => {
      if (endpoint === CONTRACT_ENDPOINT) {
        return contractPayload([requirement({ document: version(V1_ID, 1, 'slip-v1.pdf') })])
      }
      if (endpoint === DELETE_ENDPOINT) {
        throw statusError(500, 'DOCUMENT_COMMIT_FAILED', 'The document could not be removed.')
      }
      throw new Error(`unexpected call ${endpoint}`)
    })

    render(<Harness />)
    await waitFor(() => expect(screen.getByText(/slip-v1\.pdf/)).toBeTruthy())

    await act(async () => {
      screen.getByRole('button', { name: /remove/i }).click()
    })

    const summary = await waitFor(() => {
      const node = screen
        .getAllByRole('alert')
        .find((candidate) => candidate.textContent?.includes('needs your attention'))
      expect(node).toBeTruthy()
      return node!
    })
    expect(summary.textContent).toContain('could not be removed')
    // The server still holds version 1, so the panel must still show it.
    expect(screen.getByText(/slip-v1\.pdf/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /remove/i })).toBeTruthy()
  })

  it('offers no remove control when there is no stored evidence', async () => {
    request.mockImplementation(async (endpoint: string) => {
      if (endpoint === CONTRACT_ENDPOINT) {
        return contractPayload([requirement({ state: 'missing', document: null })])
      }
      throw new Error(`unexpected call ${endpoint}`)
    })

    render(<Harness />)
    await waitFor(() => expect(screen.getByLabelText('Upload Grade 12 result slip')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })
})
