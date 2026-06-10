/**
 * Intake-year resolution for admission letters.
 *
 * MIHAS / KATC run two intakes a year: a JULY intake and a JANUARY intake.
 * The official admission letters name the intake by month + year (e.g.
 * "July 2026 Intake", "January 2027 Intake") and the REF line names the
 * intake year and study mode. Hard-coding "2026" drifts out of date and is
 * wrong for January intakes (which fall in the following calendar year).
 *
 * This module computes the correct intake month + year from:
 *   1. an explicit intake string on the application, when it already names a
 *      month and a 4-digit year (we trust and parse it); otherwise
 *   2. the offer date — by selecting the NEXT upcoming intake on/after that
 *      date and rolling the year forward correctly.
 *
 * Roll-forward rule (offer-date based), using intake months July (7) and
 * January (1):
 *   - January (month 1)               → "January {Y}" intake (just commencing).
 *   - February..July (months 2-7)     → "July {Y}" intake.
 *   - August..December (months 8-12)  → "January {Y+1}" intake.
 *
 * Examples:
 *   offer 2026-06-08 → July 2026     (applying in June for July)
 *   offer 2026-07-15 → July 2026     (still within July window)
 *   offer 2026-08-02 → January 2027  (July passed → next is Jan, next year)
 *   offer 2026-12-20 → January 2027
 *   offer 2027-01-10 → January 2027  (within January window)
 *   offer 2027-02-01 → July 2027
 *
 * Everything here is a pure function — no I/O, fully unit-testable.
 */

export type IntakeMonth = 'January' | 'July'

export interface ResolvedIntake {
  /** Intake month name. */
  month: IntakeMonth
  /** Four-digit calendar year of the intake. */
  year: number
  /** Display label, e.g. "July 2026 Intake". */
  label: string
  /** Bare label without the word "Intake", e.g. "July 2026". */
  shortLabel: string
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

function buildIntake(month: IntakeMonth, year: number): ResolvedIntake {
  return {
    month,
    year,
    label: `${month} ${year} Intake`,
    shortLabel: `${month} ${year}`,
  }
}

/**
 * Parse an explicit intake string when it already names a month + 4-digit
 * year, normalising it onto the nearest official intake (July or January).
 * Returns null when the string does not contain a usable month + year.
 */
function parseExplicitIntake(intake: string | null | undefined): ResolvedIntake | null {
  if (!intake) return null
  const text = intake.toLowerCase()
  const yearMatch = text.match(/\b(20\d{2})\b/)
  if (!yearMatch) return null
  const year = Number(yearMatch[1])

  // Find any month name present in the string.
  let monthNum: number | null = null
  for (const [name, num] of Object.entries(MONTHS)) {
    if (text.includes(name)) {
      monthNum = num
      break
    }
  }
  if (monthNum == null) return null

  // Normalise to the nearest official intake month: months 2..7 → July,
  // everything else (8..12, 1) → January. This keeps an oddly-named intake
  // ("June 2026") mapped to the real intake it belongs to ("July 2026").
  if (monthNum >= 2 && monthNum <= 7) {
    return buildIntake('July', year)
  }
  return buildIntake('January', year)
}

/**
 * Compute the next upcoming intake on/after the given reference date.
 *
 * The two intakes run in sequence: July {Y} then January {Y+1}. Mapping by
 * offer month:
 *   - January (1)        → January {Y}  (the January intake just commencing)
 *   - February–July (2–7)→ July {Y}     (upcoming/current July intake)
 *   - August–December    → January {Y+1} (July has closed; next is January)
 */
function nextIntakeFromDate(reference: Date): ResolvedIntake {
  const y = reference.getUTCFullYear()
  const m = reference.getUTCMonth() + 1 // 1..12

  if (m === 1) {
    return buildIntake('January', y)
  }
  if (m <= 7) {
    return buildIntake('July', y)
  }
  return buildIntake('January', y + 1)
}

/**
 * Resolve the intake month + year for an admission letter.
 *
 * Prefers an explicit, well-formed intake string (it is the authoritative
 * record of which intake the student applied to); otherwise derives the next
 * upcoming intake from the offer date.
 *
 * @param intake     The application's intake string (may be a name, may be
 *                   empty, may be a UUID — anything without a 4-digit year is
 *                   ignored).
 * @param offerDate  ISO date string (or Date) of the offer/approval. Defaults
 *                   to now. Used only when `intake` lacks a parseable year.
 */
export function resolveIntake(
  intake: string | null | undefined,
  offerDate?: string | Date | null,
): ResolvedIntake {
  const explicit = parseExplicitIntake(intake)
  if (explicit) return explicit

  let reference = new Date()
  if (offerDate) {
    const parsed = offerDate instanceof Date ? offerDate : new Date(offerDate)
    if (!Number.isNaN(parsed.getTime())) {
      reference = parsed
    }
  }
  return nextIntakeFromDate(reference)
}
