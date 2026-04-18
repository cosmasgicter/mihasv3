// Canonical application number format: {INSTITUTION_CODE}{YEAR}{5-DIGIT-SEQUENCE}
// Examples: MIHAS202500001, KATC202500002
// Backend is the sole generator — this file provides validation and parsing only.

export interface ApplicationNumberConfig {
  institution: string
  year?: number
}

/**
 * Validate an application number matches the canonical format.
 * Accepts: MIHAS202500001, KATC202500002, or legacy APP-YYYYMMDD-XXXXXXXX
 */
export const validateApplicationNumber = (applicationNumber: string): boolean => {
  const canonical = /^[A-Z]{2,10}\d{9,14}$/
  const legacy = /^APP-\d{8}-[A-Z0-9]{8}$/
  return canonical.test(applicationNumber) || legacy.test(applicationNumber)
}

/**
 * Validate a tracking code matches accepted formats.
 * Accepts: TRK-MIHAS2025ABCDEF, TRK-ABCDEF123456, or legacy TRK + 5-6 chars
 */
export const validateTrackingCode = (code: string): boolean => {
  const patterns = [
    /^TRK-[A-Z]{2,10}\d{4}[A-Z0-9]{6}$/,  // TRK-MIHAS2025ABCDEF
    /^TRK-[A-Z0-9]{12}$/,                    // Legacy TRK-ABCDEF123456
    /^TRK[A-Z0-9]{5,6}$/,                    // Legacy TRK370990
  ]
  return patterns.some(p => p.test(code))
}

/**
 * Parse an application number into its components.
 */
export const parseApplicationNumber = (applicationNumber: string): {
  institution: string
  year: number
  sequence: number
} | null => {
  // Canonical format: MIHAS202500001
  const match = applicationNumber.match(/^([A-Z]{2,10})(\d{4})(\d{5,})$/)
  if (match) {
    return {
      institution: match[1]!,
      year: parseInt(match[2]!),
      sequence: parseInt(match[3]!),
    }
  }
  return null
}
