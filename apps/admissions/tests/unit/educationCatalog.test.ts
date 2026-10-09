import { describe, expect, it } from 'vitest'

import {
  EDUCATION_UPLOAD_COPY,
  LEGACY_SUBJECT_SLUG_TO_CODE,
  mergeWizardSubjects,
  resolveWizardSubjectId,
} from '@/pages/student/applicationWizard/lib/educationCatalog'

// Admissions-v2 task 7.1 (R11.4/R11.5, finding STU-11) removed the selectable
// `fallback-*` subjects this module used to merge into the selector. The
// expectations below changed with it: the catalogue is now whatever the server
// returned, and the retired slugs survive only as repair inputs.
describe('educationCatalog', () => {
  it('returns the backend subjects and nothing it invented', () => {
    const result = mergeWizardSubjects([
      { id: '11111111-1111-4111-8111-111111111111', name: 'English Language', code: 'ENG' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Mathematics', code: 'MATH' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Biology', code: 'BIO' },
    ])

    // Sorted Grade 12 first, alphabetical within the level.
    expect(result).toEqual([
      expect.objectContaining({ id: '33333333-3333-4333-8333-333333333333', name: 'Biology' }),
      expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111', name: 'English Language' }),
      expect.objectContaining({ id: '22222222-2222-4222-8222-222222222222', name: 'Mathematics' }),
    ])
    expect(result.some(subject => subject.id.startsWith('fallback-'))).toBe(false)
    expect(result.some(subject => subject.name === 'Commerce')).toBe(false)
  })

  it('keeps one entry when the catalogue still carries a duplicate identity', () => {
    // The 7.1 inventory found ADD_MATH/ADDMATH, MUS/MUSIC and PHYS/PHY as two
    // active rows for one real subject. Until the catalogue migration is applied
    // everywhere, the selector must not offer the same subject twice.
    const result = mergeWizardSubjects([
      { id: '11111111-1111-4111-8111-111111111111', name: 'Mathematics', code: 'MATH' },
      { id: '22222222-2222-4222-8222-222222222222', name: ' mathematics ', code: 'MTH' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Additional Mathematics', code: 'ADDMATH' },
    ])

    expect(result.filter(subject => subject.name === 'Mathematics')).toHaveLength(1)
    expect(result.filter(subject => subject.name === 'Additional Mathematics')).toHaveLength(1)
  })

  it('repairs legacy fallback subject ids to backend ids when a matching subject exists', () => {
    const subjects = mergeWizardSubjects([
      { id: '11111111-1111-4111-8111-111111111111', name: 'English Language', code: 'ENG' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Mathematics', code: 'MATH' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Commerce', code: 'COM' },
      { id: '44444444-4444-4444-8444-444444444444', name: 'Design & Technology', code: 'DT' },
      { id: '55555555-5555-4555-8555-555555555555', name: 'Science', code: 'SCI' },
    ])

    expect(resolveWizardSubjectId('fallback-english', subjects)).toBe('11111111-1111-4111-8111-111111111111')
    expect(resolveWizardSubjectId('fallback-ordinary-mathematics', subjects)).toBe('')
    expect(resolveWizardSubjectId('fallback-commerce', subjects)).toBe('33333333-3333-4333-8333-333333333333')
    expect(resolveWizardSubjectId('fallback-design-and-technology', subjects)).toBe('44444444-4444-4444-8444-444444444444')
    expect(resolveWizardSubjectId('fallback-science', subjects)).toBe('55555555-5555-4555-8555-555555555555')
    expect(resolveWizardSubjectId('fallback-biology', subjects)).toBe('')
  })

  it('maps every retired slug to a real subject code', () => {
    for (const [slug, code] of Object.entries(LEGACY_SUBJECT_SLUG_TO_CODE)) {
      expect(slug.startsWith('fallback-')).toBe(true)
      expect(code).toMatch(/^[A-Z][A-Z0-9-]*$/)
    }
  })

  it('uses identity-document language instead of generic extra KYC copy', () => {
    expect(EDUCATION_UPLOAD_COPY.identityDocument.label).toBe('NRC or passport')
    expect(EDUCATION_UPLOAD_COPY.identityDocument.helperText).toContain('NRC or passport')
    expect(EDUCATION_UPLOAD_COPY.identityDocument.helperText.toLowerCase()).not.toContain('extra kyc')
  })
})
