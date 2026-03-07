export interface LocationOption {
  value: string
  label: string
}

type CountryRecord = {
  name: string
  isoCode: string
}

export const DEFAULT_RESIDENCE_COUNTRY = 'Zambia'

let countriesPromise: Promise<CountryRecord[]> | null = null
const cityOptionsCache = new Map<string, Promise<LocationOption[]>>()

const normalizeKey = (value: string) => value.trim().toLowerCase()

const sortOptions = (options: LocationOption[]) =>
  [...options].sort((a, b) => {
    if (a.value === DEFAULT_RESIDENCE_COUNTRY) return -1
    if (b.value === DEFAULT_RESIDENCE_COUNTRY) return 1
    return a.label.localeCompare(b.label)
  })

const uniqueOptions = (values: string[]) => {
  const seen = new Set<string>()
  const options: LocationOption[] = []

  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue

    const key = normalizeKey(trimmed)
    if (seen.has(key)) continue

    seen.add(key)
    options.push({ value: trimmed, label: trimmed })
  }

  return options
}

async function loadCountries(): Promise<CountryRecord[]> {
  if (!countriesPromise) {
    countriesPromise = import('country-state-city')
      .then(({ Country }) =>
        Country.getAllCountries().map(country => ({
          name: country.name,
          isoCode: country.isoCode,
        })),
      )
      .catch(() => [{ name: DEFAULT_RESIDENCE_COUNTRY, isoCode: 'ZM' }])
  }

  return countriesPromise
}

async function resolveCountryRecord(country?: string | null) {
  const normalizedCountry = normalizeResidenceCountry(country)
  const countries = await loadCountries()
  const normalizedKey = normalizeKey(normalizedCountry)

  return (
    countries.find(entry => normalizeKey(entry.name) === normalizedKey) ||
    countries.find(entry => entry.isoCode.toLowerCase() === normalizedKey) ||
    countries.find(entry => entry.name === DEFAULT_RESIDENCE_COUNTRY)
  )
}

export function normalizeResidenceCountry(value?: string | null): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return DEFAULT_RESIDENCE_COUNTRY
  }

  const trimmed = value.trim()
  if (normalizeKey(trimmed) === normalizeKey(DEFAULT_RESIDENCE_COUNTRY)) {
    return DEFAULT_RESIDENCE_COUNTRY
  }

  return trimmed
}

export async function getCountryOptions(): Promise<LocationOption[]> {
  const countries = await loadCountries()
  return sortOptions(
    uniqueOptions(countries.map(country => country.name))
  )
}

export async function getCityOptionsForCountry(country?: string | null): Promise<LocationOption[]> {
  const normalizedCountry = normalizeResidenceCountry(country)
  const cacheKey = normalizeKey(normalizedCountry)

  const cached = cityOptionsCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const cityOptionsPromise = resolveCountryRecord(normalizedCountry)
    .then(async countryRecord => {
      if (!countryRecord) return []

      try {
        const { City } = await import('country-state-city')
        const cities = City.getCitiesOfCountry(countryRecord.isoCode) ?? []
        return uniqueOptions(cities.map(city => city.name)).sort((a, b) => a.label.localeCompare(b.label))
      } catch {
        return []
      }
    })

  cityOptionsCache.set(cacheKey, cityOptionsPromise)
  return cityOptionsPromise
}
