/**
 * Secure Storage — session cleanup and PII stripping utilities.
 *
 * The encryption abstraction was removed because it was never initialized
 * at runtime. Only clearSession() and stripPiiFields() are used.
 */

const STORAGE_PREFIX = 'mihas_secure_'

/** Clear all MIHAS-prefixed items from localStorage */
export async function clearSession(): Promise<void> {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX))
    for (const key of keys) {
      localStorage.removeItem(key)
    }
  } catch {
    // Best-effort — storage may be unavailable
  }
}

const PII_FIELDS = [
  'password', 'token', 'secret', 'nrc', 'passport_number',
  'date_of_birth', 'bank_account', 'credit_card',
  'nrc_number', 'medical_conditions', 'phone', 'email',
]

/** Strip PII fields from an object before persisting */
export function stripPiiFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result = { ...obj }
  for (const field of PII_FIELDS) {
    if (field in result) {
      delete result[field]
    }
  }
  return result
}

