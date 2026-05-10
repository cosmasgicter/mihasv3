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

describe('createApplicationSlip email delivery', () => {
  beforeEach(() => {
    generateApplicationSlipMock.mockReset()
    persistSlipMock.mockReset()
    mockApiRequest.mockReset()
  })

  it('returns an explicit backend migration error for slip emails', async () => {
    generateApplicationSlipMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    persistSlipMock.mockResolvedValue({
      success: true,
      publicUrl: 'https://example.com/slips/app-1.pdf',
      documentId: 'doc-1',
      path: 'slips/app-1.pdf',
    })
    mockApiRequest.mockRejectedValue(new Error('Email slip endpoint not implemented'))

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
      institution_name: 'Mukuba Institute of Health and Applied Sciences',
      full_name: 'Jane Student',
      email: 'jane@example.com',
      phone: '+260971234567',
      nationality: 'Zambian',
      admin_feedback: null,
      admin_feedback_date: null,
      userId: 'user-1',
    }, { sendEmail: true })

    expect(result.emailed).toBe(false)
    expect(result.emailError).toContain('not implemented')
    expect(result.fallbackDownloadUrl).toBe('https://example.com/slips/app-1.pdf')
  })
})
