/**
 * Property-based invariants for the client half of public tracking (task 10.5).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/`
 * Requirements: R13.12, R14
 * Findings:     STU-22
 *
 * These are **task invariants**, not numbered spec properties — task 10.5 has no
 * numbered property-based-testing sub-task, and none is claimed against the spec's
 * register. They exist because three client claims are statements about all
 * inputs, and the backend's Hypothesis suite cannot make them about this code:
 *
 * * **F1 — the client's shape test agrees with the server's, everywhere.** Over
 *   the whole generated token space, `isTrackingSecret` accepts exactly what the
 *   backend's `SECRET_PATTERN` accepts, and over the whole application-number and
 *   legacy-code space it accepts none of it. A drift here would send credentials
 *   to a server that rejects them, or worse, teach students the wrong thing.
 * * **F2 — the share URL is a pure function of the token.** For any token, the
 *   built URL has exactly one query parameter, that parameter is the token, and
 *   the token survives a `URL` round trip.
 * * **F3 — normalisation is idempotent and case-folding.** A code retyped in any
 *   case normalises to the same string, and normalising twice changes nothing.
 *
 * Validates: Requirements R13.12, R14.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  buildTrackerShareUrl,
  isTrackingSecret,
  normalizeSearchTerm,
} from '@/pages/public/tracker/utils/trackerUtils'

/** Crockford base32 — the mirror of `tracking_secret.ALPHABET`. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.split('')
const AMBIGUOUS = 'ILOU'.split('')

const segment = (length: number) =>
  fc.array(fc.constantFrom(...ALPHABET), { minLength: length, maxLength: length }).map((chars) =>
    chars.join(''),
  )

const trackingSecret = fc
  .tuple(segment(8), segment(20))
  .map(([selector, verifier]) => `TRK-${selector}-${verifier}`)

const applicationNumber = fc
  .tuple(
    fc
      .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), {
        minLength: 2,
        maxLength: 10,
      })
      .map((chars) => chars.join('')),
    fc
      .array(fc.constantFrom(...'0123456789'.split('')), { minLength: 9, maxLength: 14 })
      .map((chars) => chars.join('')),
  )
  .map(([code, digits]) => `${code}${digits}`)

const legacyTrackingCode = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), {
    minLength: 12,
    maxLength: 12,
  })
  .map((chars) => `TRK-${chars.join('')}`)

describe('F1 — the client and server agree on what a credential looks like', () => {
  it('accepts every token the platform can issue', () => {
    fc.assert(
      fc.property(trackingSecret, (code) => {
        expect(isTrackingSecret(code)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('never accepts an application number', () => {
    fc.assert(
      fc.property(applicationNumber, (number) => {
        expect(isTrackingSecret(number)).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('never accepts a legacy tracking code', () => {
    fc.assert(
      fc.property(legacyTrackingCode, (code) => {
        expect(isTrackingSecret(code)).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('never accepts a token containing an ambiguous character', () => {
    fc.assert(
      fc.property(
        trackingSecret,
        fc.integer({ min: 4, max: 32 }),
        fc.constantFrom(...AMBIGUOUS),
        (code, index, ambiguous) => {
          // Skip the two hyphen positions — replacing one changes the shape for a
          // different reason than the alphabet.
          fc.pre(code[index] !== '-')
          const mutated = code.slice(0, index) + ambiguous + code.slice(index + 1)
          expect(isTrackingSecret(mutated)).toBe(false)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('never accepts a token of the wrong length', () => {
    fc.assert(
      fc.property(trackingSecret, (code) => {
        expect(isTrackingSecret(code.slice(0, -1))).toBe(false)
        expect(isTrackingSecret(`${code}Z`)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })
})

describe('F2 — the share URL is a pure function of the token', () => {
  it('carries exactly one query parameter, and it is the token', () => {
    fc.assert(
      fc.property(trackingSecret, (code) => {
        const url = new URL(buildTrackerShareUrl(code, 'https://apply.example.edu'))
        expect([...url.searchParams.keys()]).toEqual(['code'])
        expect(url.searchParams.get('code')).toBe(code)
        expect(url.pathname).toBe('/track-application')
      }),
      { numRuns: 200 },
    )
  })

  it('round-trips: a shared URL re-opens the same tracking secret', () => {
    fc.assert(
      fc.property(trackingSecret, (code) => {
        const url = new URL(buildTrackerShareUrl(code, 'https://apply.example.edu'))
        const parsed = url.searchParams.get('code') as string
        expect(isTrackingSecret(parsed)).toBe(true)
        expect(parsed).toBe(code)
      }),
      { numRuns: 200 },
    )
  })

  it('is deterministic for a given token and origin', () => {
    fc.assert(
      fc.property(trackingSecret, (code) => {
        expect(buildTrackerShareUrl(code, 'https://apply.example.edu')).toBe(
          buildTrackerShareUrl(code, 'https://apply.example.edu'),
        )
      }),
      { numRuns: 100 },
    )
  })
})

describe('F3 — normalisation is idempotent and case-folding', () => {
  it('normalising twice changes nothing', () => {
    fc.assert(
      fc.property(trackingSecret, (code) => {
        const once = normalizeSearchTerm(code)
        expect(normalizeSearchTerm(once)).toBe(once)
      }),
      { numRuns: 200 },
    )
  })

  it('any casing normalises to the issued token', () => {
    fc.assert(
      fc.property(trackingSecret, (code) => {
        expect(normalizeSearchTerm(code.toLowerCase())).toBe(code)
        expect(normalizeSearchTerm(code.toUpperCase())).toBe(code)
      }),
      { numRuns: 200 },
    )
  })

  it('tolerates surrounding whitespace from a paste', () => {
    fc.assert(
      fc.property(trackingSecret, fc.constantFrom('', ' ', '  ', '\t', '\n'), (code, pad) => {
        expect(normalizeSearchTerm(`${pad}${code}${pad}`)).toBe(code)
      }),
      { numRuns: 200 },
    )
  })
})
