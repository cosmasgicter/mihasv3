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

  it('queues slip emails through the API email endpoint', async () => {
    generateApplicationSlipMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    persistSlipMock.mockResolvedValue({
      success: true,
      publicUrl: 'https://example.com/slips/app-1.pdf',
      documentId: 'doc-1',
      path: 'slips/app-1.pdf',
    })
    requestMock.mockResolvedValue({ queued: true, id: 'email-1' })

    const { createApplicationSlip } = await import('@/lib/slipService')
    const result = await createApplicationSlip({
      application_number: 'MIHAS000001',
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
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock.mock.calls[0]?.[0]).toBe('/api/email?action=send')

    const options = requestMock.mock.calls[0]?.[1] as { method: string; body: string }
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body)
    expect(body.recipient_email).toBe('jane@example.com')
    expect(body.recipient_name).toBe('Jane Student')
    expect(body.subject).toBe('Your MIHAS application slip')
    expect(body.template_name).toBe('generic')
    expect(body.template_data.actionUrl).toBe('https://example.com/slips/app-1.pdf')
  })
})
