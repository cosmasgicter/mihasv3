import { useEffect, useState } from 'react'

import {
  DEFAULT_RESIDENCE_COUNTRY,
  type LocationOption,
  getCityOptionsForCountry,
  getCountryOptions,
  normalizeResidenceCountry,
} from '@/lib/locationOptions'

export function useResidenceLocationOptions(country?: string | null) {
  const normalizedCountry = normalizeResidenceCountry(country)
  const [countryOptions, setCountryOptions] = useState<LocationOption[]>([
    { value: DEFAULT_RESIDENCE_COUNTRY, label: DEFAULT_RESIDENCE_COUNTRY },
  ])
  const [cityOptions, setCityOptions] = useState<LocationOption[]>([])
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [loadingCities, setLoadingCities] = useState(true)

  useEffect(() => {
    let cancelled = false

    setLoadingCountries(true)
    getCountryOptions()
      .then(options => {
        if (!cancelled) {
          setCountryOptions(options)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCountries(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    setLoadingCities(true)
    getCityOptionsForCountry(normalizedCountry)
      .then(options => {
        if (!cancelled) {
          setCityOptions(options)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCities(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [normalizedCountry])

  return {
    normalizedCountry,
    countryOptions,
    cityOptions,
    loadingCountries,
    loadingCities,
    loading: loadingCountries || loadingCities,
  }
}
