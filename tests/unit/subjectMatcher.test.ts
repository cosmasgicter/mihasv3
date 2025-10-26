import { describe, it, expect } from 'vitest'
import { findBestSubjectId } from '@/lib/subjectMatcher'

const subjects = [
  { id: 's1', name: 'Mathematics' },
  { id: 's2', name: 'Biology' },
  { id: 's3', name: 'Chemistry' },
  { id: 's4', name: 'English' },
  { id: 's5', name: 'Additional Mathematics' }
]

describe('findBestSubjectId', () => {
  it('matches exact names', () => {
    expect(findBestSubjectId('Mathematics', subjects)).toBe('s1')
  })

  it('matches case-insensitive and trimmed names', () => {
    expect(findBestSubjectId('  biology  ', subjects)).toBe('s2')
  })

  it('matches common abbreviations or close variants', () => {
    expect(findBestSubjectId('maths', subjects)).toBe('s1')
    expect(findBestSubjectId('add maths', subjects)).toBe('s5')
    // abbreviations
    expect(findBestSubjectId('eng', subjects)).toBe('s4')
    expect(findBestSubjectId('bio', subjects)).toBe('s2')
  })

  it('matches small OCR typos', () => {
    // small typo: 'Chemistr' missing y
    expect(findBestSubjectId('Chemistr', subjects)).toBe('s3')
    // common misread: 'Englsh'
    expect(findBestSubjectId('Englsh', subjects)).toBe('s4')
    // weird spacing and capitalization from OCR
    expect(findBestSubjectId('MATH EMATICS', subjects)).toBe('s1')
  })

  it('returns null when no good match', () => {
    expect(findBestSubjectId('Basket Weaving', subjects)).toBeNull()
  })
})
