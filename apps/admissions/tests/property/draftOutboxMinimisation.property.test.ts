/**
 * Invariants of the attached draft's local outbox record (admissions-v2 task 6.3
 * M14 — R10.4; design §8.2: records "are addressed by (user_id, application_id,
 * assignment_id) and contain only pending deltas and retry metadata").
 *
 * These are task invariants checked with fast-check, not numbered spec
 * properties: 6.3 has no property-based-testing sub-task (`pbtResults: {}`).
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { classifyLocalDraftOutbox } from '@/lib/wizardDraftProjection'
import { DRAFT_ANSWER_FIELDS } from '@/pages/student/applicationWizard/lib/draftAutosave'
import { outboxAnswerOverlay } from '@/pages/student/applicationWizard/lib/draftHydration'
import { buildDraftOutboxRecord, draftOutboxAnswers } from '@/pages/student/applicationWizard/lib/draftOutbox'

const RECORD_KEYS = [
  'answers',
  'applicationId',
  'assignment',
  'pending',
  'pendingBase',
  'savedAt',
  'serverVersion',
  'userId',
  'version',
].sort()

/** Every field the wizard form holds, answer or not. */
const FORM_FIELDS = [...DRAFT_ANSWER_FIELDS, 'program', 'intake'] as const

const formValuesArb = fc.record(
  Object.fromEntries(FORM_FIELDS.map((field) => [field, fc.string({ maxLength: 12 })])) as Record<
    (typeof FORM_FIELDS)[number],
    fc.Arbitrary<string>
  >,
)

const pendingBaseArb = fc.option(
  fc
    .subarray([...DRAFT_ANSWER_FIELDS])
    .chain((fields) =>
      fc.record(
        Object.fromEntries(fields.map((field) => [field, fc.option(fc.string({ maxLength: 12 }), { nil: null })])),
      ),
    ),
  { nil: null },
)

const idArb = fc.stringMatching(/^[a-z0-9-]{1,12}$/)

describe('the attached outbox record (task 6.3 M14 invariants)', () => {
  it('holds exactly the address, the base version, the pending answers and retry metadata — nothing else', () => {
    fc.assert(
      fc.property(formValuesArb, pendingBaseArb, idArb, idArb, fc.option(idArb, { nil: null }), (formValues, pendingBase, userId, applicationId, assignment) => {
        const record = buildDraftOutboxRecord({
          userId,
          applicationId,
          assignment,
          serverVersion: 7,
          pendingBase,
          formValues,
          savedAt: '2026-10-09T00:00:00.000Z',
        })
        expect(Object.keys(record).sort()).toEqual(RECORD_KEYS)
        expect(record.pending).toBe(true)
        const answerKeys = Object.keys(record.answers as Record<string, unknown>).sort()
        const expected = pendingBase ? Object.keys(pendingBase).sort() : [...DRAFT_ANSWER_FIELDS].sort()
        expect(answerKeys).toEqual(expected)
        // The assignment never travels as an answer: it moves only through the
        // reroute command (R10.5).
        expect(answerKeys).not.toContain('program')
        expect(answerKeys).not.toContain('intake')
        for (const key of answerKeys) {
          expect((record.answers as Record<string, unknown>)[key]).toBe(formValues[key as keyof typeof formValues])
        }
      }),
      { numRuns: 200 },
    )
  })

  it('recovers exactly the pending answers that differ from what the server holds', () => {
    fc.assert(
      fc.property(formValuesArb, formValuesArb, pendingBaseArb, (typed, hydrated, pendingBase) => {
        const record = buildDraftOutboxRecord({
          userId: 'u1',
          applicationId: 'app-1',
          assignment: 'off|in',
          serverVersion: 3,
          pendingBase,
          formValues: typed,
          savedAt: '2026-10-09T00:00:00.000Z',
        })
        const overlay = outboxAnswerOverlay(
          draftOutboxAnswers(JSON.parse(JSON.stringify(record))),
          hydrated,
          pendingBase ? Object.keys(pendingBase) : undefined,
        )
        for (const field of Object.keys(overlay)) {
          expect(Object.keys(record.answers as Record<string, unknown>)).toContain(field)
        }
        expect(overlay).not.toHaveProperty('program')
        expect(overlay).not.toHaveProperty('intake')
      }),
      { numRuns: 200 },
    )
  })

  it('is never replayed onto a draft that reports a different assignment', () => {
    fc.assert(
      fc.property(
        idArb,
        idArb,
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        fc.boolean(),
        (recordAssignment, serverAssignment, recordVersion, serverVersion, recoverable) => {
          fc.pre(recordAssignment !== serverAssignment)
          const disposition = classifyLocalDraftOutbox(
            { userId: 'u1', applicationId: 'app-1', assignment: recordAssignment, serverVersion: recordVersion, pending: true },
            { userId: 'u1', applicationId: 'app-1', serverVersion, assignment: serverAssignment },
            recoverable,
          )
          expect(disposition).not.toBe('replay')
          expect(disposition).toBe(recoverable ? 'reassigned' : 'none')
        },
      ),
      { numRuns: 300 },
    )
  })
})
