/**
 * Required-document upload flow — contract read, interrupted upload, retry,
 * replacement (admissions-v2 task **7.2**).
 *
 * Requirements: R11.6 (controls from the versioned contract; an unevaluable
 *               configuration is a retryable service error, never an empty
 *               list), R11.7 (type/size validation per requirement),
 *               R11.8 (replace targets the server record, not local state).
 * Findings:     **STU-13**, **STU-19**.
 * Design:       §9.3.
 * Evidence:     tasks.md 7.2 — "custom tenant requirement and interrupted
 *               upload E2E". This is the client half, driving the real hook,
 *               the real contract parser, and the real panel against a mocked
 *               transport; the server half is
 *               `backend/tests/integration/test_required_documents_contract_7_2.py`.
 *
 * Nothing here is mocked except the network: the state machine, the validation,
 * the retry, and the re-read after a successful upload are the shipped code.
 *
 * Validates: Requirements R11.6, R11.7, R11.8
 */
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

function customRequirement(overrides: Record<string, unknown> = {}) {
  return {
    document_type: 'nursing_council_letter',
    label: 'Nursing Council eligibility letter',
    required: true,
    description: 'The signed letter from the Nursing Council.',
    source: 'tenant',
    accepts_document_types: ['nursing_council_letter'],
    accepted_mime_types: ['application/pdf'],
    accepted_extensions: ['.pdf'],
    max_size_bytes: 2 * 1024 * 1024,
    state: 'missing',
    document: null,
    ...overrides,
  }
}

function contractPayload(requirements: unknown[]) {
  return {
    application_id: APPLICATION_ID,
    configuration_version: 'cfg-11',
    requirements,
  }
}

/** The shipped hook + the shipped panel, nothing else. */
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
    />
  )
}

function pdf(name: string, size = 1024) {
  const file = new File([new Uint8Array(size)], name, { type: 'application/pdf' })
  return file
}

/** Drop a file onto the requirement's input the way react-dropzone reads it. */
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

afterEach(() => {
  vi.useRealTimers()
})

describe('required-document upload flow (R11.6-R11.8)', () => {
  it('renders a custom tenant requirement read from the server contract', async () => {
    request.mockImplementation(async (endpoint: string) => {
      if (endpoint === CONTRACT_ENDPOINT) return contractPayload([customRequirement()])
      throw new Error(`unexpected call ${endpoint}`)
    })

    render(<Harness />)

    await waitFor(() =>
      expect(screen.getByLabelText('Upload Nursing Council eligibility letter')).toBeTruthy(),
    )
    expect(screen.getByText(/PDF up to 2MB/)).toBeTruthy()
    expect(request).toHaveBeenCalledWith(CONTRACT_ENDPOINT)
  })

  it('refuses a file the requirement does not accept before any byte leaves the device', async () => {
    request.mockImplementation(async (endpoint: string) => {
      if (endpoint === CONTRACT_ENDPOINT) return contractPayload([customRequirement()])
      throw new Error(`unexpected call ${endpoint}`)
    })

    render(<Harness />)
    await waitFor(() => expect(screen.getByText(/PDF up to 2MB/)).toBeTruthy())

    const oversize = new File([new Uint8Array(3 * 1024 * 1024)], 'letter.pdf', {
      type: 'application/pdf',
    })
    await selectFile(oversize)

    // The refusal is described in the requirement's own words — the label and
    // the limit the control advertised — in the summary and on the field.
    await waitFor(() =>
      expect(
        screen.getAllByText(
          /Nursing Council eligibility letter must be 2MB or smaller/,
        ).length,
      ).toBeGreaterThan(0),
    )
    // No upload attempt at all — only the initial contract read happened.
    expect(request.mock.calls.filter(([endpoint]) => endpoint === '/documents/upload/')).toHaveLength(0)
  })

  it('recovers an interrupted upload: one silent retry, then the persisted state', async () => {
    let uploadAttempts = 0
    let uploaded = false
    request.mockImplementation(async (endpoint: string) => {
      if (endpoint === CONTRACT_ENDPOINT) {
        return contractPayload([
          uploaded
            ? customRequirement({
                state: 'uploaded',
                document: {
                  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  document_type: 'nursing_council_letter',
                  document_name: 'council-letter.pdf',
                  verification_status: 'pending',
                  file_size: 1024,
                  mime_type: 'application/pdf',
                  uploaded_at: '2026-07-26T09:00:00Z',
                },
              })
            : customRequirement(),
        ])
      }
      if (endpoint === '/documents/upload/') {
        uploadAttempts += 1
        if (uploadAttempts === 1) {
          // The object write dies mid-flight — the server's retryable failure.
          throw statusError(500, 'STORAGE_ERROR', 'File storage error')
        }
        uploaded = true
        return { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', file_url: null }
      }
      throw new Error(`unexpected call ${endpoint}`)
    })

    render(<Harness />)
    await waitFor(() => expect(screen.getByText(/PDF up to 2MB/)).toBeTruthy())

    await selectFile(pdf('council-letter.pdf'))

    // The hook retries a retryable failure once without costing the student an
    // interaction, then re-reads the contract so the rendered state is persisted.
    await waitFor(() => expect(uploadAttempts).toBe(2), { timeout: 10000 })
    await waitFor(() => expect(screen.getByText(/council-letter\.pdf/)).toBeTruthy(), {
      timeout: 10000,
    })
    expect(screen.getByRole('button', { name: /replace file/i })).toBeTruthy()
    expect(
      request.mock.calls.filter(([endpoint]) => endpoint === CONTRACT_ENDPOINT).length,
    ).toBeGreaterThanOrEqual(2)
  })

  it('keeps a persistently failed upload retryable with an accessible message', async () => {
    let uploadAttempts = 0
    request.mockImplementation(async (endpoint: string) => {
      if (endpoint === CONTRACT_ENDPOINT) return contractPayload([customRequirement()])
      if (endpoint === '/documents/upload/') {
        uploadAttempts += 1
        throw statusError(503, 'CONFIGURATION_UNAVAILABLE', 'Configuration unavailable')
      }
      throw new Error(`unexpected call ${endpoint}`)
    })

    render(<Harness />)
    await waitFor(() => expect(screen.getByText(/PDF up to 2MB/)).toBeTruthy())
    await selectFile(pdf('council-letter.pdf'))

    // Initial attempt + one silent retry, then a visible, retryable failure.
    await waitFor(() => expect(uploadAttempts).toBe(2), { timeout: 10000 })
    const summary = await waitFor(() => {
      const node = screen
        .getAllByRole('alert')
        .find((candidate) => candidate.textContent?.includes('needs your attention'))
      expect(node).toBeTruthy()
      return node!
    })
    expect(summary.textContent).toContain('Nursing Council eligibility letter')
    expect(document.activeElement).toBe(summary)

    const retry = screen.getByRole('button', { name: /retry/i })
    await act(async () => {
      retry.click()
    })
    await waitFor(() => expect(uploadAttempts).toBeGreaterThanOrEqual(3), { timeout: 10000 })
  })

  it('replacement re-opens the control and re-reads the server record', async () => {
    let uploadedName = 'council-letter.pdf'
    request.mockImplementation(async (endpoint: string) => {
      if (endpoint === CONTRACT_ENDPOINT) {
        return contractPayload([
          customRequirement({
            state: 'uploaded',
            document: {
              id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              document_type: 'nursing_council_letter',
              document_name: uploadedName,
              verification_status: 'pending',
              file_size: 1024,
              mime_type: 'application/pdf',
              uploaded_at: '2026-07-26T09:00:00Z',
            },
          }),
        ])
      }
      if (endpoint === '/documents/upload/') {
        uploadedName = 'council-letter-v2.pdf'
        return { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', file_url: null }
      }
      throw new Error(`unexpected call ${endpoint}`)
    })

    render(<Harness />)
    await waitFor(() => expect(screen.getByText(/council-letter\.pdf/)).toBeTruthy())
    expect(document.querySelector('input[type="file"]')).toBeNull()

    await act(async () => {
      screen.getByRole('button', { name: /replace file/i }).click()
    })
    await waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull())

    await selectFile(pdf('council-letter-v2.pdf'))

    // The replacement is a server command: the panel shows the record the
    // server returned on re-read, not the local file name (STU-19).
    await waitFor(() => expect(screen.getByText(/council-letter-v2\.pdf/)).toBeTruthy(), {
      timeout: 10000,
    })
  })

  it('surfaces an unevaluable configuration as a retryable error with no controls', async () => {
    let attempts = 0
    request.mockImplementation(async (endpoint: string) => {
      if (endpoint === CONTRACT_ENDPOINT) {
        attempts += 1
        if (attempts === 1) {
          throw statusError(503, 'CONFIGURATION_UNAVAILABLE', 'Configuration unavailable')
        }
        return contractPayload([customRequirement()])
      }
      throw new Error(`unexpected call ${endpoint}`)
    })

    render(<Harness />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(document.querySelector('input[type="file"]')).toBeNull()

    await act(async () => {
      screen.getByRole('button', { name: /try again/i }).click()
    })
    await waitFor(() =>
      expect(screen.getByLabelText('Upload Nursing Council eligibility letter')).toBeTruthy(),
    )
  })
})
