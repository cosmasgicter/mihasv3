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

  it('keeps broad country coverage when Intl.supportedValuesOf is unavailable', async () => {
    const originalSupportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf

    Object.defineProperty(Intl, 'supportedValuesOf', {
      configurable: true,
      value: undefined,
    })

    try {
      const countries = await getCountryOptions()

      expect(countries.length).toBeGreaterThan(200)
      expect(countries.some(option => option.value === 'Uganda')).toBe(true)
      expect(countries.some(option => option.value === 'United Arab Emirates')).toBe(true)
    } finally {
      Object.defineProperty(Intl, 'supportedValuesOf', {
        configurable: true,
        value: originalSupportedValuesOf,
      })
    }
  })

  it('returns Zambia city options from the residence location catalog', async () => {
    const cities = await getCityOptionsForCountry('Zambia')

    expect(cities.some(option => option.value === 'Lusaka')).toBe(true)
    expect(cities.some(option => option.value === 'Kitwe')).toBe(true)
  })

  it('does not fall back to Zambia city options for unknown typed countries', async () => {
    const cities = await getCityOptionsForCountry('Not A Country')

    expect(cities).toEqual([])
  })
})
