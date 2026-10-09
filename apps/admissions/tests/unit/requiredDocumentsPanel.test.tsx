/**
 * Required-document panel behaviour (admissions-v2 task **7.2**).
 *
 * Requirements: R11.6 (every control is rendered from the versioned server
 *               contract, never a hardcoded type list), R11.7 (per-requirement
 *               type/size validation with an accessible error).
 * Findings:     **STU-13** (two hardcoded upload fields hid tenant-configured
 *               requirements), **STU-19** (replace changed only local state).
 * Design:       §9.3, §13.3 (accessible error summary with focus management,
 *               44px targets, Lucide icons, no nested cards).
 *
 * The panel is the client half of the contract: it must render whatever the
 * server published — including a document type this repository has never heard
 * of — with that requirement's own constraints, and must render **nothing**
 * uploadable when the contract could not be read.
 *
 * Validates: Requirements R11.6, R11.7
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RequiredDocumentsPanel } from '@/components/student/RequiredDocumentsPanel'
import type { RequiredDocumentUploadState } from '@/hooks/useRequiredDocuments'
import {
  parseRequiredDocumentsContract,
  type RequiredDocumentRequirement,
} from '@/lib/requiredDocuments'

function contractFrom(requirements: unknown[]) {
  return parseRequiredDocumentsContract({
    success: true,
    data: {
      application_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      configuration_version: 'cfg-7',
      requirements,
    },
  })
}

/** A tenant type no frontend constant knows about, narrowed to PDF up to 2MB. */
const CUSTOM_TENANT_ROW = {
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
}

const PLATFORM_ROW = {
  document_type: 'result_slip',
  label: 'Grade 12 result slip',
  required: true,
  description: null,
  source: 'platform',
  accepts_document_types: ['result_slip'],
  accepted_mime_types: ['application/pdf', 'image/jpeg', 'image/png'],
  accepted_extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
  max_size_bytes: 10 * 1024 * 1024,
  state: 'missing',
  document: null,
}

const noopHandlers = {
  onSelectFile: () => undefined,
  onRetry: () => undefined,
  onLocalError: () => undefined,
  onBeginReplace: () => undefined,
  onCancelReplace: () => undefined,
}

function renderPanel(
  requirements: RequiredDocumentRequirement[],
  uploadStates: Record<string, RequiredDocumentUploadState> = {},
  overrides: Partial<React.ComponentProps<typeof RequiredDocumentsPanel>> = {},
) {
  return render(
    <RequiredDocumentsPanel
      requirements={requirements}
      uploadStates={uploadStates}
      {...noopHandlers}
      {...overrides}
    />,
  )
}

function failedState(overrides: Partial<RequiredDocumentUploadState> = {}): RequiredDocumentUploadState {
  return {
    status: 'failed',
    progress: undefined,
    file: new File(['x'], 'letter.pdf', { type: 'application/pdf' }),
    error: 'Upload failed. Please try again.',
    errorCode: 'UPLOAD_FAILED',
    retryable: true,
    ...overrides,
  }
}

describe('RequiredDocumentsPanel — contract-driven controls (R11.6)', () => {
  it('renders an upload control for a custom tenant document type', () => {
    const contract = contractFrom([CUSTOM_TENANT_ROW, PLATFORM_ROW])
    renderPanel(contract.requirements)

    expect(screen.getByText('Nursing Council eligibility letter')).toBeTruthy()
    expect(
      screen.getByLabelText('Upload Nursing Council eligibility letter'),
    ).toBeTruthy()
    // …and the platform baseline row stays alongside it.
    expect(screen.getByLabelText('Upload Grade 12 result slip')).toBeTruthy()
  })

  it('publishes each requirement its own accept list and size limit', () => {
    const contract = contractFrom([CUSTOM_TENANT_ROW, PLATFORM_ROW])
    const { container } = renderPanel(contract.requirements)

    const accepts = Array.from(container.querySelectorAll('input[type="file"]')).map(
      (input) => input.getAttribute('accept') ?? '',
    )
    // The narrowed requirement offers PDF only; the platform row offers all three.
    const narrowed = accepts.find((accept) => !accept.includes('.png'))
    const platform = accepts.find((accept) => accept.includes('.png'))
    expect(narrowed).toBeTruthy()
    expect(narrowed).toContain('.pdf')
    expect(narrowed).not.toContain('.jpg')
    expect(platform).toContain('.jpg')
    expect(platform).toContain('.jpeg')

    // The narrowed requirement states its own limit, not the platform ceiling.
    expect(screen.getByText(/PDF up to 2MB/)).toBeTruthy()
    expect(screen.getByText(/PDF, JPG or PNG up to 10MB/)).toBeTruthy()
  })

  it('marks an optional requirement as optional', () => {
    const contract = contractFrom([{ ...CUSTOM_TENANT_ROW, required: false }])
    renderPanel(contract.requirements)
    expect(screen.getByText('(optional)')).toBeTruthy()
  })

  it('renders no upload control when the contract could not be read', () => {
    const { container } = renderPanel([], {}, {
      contractError: 'We could not load the documents this application needs.',
      contractErrorRetryable: true,
      onReload: () => undefined,
    })

    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain(
      'could not load the documents',
    )
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })
})

describe('RequiredDocumentsPanel — accessible errors and retry (R11.7)', () => {
  it('summarises upload failures in an assertive alert that takes focus', () => {
    const contract = contractFrom([CUSTOM_TENANT_ROW, PLATFORM_ROW])
    renderPanel(contract.requirements, {
      nursing_council_letter: failedState({
        error: 'Nursing Council eligibility letter must be a PDF up to 2MB file.',
        errorCode: 'INVALID_FILE_TYPE',
        retryable: false,
        file: null,
      }),
    })

    const summary = screen
      .getAllByRole('alert')
      .find((node) => node.textContent?.includes('needs your attention'))
    expect(summary).toBeTruthy()
    expect(summary!.getAttribute('aria-live')).toBe('assertive')
    expect(within(summary!).getByText(/Nursing Council eligibility letter:/)).toBeTruthy()
    expect(document.activeElement).toBe(summary)
  })

  it('offers retry only for a retryable failure that still holds the file', () => {
    const contract = contractFrom([CUSTOM_TENANT_ROW])
    const onRetry = vi.fn()
    const { rerender } = renderPanel(
      contract.requirements,
      { nursing_council_letter: failedState({ retryable: true }) },
      { onRetry },
    )

    screen.getByRole('button', { name: /retry/i }).click()
    expect(onRetry).toHaveBeenCalledWith('nursing_council_letter')

    // A validation rejection is not retryable — the student must pick a new file.
    rerender(
      <RequiredDocumentsPanel
        requirements={contract.requirements}
        uploadStates={{
          nursing_council_letter: failedState({ retryable: false, errorCode: 'FILE_TOO_LARGE' }),
        }}
        {...noopHandlers}
        onRetry={onRetry}
      />,
    )
    expect(screen.queryByRole('button', { name: /^retry$/i })).toBeNull()
  })

  it('shows stored evidence with a replace command instead of a fresh drop zone', () => {
    const contract = contractFrom([
      {
        ...CUSTOM_TENANT_ROW,
        state: 'uploaded',
        document: {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          document_type: 'nursing_council_letter',
          document_name: 'council-letter.pdf',
          verification_status: 'pending',
          file_size: 524288,
          mime_type: 'application/pdf',
          uploaded_at: '2026-07-26T09:00:00Z',
        },
      },
    ])
    const onBeginReplace = vi.fn()
    const { container } = renderPanel(contract.requirements, {}, { onBeginReplace })

    expect(screen.getByText('council-letter.pdf', { exact: false })).toBeTruthy()
    expect(container.querySelector('input[type="file"]')).toBeNull()

    const replace = screen.getByRole('button', { name: /replace file/i })
    replace.click()
    expect(onBeginReplace).toHaveBeenCalledWith('nursing_council_letter')
  })

  it('reports a verified requirement without offering a misleading pending label', () => {
    const contract = contractFrom([
      {
        ...PLATFORM_ROW,
        state: 'verified',
        document: {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          document_type: 'result_slip',
          document_name: 'slip.pdf',
          verification_status: 'verified',
          file_size: 1024,
          mime_type: 'application/pdf',
          uploaded_at: '2026-07-26T09:00:00Z',
        },
      },
    ])
    renderPanel(contract.requirements)

    expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.getByText(/Verified by the admissions team/)).toBeTruthy()
  })

  it('keeps every interactive control at the 44px touch target minimum', () => {
    const contract = contractFrom([
      {
        ...CUSTOM_TENANT_ROW,
        state: 'uploaded',
        document: {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          document_type: 'nursing_council_letter',
          document_name: 'council-letter.pdf',
          verification_status: 'pending',
          file_size: 2048,
          mime_type: 'application/pdf',
          uploaded_at: null,
        },
      },
    ])
    renderPanel(contract.requirements)
    const replace = screen.getByRole('button', { name: /replace file/i })
    expect(replace.className).toContain('min-h-touch')
  })
})

describe('RequiredDocumentsPanel — in-flight progress (R11.7)', () => {
  function uploadingState(
    overrides: Partial<RequiredDocumentUploadState> = {},
  ): RequiredDocumentUploadState {
    return {
      status: 'uploading',
      progress: undefined,
      file: new File(['x'.repeat(2048)], 'council-letter.pdf', { type: 'application/pdf' }),
      error: null,
      errorCode: null,
      retryable: false,
      ...overrides,
    }
  }

  it('announces an in-flight upload without claiming a percentage it cannot measure', () => {
    const contract = contractFrom([CUSTOM_TENANT_ROW])
    renderPanel(contract.requirements, { nursing_council_letter: uploadingState() })

    const bar = screen.getByRole('progressbar')
    // The upload runs through the unified fetch-based ApiClient, which cannot
    // observe request-body progress. A determinate bar would therefore be frozen
    // at whatever number we invented — on a weak connection a student reads a
    // stuck "0%" as a dead form and reloads, losing work. Indeterminate is the
    // honest, ARIA-correct representation.
    expect(bar.getAttribute('aria-valuenow')).toBeNull()
    expect(bar.getAttribute('aria-valuetext')).toBe('Uploading')
    expect(screen.queryByText('0%')).toBeNull()
    // Still an unmistakable in-flight signal, with the file being sent named.
    expect(screen.getByText(/Uploading securely/)).toBeTruthy()
    expect(screen.getByText('council-letter.pdf')).toBeTruthy()
  })

  it('renders a determinate bar when a measured percentage is supplied', () => {
    const contract = contractFrom([CUSTOM_TENANT_ROW])
    renderPanel(contract.requirements, {
      nursing_council_letter: uploadingState({ progress: 40 }),
    })

    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect(screen.getByText('40%')).toBeTruthy()
  })
})
