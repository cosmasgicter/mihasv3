/**
 * `createApplicationSlip` no longer emails anything.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task **10.6**.
 * Requirements: **R13.5** ("legacy acceptance-letter, slip, and receipt callers
 *               SHALL be deprecated and removed after measured zero use").
 * Finding:      **API-04**.
 *
 * These cases used to pin the branch that POSTed the deprecated
 * `/applications/{id}/email-slip/` route. Task 10.4 turned that route into a
 * proxy over the canonical official-document email and measured zero production
 * call sites; task 10.6 removed the route, and with it this module's only reason
 * to hold an API client.
 *
 * So the assertion inverts: the interesting property is now that a caller asking
 * for an email is **told no** and still gets a downloadable slip, and that this
 * module makes **no network call** for the email. A silent no-op would be worse
 * than the old failure — a caller would believe a message was queued when none
 * was — which is why `emailError` is populated rather than left undefined.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateApplicationSlipMock = vi.fn()
const persistSlipMock = vi.fn()
const mockApiRequest = vi.fn()

vi.mock('@/lib/pdf', () => ({
  generateApplicationSlip: (...args: unknown[]) => generateApplicationSlipMock(...args),
}))

vi.mock('@/lib/applicationSlipStorage', () => ({
  persistSlip: (...args: unknown[]) => persistSlipMock(...args),
}))

vi.mock('@/lib/lazyImportRecovery', () => ({
  importWithChunkRecovery: (importFn: () => Promise<unknown>) => importFn(),
}))

vi.mock('@/services/client', () => ({
  apiClient: {
    request: (...args: unknown[]) => mockApiRequest(...args),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const SLIP_DATA = {
  application_number: 'MIHAS000001',
  application_id: 'app-1',
  public_tracking_code: 'TRK12345',
  status: 'submitted',
  payment_status: 'pending_review',
  submitted_at: '2026-03-07T12:00:00.000Z',
  updated_at: '2026-03-07T12:00:00.000Z',
  program_name: 'Diploma in Registered Nursing',
  intake_name: 'January 2026',
  institution: 'MIHAS',
  institution_name: 'Mukuba Institute of Health and Applied Sciences',
  full_name: 'Jane Student',
  email: 'jane@example.com',
  phone: '+260971234567',
  nationality: 'Zambian',
  admin_feedback: null,
  admin_feedback_date: null,
  userId: 'user-1',
}

describe('createApplicationSlip after the legacy email route was removed', () => {
  beforeEach(() => {
    generateApplicationSlipMock.mockReset()
    persistSlipMock.mockReset()
    mockApiRequest.mockReset()
    generateApplicationSlipMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    persistSlipMock.mockResolvedValue({
      success: true,
      publicUrl: 'https://example.com/slips/app-1.pdf',
      documentId: 'doc-1',
      path: 'slips/app-1.pdf',
    })
  })

  it('declines the email explicitly instead of pretending it was queued', async () => {
    const { createApplicationSlip } = await import('@/lib/slipService')
    const result = await createApplicationSlip(SLIP_DATA, { sendEmail: true })

    expect(result.emailed).toBe(false)
    expect(result.queuedId).toBeUndefined()
    expect(result.emailError).toBe('Slip email is handled by the official-document service')
  })

  it('still returns a downloadable slip when the email is declined', async () => {
    const { createApplicationSlip } = await import('@/lib/slipService')
    const result = await createApplicationSlip(SLIP_DATA, { sendEmail: true })

    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.fallbackDownloadUrl).toBe('https://example.com/slips/app-1.pdf')
  })

  it('makes no API call at all — the removed route has no replacement here', async () => {
    const { createApplicationSlip } = await import('@/lib/slipService')
    await createApplicationSlip(SLIP_DATA, { sendEmail: true })

    expect(mockApiRequest).not.toHaveBeenCalled()
  })

  it('is unchanged when the caller did not ask for an email', async () => {
    const { createApplicationSlip } = await import('@/lib/slipService')
    const result = await createApplicationSlip(SLIP_DATA)

    expect(result.emailed).toBe(false)
    expect(result.emailError).toBeUndefined()
    expect(result.fallbackDownloadUrl).toBeUndefined()
    expect(result.blob).toBeInstanceOf(Blob)
  })
})
