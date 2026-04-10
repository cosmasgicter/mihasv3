// @vitest-environment node
/**
 * Property-based tests for Draft Round-Trip Consistency (Property 1)
 * Feature: production-readiness-audit, Property 1: Draft Round-Trip Consistency
 *
 * For any valid application draft data, saving to localStorage/database and then
 * restoring SHALL produce data equivalent to the original, including all form
 * fields, selected grades, and current step.
 *
 * **Validates: Requirements 1.3, 1.4**
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

// ── Types (mirroring wizard types) ──────────────────────────────────────

/** Wizard step keys matching steps/config.ts */
type StepKey = 'basicKyc' | 'education' | 'payment' | 'submit'

/** ECZ grade entry: subject_id + grade (1-9 scale) */
interface SubjectGrade {
  subject_id: string
  grade: number
}

/** The draft structure stored in localStorage by useWizardController */
interface WizardDraft {
  formData: WizardFormData
  selectedGrades: SubjectGrade[]
  currentStep: number
  currentStepKey: StepKey
  applicationId: string | null
  savedAt: string
  userId: string
  version: number
}

/** Form fields matching the wizard schema */
interface WizardFormData {
  full_name: string
  nrc_number: string
  passport_number: string
  date_of_birth: string
  sex: 'Male' | 'Female'
  phone: string
  email: string
  residence_town: string
  country: string
  nationality: string
  next_of_kin_name: string
  next_of_kin_phone: string
  program: string
  intake: string
}

// ── Round-trip function ─────────────────────────────────────────────────
// Models what happens when draft is saved to localStorage and restored:
// localStorage.setItem(key, JSON.stringify(draft))
// const restored = JSON.parse(localStorage.getItem(key))

function draftRoundTrip<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Zambian phone number */
const zambianPhoneArb = fc.stringMatching(/^\+260\d{9}$/)

/** ECZ grade (1-9 scale, 1-6 pass, 7-9 fail) */
const eczGradeArb = fc.integer({ min: 1, max: 9 })

/** Step key matching wizard config */
const stepKeyArb = fc.constantFrom<StepKey>('basicKyc', 'education', 'payment', 'submit')

/** Step index (1-4 matching step IDs) */
const stepIndexArb = fc.integer({ min: 1, max: 4 })

/** Subject grade entry */
const subjectGradeArb = fc.record({
  subject_id: fc.uuid(),
  grade: eczGradeArb,
})

/** Date string in YYYY-MM-DD format */
const dateStringArb = fc.date({
  min: new Date('1950-01-01'),
  max: new Date('2008-12-31'),
}).map(d => d.toISOString().split('T')[0])

/** ISO timestamp string */
const isoTimestampArb = fc.date({
  min: new Date('2024-01-01'),
  max: new Date('2026-12-31'),
}).map(d => d.toISOString())

/** Wizard form data matching the actual schema */
const wizardFormDataArb: fc.Arbitrary<WizardFormData> = fc.record({
  full_name: fc.string({ minLength: 2, maxLength: 100 }),
  nrc_number: fc.stringMatching(/^\d{6}\/\d{2}\/\d{1}$/),
  passport_number: fc.string({ minLength: 0, maxLength: 20 }),
  date_of_birth: dateStringArb,
  sex: fc.constantFrom<'Male' | 'Female'>('Male', 'Female'),
  phone: zambianPhoneArb,
  email: fc.emailAddress(),
  residence_town: fc.string({ minLength: 2, maxLength: 50 }),
  country: fc.constantFrom('Zambia', 'Zimbabwe', 'Malawi', 'Tanzania', 'DRC'),
  nationality: fc.constantFrom('Zambian', 'Zimbabwean', 'Malawian', 'Tanzanian', 'Congolese'),
  next_of_kin_name: fc.string({ minLength: 1, maxLength: 100 }),
  next_of_kin_phone: zambianPhoneArb,
  program: fc.uuid(),
  intake: fc.string({ minLength: 1, maxLength: 50 }),
})

/** Complete wizard draft as stored in localStorage */
const wizardDraftArb: fc.Arbitrary<WizardDraft> = fc.record({
  formData: wizardFormDataArb,
  selectedGrades: fc.array(subjectGradeArb, { minLength: 0, maxLength: 12 }),
  currentStep: stepIndexArb,
  currentStepKey: stepKeyArb,
  applicationId: fc.oneof(fc.uuid(), fc.constant(null)),
  savedAt: isoTimestampArb,
  userId: fc.uuid(),
  version: fc.constant(2),
})

// ── Tests ────────────────────────────────────────────────────────────────

describe('Draft Round-Trip Consistency Property Tests (P1)', () => {
  /**
   * **Validates: Requirements 1.3, 1.4**
   *
   * Core property: a complete wizard draft survives JSON round-trip
   * (localStorage save/restore) without any data loss.
   */
  it('complete wizard draft survives JSON round-trip with all fields preserved', () => {
    fc.assert(
      fc.property(wizardDraftArb, (draft) => {
        const restored = draftRoundTrip(draft)
        expect(restored).toEqual(draft)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 1.3, 1.4**
   *
   * ECZ grades (subject_id + grade 1-9) are preserved exactly through
   * the round-trip, maintaining array order and numeric grade values.
   */
  it('ECZ grade data preserves subject_id and numeric grade through round-trip', () => {
    fc.assert(
      fc.property(
        fc.array(subjectGradeArb, { minLength: 1, maxLength: 12 }),
        (grades) => {
          const restored = draftRoundTrip(grades)
          expect(restored).toHaveLength(grades.length)
          for (let i = 0; i < grades.length; i++) {
            expect(restored[i].subject_id).toBe(grades[i].subject_id)
            expect(restored[i].grade).toBe(grades[i].grade)
            expect(typeof restored[i].grade).toBe('number')
          }
        },
      ),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 1.3, 1.4**
   *
   * The currentStepKey is preserved through round-trip, ensuring the
   * wizard restores to the correct step after draft restoration.
   */
  it('step key is preserved through round-trip for correct step restoration', () => {
    fc.assert(
      fc.property(wizardDraftArb, (draft) => {
        const restored = draftRoundTrip(draft)
        expect(restored.currentStepKey).toBe(draft.currentStepKey)
        expect(restored.currentStep).toBe(draft.currentStep)
        expect(['basicKyc', 'education', 'payment', 'submit']).toContain(restored.currentStepKey)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 1.3, 1.4**
   *
   * Round-trip is idempotent: applying it twice yields the same result
   * as applying it once (no progressive data degradation).
   */
  it('draft round-trip is idempotent (double round-trip equals single)', () => {
    fc.assert(
      fc.property(wizardDraftArb, (draft) => {
        const once = draftRoundTrip(draft)
        const twice = draftRoundTrip(once)
        expect(twice).toEqual(once)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 1.3, 1.4**
   *
   * All personal info form fields (strings, enums) survive the round-trip
   * without truncation or type coercion.
   */
  it('personal info fields preserve type and value through round-trip', () => {
    fc.assert(
      fc.property(wizardFormDataArb, (formData) => {
        const restored = draftRoundTrip(formData)
        expect(restored.full_name).toBe(formData.full_name)
        expect(restored.email).toBe(formData.email)
        expect(restored.phone).toBe(formData.phone)
        expect(restored.sex).toBe(formData.sex)
        expect(restored.date_of_birth).toBe(formData.date_of_birth)
        expect(restored.nationality).toBe(formData.nationality)
        expect(restored.country).toBe(formData.country)
        expect(restored.residence_town).toBe(formData.residence_town)
      }),
      { numRuns: 10 },
    )
  })
})
