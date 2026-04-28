import { describe, expect, it } from 'vitest'
import { findBestSubjectId } from '@/lib/subjectMatcher'

// Realistic catalog matching the ECZ seed data
const CATALOG = [
  { id: 'eng', name: 'English Language', code: 'ENG' },
  { id: 'math', name: 'Mathematics', code: 'MATH' },
  { id: 'ce', name: 'Civic Education', code: 'CE' },
  { id: 'bio', name: 'Biology', code: 'BIO' },
  { id: 'chem', name: 'Chemistry', code: 'CHEM' },
  { id: 'phy', name: 'Physics', code: 'PHY' },
  { id: 'sci', name: 'Science', code: 'SCI' },
  { id: 'intsci', name: 'Integrated Science', code: 'INTSCI' },
  { id: 'addmath', name: 'Additional Mathematics', code: 'ADDMATH' },
  { id: 'omath', name: 'Ordinary Mathematics', code: 'OMATH' },
  { id: 'com', name: 'Commerce', code: 'COM' },
  { id: 'dt', name: 'Design & Technology', code: 'DT' },
  { id: 'geo', name: 'Geography', code: 'GEO' },
  { id: 'hist', name: 'History', code: 'HIST' },
  { id: 're', name: 'Religious Education', code: 'RE' },
]

describe('findBestSubjectId', () => {
  describe('OCR-extracted subjects (all 7 from real result slip)', () => {
    it('matches "English Language" exactly', () => {
      expect(findBestSubjectId('English Language', CATALOG)).toBe('eng')
    })

    it('matches "Mathematics" to "Ordinary Mathematics" via prefix expansion', () => {
      expect(findBestSubjectId('Mathematics', CATALOG)).toBe('math')
    })

    it('matches "Civic Education" exactly', () => {
      expect(findBestSubjectId('Civic Education', CATALOG)).toBe('ce')
    })

    it('matches "Biology" exactly', () => {
      expect(findBestSubjectId('Biology', CATALOG)).toBe('bio')
    })

    it('matches "Science" exactly, not "Integrated Science"', () => {
      expect(findBestSubjectId('Science', CATALOG)).toBe('sci')
    })

    it('matches "Design & Technology" via & → and normalization', () => {
      expect(findBestSubjectId('Design & Technology', CATALOG)).toBe('dt')
    })

    it('matches "Commerce" exactly', () => {
      expect(findBestSubjectId('Commerce', CATALOG)).toBe('com')
    })
  })

  describe('prevents wrong matches', () => {
    it('does NOT match "Mathematics" to "Additional Mathematics"', () => {
      const result = findBestSubjectId('Mathematics', [
        { id: 'addmath', name: 'Additional Mathematics', code: 'ADDMATH' },
        { id: 'math', name: 'Mathematics', code: 'MATH' },
      ])
      expect(result).toBe('math')
    })

    it('prefers exact "Mathematics" over "Ordinary Mathematics" when both exist', () => {
      const result = findBestSubjectId('Mathematics', [
        { id: 'omath', name: 'Ordinary Mathematics', code: 'OMATH' },
        { id: 'math', name: 'Mathematics', code: 'MATH' },
      ])
      expect(result).toBe('math')
    })

    it('prefers backend UUID subjects over frontend fallback subjects', () => {
      const result = findBestSubjectId('Commerce', [
        { id: 'fallback-commerce', name: 'Commerce', code: 'COM' },
        { id: '2d055d2c-2c0a-4b90-a00f-6e5b0ffb279f', name: 'Commerce', code: 'COM' },
      ])
      expect(result).toBe('2d055d2c-2c0a-4b90-a00f-6e5b0ffb279f')
    })

    it('uses backend UUIDs for OCR aliases before falling back to local IDs', () => {
      const result = findBestSubjectId('Ordinary Science', [
        { id: 'fallback-science', name: 'Science', code: 'SCI' },
        { id: '6f34b423-04ea-40d6-8ce5-c53400f10c29', name: 'Science', code: 'SCI' },
      ])
      expect(result).toBe('6f34b423-04ea-40d6-8ce5-c53400f10c29')
    })
  })

  describe('abbreviations', () => {
    it('matches "maths" to "Mathematics"', () => {
      expect(findBestSubjectId('maths', CATALOG)).toBe('math')
    })

    it('matches "bio" to "Biology"', () => {
      expect(findBestSubjectId('bio', CATALOG)).toBe('bio')
    })

    it('matches "chem" to "Chemistry"', () => {
      expect(findBestSubjectId('chem', CATALOG)).toBe('chem')
    })

    it('matches "phy" to "Physics"', () => {
      expect(findBestSubjectId('phy', CATALOG)).toBe('phy')
    })
  })

  describe('ECZ alias variants', () => {
    it('matches "civics" to "Civic Education"', () => {
      expect(findBestSubjectId('civics', CATALOG)).toBe('ce')
    })

    it('matches "commercial studies" to "Commerce"', () => {
      expect(findBestSubjectId('commercial studies', CATALOG)).toBe('com')
    })

    it('matches "combined science" to "Science"', () => {
      expect(findBestSubjectId('combined science', CATALOG)).toBe('sci')
    })

    it('matches "Design and Technology" to "Design & Technology"', () => {
      expect(findBestSubjectId('Design and Technology', CATALOG)).toBe('dt')
    })

    it('matches "Ordinary Mathematics" to "Ordinary Mathematics"', () => {
      expect(findBestSubjectId('Ordinary Mathematics', CATALOG)).toBe('omath')
    })
  })

  describe('edge cases', () => {
    it('returns null for empty string', () => {
      expect(findBestSubjectId('', CATALOG)).toBeNull()
    })

    it('returns null for empty catalog', () => {
      expect(findBestSubjectId('Mathematics', [])).toBeNull()
    })

    it('handles extra whitespace', () => {
      expect(findBestSubjectId('  Biology  ', CATALOG)).toBe('bio')
    })
  })
})
