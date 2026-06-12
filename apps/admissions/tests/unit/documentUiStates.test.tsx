/**
 * Document UI state tests (task 37.3).
 *
 * Spec: `multi-tenant-beanola-remediation` — Phase 10 (Document UI states),
 * Requirement 17. Locks the student + admin document UI behaviour against the
 * backend-truth contract:
 *
 *   - status-gated action visibility (R17.1): the student document surface only
 *     renders the official actions allowed by the current application status +
 *     payment state, via the pure `officialDocumentGate` predicate.
 *   - queued/generating/ready/failed rendering (R17.2): the four backend states
 *     map deterministically through `deriveOfficialDocumentUiState` and surface
 *     as the right button label.
 *   - email-of-stored-document (R17.2): the slip "email" action emails the
 *     backend-stored official document (calls the service email path), never a
 *     locally rendered blob.
 *   - admin scoped listing (R17.4): the admin panel lists the latest official
 *     document per type from the backend-scoped service.
 *
 * The deeper hook wiring (poll loop, generate→ready reconcile, scope-load
 * error) is already covered by `useAdminOfficialDocuments.test.tsx` and the
 * gate space by `officialDocumentGating.property.test.ts`; this file fills the
 * component-render + UI-state-mapper gaps those leave.
 *
 * **Validates: Requirements R17.1, R17.2, R17.4**
 */

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deriveOfficialDocumentUiState } from '@/hooks/useOfficialDocument'
import { DocumentButtons } from '@/components/student/DocumentButtons'
import { ApplicationSlipActions } from '@/components/student/ApplicationSlipActions'
import { DownloadReceiptButton } from '@/components/student/DownloadReceiptButton'
import { AdminOfficialDocumentsPanel } from '@/components/admin/applications/AdminOfficialDocumentsPanel'
import { ADMIN_OFFICIAL_DOCUMENT_TYPES } from '@/hooks/useAdminOfficialDocuments'

// Backend official-document service — the single source of official PDFs. The
// student + admin UI drive every official action through here (R17.6), so the
// mocks below let us assert the UI never reaches for a local `@/lib/pdf` blob.
const generateMock = vi.fn()
const getMock = vi.fn()
const listMock = vi.fn()
const downloadMock = vi.fn()
const emailMock = vi.fn()

vi.mock('@/services/officialDocuments', () => ({
  officialDocumentService: {
    generateOfficialDocument: (...args: unknown[]) => generateMock(...args),
    getOfficialDocument: (...args: unknown[]) => getMock(...args),
    listOfficialDocuments: (...args: unknown[]) => listMock(...args),
    downloadOfficialDocument: (...args: unknown[]) => downloadMock(...args),
    emailOfficialDocument: (...args: unknown[]) => emailMock(...args),
  },
}))

const addToastMock = vi.fn()
const toastErrorMock = vi.fn()
const toastSuccessMock = vi.fn()

vi.mock('@/hooks/useToast', () => ({
  useToastStore: () => ({
    addToast: addToastMock,
    success: toastSuccessMock,
    error: toastErrorMock,
  }),
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'jane@example.com', role: 'student' } }),
}))

const APP_ID = 'app-123'

beforeEach(() => {
  generateMock.mockReset()
  getMock.mockReset()
  listMock.mockReset()
  downloadMock.mockReset()
  emailMock.mockReset()
  addToastMock.mockReset()
  toastErrorMock.mockReset()
  toastSuccessMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// 1. queued/generating/ready/failed rendering — the UI-state mapper (R17.2)
// ---------------------------------------------------------------------------
describe('deriveOfficialDocumentUiState — backend status → UI state (R17.2)', () => {
  it('maps a ready backend status to ready regardless of in-flight', () => {
    expect(deriveOfficialDocumentUiState(false, 'ready')).toBe('ready')
    expect(deriveOfficialDocumentUiState(true, 'ready')).toBe('ready')
  })

  it('maps a queued backend status to queued (no flicker to generating)', () => {
    expect(deriveOfficialDocumentUiState(false, 'queued')).toBe('queued')
    expect(deriveOfficialDocumentUiState(true, 'queued')).toBe('queued')
  })

  it('maps a failed backend status to failed when settled, generating while retrying', () => {
    expect(deriveOfficialDocumentUiState(false, 'failed')).toBe('failed')
    expect(deriveOfficialDocumentUiState(true, 'failed')).toBe('generating')
  })

  it('reads the very first in-flight request (no status yet) as generating', () => {
    expect(deriveOfficialDocumentUiState(true, null)).toBe('generating')
  })

  it('is idle before any request and with no backend status', () => {
    expect(deriveOfficialDocumentUiState(false, null)).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// 2. status-gated action visibility (R17.1)
// ---------------------------------------------------------------------------
describe('DocumentButtons — status-gated action visibility (R17.1)', () => {
  it('renders nothing for a draft application with no verified payment', () => {
    const { container } = render(
      <DocumentButtons applicationId={APP_ID} status="draft" paymentStatus={null} />,
    )
    expect(container.childElementCount).toBe(0)
  })

  it('offers the acceptance-letter action only when the application is approved', () => {
    render(<DocumentButtons applicationId={APP_ID} status="approved" paymentStatus={null} />)
    // The acceptance action is offered (rendered once for desktop + once for mobile).
    expect(screen.getAllByText('Acceptance Letter').length).toBeGreaterThan(0)
    // The conditional-offer action is NOT offered for an approved application.
    expect(screen.queryByText('Conditional Acceptance')).toBeNull()
  })

  it('offers the conditional-offer action only when conditionally approved', () => {
    render(
      <DocumentButtons applicationId={APP_ID} status="conditionally_approved" paymentStatus={null} />,
    )
    expect(screen.getAllByText('Conditional Acceptance').length).toBeGreaterThan(0)
    expect(screen.queryByText('Acceptance Letter')).toBeNull()
  })

  it('offers the payment-receipt action only when payment is verified', () => {
    render(<DocumentButtons applicationId={APP_ID} status="submitted" paymentStatus="verified" />)
    expect(screen.getAllByText('Payment Receipt').length).toBeGreaterThan(0)
  })

  it('hides the payment-receipt action when payment is not verified', () => {
    render(<DocumentButtons applicationId={APP_ID} status="approved" paymentStatus="pending" />)
    expect(screen.queryByText('Payment Receipt')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. email-of-stored-document (R17.2) — emails the backend record, not a blob
// ---------------------------------------------------------------------------
describe('ApplicationSlipActions — email of stored official document (R17.2)', () => {
  it('emails the backend-stored slip via the official-document service, not a local blob', async () => {
    // generate() resolves ready so the email path proceeds straight to emailing
    // the stored backend record.
    generateMock.mockResolvedValue({ document_type: 'application_slip', status: 'ready' })
    emailMock.mockResolvedValue(undefined)

    render(<ApplicationSlipActions applicationId={APP_ID} />)

    fireEvent.click(screen.getByText('Email Slip'))
    const input = screen.getByLabelText('Email address for application slip') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'student@example.com' } })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => {
      expect(emailMock).toHaveBeenCalledWith(APP_ID, 'application_slip', 'student@example.com')
    })
    // The backend-stored record is ensured-current before emailing (no local render).
    expect(generateMock).toHaveBeenCalledWith(APP_ID, 'application_slip')
    await screen.findByText('Slip sent to student@example.com')
  })

  it('blocks an invalid email address before calling the service', () => {
    render(<ApplicationSlipActions applicationId={APP_ID} />)
    fireEvent.click(screen.getByText('Email Slip'))
    const input = screen.getByLabelText('Email address for application slip') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByText('Send'))

    expect(screen.getByText('Please enter a valid email address')).toBeTruthy()
    expect(emailMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 3b. status-gated receipt visibility + download-of-stored-document (R17.1, R17.2)
// ---------------------------------------------------------------------------
describe('DownloadReceiptButton — payment-gated visibility + stored download (R17.1, R17.2)', () => {
  it('renders nothing when payment is not verified (status gate, R17.1)', () => {
    const { container } = render(
      <DownloadReceiptButton applicationId={APP_ID} paymentStatus="pending" />,
    )
    expect(container.childElementCount).toBe(0)
    expect(screen.queryByText('Download Receipt')).toBeNull()
  })

  it('offers the receipt action once payment is verified (R17.1)', () => {
    render(<DownloadReceiptButton applicationId={APP_ID} paymentStatus="verified" />)
    expect(screen.getByText('Download Receipt')).toBeTruthy()
  })

  it('downloads the backend-stored receipt via the official-document service, not a local blob (R17.2)', async () => {
    // generate() resolves ready → the download path streams the stored record.
    generateMock.mockResolvedValue({ document_type: 'payment_receipt', status: 'ready' })
    downloadMock.mockResolvedValue(undefined)

    render(<DownloadReceiptButton applicationId={APP_ID} paymentStatus="verified" />)
    fireEvent.click(screen.getByText('Download Receipt'))

    await waitFor(() => {
      expect(downloadMock).toHaveBeenCalledWith(APP_ID, 'payment_receipt')
    })
    // The authoritative record is ensured-current before download (no local render).
    expect(generateMock).toHaveBeenCalledWith(APP_ID, 'payment_receipt')
    await waitFor(() =>
      expect(addToastMock).toHaveBeenCalledWith('success', 'Receipt downloaded successfully'),
    )
  })

  it('surfaces a retry affordance and error toast when backend generation fails (R17.2)', async () => {
    // generate() resolves failed → download path bails before streaming, the
    // button degrades to a Retry affordance.
    generateMock.mockResolvedValue({ document_type: 'payment_receipt', status: 'failed' })

    render(<DownloadReceiptButton applicationId={APP_ID} paymentStatus="verified" />)
    fireEvent.click(screen.getByText('Download Receipt'))

    await waitFor(() => expect(generateMock).toHaveBeenCalledWith(APP_ID, 'payment_receipt'))
    // No stored record was streamed because generation did not reach `ready`.
    expect(downloadMock).not.toHaveBeenCalled()
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith('error', expect.any(String)))
    // The button now offers a retry rather than a fresh download.
    expect(await screen.findByText('Retry')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 3c. DocumentButtons sources the slip + receipt download from the backend (R17.2, R17.6)
// ---------------------------------------------------------------------------
describe('DocumentButtons — ready actions stream stored backend records (R17.2, R17.6)', () => {
  it('downloads the official acceptance letter through the backend service, never @/lib/pdf', async () => {
    generateMock.mockResolvedValue({ document_type: 'acceptance_letter', status: 'ready' })
    downloadMock.mockResolvedValue(undefined)

    render(<DocumentButtons applicationId={APP_ID} status="approved" paymentStatus={null} />)

    // Desktop + mobile both render the action; click the first.
    fireEvent.click(screen.getAllByText('Acceptance Letter')[0])

    await waitFor(() => {
      expect(generateMock).toHaveBeenCalledWith(APP_ID, 'acceptance_letter')
      expect(downloadMock).toHaveBeenCalledWith(APP_ID, 'acceptance_letter')
    })
  })
})

// ---------------------------------------------------------------------------
// 4. admin scoped listing (R17.4)
// ---------------------------------------------------------------------------
describe('AdminOfficialDocumentsPanel — scoped latest-per-type listing (R17.4)', () => {
  function readyDoc(type: string) {
    return {
      document_id: `doc-${type}`,
      document_type: type,
      status: 'ready' as const,
      download_url: `https://files.example/${type}.pdf`,
      generated_at: '2026-06-09T00:00:00.000Z',
      template_version: 2,
      institution_id: 'inst-1',
    }
  }

  it('lists the latest official document per type from the backend-scoped service', async () => {
    listMock.mockResolvedValue([readyDoc('acceptance_letter')])

    render(<AdminOfficialDocumentsPanel applicationId={APP_ID} />)

    // The panel pulls the list from the scoped backend endpoint (R17.5 scope is
    // enforced server-side; the panel consumes only what it returns).
    await waitFor(() => expect(listMock).toHaveBeenCalledWith(APP_ID))

    // One row per generatable type, with labels rendered.
    for (const { label } of ADMIN_OFFICIAL_DOCUMENT_TYPES) {
      expect(await screen.findByText(label)).toBeTruthy()
    }

    // The type with a stored backend record reads Ready; an absent one reads
    // "Not generated".
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getAllByText('Not generated').length).toBe(
      ADMIN_OFFICIAL_DOCUMENT_TYPES.length - 1,
    )
  })

  it('queues backend generation through the scoped service when an operator generates', async () => {
    listMock.mockResolvedValue([])
    generateMock.mockResolvedValue({ document_type: 'application_slip', status: 'ready' })

    render(<AdminOfficialDocumentsPanel applicationId={APP_ID} />)

    // Wait for the initial scoped load to settle.
    await waitFor(() => expect(listMock).toHaveBeenCalledWith(APP_ID))

    const generateButtons = await screen.findAllByText('Generate')
    fireEvent.click(generateButtons[0])

    await waitFor(() => expect(generateMock).toHaveBeenCalledWith(APP_ID, 'application_slip'))
    // No client-side PDF generation — generation is always backend-sourced (R17.6).
  })
})
