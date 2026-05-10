/**
 * MIHAS-KATC PDF Theme — Public Barrel
 *
 * Import everything design-system-related through this file:
 *
 *   import { colors, space, textStyles, logos } from '@/lib/pdf/theme'
 *
 * Never import directly from the sub-files in production code — keeps
 * refactors localized to this barrel.
 */

export { colors, semantic } from './colors'
export type { SemanticColor } from './colors'

export {
  spacing,
  space,
  pageDimensions,
  radius,
  borderWidth,
} from './spacing'

export {
  FONT_FAMILY,
  registerPdfFonts,
  typeScale,
  textStyles,
  __resetFontRegistration,
} from './typography'
export type { TypeScaleKey, TextStyleKey } from './typography'

/**
 * Institution logo asset paths. All files live in /public/images/logos/ and
 * are served same-origin. @react-pdf fetches them at render time via the
 * <Image src={...}> component.
 *
 * The MIHAS and KATC logos exist as both .png and .webp; @react-pdf requires
 * PNG/JPEG (no WebP support as of v4.x), so we use .png variants here.
 */
export const logos = {
  mihas: '/images/logos/mihas-logo.png',
  katc: '/images/logos/katc-logo.png',
  mihasFull: '/images/logos/mukuba institute of health and applied sciences logo.png',
  katcFull: '/images/logos/kalulushi training centre logo.png',
} as const

/**
 * Institution registry — canonical names + logo mapping. Document components
 * call `getInstitution(code)` to resolve any short code into the correct
 * display name and logo path.
 */
export const institutions = {
  MIHAS: {
    code: 'MIHAS',
    shortName: 'MIHAS',
    fullName: 'Mukuba Institute of Health and Allied Sciences',
    logoMark: logos.mihas,
    logoFull: logos.mihasFull,
    // Short form used in the PDF header — narrow column, must fit on one line.
    address: 'Plot 3375 Off President Avenue, Kalulushi, Zambia',
    // Full descriptive address with landmarks — suitable for letters, emails,
    // and the contact page where the extra detail helps applicants find us.
    detailedAddress:
      'Plot 3375 Off President Avenue, Kalulushi — next to the Civic Centre, opposite Kalulushi General Hospital',
    phone: '+260 961 515 151',
    email: 'info@mihas.edu.zm',
  },
  KATC: {
    code: 'KATC',
    shortName: 'KATC',
    fullName: 'Kalulushi Training Centre',
    logoMark: logos.katc,
    logoFull: logos.katcFull,
    address: 'Plot 110206 Dag Hammarskjöld Road, Kalulushi 10101, Zambia',
    detailedAddress:
      'Plot 110206 Dag Hammarskjöld Road, Kalulushi 10101, Zambia',
    phone: '+260 966 992 299',
    email: 'info@katc.edu.zm',
  },
} as const

export type InstitutionCode = keyof typeof institutions
export type Institution = (typeof institutions)[InstitutionCode]

/**
 * Resolve a short code or unknown string into an Institution record.
 *
 * Behaviour:
 *   - null / undefined / empty string  → returns MIHAS silently (caller
 *     explicitly has no preference).
 *   - "MIHAS" / "KATC" (any case)      → returns the matching institution.
 *   - any other non-empty string       → logs a warning and falls back to
 *     MIHAS. The warning is intentional: an unrecognised institution code
 *     almost always means a data-shape bug (e.g. backend sent a new code
 *     we haven't registered yet) and should surface, not be swallowed.
 */
export function getInstitution(code: string | null | undefined): Institution {
  if (!code) return institutions.MIHAS
  const upper = code.toUpperCase() as InstitutionCode
  const match = institutions[upper]
  if (match) return match

  // Intentional surface — silent fallback for unknown codes caused real
  // bugs (e.g. a KATC acceptance letter rendering with the MIHAS header
  // when the code shape drifted). Log so it's visible in error monitoring.
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(
      `[pdf/theme] Unknown institution code "${code}" — falling back to MIHAS. ` +
        `Registered codes: ${Object.keys(institutions).join(', ')}. ` +
        'This usually indicates a backend/frontend contract drift.',
    )
  }
  return institutions.MIHAS
}
