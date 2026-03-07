import { describe, expect, it } from 'vitest'

import {
  EDUCATION_UPLOAD_COPY,
  mergeWizardSubjects,
} from '@/pages/student/applicationWizard/lib/educationCatalog'

describe('educationCatalog', () => {
  it('adds the canonical Zambia fallback subjects when the API list is incomplete', () => {
    const result = mergeWizardSubjects([
      { id: 'english', name: 'English', code: 'ENG' },
      { id: 'math', name: 'Mathematics', code: 'MATH' },
      { id: 'bio', name: 'Biology', code: 'BIO' },
    ])

    expect(result.some(subject => subject.name === 'Additional Mathematics')).toBe(true)
    expect(result.some(subject => subject.name === 'Ordinary Mathematics')).toBe(true)
    expect(result.some(subject => subject.name === 'Agricultural Science')).toBe(true)
    expect(result.some(subject => subject.name === 'Computer Studies')).toBe(true)
  })

  it('deduplicates equivalent subjects by normalized name', () => {
    const result = mergeWizardSubjects([
      { id: 'math-1', name: 'Mathematics', code: 'MATH' },
      { id: 'math-2', name: ' mathematics ', code: 'MTH' },
      { id: 'add-math', name: 'Additional Mathematics', code: 'ADDMATH' },
    ])

    expect(result.filter(subject => subject.name === 'Mathematics')).toHaveLength(1)
    expect(result.filter(subject => subject.name === 'Additional Mathematics')).toHaveLength(1)
  })

  it('uses identity-document language instead of generic extra KYC copy', () => {
    expect(EDUCATION_UPLOAD_COPY.identityDocument.label).toBe('Identity document (NRC or Passport)')
    expect(EDUCATION_UPLOAD_COPY.identityDocument.helperText).toContain('NRC or passport')
    expect(EDUCATION_UPLOAD_COPY.identityDocument.helperText.toLowerCase()).not.toContain('extra kyc')
  })
})
