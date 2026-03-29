import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RESIDENCE_COUNTRY,
  getCityOptionsForCountry,
  getCountryOptions,
  normalizeResidenceCountry,
} from '@/lib/locationOptions'

describe('locationOptions', () => {
  it('defaults blank residence country values to Zambia', () => {
    expect(normalizeResidenceCountry('')).toBe(DEFAULT_RESIDENCE_COUNTRY)
    expect(normalizeResidenceCountry(undefined)).toBe(DEFAULT_RESIDENCE_COUNTRY)
  })

  it('keeps Zambia pinned to the top of the country list', async () => {
    const countries = await getCountryOptions()

    expect(countries[0]).toMatchObject({
      value: 'Zambia',
      label: 'Zambia',
    })
    expect(countries.some(option => option.value === 'United States')).toBe(true)
  })

  it('returns Zambia city options from the world location catalog', async () => {
    const cities = await getCityOptionsForCountry('Zambia')

    expect(cities.some(option => option.value === 'Lusaka')).toBe(true)
    expect(cities.some(option => option.value === 'Kitwe')).toBe(true)
  })
})
