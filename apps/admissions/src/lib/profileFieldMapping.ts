import { DEFAULT_RESIDENCE_COUNTRY, normalizeResidenceCountry } from '@/lib/locationOptions'

type StringLike = string | null | undefined

export interface CanonicalProfileFields {
  full_name?: StringLike
  first_name?: StringLike
  last_name?: StringLike
  email?: StringLike
  phone?: StringLike
  date_of_birth?: StringLike
  sex?: StringLike
  residence_town?: StringLike
  country?: StringLike
  city?: StringLike
  address?: StringLike
  nationality?: StringLike
  nrc_number?: StringLike
  next_of_kin_name?: StringLike
  next_of_kin_phone?: StringLike
}

/**
 * The 9 required profile fields for completion calculation.
 * Each entry maps a field key to a human-readable label.
 */
export const REQUIRED_PROFILE_FIELDS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'date_of_birth', label: 'Date of Birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'nrc_number', label: 'NRC Number' },
  { key: 'address', label: 'Address' },
  { key: 'next_of_kin', label: 'Next of Kin' },
] as const

export const REQUIRED_PROFILE_FIELD_COUNT = REQUIRED_PROFILE_FIELDS.length

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

/**
 * Resolves the effective value for each of the 9 required profile fields.
 * Uses profile data first, then falls back to metadata, with special
 * handling for composite fields (first_name from full_name, gender from sex, etc.).
 */
function resolveRequiredFieldValues(
  profile?: CanonicalProfileFields | null,
  metadata?: CanonicalProfileFields | null,
): Record<string, string> {
  // first_name: prefer explicit first_name, fall back to first part of full_name
  const firstName = pickFirstText(
    profile?.first_name,
    metadata?.first_name,
  ) || (() => {
    const fullName = pickFirstText(profile?.full_name, metadata?.full_name)
    return fullName ? fullName.split(/\s+/)[0] || '' : ''
  })()

  // last_name: prefer explicit last_name, fall back to rest of full_name
  const lastName = pickFirstText(
    profile?.last_name,
    metadata?.last_name,
  ) || (() => {
    const fullName = pickFirstText(profile?.full_name, metadata?.full_name)
    if (!fullName) return ''
    const parts = fullName.split(/\s+/)
    return parts.length > 1 ? parts.slice(1).join(' ') : ''
  })()

  // gender: stored as "sex" in the database
  const gender = pickFirstText(profile?.sex, metadata?.sex)

  // address: prefer address, fall back to residence_town or city
  const address = pickFirstText(
    profile?.address,
    metadata?.address,
    profile?.residence_town,
    metadata?.residence_town,
    profile?.city,
    metadata?.city,
  )

  // next_of_kin: prefer next_of_kin_name
  const nextOfKin = pickFirstText(
    profile?.next_of_kin_name,
    metadata?.next_of_kin_name,
  )

  return {
    first_name: firstName,
    last_name: lastName,
    email: pickFirstText(profile?.email, metadata?.email),
    phone: pickFirstText(profile?.phone, metadata?.phone),
    date_of_birth: normalizeDateInputValue(pickFirstText(profile?.date_of_birth, metadata?.date_of_birth)),
    gender,
    nrc_number: pickFirstText(profile?.nrc_number, metadata?.nrc_number),
    address,
    next_of_kin: nextOfKin,
  }
}

/**
 * Calculates profile completion percentage based on 9 required fields:
 * first_name, last_name, email, phone, date_of_birth, gender, nrc_number, address, next_of_kin
 *
 * Returns a percentage from 0 to 100 (rounded).
 */
export function calculateCanonicalProfileCompletion(
  profile?: CanonicalProfileFields | null,
  metadata?: CanonicalProfileFields | null,
): number {
  const values = resolveRequiredFieldValues(profile, metadata)
  const filledCount = REQUIRED_PROFILE_FIELDS.filter(
    ({ key }) => hasText(values[key]),
  ).length
  return Math.round((filledCount / REQUIRED_PROFILE_FIELD_COUNT) * 100)
}

/**
 * Returns the list of missing required profile fields with human-readable labels.
 * Empty array when profile is 100% complete.
 */
export function getMissingProfileFields(
  profile?: CanonicalProfileFields | null,
  metadata?: CanonicalProfileFields | null,
): { key: string; label: string }[] {
  const values = resolveRequiredFieldValues(profile, metadata)
  return REQUIRED_PROFILE_FIELDS.filter(
    ({ key }) => !hasText(values[key]),
  ).map(({ key, label }) => ({ key, label }))
}
