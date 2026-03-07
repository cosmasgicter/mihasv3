import { DEFAULT_RESIDENCE_COUNTRY, normalizeResidenceCountry } from '@/lib/locationOptions'

type StringLike = string | null | undefined

export interface CanonicalProfileFields {
  full_name?: StringLike
  phone?: StringLike
  date_of_birth?: StringLike
  sex?: StringLike
  residence_town?: StringLike
  country?: StringLike
  city?: StringLike
  address?: StringLike
  nationality?: StringLike
  next_of_kin_name?: StringLike
  next_of_kin_phone?: StringLike
}

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '' && value !== 'Not provided'

const pickFirstText = (...values: unknown[]): string => {
  for (const value of values) {
    if (hasText(value)) {
      return value.trim()
    }
  }

  return ''
}

export function normalizeDateInputValue(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (!hasText(value)) {
    return ''
  }

  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().slice(0, 10)
}

export function normalizeDateTimeLocalValue(value: unknown): string {
  if (!hasText(value)) {
    return ''
  }

  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  const iso = parsed.toISOString()
  return iso.slice(0, 16)
}

export function getCanonicalResidenceTown(
  profile?: CanonicalProfileFields | null,
  metadata?: CanonicalProfileFields | null,
): string {
  return pickFirstText(
    profile?.residence_town,
    profile?.city,
    profile?.address,
    metadata?.residence_town,
    metadata?.city,
    metadata?.address,
  )
}

export function getCanonicalResidenceCountry(
  profile?: CanonicalProfileFields | null,
  metadata?: CanonicalProfileFields | null,
): string {
  return normalizeResidenceCountry(
    pickFirstText(profile?.country, metadata?.country, DEFAULT_RESIDENCE_COUNTRY),
  )
}

export function calculateCanonicalProfileCompletion(
  profile?: CanonicalProfileFields | null,
  metadata?: CanonicalProfileFields | null,
): number {
  // Core fields populated during registration — these define profile completeness.
  // Registration writes: first_name, last_name (→ full_name), phone, date_of_birth,
  // sex, residence_town, country to the profiles table.
  const coreValues = [
    pickFirstText(profile?.full_name, metadata?.full_name),
    pickFirstText(profile?.phone, metadata?.phone),
    normalizeDateInputValue(pickFirstText(profile?.date_of_birth, metadata?.date_of_birth)),
    pickFirstText(profile?.sex, metadata?.sex),
    getCanonicalResidenceTown(profile, metadata),
    pickFirstText(profile?.country, metadata?.country),
  ]

  const completedFields = coreValues.filter(hasText).length
  return Math.round((completedFields / coreValues.length) * 100)
}
