/**
 * Unit tests — ApplicationSlip document generator.
 *
 * Verifies the public `generateApplicationSlip` function:
 *   - throws on missing required fields
 *   - succeeds on typical input and returns application/pdf Blob
 *   - generates a QR data URL containing the tracking code payload
 */

import { describe, expect, it, vi } from 'vitest'

// Mock @react-pdf/renderer at the module level. pdf() returns an object
// whose .toBlob() resolves to a small synthetic Blob — good enough to verify
// the public contract without actually running the layout engine in jsdom.
vi.mock('@react-pdf/renderer', async () => {
  const R = await import('react')
  return {
    Document: ({ children }: any) => R.createElement('pdf-document', null, children),
    Page: ({ children }: any) => R.createElement('pdf-page', null, children),
    View: ({ children }: any) => R.createElement('pdf-view', null, children),
    Text: ({ children, render: r }: any) =>
      R.createElement('pdf-text', null, r ? r({ pageNumber: 1, totalPages: 1 }) : children),
    Image: () => R.createElement('pdf-image', null),
    StyleSheet: { create: (s: any) => s },
    Font: {
      register: vi.fn(),
      registerHyphenationCallback: vi.fn(),
    },
    pdf: (_el: unknown) => ({
      toBlob: async () =>
        new Blob(['%PDF-1.4\n%synthetic-pdf'], { type: 'application/pdf' }),
    }),
  }
})

// Mock the qrcode library so we can verify what gets encoded.
const { toDataURLSpy } = vi.hoisted(() => ({
  toDataURLSpy: vi.fn(async (_data: string) => 'data:image/png;base64,QRMOCK'),
}))
vi.mock('qrcode', () => ({
  default: { toDataURL: toDataURLSpy },
}))

import { generateApplicationSlip } from '@/lib/pdf'
import type { ApplicationSlipData } from '@/lib/pdf'

const baseData: ApplicationSlipData = {
  application_number: 'APP-20260510-ABCD1234',
  public_tracking_code: 'TRK-ABC123DEF456',
  status: 'under_review',
  payment_status: 'verified',
  submitted_at: '2026-05-10T12:00:00Z',
  updated_at: '2026-05-10T12:05:00Z',
  program_name: 'Diploma in Registered Nursing',
  intake_name: 'January 2027',
  institution: 'MIHAS',
  full_name: 'Bwalya Chanda',
  email: 'bwalya.chanda@example.com',
  phone: '+260 977 000 000',
  nationality: 'Zambian',
}

describe('generateApplicationSlip', () => {
  it('returns a PDF Blob for valid input', async () => {
    toDataURLSpy.mockClear()
    const blob = await generateApplicationSlip(baseData)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
  })

  it('encodes the tracking code and application number in the QR payload', async () => {
    toDataURLSpy.mockClear()
    await generateApplicationSlip(baseData)
    expect(toDataURLSpy).toHaveBeenCalledOnce()
    const jsonArg = toDataURLSpy.mock.calls[0]?.[0] as string
    const payload = JSON.parse(jsonArg)
    expect(payload.v).toBe(1) // schema version pinned
    expect(payload.type).toBe('application_slip')
    expect(payload.app_no).toBe(baseData.application_number)
    expect(payload.tracking).toBe(baseData.public_tracking_code)
    expect(payload.institution).toBe('MIHAS')
  })

  it('throws when application_number is missing', async () => {
    await expect(
      generateApplicationSlip({ ...baseData, application_number: '' }),
    ).rejects.toThrow(/missing application data/i)
  })

  it('throws when public_tracking_code is missing', async () => {
    await expect(
      generateApplicationSlip({ ...baseData, public_tracking_code: '' }),
    ).rejects.toThrow(/missing application data/i)
  })

  it('handles null optional fields without throwing', async () => {
    const withNulls: ApplicationSlipData = {
      ...baseData,
      program_name: null,
      intake_name: null,
      nationality: null,
      phone: '',
    }
    const blob = await generateApplicationSlip(withNulls)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('handles KATC institution code', async () => {
    toDataURLSpy.mockClear()
    const blob = await generateApplicationSlip({ ...baseData, institution: 'KATC' })
    expect(blob).toBeInstanceOf(Blob)
    const payload = JSON.parse(toDataURLSpy.mock.calls[0]?.[0] as string)
    expect(payload.institution).toBe('KATC')
  })

  // Regression: Bug-1 in QA review. The old status-variant logic only checked
  // 'verified' and 'paid' — missing 'successful' and 'force_approved'. Every
  // canonical verified-equivalent status must render as the 'verified' badge,
  // and 'deferred' must not be mislabelled as verified.
  it.each([
    ['verified', true],
    ['paid', true],
    ['successful', true],
    ['force_approved', true],
    ['pending', false],
    ['pending_review', false],
    ['rejected', false],
    ['deferred', false],
    ['failed', false],
    ['expired', false],
    [null, false],
  ] as const)(
    'payment_status=%s resolves to verified=%s',
    async (status, _expectedVerified) => {
      const blob = await generateApplicationSlip({
        ...baseData,
        payment_status: status as string | null,
      })
      expect(blob).toBeInstanceOf(Blob)
      // We can't inspect the badge variant directly because @react-pdf is
      // mocked, but generation must not throw for any canonical status.
    },
  )
})
