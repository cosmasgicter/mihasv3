export interface LocationOption {
  value: string
  label: string
}

export const DEFAULT_RESIDENCE_COUNTRY = 'Zambia'

const cityOptionsCache = new Map<string, Promise<LocationOption[]>>()

const normalizeKey = (value: string) => value.trim().toLowerCase()

const FALLBACK_COUNTRY_CODES = [
  'ZM', 'ZA', 'ZW', 'BW', 'MW', 'MZ', 'NA', 'TZ', 'KE', 'UG', 'RW', 'BI', 'CD',
  'AO', 'NG', 'GH', 'ET', 'EG', 'US', 'GB', 'CA', 'AU', 'IN', 'CN', 'JP', 'DE',
  'FR', 'IT', 'ES', 'BR', 'AE'
]

const ZAMBIA_CITY_NAMES = [
  'Chililabombwe',
  'Chingola',
  'Chipata',
  'Choma',
  'Kabwe',
  'Kafue',
  'Kalulushi',
  'Kapiri Mposhi',
  'Kasama',
  'Kitwe',
  'Livingstone',
  'Luanshya',
  'Lusaka',
  'Mansa',
  'Mazabuka',
  'Mongu',
  'Mpika',
  'Mufulira',
  'Ndola',
  'Solwezi',
]

function getSupportedRegionCodes(): string[] {
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  if (typeof supportedValuesOf === 'function') {
    try {
      const codes = supportedValuesOf('region').filter(code => /^[A-Z]{2}$/.test(code))
      if (codes.length > 0) return codes
    } catch {
      // Fall back to a compact common-country list below.
    }
  }

  return FALLBACK_COUNTRY_CODES
}

function getCountryNameFromCode(code: string): string | null {
  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
    return displayNames.of(code) || null
  } catch {
    return code === 'ZM' ? DEFAULT_RESIDENCE_COUNTRY : null
  }
}

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
  const countryNames = getSupportedRegionCodes()
    .map(code => getCountryNameFromCode(code))
    .filter((name): name is string => Boolean(name))

  return sortOptions(
    uniqueOptions(countryNames)
  )
}

function isZambiaCountry(country?: string | null): boolean {
  const normalizedKey = normalizeKey(normalizeResidenceCountry(country))
  return normalizedKey === 'zambia' || normalizedKey === 'zm'
}

export async function getCityOptionsForCountry(country?: string | null): Promise<LocationOption[]> {
  const normalizedCountry = normalizeResidenceCountry(country)
  const cacheKey = normalizeKey(normalizedCountry)

  const cached = cityOptionsCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const cityOptionsPromise = Promise.resolve(
    isZambiaCountry(normalizedCountry)
      ? uniqueOptions(ZAMBIA_CITY_NAMES).sort((a, b) => a.label.localeCompare(b.label))
      : []
  )

  cityOptionsCache.set(cacheKey, cityOptionsPromise)
  return cityOptionsPromise
}
