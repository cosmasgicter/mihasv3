/**
 * The document surface's presentation split, over its whole input space.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task **11.3**.
 * Requirements: **R13.2**, **R16.1** (320 px first, and a compact layout may not
 *               lose commands), **R16.5**.
 * Findings:     **STU-05** (*"Application document actions become a tall stack of
 *               equally prominent buttons on mobile"*; remedy: *"Present status
 *               first, one primary action, and an accessible overflow/menu for
 *               secondary document commands"*), **STU-18**.
 *
 * These are **task invariants**, not numbered spec properties — task 11.3 has no
 * numbered property-based-testing sub-task, so nothing here is recorded through
 * `update_pbt_status` and no numbered property is claimed.
 *
 * Why property tests at all for a presentation helper: the whole point of the
 * split is that **no command is lost**. A "one primary action plus an overflow"
 * design is only safe if the two halves are a genuine partition of what the
 * platform offered, for every set of documents an application can have, in every
 * order the server's list can arrive in. That is a statement about a whole input
 * space, and five of these six invariants are exactly that statement.
 *
 * **Validates: Requirements R13.2, R16.1**
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  OFFICIAL_DOCUMENT_PRIORITY,
  officialDocumentSummary,
  presentOfficialDocuments,
} from '@/lib/officialDocumentPresentation'

/**
 * The document types an application can actually have, plus one the build does
 * not know — because the server's list read publishes whatever it has, and a type
 * this build has no copy for must not be able to displace the offer letter or
 * disappear.
 */
const DOCUMENT_TYPE = fc.constantFrom(
  'acceptance_letter',
  'conditional_offer',
  'application_slip',
  'payment_receipt',
  'finance_receipt',
  'some_future_document',
)

const AVAILABLE = fc.array(DOCUMENT_TYPE, { minLength: 0, maxLength: 6 })

/** A historical set is always a subset of what is available — that is the server's shape. */
const INPUT = AVAILABLE.chain((available) =>
  fc
    .subarray(available, { minLength: 0, maxLength: available.length })
    .map((historical) => ({ available, historical })),
)

function typesOf(entries: readonly { documentType: string }[]): string[] {
  return entries.map((entry) => entry.documentType)
}

describe('presentOfficialDocuments — the primary/overflow split (task 11.3)', () => {
  it('loses no command and invents none: the two halves partition the deduped input', () => {
    fc.assert(
      fc.property(INPUT, ({ available, historical }) => {
        const presentation = presentOfficialDocuments({ available, historical })
        const rendered = presentation.primary
          ? [presentation.primary, ...presentation.secondary]
          : [...presentation.secondary]

        // `all` is exactly the primary followed by the overflow.
        expect(typesOf(presentation.all)).toEqual(typesOf(rendered))
        // Nothing is rendered twice…
        expect(new Set(typesOf(rendered)).size).toBe(rendered.length)
        // …and the set rendered is the set offered.
        expect(new Set(typesOf(rendered))).toEqual(new Set(available))
        // With nothing offered there is no primary, which is the surface's only
        // "render nothing at all" case.
        expect(presentation.primary === null).toBe(new Set(available).size === 0)
      }),
      { numRuns: 300 },
    )
  })

  it('picks the same primary whatever order the server listed the documents in', () => {
    fc.assert(
      fc.property(
        AVAILABLE.filter((available) => new Set(available).size > 0),
        fc.nat(),
        (available, seed) => {
          const rotated = [...available]
          if (rotated.length > 1) {
            const pivot = seed % rotated.length
            rotated.push(...rotated.splice(0, pivot))
          }
          const first = presentOfficialDocuments({ available })
          const second = presentOfficialDocuments({ available: rotated.reverse() })

          expect(second.primary?.documentType).toBe(first.primary?.documentType)
          expect(typesOf(second.all)).toEqual(typesOf(first.all))
        },
      ),
      { numRuns: 300 },
    )
  })

  it('never puts a lower-consequence document in front of a higher one', () => {
    const rank = (documentType: string): number => {
      const index = OFFICIAL_DOCUMENT_PRIORITY.indexOf(documentType)
      return index === -1 ? OFFICIAL_DOCUMENT_PRIORITY.length : index
    }
    fc.assert(
      fc.property(INPUT, ({ available, historical }) => {
        const { primary, all } = presentOfficialDocuments({ available, historical })
        if (!primary) return
        // The primary outranks (or ties with) everything offered…
        for (const type of available) {
          expect(rank(primary.documentType)).toBeLessThanOrEqual(rank(type))
        }
        // …and the whole list is non-decreasing in rank, so the overflow reads in
        // the same order of consequence.
        const ranks = all.map((entry) => rank(entry.documentType))
        expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
      }),
      { numRuns: 300 },
    )
  })

  it('carries the historical flag and never invents one (STU-18)', () => {
    fc.assert(
      fc.property(INPUT, ({ available, historical }) => {
        const { all } = presentOfficialDocuments({ available, historical })
        const historicalSet = new Set(historical)
        for (const entry of all) {
          expect(entry.historical).toBe(historicalSet.has(entry.documentType))
        }
      }),
      { numRuns: 300 },
    )
  })

  it('is pure: the same input answers the same thing twice', () => {
    fc.assert(
      fc.property(INPUT, ({ available, historical }) => {
        const frozenAvailable = [...available]
        const first = presentOfficialDocuments({ available, historical })
        const second = presentOfficialDocuments({ available, historical })
        expect(second).toEqual(first)
        // And the caller's array is not sorted underneath it — the surface passes
        // a memoised list and re-renders on its identity.
        expect(available).toEqual(frozenAvailable)
      }),
      { numRuns: 300 },
    )
  })

  it('says something before any control exactly when there is a control (STU-05)', () => {
    fc.assert(
      fc.property(INPUT, ({ available, historical }) => {
        const presentation = presentOfficialDocuments({ available, historical })
        const summary = officialDocumentSummary(presentation)
        expect(summary === null).toBe(presentation.primary === null)
        if (summary) {
          // The status sentence names the document the primary control acts on, so
          // "status first" and "one primary action" cannot drift apart.
          expect(summary).toContain(presentation.primary!.copy.noun)
        }
      }),
      { numRuns: 300 },
    )
  })
})
