import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()
const generateApplicationSlipMock = vi.fn()
const persistSlipMock = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: {
    request: requestMock,
  },
}))

vi.mock('@/lib/applicationSlip', () => ({
  generateApplicationSlip: generateApplicationSlipMock,
  persistSlip: persistSlipMock,
}))

describe('createApplicationSlip email delivery', () => {
  beforeEach(() => {
    requestMock.mockReset()
    generateApplicationSlipMock.mockReset()
    persistSlipMock.mockReset()
  })

  it('queues slip emails through the applications email-slip endpoint with constrained payload', async () => {
    generateApplicationSlipMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    persistSlipMock.mockResolvedValue({
      success: true,
      publicUrl: 'https://example.com/slips/app-1.pdf',
      documentId: 'doc-1',
      path: 'slips/app-1.pdf',
    })
    requestMock.mockResolvedValue({
      emailed: true,
      queuedId: 'email-1',
      fallbackDownloadUrl: 'https://example.com/slips/app-1.pdf',
    })

    const { createApplicationSlip } = await import('@/lib/slipService')
    const result = await createApplicationSlip({
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
      institution_name: 'Mukuba Institute of Health and Allied Sciences',
      full_name: 'Jane Student',
      email: 'jane@example.com',
      phone: '+260971234567',
      nationality: 'Zambian',
      admin_feedback: null,
      admin_feedback_date: null,
      userId: 'user-1',
    }, { sendEmail: true })

    expect(result.emailError).toBeUndefined()
    expect(result.emailed).toBe(true)
    expect(result.queuedId).toBe('email-1')
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock.mock.calls[0]?.[0]).toBe('/api/applications?action=email-slip')

    const options = requestMock.mock.calls[0]?.[1] as { method: string; body: string }
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body)
    expect(body).toEqual({
      applicationId: 'app-1',
      recipientEmail: 'jane@example.com',
      slipUrl: 'https://example.com/slips/app-1.pdf',
      slipDocumentReference: 'doc-1',
    })
  })

  it('returns an email error and fallback URL when queueing fails', async () => {
    generateApplicationSlipMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    persistSlipMock.mockResolvedValue({
      success: true,
      publicUrl: 'https://example.com/slips/app-2.pdf',
      documentId: 'doc-2',
      path: 'slips/app-2.pdf',
    })
    requestMock.mockRejectedValue(new Error('Queue service unavailable'))

    const { createApplicationSlip } = await import('@/lib/slipService')
    const result = await createApplicationSlip({
      application_number: 'MIHAS000002',
      application_id: 'app-2',
      public_tracking_code: 'TRK88888',
      status: 'submitted',
      payment_status: 'pending_review',
      submitted_at: '2026-03-07T12:00:00.000Z',
      updated_at: '2026-03-07T12:00:00.000Z',
      program_name: 'Diploma in Registered Nursing',
      intake_name: 'January 2026',
      institution: 'MIHAS',
      institution_name: 'Mukuba Institute of Health and Allied Sciences',
      full_name: 'Jane Student',
      email: 'jane@example.com',
      phone: '+260971234567',
      nationality: 'Zambian',
      admin_feedback: null,
      admin_feedback_date: null,
      userId: 'user-1',
    }, { sendEmail: true })

    expect(result.emailed).toBe(false)
    expect(result.emailError).toContain('Queue service unavailable')
    expect(result.fallbackDownloadUrl).toBe('https://example.com/slips/app-2.pdf')
  })
})
