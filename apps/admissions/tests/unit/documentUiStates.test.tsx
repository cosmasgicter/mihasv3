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

import { render as rtlRender, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deriveOfficialDocumentUiState } from '@/hooks/useOfficialDocument'
import { DocumentButtons } from '@/components/student/DocumentButtons'
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

// admissions-v2 task 10.4: the failure path now renders
// `OfficialDocumentRecovery`, whose tenant-resolved support affordance
// (`resolveTenantSupportContact`) reads the runtime portal brand — a React Query
// read of `/api/v1/catalog/context/`. Stub the resolved context rather than stand
// up a QueryClientProvider: this file's subject is the document UI states, and
// the neutral/white-label branches of that affordance are owned by
// `usePortalBrand.test.tsx` and `officialDocumentDurability.test.tsx`.
vi.mock('@/hooks/usePortalBrand', () => ({
  usePortalBrand: () => ({
    brandName: 'Beanola Admissions',
    brandOwner: 'Beanola Technologies',
    isWhiteLabel: false,
    offeringInstitutionId: undefined,
    supportEmail: null,
    isLoading: false,
  }),
  DEFAULT_BRAND_NAME: 'Beanola Admissions',
}))

/**
 * Every render here goes through a router, because the task-10.4 recovery state
 * offers a real route to a human: when the resolved tenant publishes no
 * admissions address, `resolveTenantSupportContact` falls back to the neutral
 * in-app `/contact` route, which is a `<Link>` (STU-24 — never a hardcoded
 * address). A bare `render` would fail on the router context rather than on
 * anything this file is about.
 */
function render(
  ui: ReactElement,
  options?: Parameters<typeof rtlRender>[1],
): ReturnType<typeof rtlRender> {
  return rtlRender(ui, { wrapper: MemoryRouter, ...options })
}

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

  it('maps known tenant setup failures to setup_required before retry states', () => {
    expect(deriveOfficialDocumentUiState(false, 'failed', true)).toBe('setup_required')
    expect(deriveOfficialDocumentUiState(true, 'queued', true)).toBe('setup_required')
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
/*
  These three cases were written against `ApplicationSlipActions`, which
  admissions-v2 task **11.3** folded into `DocumentButtons` (finding STU-05: the
  slip's own component existed to render two equally prominent buttons plus an
  inline email form). The subject moved; the claims did not — the slip's download
  and email still go through `services/officialDocuments.ts` and never through a
  local `@/lib/pdf` render.

  One case *is* gone, and deliberately: "blocks an invalid email address before
  calling the service" guarded a text input that no longer exists. The platform
  emails an official record to its owner and refuses every other address with
  `RECIPIENT_NOT_PERMITTED` (task 10.4), so the pre-11.3 prefilled input accepted
  an address the API would reject with a 400. The replacement case asserts the
  input is absent, which is the same protection stated as a property of the
  surface rather than as a client-side format check.
*/
describe('DocumentButtons — download and email of the stored slip (R17.2)', () => {
  // SJR task 3.17 (R5-a, clause 1.23): this case clicked "Download Slip" and
  // expected `downloadOfficialDocument`, which opened a tab in code after the
  // awaits. The control now makes the slip ("Prepare"), then offers an "Open"
  // anchor to the in-app opener; nothing is downloaded or opened in code.
  it('prepares the backend-stored slip via the official-document service, then offers an Open link', async () => {
    generateMock.mockResolvedValue({ document_type: 'application_slip', status: 'ready' })
    render(<DocumentButtons applicationId={APP_ID} status="submitted" paymentStatus={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Prepare Application Slip/i }))
    await waitFor(() => {
      expect(generateMock).toHaveBeenCalledWith(APP_ID, 'application_slip')
    })
    const open = await screen.findByRole('link', { name: /Open Application Slip/i })
    expect(open.getAttribute('href')).toBe(
      `/student/documents/open?app=${APP_ID}&type=application_slip`,
    )
    expect(open.getAttribute('target')).toBe('_blank')
    expect(downloadMock).not.toHaveBeenCalled()
  })

  it('emails the backend-stored slip via the official-document service, not a local blob', async () => {
    // generate() resolves ready so the email path proceeds straight to emailing
    // the stored backend record.
    generateMock.mockResolvedValue({ document_type: 'application_slip', status: 'ready' })
    emailMock.mockResolvedValue(undefined)

    render(<DocumentButtons applicationId={APP_ID} status="submitted" paymentStatus={null} />)

    // Every command that is not the one primary download lives behind the sheet.
    fireEvent.click(screen.getByTestId('document-options-trigger'))
    fireEvent.click(screen.getByText('Email application slip to me'))

    await waitFor(() => {
      // No address argument: the recipient is the owner, decided by the platform.
      expect(emailMock).toHaveBeenCalledWith(APP_ID, 'application_slip', undefined)
    })
    // The backend-stored record is ensured-current before emailing (no local render).
    expect(generateMock).toHaveBeenCalledWith(APP_ID, 'application_slip')
  })

  it('offers no address field, because an official record is not redirectable', () => {
    render(<DocumentButtons applicationId={APP_ID} status="submitted" paymentStatus={null} />)
    fireEvent.click(screen.getByTestId('document-options-trigger'))

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.querySelector('input[type="email"]')).toBeNull()
    expect(screen.getByText('Email application slip to me')).toBeTruthy()
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
    // SJR task 3.17 (R5-f): the retired "Download Receipt" label is now "Prepare receipt".
    expect(screen.queryByText('Prepare receipt')).toBeNull()
  })

  it('offers the receipt action once payment is verified (R17.1)', () => {
    render(<DownloadReceiptButton applicationId={APP_ID} paymentStatus="verified" />)
    expect(screen.getByText('Prepare receipt')).toBeTruthy()
  })

  // SJR task 3.17 (R5-a, R5-f): the receipt control is "Prepare receipt", then an
  // "Open receipt" anchor to the opener. The old case expected a download and the
  // toast "Receipt downloaded successfully", which claimed an action that never
  // happened; the toast now says the receipt is ready to open.
  it('prepares the backend-stored receipt via the official-document service, then offers an Open link (R17.2)', async () => {
    // generate() resolves ready → the receipt can be opened.
    generateMock.mockResolvedValue({ document_type: 'payment_receipt', status: 'ready' })
    render(<DownloadReceiptButton applicationId={APP_ID} paymentStatus="verified" />)
    fireEvent.click(screen.getByText('Prepare receipt'))
    // The authoritative record is ensured-current (no local render).
    await waitFor(() => expect(generateMock).toHaveBeenCalledWith(APP_ID, 'payment_receipt'))
    const open = await screen.findByRole('link', { name: /Open receipt/i })
    expect(open.getAttribute('href')).toBe(
      `/student/documents/open?app=${APP_ID}&type=payment_receipt`,
    )
    expect(downloadMock).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(addToastMock).toHaveBeenCalledWith('success', 'Receipt is ready to open'),
    )
  })

  it('surfaces a retry affordance and error toast when backend generation fails (R17.2)', async () => {
    // generate() resolves failed → the prepare path bails before it is ready, the
    // button degrades to a Retry affordance.
    generateMock.mockResolvedValue({ document_type: 'payment_receipt', status: 'failed' })
    render(<DownloadReceiptButton applicationId={APP_ID} paymentStatus="verified" />)
    fireEvent.click(screen.getByText('Prepare receipt'))

    await waitFor(() => expect(generateMock).toHaveBeenCalledWith(APP_ID, 'payment_receipt'))
    // No stored record was streamed because generation did not reach `ready`.
    expect(downloadMock).not.toHaveBeenCalled()
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith('error', expect.any(String)))
    // The button now offers a retry rather than a fresh download.
    expect(await screen.findByText('Retry')).toBeTruthy()
  })

  it('retries through the same idempotent official-document service path', async () => {
    generateMock
      .mockResolvedValueOnce({ document_type: 'payment_receipt', status: 'failed' })
      .mockResolvedValueOnce({ document_type: 'payment_receipt', status: 'ready' })
    render(<DownloadReceiptButton applicationId={APP_ID} paymentStatus="verified" />)
    fireEvent.click(screen.getByText('Prepare receipt'))
    const retryButton = await screen.findByText('Retry')
    fireEvent.click(retryButton)
    await waitFor(() => {
      expect(generateMock).toHaveBeenCalledTimes(2)
      expect(generateMock).toHaveBeenNthCalledWith(1, APP_ID, 'payment_receipt')
      expect(generateMock).toHaveBeenNthCalledWith(2, APP_ID, 'payment_receipt')
    })
    // SJR task 3.17: the retry ends in an Open link, not a download.
    expect(await screen.findByRole('link', { name: /Open receipt/i })).toBeTruthy()
    expect(downloadMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 3c. DocumentButtons sources the slip + receipt download from the backend (R17.2, R17.6)
// ---------------------------------------------------------------------------
describe('DocumentButtons — ready actions stream stored backend records (R17.2, R17.6)', () => {
  // SJR task 3.17 (R5-a): prepare through the backend service, then an Open anchor
  // to the opener; the old case expected `downloadOfficialDocument`.
  it('prepares the official acceptance letter through the backend service, never @/lib/pdf', async () => {
    generateMock.mockResolvedValue({ document_type: 'acceptance_letter', status: 'ready' })
    render(<DocumentButtons applicationId={APP_ID} status="approved" paymentStatus={null} />)
    // Desktop + mobile both render the action; click the first.
    fireEvent.click(screen.getAllByText('Acceptance Letter')[0])
    await waitFor(() => {
      expect(generateMock).toHaveBeenCalledWith(APP_ID, 'acceptance_letter')
    })
    const open = await screen.findByRole('link', { name: /Open Acceptance Letter/i })
    expect(open.getAttribute('href')).toBe(
      `/student/documents/open?app=${APP_ID}&type=acceptance_letter`,
    )
    expect(downloadMock).not.toHaveBeenCalled()
  })

  it('surfaces setup-required when tenant document profile or assets are missing', async () => {
    generateMock.mockRejectedValue(
      Object.assign(new Error('DOCUMENT_PROFILE_NOT_CONFIGURED'), {
        code: 'DOCUMENT_PROFILE_NOT_CONFIGURED',
      }),
    )

    render(<DocumentButtons applicationId={APP_ID} status="approved" paymentStatus={null} />)

    fireEvent.click(screen.getAllByText('Acceptance Letter')[0])

    expect(await screen.findByText('Setup Required')).toBeTruthy()
    expect(downloadMock).not.toHaveBeenCalled()
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

  it('shows setup-required instead of retry when backend reports missing tenant document setup', async () => {
    listMock.mockResolvedValue([])
    generateMock.mockRejectedValue(
      Object.assign(new Error('DOCUMENT_PROFILE_NOT_CONFIGURED'), {
        code: 'DOCUMENT_PROFILE_NOT_CONFIGURED',
      }),
    )

    render(<AdminOfficialDocumentsPanel applicationId={APP_ID} />)

    await waitFor(() => expect(listMock).toHaveBeenCalledWith(APP_ID))
    const generateButtons = await screen.findAllByText('Generate')
    fireEvent.click(generateButtons[0])

    expect(await screen.findByText('Setup Required')).toBeTruthy()
    expect(await screen.findByText('Setup required')).toBeTruthy()
  })
})
