import { describe, expect, it } from 'vitest'

import { findBestSubjectId } from '@/lib/subjectMatcher'

describe('findBestSubjectId', () => {
  it('prefers an exact mathematics match over additional mathematics', () => {
    const result = findBestSubjectId('Mathematics', [
      { id: 'add-math', name: 'Additional Mathematics', code: 'ADDMATH' },
      { id: 'math', name: 'Mathematics', code: 'MATH' },
    ])

    expect(result).toBe('math')
  })
})
