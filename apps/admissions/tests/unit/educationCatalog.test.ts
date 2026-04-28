import { describe, expect, it } from 'vitest'

import {
  EDUCATION_UPLOAD_COPY,
  mergeWizardSubjects,
  resolveWizardSubjectId,
} from '@/pages/student/applicationWizard/lib/educationCatalog'

describe('educationCatalog', () => {
  it('preserves backend subjects while filling gaps from the fallback catalog', () => {
    const result = mergeWizardSubjects([
      { id: '11111111-1111-4111-8111-111111111111', name: 'English', code: 'ENG' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Mathematics', code: 'MATH' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Biology', code: 'BIO' },
    ])

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111', name: 'English' }),
        expect.objectContaining({ id: '22222222-2222-4222-8222-222222222222', name: 'Mathematics' }),
        expect.objectContaining({ id: '33333333-3333-4333-8333-333333333333', name: 'Biology' }),
        expect.objectContaining({ id: 'fallback-commerce', name: 'Commerce' }),
      ])
    )
    expect(result.filter(subject => subject.name === 'English')).toHaveLength(1)
    expect(result.filter(subject => subject.name === 'Mathematics')).toHaveLength(1)
    expect(result.filter(subject => subject.name === 'Biology')).toHaveLength(1)
  })

  it('deduplicates equivalent subjects by normalized name', () => {
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
      { id: '11111111-1111-4111-8111-111111111111', name: 'English', code: 'ENG' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Mathematics', code: 'MATH' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Commerce', code: 'COM' },
      { id: '44444444-4444-4444-8444-444444444444', name: 'Design & Technology', code: 'DT' },
      { id: '55555555-5555-4555-8555-555555555555', name: 'Science', code: 'SCI' },
    ])

    expect(resolveWizardSubjectId('fallback-english', subjects)).toBe('11111111-1111-4111-8111-111111111111')
    expect(resolveWizardSubjectId('fallback-ordinary-mathematics', subjects)).toBe('22222222-2222-4222-8222-222222222222')
    expect(resolveWizardSubjectId('fallback-commerce', subjects)).toBe('33333333-3333-4333-8333-333333333333')
    expect(resolveWizardSubjectId('fallback-design-and-technology', subjects)).toBe('44444444-4444-4444-8444-444444444444')
    expect(resolveWizardSubjectId('fallback-science', subjects)).toBe('55555555-5555-4555-8555-555555555555')
    expect(resolveWizardSubjectId('fallback-biology', subjects)).toBe('')
  })

  it('uses identity-document language instead of generic extra KYC copy', () => {
    expect(EDUCATION_UPLOAD_COPY.identityDocument.label).toBe('NRC or passport')
    expect(EDUCATION_UPLOAD_COPY.identityDocument.helperText).toContain('NRC or passport')
    expect(EDUCATION_UPLOAD_COPY.identityDocument.helperText.toLowerCase()).not.toContain('extra kyc')
  })
})
