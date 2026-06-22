/**
 * Beanola tenant PDF typography system
 *
 * Four font families, registered once at module load. The TTF files live in
 * `src/lib/pdf/assets/fonts/` and are imported as Vite URL assets (`?url`), so
 * they are emitted as hashed, immutable-cacheable files under `/assets/` at
 * build time rather than being publicly fetchable from `public/`. This keeps
 * the PDF-only fonts off the public web-fetch path (perf-hardening R10.2) while
 * still serving them same-origin to avoid a Google-Fonts-CDN runtime dependency.
 *
 * Scale follows a modular 1.25 (major third) ratio — small enough to feel
 * institutional, large enough for clear hierarchy.
 *
 * Why these faces:
 *   Playfair Display (serif, high-contrast) — document titles. Reads as
 *     formal and institutional. Widely used by academic publishers.
 *   Source Sans 3 (humanist sans, 5-weight family) — body and UI chrome.
 *     Excellent legibility at 10–12pt in print. Open-source Adobe-designed.
 *   JetBrains Mono (slab mono) — reference codes, receipt numbers. Fixed-
 *     width keeps digits aligned. No visible l/1/I confusion.
 */

import { Font } from '@react-pdf/renderer'

// Static single-weight TTF files — one file per registered weight.
// Variable fonts were tried first but @react-pdf/renderer v4 silently
// drops glyphs when weight interpolation is requested against a single
// variable-font file, producing visibly broken text in the rendered PDF.
// Static fonts render every glyph predictably.
//
// Imported via Vite's `?url` suffix so each TTF is emitted as a hashed asset
// under `/assets/` (immutable-cached) and is NOT served from the public
// web-fetch path. @react-pdf fetches the emitted same-origin URL at render
// time. Importing only resolves a string — no network activity until render.
import PLAYFAIR_SEMIBOLD_URL from '../assets/fonts/playfair-display-v40-latin-600.ttf?url'
import PLAYFAIR_BOLD_URL from '../assets/fonts/playfair-display-v40-latin-700.ttf?url'
import SOURCE_SANS_REGULAR_URL from '../assets/fonts/source-sans-3-v19-latin-regular.ttf?url'
import SOURCE_SANS_SEMIBOLD_URL from '../assets/fonts/source-sans-3-v19-latin-600.ttf?url'
import JETBRAINS_MONO_URL from '../assets/fonts/jetbrains-mono-v24-latin-500.ttf?url'
import PINYON_SCRIPT_URL from '../assets/fonts/pinyon-script-v24-latin-regular.ttf?url'

export const FONT_FAMILY = {
  display: 'Playfair Display',
  body: 'Source Sans 3',
  mono: 'JetBrains Mono',
  script: 'Pinyon Script',
} as const

let registered = false

/**
 * Register all document fonts with @react-pdf.
 *
 * Safe to call multiple times — the internal `registered` flag guards
 * against duplicate registration which would otherwise log warnings.
 *
 * Called lazily from renderToBlob() so that importing the barrel does not
 * trigger network/file-system activity until a PDF is actually rendered.
 */
export function registerPdfFonts(): void {
  if (registered) return

  Font.register({
    family: FONT_FAMILY.display,
    fonts: [
      { src: PLAYFAIR_SEMIBOLD_URL, fontWeight: 600 },
      { src: PLAYFAIR_BOLD_URL, fontWeight: 700 },
    ],
  })

  Font.register({
    family: FONT_FAMILY.body,
    fonts: [
      { src: SOURCE_SANS_REGULAR_URL, fontWeight: 400 },
      { src: SOURCE_SANS_SEMIBOLD_URL, fontWeight: 600 },
    ],
  })

  Font.register({
    family: FONT_FAMILY.mono,
    fonts: [{ src: JETBRAINS_MONO_URL, fontWeight: 500 }],
  })

  // Calligraphy font — used only for the signatory name above the
  // signature line on formal letters (acceptance letter). Deliberately
  // single-weight: Pinyon Script has no bold variant (a bold copperplate
  // script is an oxymoron), so fonts array has just one entry.
  Font.register({
    family: FONT_FAMILY.script,
    fonts: [{ src: PINYON_SCRIPT_URL, fontWeight: 400 }],
  })

  // Disable hyphenation globally — unexpected hyphens in names and addresses
  // look unprofessional. @react-pdf word-wraps without breaking instead.
  Font.registerHyphenationCallback((word) => [word])

  registered = true
}

/**
 * Reset registration flag. Used by tests to re-register fonts with mocked URLs.
 * @internal
 */
export function __resetFontRegistration(): void {
  registered = false
}

/**
 * Type-scale — in points. Multiplicative ratio of 1.25.
 * Line-heights use the "1.4× for body, 1.2× for display" convention.
 */
export const typeScale = {
  micro: { size: 7.5, lineHeight: 1.3 },
  caption: { size: 9, lineHeight: 1.4 },
  label: { size: 10, lineHeight: 1.4 },
  body: { size: 11, lineHeight: 1.5 },
  bodyLg: { size: 13, lineHeight: 1.5 },
  subhead: { size: 14, lineHeight: 1.3 },
  heading: { size: 18, lineHeight: 1.25 },
  title: { size: 26, lineHeight: 1.15 },
  display: { size: 32, lineHeight: 1.1 },
} as const

export type TypeScaleKey = keyof typeof typeScale

/**
 * Pre-composed text style presets. Components reference these rather than
 * assembling their own font rules — keeps typography consistent across all
 * three document types.
 */
export const textStyles = {
  // Document title — centered display text at the top of each PageFrame
  documentTitle: {
    fontFamily: FONT_FAMILY.display,
    fontWeight: 700 as const,
    fontSize: typeScale.title.size,
    lineHeight: typeScale.title.lineHeight,
    letterSpacing: -0.4,
  },
  // Section headings — "Applicant Information", "Payment Details", etc.
  sectionHeading: {
    fontFamily: FONT_FAMILY.display,
    fontWeight: 600 as const,
    fontSize: typeScale.heading.size,
    lineHeight: typeScale.heading.lineHeight,
    letterSpacing: -0.2,
  },
  // Body paragraphs in letters
  bodyProse: {
    fontFamily: FONT_FAMILY.body,
    fontWeight: 400 as const,
    fontSize: typeScale.bodyLg.size,
    lineHeight: typeScale.bodyLg.lineHeight,
  },
  // Body in forms and tables
  body: {
    fontFamily: FONT_FAMILY.body,
    fontWeight: 400 as const,
    fontSize: typeScale.body.size,
    lineHeight: typeScale.body.lineHeight,
  },
  bodyStrong: {
    fontFamily: FONT_FAMILY.body,
    fontWeight: 600 as const,
    fontSize: typeScale.body.size,
    lineHeight: typeScale.body.lineHeight,
  },
  // Small labels above values in labeled fields — UPPERCASE + tracking
  label: {
    fontFamily: FONT_FAMILY.body,
    fontWeight: 600 as const,
    fontSize: typeScale.caption.size,
    lineHeight: typeScale.caption.lineHeight,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  // Metadata chips: issue date, reference, etc.
  metadata: {
    fontFamily: FONT_FAMILY.body,
    fontWeight: 400 as const,
    fontSize: typeScale.caption.size,
    lineHeight: typeScale.caption.lineHeight,
  },
  // Reference codes: application number, receipt number, tracking code
  code: {
    fontFamily: FONT_FAMILY.mono,
    fontWeight: 500 as const,
    fontSize: typeScale.body.size,
    lineHeight: typeScale.body.lineHeight,
    letterSpacing: 0.3,
  },
  // Footer disclaimer, page number
  footer: {
    fontFamily: FONT_FAMILY.body,
    fontWeight: 400 as const,
    fontSize: typeScale.micro.size,
    lineHeight: typeScale.micro.lineHeight,
  },
  // Handwritten-style signatory name above the typeset line on letters.
  // Size is deliberately larger than surrounding body text so the signature
  // reads as the visual anchor of the closing block.
  signatureScript: {
    fontFamily: FONT_FAMILY.script,
    fontWeight: 400 as const,
    fontSize: 28,
    lineHeight: 1.2,
  },
} as const

export type TextStyleKey = keyof typeof textStyles
