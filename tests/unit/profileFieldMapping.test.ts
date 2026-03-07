import { describe, expect, it } from 'vitest'

import {
  calculateCanonicalProfileCompletion,
  getCanonicalResidenceTown,
  normalizeDateInputValue,
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

  it('reaches 100 percent when all core registration fields are present', () => {
    const completion = calculateCanonicalProfileCompletion(
      {
        full_name: 'Jane Doe',
        phone: '+260971234567',
        date_of_birth: '1998-01-01T00:00:00.000Z',
        sex: 'Female',
        residence_town: 'Lusaka',
        country: 'Zambia',
      },
      {},
    )

    expect(completion).toBe(100)
  })

  it('reaches 100 percent even without optional next_of_kin and nationality fields', () => {
    const completion = calculateCanonicalProfileCompletion(
      {
        full_name: 'Jane Doe',
        phone: '+260971234567',
        date_of_birth: '1998-01-01',
        sex: 'Female',
        residence_town: 'Lusaka',
        country: 'Zambia',
        nationality: 'Zambian',
        next_of_kin_name: 'John Doe',
        next_of_kin_phone: '+260977000000',
      },
      {},
    )

    // nationality and next_of_kin are not part of core fields — still 100%
    expect(completion).toBe(100)
  })

  it('does not penalize a fully populated residence_town profile because of missing legacy city/address', () => {
    const completion = calculateCanonicalProfileCompletion(
      {
        full_name: 'Jane Doe',
        phone: '+260971234567',
        date_of_birth: '1998-01-01',
        sex: 'Female',
        residence_town: 'Lusaka',
        country: 'Zambia',
      },
      {},
    )

    expect(completion).toBe(100)
  })

  it('reflects partial completion when some registration fields are missing', () => {
    const completion = calculateCanonicalProfileCompletion(
      {
        full_name: 'Jane Doe',
        phone: '+260971234567',
      },
      {},
    )

    // 2 out of 6 core fields = 33%
    expect(completion).toBe(33)
  })
})
