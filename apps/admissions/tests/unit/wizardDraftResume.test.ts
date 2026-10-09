import { describe, expect, it } from 'vitest'

import {
  DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST,
  deriveDraftResumeUploads,
  fillDraftPersonalFieldsFromRecord,
  mergeDraftResumeUploads,
  normalizeDraftResumeGrades,
  resolveDraftResumeStepId,
} from '@/pages/student/applicationWizard/lib/draftResume'

const canonical = (slot: number): string =>
  `${String(slot).repeat(8)}-${String(slot).repeat(4)}-4${String(slot).repeat(3)}-8${String(slot).repeat(3)}-${String(slot).repeat(12)}`

const MATH = canonical(1)
const ENG = canonical(2)
const BAD_GRADE = canonical(3)

describe('wizard draft resume helpers', () => {
  // Admissions-v2 task 7.1 (R11.5, STU-11): a restored row survives only when its
  // subject is a canonical server identity. Legacy `fallback-*` slugs and any
  // other non-canonical reference are dropped here rather than counted and then
  // discarded at sync time.
  it('normalizes and filters restored grades', () => {
    const result = normalizeDraftResumeGrades([
      { subject_id: MATH, grade: '1' },
      { subject_id: ENG, grade: 4 },
      { subject_id: '', grade: 5 },
      { subject_id: BAD_GRADE, grade: 15 },
      { subject_id: 'fallback-biology', grade: 2 },
      { subject_id: 'not-a-uuid', grade: 2 },
      null,
    ])

    expect(result).toEqual([
      { row_id: `restored-0-${MATH}`, subject_id: MATH, grade: 1 },
      { row_id: `restored-1-${ENG}`, subject_id: ENG, grade: 4 },
    ])
  })

  it('derives uploaded document flags from restored application urls', () => {
    expect(
      deriveDraftResumeUploads({
        result_slip_url: 'https://files.example.com/result.pdf',
        extra_kyc_url: '',
      })
    ).toEqual({
      result_slip: true,
      extra_kyc: false,
    })
  })

  it('keeps application document urls when server document hydration is empty', () => {
    expect(
      mergeDraftResumeUploads(
        {
          result_slip_url: 'https://files.example.com/result.pdf',
          extra_kyc_url: 'https://files.example.com/nrc.pdf',
        },
        {
          result_slip: false,
          extra_kyc: false,
        }
      )
    ).toEqual({
      result_slip: true,
      extra_kyc: true,
    })
  })

  it('keeps server document flags when application urls are missing', () => {
    expect(
      mergeDraftResumeUploads(
        {
          result_slip_url: '',
          extra_kyc_url: null,
        },
        {
          result_slip: true,
          extra_kyc: false,
        }
      )
    ).toEqual({
      result_slip: true,
      extra_kyc: false,
    })
  })

  it('resumes to the payment step when education requirements are complete but payment is not verified', () => {
    const grades = normalizeDraftResumeGrades([
      { subject_id: canonical(4), grade: 1 },
      { subject_id: canonical(5), grade: 2 },
      { subject_id: canonical(6), grade: 3 },
      { subject_id: canonical(7), grade: 4 },
      { subject_id: canonical(8), grade: 5 },
    ])

    const application = {
      full_name: 'Jane Student',
      program: 'Registered Nursing',
      result_slip_url: '/result.pdf',
      extra_kyc_url: '/nrc.pdf',
      payment_status: 'pending_review',
    }

    const stepId = resolveDraftResumeStepId(
      application,
      grades,
      deriveDraftResumeUploads(application)
    )

    // 6-step model (R10.1): payment is step 5.
    expect(stepId).toBe(5)
  })

  it('resumes to the review step when payment is already verified', () => {
    const grades = normalizeDraftResumeGrades([
      { subject_id: canonical(4), grade: 1 },
      { subject_id: canonical(5), grade: 2 },
      { subject_id: canonical(6), grade: 3 },
      { subject_id: canonical(7), grade: 4 },
      { subject_id: canonical(8), grade: 5 },
    ])

    const application = {
      full_name: 'Jane Student',
      program: 'Registered Nursing',
      result_slip_url: '/result.pdf',
      extra_kyc_url: '/nrc.pdf',
      payment_status: 'verified',
    }

    const stepId = resolveDraftResumeStepId(
      application,
      grades,
      deriveDraftResumeUploads(application)
    )

    // 6-step model (R10.1): review/submit is step 6.
    expect(stepId).toBe(6)
  })

  it('stays on the education step when grades or documents are incomplete', () => {
    const application = {
      full_name: 'Jane Student',
      program: 'Registered Nursing',
      result_slip_url: '/result.pdf',
      extra_kyc_url: null,
      payment_status: null,
    }

    const stepId = resolveDraftResumeStepId(
      application,
      normalizeDraftResumeGrades([
        { subject_id: canonical(4), grade: 1 },
        { subject_id: canonical(5), grade: 2 },
      ]),
      deriveDraftResumeUploads(application)
    )

    // 6-step model (R10.1): education is step 4.
    expect(stepId).toBe(4)
  })
})

/**
 * The list-projection fill (admissions-v2 task 11.2, second pass; R10.2/R10.3,
 * finding STU-02).
 *
 * `docs/v2-evidence/11.2/README.md` §2.2 recorded, as unfixed, that a resumed draft
 * came back with the platform's stored town missing. The cause is not a race: the
 * wizard hydrates from the application *list*, and `ApplicationListSerializer`
 * carries no personal answer beyond `full_name` / `email` / `phone`. These cases pin
 * the fill that closes it, including the direction of authority — the record
 * supplies only what the projection omits, and a blank never wins.
 */
describe('draft personal fields absent from the list projection', () => {
  const record = {
    id: 'app-1',
    nrc_number: '123456/78/9',
    passport_number: 'ZN123456',
    date_of_birth: '2004-05-04',
    sex: 'male',
    residence_town: 'Kabwe',
    country: 'Zambia',
    nationality: 'Zambian',
    next_of_kin_name: 'Next Of Kin',
    next_of_kin_phone: '+260971234567',
    // Fields the list *does* carry, with values that must not win.
    full_name: 'Row Name',
    email: 'row@example.com',
    phone: '+260955000000',
    program: 'Row Program',
  }

  it('names exactly the fields the list omits', () => {
    expect([...DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST]).toEqual([
      'nrc_number',
      'passport_number',
      'date_of_birth',
      'sex',
      'residence_town',
      'country',
      'nationality',
      'next_of_kin_name',
      'next_of_kin_phone',
    ])
  })

  it('fills every omitted answer from the authoritative row', () => {
    const listItem = { id: 'app-1', full_name: 'List Name', email: 'list@example.com', phone: '+260970000000' }
    const filled = fillDraftPersonalFieldsFromRecord(listItem, record)
    expect(filled.residence_town).toBe('Kabwe')
    expect(filled.nrc_number).toBe('123456/78/9')
    expect(filled.date_of_birth).toBe('2004-05-04')
    expect(filled.next_of_kin_phone).toBe('+260971234567')
  })

  it('never overrides a field the list already carries', () => {
    const listItem = { id: 'app-1', full_name: 'List Name', email: 'list@example.com', phone: '+260970000000', program: 'List Program' }
    const filled = fillDraftPersonalFieldsFromRecord(listItem, record)
    expect(filled.full_name).toBe('List Name')
    expect(filled.email).toBe('list@example.com')
    expect(filled.phone).toBe('+260970000000')
    expect(filled.program).toBe('List Program')
  })

  it('keeps a value the list carries for an omitted field, when it has one', () => {
    const listItem = { id: 'app-1', residence_town: 'Livingstone' }
    expect(fillDraftPersonalFieldsFromRecord(listItem, record).residence_town).toBe('Livingstone')
  })

  it('treats whitespace as absent and a blank record value as no answer', () => {
    expect(fillDraftPersonalFieldsFromRecord({ id: 'a', residence_town: '   ' }, record).residence_town).toBe('Kabwe')
    expect(
      fillDraftPersonalFieldsFromRecord({ id: 'a', residence_town: '' }, { ...record, residence_town: '  ' })
        .residence_town,
    ).toBe('')
  })

  it('returns the list item unchanged when there is no readable record', () => {
    const listItem = { id: 'app-1', residence_town: '' }
    expect(fillDraftPersonalFieldsFromRecord(listItem, null)).toBe(listItem)
    expect(fillDraftPersonalFieldsFromRecord(listItem, undefined)).toBe(listItem)
    expect(fillDraftPersonalFieldsFromRecord(listItem, { id: 'app-1' })).toBe(listItem)
  })

  it('is idempotent: filling twice answers the same thing', () => {
    const once = fillDraftPersonalFieldsFromRecord({ id: 'app-1' }, record)
    expect(fillDraftPersonalFieldsFromRecord(once, record)).toEqual(once)
  })
})
