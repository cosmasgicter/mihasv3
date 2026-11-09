/**
 * Zambian MSISDN validator + normaliser.
 *
 * Task 32.1 of the payment-hardening spec. Accepts every Zambian phone
 * shape the PaymentForm encounters — `+260XXXXXXXXX`, `0XXXXXXXXX`,
 * `260XXXXXXXXX`, bare 9-digit — and normalises to the canonical
 * `+260XXXXXXXXX` E.164 form.
 *
 * The client MUST NOT infer or return the mobile-money operator from the
 * number. Operator derivation is a backend responsibility
 * (`backend/apps/documents/payment_service.py::_operator_for_msisdn`).
 * This module deliberately exposes only format validation + canonical
 * normalisation — no operator hint.
 *
 * Pure functions, no I/O, deterministic and idempotent.
 *
 * Requirements: R11.5, R14.5.
 */

import { z } from 'zod'

/**
 * Strip whitespace, dashes, and parentheses from an input string.
 *
 * Pure helper used by both the normaliser and the Zod refinement.
 */
function stripSeparators(raw: string): string {
  return raw.replace(/[\s\-()\t]/g, '')
}

/**
 * Return the canonical `+260XXXXXXXXX` form of a Zambian MSISDN, or
 * `null` when the input does not match any supported shape.
 *
 * Supported shapes (after stripping whitespace / dashes / parens):
 *   `+260XXXXXXXXX` — already E.164 (12 digits after `+`).
 *   `260XXXXXXXXX`  — country code without `+` (12 digits).
 *   `0XXXXXXXXX`    — national trunk prefix (10 digits, starts with 0).
 *   `XXXXXXXXX`     — bare 9-digit subscriber number.
 *
 * Idempotent: `normalizeZambianMsisdn(normalizeZambianMsisdn(x) ?? '')`
 * equals `normalizeZambianMsisdn(x)` for every valid input.
 */
export function normalizeZambianMsisdn(input: string): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const cleaned = stripSeparators(input.trim())
  if (!cleaned) {
    return null
  }

  // Accept an optional leading `+` and require pure digits after it.
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned
  if (!/^\d+$/.test(digits)) {
    return null
  }

  // `+260XXXXXXXXX` / `260XXXXXXXXX` — 12 digits, starts with `260`.
  if (digits.length === 12 && digits.startsWith('260')) {
    return `+${digits}`
  }

  // `0XXXXXXXXX` — 10 digits, starts with `0`.
  if (digits.length === 10 && digits.startsWith('0')) {
    return `+260${digits.slice(1)}`
  }

  // Bare 9-digit subscriber number.
  if (digits.length === 9) {
    return `+260${digits}`
  }

  return null
}

/**
 * Zod schema that accepts any supported Zambian MSISDN shape and
 * transforms it to canonical `+260XXXXXXXXX` on success.
 *
 * Typed as `ReturnType<typeof buildSchema>` so the concrete Zod type
 * (which differs between Zod v3's `ZodEffects` and v4's equivalent)
 * stays in step with whichever version the project uses.
 */
function buildSchema() {
  return z.string().transform((raw, ctx) => {
    const normalized = normalizeZambianMsisdn(raw)
    if (normalized === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid Zambian mobile number',
      })
      return z.NEVER
    }
    return normalized
  })
}

export const zambianMsisdnSchema = buildSchema()

/**
 * Registration-only phone schema (student-journey-repair R8-b).
 *
 * Both normalisers read `+260` followed by six digits as a bare nine-digit
 * subscriber number, which would store the typo `+260977123` as
 * `+260260977123`. Registration refuses it instead: an input that starts with
 * `+` (separators stripped) must be `+260` plus exactly nine digits. Every
 * other shape is handled by `zambianMsisdnSchema`. The shared normaliser is
 * untouched, so mobile-money normalisation stays byte-for-byte the same.
 */
const REGISTRATION_PHONE_MESSAGE =
  'Enter a Zambian mobile number, for example 0977654321 or +260977654321.'

export const registrationPhoneSchema = z.string().transform((raw, ctx) => {
  const cleaned = stripSeparators(typeof raw === 'string' ? raw.trim() : '')
  if (cleaned.startsWith('+') && !/^\+260\d{9}$/.test(cleaned)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: REGISTRATION_PHONE_MESSAGE })
    return z.NEVER
  }
  const normalized = normalizeZambianMsisdn(raw)
  if (normalized === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: REGISTRATION_PHONE_MESSAGE })
    return z.NEVER
  }
  return normalized
})
