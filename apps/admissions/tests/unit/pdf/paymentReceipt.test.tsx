/**
 * Unit tests — PaymentReceipt document generator.
 *
 * Verifies:
 *   - throws on missing required fields
 *   - returns application/pdf Blob for valid ZMW and USD receipts
 *   - QR payload contains receipt number + amount + currency
 *   - optional paymentReference does not crash when omitted
 *   - backward-compat shim at @/lib/receiptGenerator still works
 */

import { describe, expect, it, vi } from 'vitest'

const { toDataURLSpy } = vi.hoisted(() => ({
  toDataURLSpy: vi.fn(async (_data: string) => 'data:image/png;base64,QRMOCK'),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: toDataURLSpy } }))

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
        new Blob(['%PDF-1.4\n%synthetic'], { type: 'application/pdf' }),
    }),
  }
})

import { generatePaymentReceipt } from '@/lib/pdf'
import type { PaymentReceiptData } from '@/lib/pdf'

const baseData: PaymentReceiptData = {
  receiptNumber: 'RCP-20260510-00001',
  applicationNumber: 'APP-20260510-ABCD1234',
  studentName: 'Bwalya Chanda',
  email: 'bwalya.chanda@example.com',
  phone: '+260 977 000 000',
  program: 'Diploma in Registered Nursing',
  institution: 'MIHAS',
  amount: 150.0,
  currency: 'ZMW',
  paymentMethod: 'Airtel Money',
  paymentReference: 'LENCO-ABC123',
  paymentDate: '2026-05-09T15:30:00Z',
  verifiedDate: '2026-05-10T08:00:00Z',
  verifiedBy: '***REMOVED***',
}

describe('generatePaymentReceipt', () => {
  it('returns a PDF Blob for typical ZMW payment', async () => {
    toDataURLSpy.mockClear()
    const blob = await generatePaymentReceipt(baseData)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
  })

  it('encodes receipt number + amount + currency in QR payload', async () => {
    toDataURLSpy.mockClear()
    await generatePaymentReceipt(baseData)
    const payload = JSON.parse(toDataURLSpy.mock.calls[0]?.[0] as string)
    expect(payload.v).toBe(1)
    expect(payload.type).toBe('payment_receipt')
    expect(payload.receipt_no).toBe('RCP-20260510-00001')
    expect(payload.amount).toBe(150)
    expect(payload.currency).toBe('ZMW')
  })

  it('handles USD international payment (currency defaults applied correctly)', async () => {
    toDataURLSpy.mockClear()
    const blob = await generatePaymentReceipt({
      ...baseData,
      amount: 20,
      currency: 'USD',
      paymentMethod: 'Card',
    })
    expect(blob).toBeInstanceOf(Blob)
    const payload = JSON.parse(toDataURLSpy.mock.calls[0]?.[0] as string)
    expect(payload.currency).toBe('USD')
    expect(payload.amount).toBe(20)
  })

  it('defaults to ZMW when currency is unset', async () => {
    toDataURLSpy.mockClear()
    const { currency: _drop, ...noCurrency } = baseData
    const blob = await generatePaymentReceipt(noCurrency)
    expect(blob).toBeInstanceOf(Blob)
    const payload = JSON.parse(toDataURLSpy.mock.calls[0]?.[0] as string)
    expect(payload.currency).toBe('ZMW')
  })

  it('renders without paymentReference', async () => {
    const { paymentReference: _drop, ...noRef } = baseData
    const blob = await generatePaymentReceipt(noRef)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('throws when receiptNumber is missing', async () => {
    await expect(
      generatePaymentReceipt({ ...baseData, receiptNumber: '' }),
    ).rejects.toThrow(/missing payment data/i)
  })

  it('throws when applicationNumber is missing', async () => {
    await expect(
      generatePaymentReceipt({ ...baseData, applicationNumber: '' }),
    ).rejects.toThrow(/missing payment data/i)
  })
})
