/**
 * Unit tests — QR payload builder.
 *
 * Pinning the schema shape here is the cheapest way to catch drift:
 * if anyone reorders fields or drops the version, the test fails loudly.
 */

import { describe, expect, it } from 'vitest'

import { QR_PAYLOAD_VERSION, buildQrPayload } from '@/lib/pdf/qr'

describe('buildQrPayload', () => {
  it('exposes the current schema version', () => {
    expect(QR_PAYLOAD_VERSION).toBe(1)
  })

  it('always emits v as the first key', () => {
    const out = buildQrPayload({ type: 'application_slip', app_no: 'APP-1' })
    const keys = Object.keys(out)
    expect(keys[0]).toBe('v')
    expect(out.v).toBe(1)
  })

  it('preserves all caller-supplied fields', () => {
    const out = buildQrPayload({
      type: 'payment_receipt',
      receipt_no: 'RCP-001',
      amount: 150,
      currency: 'ZMW',
    })
    expect(out.type).toBe('payment_receipt')
    expect(out.receipt_no).toBe('RCP-001')
    expect(out.amount).toBe(150)
    expect(out.currency).toBe('ZMW')
  })

  it('coerces undefined to null so JSON.stringify does not drop fields', () => {
    const out = buildQrPayload({
      type: 'acceptance_letter',
      student: undefined,
      institution: null,
    })
    expect(out.student).toBeNull()
    expect(out.institution).toBeNull()
  })

  it('produces JSON-stringifiable output (no symbols, no functions)', () => {
    const out = buildQrPayload({ type: 'acceptance_letter', app_no: 'X' })
    expect(() => JSON.stringify(out)).not.toThrow()
    const parsed = JSON.parse(JSON.stringify(out))
    expect(parsed.v).toBe(1)
    expect(parsed.type).toBe('acceptance_letter')
  })
})
