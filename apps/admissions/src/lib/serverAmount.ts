/**
 * Display-only formatting for server-authored money strings.
 *
 * Task 8.1 of `.kiro/specs/admissions-v2-canonical-rebuild/`. The backend is the
 * sole authority on amounts (R12.1): it sends already-quantised decimal strings
 * (`"153.00"`) on the fee quote, and the UI's only job is to put a currency marker
 * in front of them.
 *
 * This module deliberately performs **no arithmetic** — no percentage, no total,
 * no rounding, no default. That is the whole point: finding STU-08 was a client
 * that multiplied the fee by 1.01 and invented a K150/USD 20 fallback. Formatting
 * a string the server already decided cannot drift from what the server will
 * charge.
 */

/** Currency markers for the currencies the platform quotes in. */
const CURRENCY_PREFIX: Record<string, string> = {
  ZMW: 'K',
  USD: '$',
}

/**
 * Format a server-sent decimal string for display.
 *
 * The digits are passed through untouched — only a currency marker is added — so
 * the rendered value is byte-identical to the amount the server authored.
 * Unknown currencies render as `"<CODE> <amount>"`.
 */
export function formatServerAmount(amount: string | null | undefined, currency: string | null | undefined): string {
  const value = (amount ?? '').trim()
  if (!value) return ''
  const code = (currency ?? '').trim().toUpperCase()
  const prefix = CURRENCY_PREFIX[code]
  if (prefix) return `${prefix}${value}`
  return code ? `${code} ${value}` : value
}

/**
 * The plain label for the residency category a fee was resolved for (task 28.2,
 * R13.4). The code is the backend's; a student reads "Zambian applicant rate".
 * An unknown code gives an empty string, so a raw value is never shown in its
 * place.
 */
export function residencyRateLabel(category: string | null | undefined): string {
  switch ((category ?? '').trim().toLowerCase()) {
    case 'local':
      return 'Zambian applicant rate'
    case 'international':
      return 'International applicant rate'
    default:
      return ''
  }
}

/** Whether a server-sent decimal string represents a non-zero amount. */
export function isNonZeroServerAmount(amount: string | null | undefined): boolean {
  const value = (amount ?? '').trim()
  if (!value) return false
  return /[1-9]/.test(value)
}

/**
 * Format an expiry instant as a short local time, for "price held until …" copy.
 *
 * Returns an empty string for a missing or unparseable value rather than
 * inventing a deadline.
 */
export function formatExpiryTime(expiresAt: string | null | undefined): string {
  if (!expiresAt) return ''
  const parsed = Date.parse(expiresAt)
  if (!Number.isFinite(parsed)) return ''
  try {
    return new Date(parsed).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
