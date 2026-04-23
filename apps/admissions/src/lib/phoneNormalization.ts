/**
 * Canonical Zambian phone normalization.
 *
 * Used by both mobile-money and card/widget payment paths to ensure
 * a single phone format reaches the backend and Lenco gateway.
 */

/** Normalize any Zambian phone input to E.164 format (+260XXXXXXXXX) */
export function normalizeZambianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // +260977... → 260977...
  if (digits.startsWith('260') && digits.length >= 12) {
    return '+' + digits.slice(0, 12)
  }
  // 0977... → +260977...
  if (digits.startsWith('0') && digits.length === 10) {
    return '+260' + digits.slice(1)
  }
  // 977... (9 digits, no leading 0) → +260977...
  if (digits.length === 9) {
    return '+260' + digits
  }
  return digits
}

/** Extract only digits from a phone string */
export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}
