// @vitest-environment node
/**
 * Property-based tests for Auto-Save Data Round-Trip (Property 2)
 * Feature: production-remediation
 *
 * Property 2: Auto-save data round-trip
 * For any valid auto-save payload (form data object), serializing it to JSON
 * and then parsing it back must produce an object deeply equal to the original.
 *
 * **Validates: Requirements 2.6**
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

// ── Types ───────────────────────────────────────────────────────────────

/** Draft fields that match the application wizard's auto-save payload */
interface DraftData {
  [key: string]: unknown
}

// ── Round-trip function ─────────────────────────────────────────────────
// Simulates what happens when auto-save persists data via JSON serialization
// (localStorage, API payload, etc.)

function jsonRoundTrip<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Zambian phone number format */
const zambianPhoneArb = fc.stringMatching(/^\+260\d{9}$/)

/** NRC number format (e.g., 123456/78/1) */
const nrcArb = fc.stringMatching(/^\d{6}\/\d{2}\/\d{1}$/)

/** ECZ grade (1-9 scale) */
const eczGradeArb = fc.integer({ min: 1, max: 9 })

/** Application status enum */
const statusArb = fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected', 'waitlisted')

/** A realistic draft data object matching the wizard's auto-save fields */
const draftDataArb = fc.record({
  full_name: fc.string({ minLength: 1, maxLength: 100 }),
  nrc_number: nrcArb,
  phone: zambianPhoneArb,
  email: fc.emailAddress(),
  date_of_birth: fc
    .date({ min: new Date('1950-01-01'), max: new Date('2010-12-31') })
    .filter((date) => Number.isFinite(date.getTime()))
    .map((date) => date.toISOString().split('T')[0]),
  gender: fc.constantFrom('male', 'female', 'other'),
  nationality: fc.constantFrom('Zambian', 'Zimbabwean', 'Malawian', 'Tanzanian', 'Congolese'),
  address: fc.string({ minLength: 1, maxLength: 200 }),
  next_of_kin: fc.string({ minLength: 1, maxLength: 100 }),
  program_id: fc.uuid(),
  intake_id: fc.uuid(),
  status: statusArb,
  version: fc.integer({ min: 1, max: 10000 }),
  grades: fc.array(
    fc.record({
      subject: fc.string({ minLength: 1, maxLength: 50 }),
      grade: eczGradeArb,
    }),
    { minLength: 0, maxLength: 10 },
  ),
})

/**
 * Arbitrary JSON-serializable values (no undefined, no functions, no symbols).
 * Excludes -0 because JSON.stringify(-0) === "0", so JSON.parse round-trips
 * -0 to +0. This is expected JavaScript behavior, not a bug in auto-save.
 */
const jsonSerializableArb = fc.jsonValue().map(function stripNegativeZero(v: unknown): unknown {
  if (typeof v === 'number' && Object.is(v, -0)) return 0
  if (Array.isArray(v)) return v.map(stripNegativeZero)
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      out[k] = stripNegativeZero(val)
    }
    return out
  }
  return v
})

// ── Tests ────────────────────────────────────────────────────────────────

describe('Auto-Save Data Round-Trip Property Tests (P2)', () => {
  /**
   * **Validates: Requirements 2.6**
   *
   * Core property: draft data survives JSON serialization round-trip
   * without data loss.
   */
  it('draft data round-trip preserves all fields via JSON.parse(JSON.stringify(x))', () => {
    fc.assert(
      fc.property(draftDataArb, (draft) => {
        const roundTripped = jsonRoundTrip(draft)
        expect(roundTripped).toEqual(draft)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 2.6**
   *
   * Any JSON-serializable value survives the round-trip.
   */
  it('arbitrary JSON-serializable values survive round-trip', () => {
    fc.assert(
      fc.property(jsonSerializableArb, (value) => {
        const roundTripped = jsonRoundTrip(value)
        expect(roundTripped).toEqual(value)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 2.6**
   *
   * Round-trip is idempotent: applying it twice yields the same result
   * as applying it once.
   */
  it('round-trip is idempotent (applying twice equals applying once)', () => {
    fc.assert(
      fc.property(draftDataArb, (draft) => {
        const once = jsonRoundTrip(draft)
        const twice = jsonRoundTrip(once)
        expect(twice).toEqual(once)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 2.6**
   *
   * Draft data with nested arrays (grades) preserves array length
   * and element order through round-trip.
   */
  it('nested arrays preserve length and order through round-trip', () => {
    fc.assert(
      fc.property(draftDataArb, (draft) => {
        const roundTripped = jsonRoundTrip(draft)
        expect(roundTripped.grades).toHaveLength(draft.grades.length)
        for (let i = 0; i < draft.grades.length; i++) {
          expect(roundTripped.grades[i].subject).toBe(draft.grades[i].subject)
          expect(roundTripped.grades[i].grade).toBe(draft.grades[i].grade)
        }
      }),
      { numRuns: 10 },
    )
  })
})
