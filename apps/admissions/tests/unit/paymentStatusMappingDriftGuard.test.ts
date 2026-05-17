/**
 * Drift-guard: asserts frontend normalizePaymentStatus matches the
 * canonical PAYMENT_TO_APP_MAP from backend/apps/documents/payment_service.py.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { normalizePaymentStatus } from '@/lib/paymentStatus'
import { PAYMENT_TO_APP_MAP, CANONICAL_PAYMENT_STATUSES } from '@/lib/__fixtures__/paymentStatusBackendMirror'

function parseBackendMap(): Record<string, string> {
  const filePath = resolve(__dirname, '../../../../backend/apps/documents/payment_service.py')
  const content = readFileSync(filePath, 'utf-8')

  // Extract PAYMENT_TO_APP_MAP block
  const mapStart = content.indexOf('PAYMENT_TO_APP_MAP: dict[str, str] = {')
  expect(mapStart).toBeGreaterThan(-1)

  const blockStart = content.indexOf('{', mapStart)
  const blockEnd = content.indexOf('}', blockStart)
  const block = content.slice(blockStart + 1, blockEnd)

  const map: Record<string, string> = {}
  const entryPattern = /^\s*"(\w+)":\s*"(\w+)"/gm
  let match: RegExpExecArray | null
  while ((match = entryPattern.exec(block)) !== null) {
    map[match[1]] = match[2]
  }
  return map
}

describe('Payment Status Mapping Drift Guard', () => {
  const backendMap = parseBackendMap()

  it('backend PAYMENT_TO_APP_MAP is parseable and non-empty', () => {
    expect(Object.keys(backendMap).length).toBeGreaterThanOrEqual(6)
  })

  it('fixture matches parsed backend map', () => {
    expect(PAYMENT_TO_APP_MAP).toEqual(backendMap)
  })

  it('fixture covers all canonical statuses', () => {
    const parsedKeys = Object.keys(backendMap).sort()
    expect(CANONICAL_PAYMENT_STATUSES).toEqual(parsedKeys)
  })

  it('normalizePaymentStatus agrees with PAYMENT_TO_APP_MAP for every canonical status', () => {
    // Backend map uses 'not_paid' and 'pending_review' as derived values.
    // Frontend normalizePaymentStatus uses the same canonical names for output.
    const frontendToBackendOutput: Record<string, string> = {
      verified: 'verified',
      rejected: 'failed',
      not_paid: 'not_paid',
      deferred: 'deferred',
      pending_review: 'pending_review',
    }

    for (const [canonicalStatus, expectedAppStatus] of Object.entries(backendMap)) {
      const frontendResult = normalizePaymentStatus(canonicalStatus)
      const mappedBackend = frontendToBackendOutput[frontendResult]
      expect(
        mappedBackend,
        `normalizePaymentStatus("${canonicalStatus}") returned "${frontendResult}" which maps to "${mappedBackend}", expected "${expectedAppStatus}"`
      ).toBe(expectedAppStatus)
    }
  })

  it('force_approved normalizes to verified on frontend', () => {
    expect(normalizePaymentStatus('force_approved')).toBe('verified')
  })
})
