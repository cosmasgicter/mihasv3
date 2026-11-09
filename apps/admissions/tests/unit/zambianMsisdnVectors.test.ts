/**
 * Drift guard: frontend MSISDN handling against the shared vectors.
 *
 * Spec: student-journey-repair task 3.27, clause 2.42 (design R8-b). The same
 * fixture is read by backend/tests/unit/test_zambian_msisdn_vectors.py, so the
 * two normalisers (and the two registration pre-checks) cannot drift.
 */
import { describe, expect, it } from 'vitest'
import vectors from './__fixtures__/zambianMsisdnVectors.json'
import { normalizeZambianMsisdn, registrationPhoneSchema } from '@/lib/zambianMsisdn'

describe('zambian MSISDN shared vectors', () => {
  it.each(vectors.normalise)('normalises %j', ({ input, expected }) => {
    expect(normalizeZambianMsisdn(input)).toBe(expected)
  })

  it.each(vectors.registrationRefused)('registration refuses %j', (input) => {
    expect(registrationPhoneSchema.safeParse(input).success).toBe(false)
  })

  it.each(vectors.registrationAccepted)('registration accepts %j', ({ input, expected }) => {
    const parsed = registrationPhoneSchema.safeParse(input)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toBe(expected)
  })

  it('never stores +260 plus six digits as +260260...', () => {
    expect(registrationPhoneSchema.safeParse('+260977123').success).toBe(false)
  })
})
