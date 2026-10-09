/**
 * Task 10.4 — the browser decides nothing about official-document work.
 *
 * admissions-v2 task 10.4 — R13.2, R13.5, R13.11; findings **STU-18**, **API-04**.
 *
 * Four claims, and each is one an endpoint test cannot reach:
 *
 * 1. `not_requested` is not a queue. The pre-10.4 hook mapped every unknown
 *    status to a poll, so a document nothing had recorded was polled 20 times
 *    and then declared failed;
 * 2. the retry affordance is the **server's** `can_retry`, so a tenant setup
 *    failure offers no button that cannot work;
 * 3. the student's failure copy never names the school's document configuration,
 *    and always offers a tenant-resolved route to a human (STU-18 / STU-24);
 * 4. the email call goes to the canonical per-type route, for every type — the
 *    service used to *throw* for anything but the slip (API-04).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OfficialDocumentRecovery } from '@/components/student/documents/OfficialDocumentRecovery'
import {
  OFFICIAL_DOCUMENT_SETUP_REQUIRED_MESSAGE,
  OFFICIAL_DOCUMENT_STUDENT_UNAVAILABLE_MESSAGE,
  deriveOfficialDocumentUiState,
} from '@/hooks/useOfficialDocument'
import type { OfficialDocumentStatus } from '@/services/officialDocuments'

const requests: Array<{ endpoint: string; init?: RequestInit }> = []

vi.mock('@/services/client', () => ({
  apiClient: {
    request: vi.fn(async (endpoint: string, init?: RequestInit) => {
      requests.push({ endpoint, init })
      return null
    }),
  },
}))

vi.mock('@/lib/apiErrorLogger', () => ({ logApiError: vi.fn() }))

const portalBrand = { brandName: 'Beanola Admissions', supportEmail: null as string | null }
vi.mock('@/hooks/usePortalBrand', () => ({
  usePortalBrand: () => portalBrand,
}))

beforeEach(() => {
  requests.length = 0
  portalBrand.brandName = 'Beanola Admissions'
  portalBrand.supportEmail = null
})

// ---------------------------------------------------------------------------
// 1. `not_requested` is not a queue (R13.11)
// ---------------------------------------------------------------------------

describe('the UI state never turns an unrequested document into a queue (R13.11)', () => {
  it('maps not_requested to idle, never to queued', () => {
    expect(deriveOfficialDocumentUiState(false, 'not_requested')).toBe('idle')
  })

  it('maps not_requested to generating only while a request is in flight', () => {
    expect(deriveOfficialDocumentUiState(true, 'not_requested')).toBe('generating')
  })

  it('still maps a committed job to queued', () => {
    expect(deriveOfficialDocumentUiState(false, 'queued')).toBe('queued')
    expect(deriveOfficialDocumentUiState(true, 'queued')).toBe('queued')
  })

  it('keeps every pre-10.4 mapping intact', () => {
    expect(deriveOfficialDocumentUiState(false, 'ready')).toBe('ready')
    expect(deriveOfficialDocumentUiState(false, 'failed')).toBe('failed')
    expect(deriveOfficialDocumentUiState(true, 'failed')).toBe('generating')
    expect(deriveOfficialDocumentUiState(false, 'setup_required')).toBe('setup_required')
    expect(deriveOfficialDocumentUiState(false, null)).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// 2 + 3. Neutral student recovery, and a retry only when the server says so
// ---------------------------------------------------------------------------

function renderRecovery(props: Partial<React.ComponentProps<typeof OfficialDocumentRecovery>> = {}) {
  return render(
    <MemoryRouter>
      <OfficialDocumentRecovery
        message={OFFICIAL_DOCUMENT_STUDENT_UNAVAILABLE_MESSAGE}
        canRetry={false}
        isSetupRequired
        applicationNumber="APP-20260101-ABCDEFGH"
        documentLabel="acceptance letter"
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('the student recovery state (STU-18)', () => {
  it('never shows the school document-setup checklist', () => {
    renderRecovery()
    expect(screen.queryByText(OFFICIAL_DOCUMENT_SETUP_REQUIRED_MESSAGE)).toBeNull()
    const body = document.body.textContent ?? ''
    for (const leak of ['document profile', 'template', 'logo', 'signature']) {
      expect(body.toLowerCase()).not.toContain(leak)
    }
  })

  it('says what happened and that the office already knows', () => {
    renderRecovery()
    expect(screen.getByText(OFFICIAL_DOCUMENT_STUDENT_UNAVAILABLE_MESSAGE)).toBeTruthy()
    expect(
      screen.getByText(/notified and does not need you to do anything else/i),
    ).toBeTruthy()
  })

  it('offers the neutral in-app contact route when the tenant has no address', () => {
    renderRecovery()
    const link = screen.getByRole('link', { name: /contact support/i })
    expect(link.getAttribute('href')).toBe('/contact')
  })

  it('offers the resolved school address when the tenant has one', () => {
    portalBrand.brandName = 'Test College'
    portalBrand.supportEmail = 'admissions@testcollege.edu.zm'
    renderRecovery()
    const link = screen.getByRole('link', { name: /email admissions/i })
    expect(link.getAttribute('href')).toContain('mailto:admissions@testcollege.edu.zm')
  })

  it('never emits a platform or legacy-school address (STU-24)', () => {
    renderRecovery()
    const html = document.body.innerHTML
    for (const forbidden of ['@beanola.com', 'mihas', 'katc', '@gmail.com']) {
      expect(html.toLowerCase()).not.toContain(forbidden)
    }
  })

  it('offers no retry when the server says retrying cannot help', () => {
    const onRetry = vi.fn()
    renderRecovery({ canRetry: false, onRetry })
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
  })

  it('offers a retry when the server says it could help', async () => {
    const onRetry = vi.fn()
    renderRecovery({
      canRetry: true,
      isSetupRequired: false,
      message: 'The document could not be prepared. Please try again.',
      onRetry,
    })
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1))
  })

  it('renders nothing at all when there is no failure message', () => {
    const { container } = render(
      <MemoryRouter>
        <OfficialDocumentRecovery message={null} canRetry={false} isSetupRequired={false} />
      </MemoryRouter>,
    )
    expect(container.textContent).toBe('')
  })

  it('carries only non-PII context into the support mailto', () => {
    portalBrand.supportEmail = 'admissions@testcollege.edu.zm'
    renderRecovery()
    const href = screen.getByRole('link', { name: /email admissions/i }).getAttribute('href') ?? ''
    expect(decodeURIComponent(href)).toContain('APP-20260101-ABCDEFGH')
    expect(decodeURIComponent(href).toLowerCase()).not.toContain('nrc')
  })
})

// ---------------------------------------------------------------------------
// 4. The email call goes to the canonical per-type route (API-04)
// ---------------------------------------------------------------------------

describe('the official-document email call (R13.5, API-04)', () => {
  const types = [
    'application_slip',
    'acceptance_letter',
    'conditional_offer',
    'payment_receipt',
    'finance_receipt',
  ] as const

  it.each(types)('emails %s through the canonical route rather than throwing', async (documentType) => {
    const { officialDocumentService } = await import('@/services/officialDocuments')
    await officialDocumentService.emailOfficialDocument('app-1', documentType)
    expect(requests.at(-1)?.endpoint).toBe(
      `/applications/app-1/official-documents/${documentType}/email/`,
    )
  })

  it('never calls the legacy email-slip route', async () => {
    const { officialDocumentService } = await import('@/services/officialDocuments')
    await officialDocumentService.emailOfficialDocument('app-1', 'application_slip')
    expect(requests.every((r) => !r.endpoint.includes('email-slip'))).toBe(true)
  })

  it('omits the recipient when the caller does not name one', async () => {
    const { officialDocumentService } = await import('@/services/officialDocuments')
    await officialDocumentService.emailOfficialDocument('app-1', 'acceptance_letter')
    expect(requests.at(-1)?.init?.body).toBe('{}')
  })

  it('passes an explicit recipient through for the backend to validate', async () => {
    const { officialDocumentService } = await import('@/services/officialDocuments')
    await officialDocumentService.emailOfficialDocument(
      'app-1',
      'acceptance_letter',
      'student@example.com',
    )
    expect(requests.at(-1)?.init?.body).toBe('{"email":"student@example.com"}')
  })
})

// ---------------------------------------------------------------------------
// 5. The published contract shape
// ---------------------------------------------------------------------------

describe('the published contract (R13.11)', () => {
  it('carries the durable job, the read-existing marker, and the retry answer', () => {
    // A compile-time claim expressed as a value: every field the surfaces read
    // is on the contract, so none of them has to be derived in the browser.
    const status: OfficialDocumentStatus = {
      document_id: 'doc-1',
      document_type: 'acceptance_letter',
      status: 'ready',
      generated_at: '2026-08-09T00:00:00Z',
      template_version: 3,
      institution_id: 'inst-1',
      historical: true,
      can_retry: false,
      job: {
        state: 'succeeded',
        attempts: 1,
        requested_at: '2026-08-09T00:00:00Z',
        settled_at: '2026-08-09T00:00:05Z',
        error_code: null,
        terminal: true,
        can_retry: false,
      },
    }
    expect(status.job?.state).toBe('succeeded')
    expect(status.historical).toBe(true)
    expect(status.can_retry).toBe(false)
  })
})
