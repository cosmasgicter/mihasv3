/**
 * Property tests for the resume-hydration fill (admissions-v2 task 11.2, second
 * pass).
 *
 * The wizard hydrates a resumed draft from the application *list*, and
 * `ApplicationListSerializer` carries no personal answer beyond `full_name` /
 * `email` / `phone`. `fillDraftPersonalFieldsFromRecord` closes that gap by reading
 * the authoritative row for the answers the projection omits. These are the
 * invariants that must hold over its whole input space rather than for the examples
 * in `tests/unit/wizardDraftResume.test.ts`.
 *
 * The dangerous failure is not "a field did not arrive" — it is "a field the
 * platform held was replaced by a blank", which is the data loss §2.2 recorded. Two
 * of the four properties are about exactly that.
 *
 * Validates: Requirements R10.2 (one owner for hydration), R10.3 (the online draft
 * is authoritative and no answer is silently discarded). Finding STU-02. These are
 * task invariants, not numbered spec properties — task 11.2 has no numbered PBT
 * sub-task.
 */
import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import {
  DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST,
  fillDraftPersonalFieldsFromRecord,
} from '@/pages/student/applicationWizard/lib/draftResume'

/** The fields the list *does* carry — the projection must keep winning on these. */
const LIST_OWNED_FIELDS = ['full_name', 'email', 'phone', 'program', 'intake', 'institution'] as const

const arbField = fc.constantFrom(...DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST)

/**
 * A value as it can really arrive: a real answer, a blank, whitespace-only (which a
 * projection produces for an absent string), `null`, or absent altogether.
 */
const arbValue = fc.oneof(
  fc.string({ minLength: 1, maxLength: 12 }).filter(text => text.trim() !== ''),
  fc.constant(''),
  fc.constant('   '),
  fc.constant(null),
  fc.constant(undefined),
)

const arbRecordOfFields = (fields: readonly string[]) =>
  fc
    .array(fc.tuple(fc.constantFrom(...fields), arbValue), { maxLength: 8 })
    .map(entries => Object.fromEntries(entries) as Record<string, unknown>)

const arbListItem = fc
  .tuple(
    arbRecordOfFields(DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST),
    arbRecordOfFields(LIST_OWNED_FIELDS),
  )
  .map(([personal, owned]) => ({ id: 'app-1', ...personal, ...owned }) as Record<string, unknown>)

const arbRecord = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc
    .tuple(
      arbRecordOfFields(DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST),
      arbRecordOfFields(LIST_OWNED_FIELDS),
    )
    .map(([personal, owned]) => ({ id: 'app-1', ...personal, ...owned }) as Record<string, unknown>),
)

const present = (value: unknown) => (typeof value === 'string' ? value.trim() !== '' : value != null)

describe('fillDraftPersonalFieldsFromRecord properties', () => {
  /**
   * Property H1 — an answer the projection carries is never lost.
   *
   * This is the data-loss invariant. Whatever the row says, a present value on the
   * list item survives the fill unchanged.
   */
  it('never replaces a present list value, for any field', () => {
    fc.assert(
      fc.property(arbListItem, arbRecord, (listItem, record) => {
        const filled = fillDraftPersonalFieldsFromRecord(listItem, record)
        for (const key of Object.keys(listItem)) {
          if (present(listItem[key])) {
            expect(filled[key]).toEqual(listItem[key])
          }
        }
      }),
      { numRuns: 300 },
    )
  })

  /**
   * Property H2 — the fill only ever touches the nine fields the list omits.
   *
   * The projection stays the authority on programme, intake, institution and the
   * three personal fields it does carry, because the wizard's catalog resolution is
   * written against those values.
   */
  it('touches no field outside the omitted set', () => {
    fc.assert(
      fc.property(arbListItem, arbRecord, (listItem, record) => {
        const filled = fillDraftPersonalFieldsFromRecord(listItem, record)
        const omitted = new Set<string>(DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST)
        for (const key of new Set([...Object.keys(listItem), ...Object.keys(filled)])) {
          if (!omitted.has(key)) {
            expect(filled[key]).toEqual(listItem[key])
          }
        }
      }),
      { numRuns: 300 },
    )
  })

  /**
   * Property H3 — a blank is never written.
   *
   * A record that has nothing to say about a field leaves it exactly as it was: the
   * fill can only ever move a field from absent to present, never the other way.
   */
  it('only ever moves a field from absent to present', () => {
    fc.assert(
      fc.property(arbListItem, arbRecord, arbField, (listItem, record, field) => {
        const filled = fillDraftPersonalFieldsFromRecord(listItem, record)
        if (present(listItem[field])) return
        if (!record || !present(record[field])) {
          expect(filled[field]).toEqual(listItem[field])
        } else {
          expect(filled[field]).toEqual(record[field])
        }
      }),
      { numRuns: 300 },
    )
  })

  /** Property H4 — pure and idempotent: the second fill has nothing left to do. */
  it('is idempotent and does not mutate its input', () => {
    fc.assert(
      fc.property(arbListItem, arbRecord, (listItem, record) => {
        const before = JSON.stringify(listItem)
        const once = fillDraftPersonalFieldsFromRecord(listItem, record)
        const twice = fillDraftPersonalFieldsFromRecord(once, record)
        expect(twice).toEqual(once)
        expect(JSON.stringify(listItem)).toBe(before)
      }),
      { numRuns: 300 },
    )
  })
})
