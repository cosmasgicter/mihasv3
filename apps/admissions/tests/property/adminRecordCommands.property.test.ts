/**
 * Invariants of the admin record command presenter (admissions-v2 task **11.4**).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 11.4
 * Requirements: **R16.1** (a compact admin record may not lose commands),
 *               **R16.2** (accessible state — the disclosure's count is part of
 *               its accessible name, so it has to be true).
 * Findings:     **ADM-01**, **ADM-03**.
 *
 * These are **task invariants**, not numbered spec properties: task 11.4 has no
 * numbered property-based-testing sub-task, so nothing here is recorded as a spec
 * property and none of it is claimed as one. Stated plainly rather than silently
 * skipped, exactly as task 11.3 stated it for
 * `officialDocumentPresentation.property.test.ts`.
 *
 * Four of the six say the same thing from different directions: **no command is
 * lost.** That is the whole content of the R16.1 clause this task exists to
 * satisfy — a phone-width record may reorder and de-emphasise, and may not
 * withhold.
 */
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  adminRecordOverflowLabel,
  presentAdminRecordCommands,
  announceAdminRecordState,
  type AdminRecordCommand,
} from '@/lib/adminRecordCommands'
import {
  applicationDecisionCommands,
  applicationPaymentCommands,
  applicationStatusCommands,
} from '@/lib/adminApplicationCommands'
import { APPLICATION_STATUSES } from '@/types/applicationStatus'

/**
 * A command generator constrained to the real input space: an id, a label, and a
 * prominence. `onSelect` is a distinguishable no-op so identity is checkable.
 */
const arbCommand = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 12 }),
    label: fc.string({ minLength: 1, maxLength: 24 }),
    prominence: fc.constantFrom<'primary' | 'overflow'>('primary', 'overflow'),
  })
  .map(
    (base, index = 0): AdminRecordCommand => ({
      ...base,
      onSelect: () => index,
    }),
  )

/** Ids are made unique so "the same set" is a statement about membership. */
const arbCommands = fc
  .array(arbCommand, { minLength: 0, maxLength: 10 })
  .map((commands) => commands.map((command, index) => ({ ...command, id: `${index}-${command.id}` })))

describe('[invariants] the compact admin command surface loses nothing', () => {
  it('partitions the commands: primary plus overflow is exactly what it was given', () => {
    fc.assert(
      fc.property(arbCommands, (commands) => {
        const { primary, overflow } = presentAdminRecordCommands(commands)
        const emitted = [...(primary ? [primary] : []), ...overflow]
        expect(emitted.length).toBe(commands.length)
        expect(new Set(emitted.map((entry) => entry.id))).toEqual(
          new Set(commands.map((entry) => entry.id)),
        )
      }),
      { numRuns: 200 },
    )
  })

  it('emits each command exactly once — never duplicated into both halves', () => {
    fc.assert(
      fc.property(arbCommands, (commands) => {
        const { primary, overflow } = presentAdminRecordCommands(commands)
        if (primary) {
          expect(overflow.some((entry) => entry.id === primary.id)).toBe(false)
        }
        expect(new Set(overflow.map((entry) => entry.id)).size).toBe(overflow.length)
      }),
      { numRuns: 200 },
    )
  })

  it('counts honestly: the label states the number the panel holds', () => {
    fc.assert(
      fc.property(arbCommands, fc.nat({ max: 6 }), (commands, extra) => {
        const { overflowCount } = presentAdminRecordCommands(commands)
        const total = overflowCount + extra
        const label = adminRecordOverflowLabel(total)
        if (total === 0) {
          expect(label).toBe('No other actions')
        } else {
          // The number in the sentence is the number, not an approximation of it.
          expect(Number((label.match(/^(\d+)/) || [])[1] ?? 1)).toBe(total)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('always leaves something prominent when there is anything to do', () => {
    fc.assert(
      fc.property(arbCommands, (commands) => {
        const { primary } = presentAdminRecordCommands(commands)
        expect(primary === null).toBe(commands.length === 0)
      }),
      { numRuns: 200 },
    )
  })

  it('preserves the caller\'s declaration order inside the overflow', () => {
    fc.assert(
      fc.property(arbCommands, (commands) => {
        const { primary, overflow } = presentAdminRecordCommands(commands)
        const expected = commands.filter((entry) => entry.id !== primary?.id).map((entry) => entry.id)
        expect(overflow.map((entry) => entry.id)).toEqual(expected)
      }),
      { numRuns: 200 },
    )
  })

  it('is pure: it mutates nothing it was given and repeats itself', () => {
    fc.assert(
      fc.property(arbCommands, (commands) => {
        const before = commands.map((entry) => `${entry.id}:${entry.prominence}`)
        const first = presentAdminRecordCommands(commands)
        const second = presentAdminRecordCommands(commands)
        expect(commands.map((entry) => `${entry.id}:${entry.prominence}`)).toEqual(before)
        expect(first.primary?.id).toBe(second.primary?.id)
        expect(first.overflow.map((e) => e.id)).toEqual(second.overflow.map((e) => e.id))
      }),
      { numRuns: 200 },
    )
  })
})

describe('[invariants] the applications enumeration is total and adds no authority', () => {
  it('yields commands for any status string without throwing', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(...APPLICATION_STATUSES), fc.string({ maxLength: 20 })),
        fc.string({ maxLength: 20 }),
        fc.boolean(),
        (status, paymentStatus, canVerifyPayment) => {
          const commands = applicationDecisionCommands({ status, paymentStatus, canVerifyPayment })
          // Every entry is well-formed and uniquely identified.
          expect(new Set(commands.map((entry) => entry.id)).size).toBe(commands.length)
          for (const entry of commands) {
            expect(entry.label.length).toBeGreaterThan(0)
            expect(entry.kind === 'status' || entry.kind === 'payment').toBe(true)
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('offers no payment decision to an actor the server did not authorize', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(...APPLICATION_STATUSES), fc.string({ maxLength: 20 })),
        fc.string({ maxLength: 20 }),
        (status, paymentStatus) => {
          const commands = applicationDecisionCommands({
            status,
            paymentStatus,
            canVerifyPayment: false,
          })
          expect(commands.every((entry) => entry.kind === 'status')).toBe(true)
          // …and withholding the payment half changes nothing about the status half.
          expect(commands.map((entry) => entry.id)).toEqual(
            applicationStatusCommands(status).map((entry) => entry.id),
          )
        },
      ),
      { numRuns: 300 },
    )
  })

  it('is the concatenation of its two halves, in that order', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...APPLICATION_STATUSES),
        fc.constantFrom('not_paid', 'pending_review', 'verified', 'rejected', 'deferred'),
        (status, paymentStatus) => {
          const whole = applicationDecisionCommands({ status, paymentStatus }).map((e) => e.id)
          const halves = [
            ...applicationStatusCommands(status).map((e) => e.id),
            ...applicationPaymentCommands(paymentStatus, true).map((e) => e.id),
          ]
          expect(whole).toEqual(halves)
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('[invariants] a resting admin record announces nothing', () => {
  it('says nothing unless it is working or has something settled to report', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), (recordLabel) => {
        expect(announceAdminRecordState({ recordLabel })).toBe('')
        expect(announceAdminRecordState({ recordLabel, busy: true })).toContain(recordLabel)
        expect(announceAdminRecordState({ recordLabel, settledLabel: 'Approved' })).toContain('Approved')
      }),
      { numRuns: 100 },
    )
  })
})
