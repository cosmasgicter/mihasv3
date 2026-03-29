export const RESIDENCE_TOWN_LABEL = 'Residence town'

export const RESIDENCE_TOWN_REQUIRED_MESSAGE = 'Residence town is required'
export const RESIDENCE_TOWN_MIN_LENGTH_MESSAGE = 'Residence town must be at least 2 characters'

export function normalizeResidenceTown(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function getResidenceTownHelperText({
  loadingCities,
  selectedCountry,
  defaultCountry,
}: {
  loadingCities: boolean
  selectedCountry?: string
  defaultCountry: string
}): string {
  if (loadingCities) {
    return 'Loading town suggestions...'
  }

  return `Suggestions are for ${selectedCountry || defaultCountry}. You can still type your town manually.`
}
