/**
 * ECZ exam number decoder.
 *
 * Zambian ECZ exam numbers come in two formats:
 * - 10-digit: CCCCCCCNNN (7-char centre code + 3-char candidate sequence)
 * - 12-digit: YYCCCCCCCNNN (2-char year prefix + 7-char centre code + 3-char candidate sequence)
 *
 * We decode the structural components for display purposes. We do NOT
 * claim verification against ECZ — that requires their private portal.
 */

export interface DecodedExamNumber {
  raw: string
  valid: boolean
  length: 10 | 12 | null
  centreCode: string | null
  candidateSequence: string | null
  yearPrefix: string | null
}

const DIGITS_ONLY = /^\d+$/

export function decodeExamNumber(raw: string | null | undefined): DecodedExamNumber {
  const cleaned = (raw ?? '').trim()

  if (!cleaned || !DIGITS_ONLY.test(cleaned)) {
    return { raw: cleaned, valid: false, length: null, centreCode: null, candidateSequence: null, yearPrefix: null }
  }

  if (cleaned.length === 10) {
    return {
      raw: cleaned,
      valid: true,
      length: 10,
      centreCode: cleaned.slice(0, 7),
      candidateSequence: cleaned.slice(7),
      yearPrefix: null,
    }
  }

  if (cleaned.length === 12) {
    return {
      raw: cleaned,
      valid: true,
      length: 12,
      yearPrefix: cleaned.slice(0, 2),
      centreCode: cleaned.slice(2, 9),
      candidateSequence: cleaned.slice(9),
    }
  }

  return { raw: cleaned, valid: false, length: null, centreCode: null, candidateSequence: null, yearPrefix: null }
}

export function isValidExamNumber(raw: string | null | undefined): boolean {
  return decodeExamNumber(raw).valid
}
