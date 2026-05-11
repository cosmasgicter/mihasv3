import { describe, it, expect } from 'vitest'
import { decodeExamNumber, isValidExamNumber } from '@/lib/eczExamNumber'

describe('decodeExamNumber', () => {
  it('decodes a 10-digit exam number', () => {
    const result = decodeExamNumber('1905021028')
    expect(result.valid).toBe(true)
    expect(result.length).toBe(10)
    expect(result.centreCode).toBe('1905021')
    expect(result.candidateSequence).toBe('028')
    expect(result.yearPrefix).toBeNull()
  })

  it('decodes a 12-digit exam number', () => {
    const result = decodeExamNumber('190502150028')
    expect(result.valid).toBe(true)
    expect(result.length).toBe(12)
    expect(result.yearPrefix).toBe('19')
    expect(result.centreCode).toBe('0502150')
    expect(result.candidateSequence).toBe('028')
  })

  it('returns invalid for 11-digit number', () => {
    const result = decodeExamNumber('19050215002')
    expect(result.valid).toBe(false)
    expect(result.length).toBeNull()
  })

  it('returns invalid for empty string', () => {
    expect(decodeExamNumber('')).toMatchObject({ valid: false })
  })

  it('returns invalid for null/undefined', () => {
    expect(decodeExamNumber(null).valid).toBe(false)
    expect(decodeExamNumber(undefined).valid).toBe(false)
  })

  it('returns invalid for non-digit characters', () => {
    expect(decodeExamNumber('19050215002A').valid).toBe(false)
    expect(decodeExamNumber('ABC1234567').valid).toBe(false)
  })

  it('trims whitespace before decoding', () => {
    const result = decodeExamNumber('  190502150028  ')
    expect(result.valid).toBe(true)
    expect(result.length).toBe(12)
  })

  it('returns invalid for too-short numbers', () => {
    expect(decodeExamNumber('12345').valid).toBe(false)
  })

  it('returns invalid for too-long numbers', () => {
    expect(decodeExamNumber('1234567890123').valid).toBe(false)
  })

  it('preserves raw value in output', () => {
    expect(decodeExamNumber('190502150028').raw).toBe('190502150028')
    expect(decodeExamNumber('  bad  ').raw).toBe('bad')
  })
})

describe('isValidExamNumber', () => {
  it('returns true for valid 10-digit', () => {
    expect(isValidExamNumber('1905021028')).toBe(true)
  })

  it('returns true for valid 12-digit', () => {
    expect(isValidExamNumber('190502150028')).toBe(true)
  })

  it('returns false for invalid', () => {
    expect(isValidExamNumber('abc')).toBe(false)
    expect(isValidExamNumber(null)).toBe(false)
    expect(isValidExamNumber('')).toBe(false)
  })
})
