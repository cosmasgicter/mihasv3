/**
 * Unit test — idempotency-key header is present per submission (Task 36.5).
 *
 * Scope
 * -----
 * Verifies that `initiateMobileMoney` and `initiatePayment` in
 * `@/services/payments` forward the supplied `idempotencyKey` as an
 * HTTP `idempotency-key` header, and that two successive calls carry
 * DISTINCT key values in the documented
 * `pay-<applicationId[0..8]>-<uuid>` shape.
 *
 * The `idempotency-key` header is the replay-protection primitive
 * routed through the backend `@idempotent` decorator — two different
 * keys let the student retry a genuinely new attempt, and identical
 * keys short-circuit the replay into the cached response.
 *
 * Validates: Requirements R14.1.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { generateIdempotencyKey } from '@/lib/paymentStatus'
import { apiClient } from '@/services/client'
import { initiateMobileMoney, initiatePayment } from '@/services/payments'

const APPLICATION_ID = '8c5d3bde-9b14-4ef6-9d25-0adeff0ef911'
// The first 8 chars of the UUID above; used to pin the key prefix.
const APPLICATION_ID_PREFIX = APPLICATION_ID.slice(0, 8)

// Regex from the spec text — matches ``pay-<app8>-<uuid>``. The trailing
// segment may be a v4 UUID (crypto.randomUUID()) OR the legacy
// Math.random fallback — the helper marks the fallback branch with a
// LEGACY FALLBACK comment in paymentStatus.ts.
const KEY_SHAPE = /^pay-[0-9a-f]{8}-[A-Za-z0-9-]{8,}$/

type CapturedCall = {
  endpoint: string
  init: RequestInit & { headers?: Record<string, string> }
}

describe('payments service — idempotency-key header per submission', () => {
  let captured: CapturedCall[]
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    captured = []

    // Mock apiClient.request so we can inspect the headers without
    // needing to stand up CSRF, cookies, or network.
    spy = vi
      .spyOn(apiClient, 'request')
      .mockImplementation(async (endpoint: unknown, init?: unknown) => {
        captured.push({
          endpoint: String(endpoint),
          init: (init ?? {}) as RequestInit & {
            headers?: Record<string, string>
          },
        })
        return { success: true, data: { reference: 'ref', amount: '153', currency: 'ZMW', payment_id: 'p' } }
      })
  })

  afterEach(() => {
    spy.mockRestore()
  })

  it('initiateMobileMoney forwards the idempotency-key header', async () => {
    const key = generateIdempotencyKey(APPLICATION_ID)

    await initiateMobileMoney(
      { application_id: APPLICATION_ID, phone: '+260977000000' },
      { idempotencyKey: key },
    )

    expect(captured).toHaveLength(1)
    const headers = captured[0]?.init?.headers as Record<string, string> | undefined
    expect(headers).toBeDefined()
    expect(headers!['idempotency-key']).toBe(key)
  })

  it('initiatePayment forwards the idempotency-key header', async () => {
    const key = generateIdempotencyKey(APPLICATION_ID)

    await initiatePayment({ application_id: APPLICATION_ID }, { idempotencyKey: key })

    expect(captured).toHaveLength(1)
    const headers = captured[0]?.init?.headers as Record<string, string> | undefined
    expect(headers).toBeDefined()
    expect(headers!['idempotency-key']).toBe(key)
  })

  it('omits the header when no idempotencyKey is supplied', async () => {
    await initiateMobileMoney({
      application_id: APPLICATION_ID,
      phone: '+260977000000',
    })

    expect(captured).toHaveLength(1)
    const headers = (captured[0]?.init?.headers ?? undefined) as
      | Record<string, string>
      | undefined
    if (headers) {
      expect(headers['idempotency-key']).toBeUndefined()
    }
  })

  it('two successive submissions carry distinct keys in the documented shape', async () => {
    const keyA = generateIdempotencyKey(APPLICATION_ID)
    const keyB = generateIdempotencyKey(APPLICATION_ID)

    await initiateMobileMoney(
      { application_id: APPLICATION_ID, phone: '+260977000000' },
      { idempotencyKey: keyA },
    )
    await initiateMobileMoney(
      { application_id: APPLICATION_ID, phone: '+260977000000' },
      { idempotencyKey: keyB },
    )

    expect(captured).toHaveLength(2)
    const headerA = (captured[0]!.init.headers as Record<string, string>)['idempotency-key']
    const headerB = (captured[1]!.init.headers as Record<string, string>)['idempotency-key']

    expect(headerA).toBe(keyA)
    expect(headerB).toBe(keyB)
    expect(headerA).not.toBe(headerB)

    for (const header of [headerA, headerB]) {
      expect(header).toMatch(KEY_SHAPE)
      expect(header.startsWith(`pay-${APPLICATION_ID_PREFIX}-`)).toBe(true)
    }
  })
})
