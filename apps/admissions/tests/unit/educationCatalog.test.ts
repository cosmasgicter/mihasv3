import { describe, expect, it } from 'vitest'

import {
  EDUCATION_UPLOAD_COPY,
  mergeWizardSubjects,
  resolveWizardSubjectId,
} from '@/pages/student/applicationWizard/lib/educationCatalog'

describe('educationCatalog', () => {
  it('only returns backend-backed subjects when the API list is incomplete', () => {
    const result = mergeWizardSubjects([
      { id: '11111111-1111-4111-8111-111111111111', name: 'English', code: 'ENG' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Mathematics', code: 'MATH' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Biology', code: 'BIO' },
    ])

    expect(result.map(subject => subject.name)).toEqual(['Biology', 'English', 'Mathematics'])
    expect(result.some(subject => subject.id.startsWith('fallback-'))).toBe(false)
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
    ])

    expect(resolveWizardSubjectId('fallback-english', subjects)).toBe('11111111-1111-4111-8111-111111111111')
    expect(resolveWizardSubjectId('fallback-biology', subjects)).toBe('')
  })

  it('uses identity-document language instead of generic extra KYC copy', () => {
    expect(EDUCATION_UPLOAD_COPY.identityDocument.label).toBe('NRC or passport')
    expect(EDUCATION_UPLOAD_COPY.identityDocument.helperText).toContain('NRC or passport')
    expect(EDUCATION_UPLOAD_COPY.identityDocument.helperText.toLowerCase()).not.toContain('extra kyc')
  })
})
