import { describe, expect, it } from 'vitest'

import {
  calculateCanonicalProfileCompletion,
  getMissingProfileFields,
  getCanonicalResidenceTown,
  normalizeDateInputValue,
  REQUIRED_PROFILE_FIELDS,
  REQUIRED_PROFILE_FIELD_COUNT,
} from '@/lib/profileFieldMapping'

describe('profile field mapping utilities', () => {
  it('normalizes ISO timestamps for HTML date inputs', () => {
    expect(normalizeDateInputValue('1994-09-08T00:00:00.000Z')).toBe('1994-09-08')
  })

  it('preserves already normalized HTML date values', () => {
    expect(normalizeDateInputValue('2001-02-03')).toBe('2001-02-03')
  })

  it('returns an empty string for invalid date values', () => {
    expect(normalizeDateInputValue('not-a-date')).toBe('')
  })

  it('prefers residence_town before legacy city or address fields', () => {
    expect(
      getCanonicalResidenceTown(
        { residence_town: 'Kitwe', city: 'Ndola', address: 'Plot 10' },
        { residence_town: 'Lusaka', city: 'Kabwe', address: 'Plot 11' },
      ),
    ).toBe('Kitwe')

    expect(
      getCanonicalResidenceTown(
        { city: 'Ndola', address: 'Plot 10' },
        { residence_town: 'Lusaka', city: 'Kabwe', address: 'Plot 11' },
      ),
    ).toBe('Ndola')
  })
})

describe('profile completion calculation (9 required fields)', () => {
  it('defines exactly 9 required fields', () => {
    expect(REQUIRED_PROFILE_FIELD_COUNT).toBe(9)
    expect(REQUIRED_PROFILE_FIELDS).toHaveLength(9)
  })

  it('reaches 100% when all 9 required fields are present', () => {
    const completion = calculateCanonicalProfileCompletion(
      {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        phone: '+260971234567',
        date_of_birth: '1998-01-01',
        sex: 'Female',
        nrc_number: '123456/78/9',
        address: 'Plot 10, Lusaka',
        next_of_kin_name: 'John Doe',
      },
      {},
    )
    expect(completion).toBe(100)
  })

  it('derives first_name and last_name from full_name when explicit fields are absent', () => {
    const completion = calculateCanonicalProfileCompletion(
      {
        full_name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+260971234567',
        date_of_birth: '1998-01-01',
        sex: 'Female',
        nrc_number: '123456/78/9',
        address: 'Plot 10, Lusaka',
        next_of_kin_name: 'John Doe',
      },
      {},
    )
    expect(completion).toBe(100)
  })

  it('uses residence_town as address fallback', () => {
    const completion = calculateCanonicalProfileCompletion(
      {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        phone: '+260971234567',
        date_of_birth: '1998-01-01',
        sex: 'Female',
        nrc_number: '123456/78/9',
        residence_town: 'Lusaka',
        next_of_kin_name: 'John Doe',
      },
      {},
    )
    // address resolved from residence_town
    expect(completion).toBe(100)
  })

  it('reflects partial completion when some fields are missing', () => {
    const completion = calculateCanonicalProfileCompletion(
      {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        phone: '+260971234567',
      },
      {},
    )
    // 4 out of 9 = 44%
    expect(completion).toBe(44)
  })

  it('returns 0% for empty profile', () => {
    expect(calculateCanonicalProfileCompletion(null, null)).toBe(0)
    expect(calculateCanonicalProfileCompletion({}, {})).toBe(0)
  })

  it('falls back to metadata when profile fields are empty', () => {
    const completion = calculateCanonicalProfileCompletion(
      {},
      {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        phone: '+260971234567',
        date_of_birth: '1998-01-01',
        sex: 'Female',
        nrc_number: '123456/78/9',
        address: 'Plot 10',
        next_of_kin_name: 'John Doe',
      },
    )
    expect(completion).toBe(100)
  })

  it('ignores "Not provided" as a valid value', () => {
    const completion = calculateCanonicalProfileCompletion(
      {
        first_name: 'Jane',
        last_name: 'Not provided',
        email: 'jane@example.com',
      },
      {},
    )
    // first_name + email = 2 out of 9 = 22%
    expect(completion).toBe(22)
  })
})

describe('getMissingProfileFields', () => {
  it('returns empty array when all fields are filled', () => {
    const missing = getMissingProfileFields(
      {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        phone: '+260971234567',
        date_of_birth: '1998-01-01',
        sex: 'Female',
        nrc_number: '123456/78/9',
        address: 'Plot 10, Lusaka',
        next_of_kin_name: 'John Doe',
      },
      {},
    )
    expect(missing).toEqual([])
  })

  it('returns all 9 fields when profile is empty', () => {
    const missing = getMissingProfileFields(null, null)
    expect(missing).toHaveLength(9)
    expect(missing.map(f => f.key)).toEqual([
      'first_name', 'last_name', 'email', 'phone',
      'date_of_birth', 'gender', 'nrc_number', 'address', 'next_of_kin',
    ])
  })

  it('returns only the missing fields', () => {
    const missing = getMissingProfileFields(
      {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        phone: '+260971234567',
      },
      {},
    )
    expect(missing.map(f => f.key)).toEqual([
      'date_of_birth', 'gender', 'nrc_number', 'address', 'next_of_kin',
    ])
  })

  it('includes human-readable labels', () => {
    const missing = getMissingProfileFields({ first_name: 'Jane' }, {})
    const nrcField = missing.find(f => f.key === 'nrc_number')
    expect(nrcField?.label).toBe('NRC Number')
  })
})
