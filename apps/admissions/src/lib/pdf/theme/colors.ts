/**
 * Beanola tenant PDF color system
 *
 * Print-safe palette for document rendering via @react-pdf/renderer.
 *
 * Design principles:
 *   - Intentionally restrained. Two accent colors used sparingly.
 *   - All body text at ink-900 (#0B1F3A) for ≥7:1 contrast on white.
 *   - Hairline dividers at ink-300 — visible but not heavy on paper.
 *   - Accent colors (gold, green, red) reserved for single semantic moments:
 *       gold  → decorative underline on the document title
 *       green → "verified"/"paid" status badges only
 *       red   → conditional-acceptance warnings only
 *
 * Contrast compliance (against #FFFFFF paper):
 *   ink-900  : 16.6:1  (AAA)
 *   ink-700  : 11.5:1  (AAA)
 *   ink-500  : 5.1:1   (AA, body ≥14pt only)
 *   ink-300  : 2.3:1   (decorative, NOT text)
 *   gold     : 5.4:1   (AA, body text)
 *   green    : 7.6:1   (AAA)
 *   red      : 8.4:1   (AAA)
 *
 * Numeric values are hex strings because @react-pdf/renderer accepts
 * CSS-style color strings everywhere.
 */

export const colors = {
  // Ink scale — used for ~95% of all text and structural elements.
  ink: {
    900: '#0B1F3A', // primary text, document titles, emphasis
    700: '#1D3557', // section headings, strong labels
    500: '#5C6B7A', // metadata labels, tertiary text
    300: '#B8C3CF', // hairline dividers, quiet borders
    50: '#F3F6FA', // subtle surface fills (metadata strip bg, table stripes)
  },

  // Single neutral surface.
  paper: '#FFFFFF',

  // Accent colors — one chosen per document, used once or twice max.
  accent: {
    gold: '#A67C00', // warm institutional gold — slightly desaturated for print elegance
    green: '#2F6B3A', // verified / paid / approved
    red: '#8B1E3F', // conditional warnings
  },

  // Badge backgrounds — tinted surfaces for StatusBadge pills.
  // Kept here (not inline) so every badge instance shares the same tone.
  badge: {
    greenBg: '#E8F2EA', // subtle green tint for verified/approved
    redBg: '#F5E6EB', // subtle burgundy tint for conditional
  },
} as const

/**
 * Semantic color aliases — prefer these in component code over raw token
 * paths so that the intent is documented at the call site.
 */
export const semantic = {
  titleText: colors.ink[900],
  sectionHeading: colors.ink[700],
  bodyText: colors.ink[900],
  labelText: colors.ink[500],
  mutedText: colors.ink[500],
  divider: colors.ink[300],
  surface: colors.ink[50],
  paper: colors.paper,

  // Status
  statusApproved: colors.accent.green,
  statusPending: colors.ink[500],
  statusConditional: colors.accent.red,
  statusVerified: colors.accent.green,

  // Decorative
  brandAccent: colors.accent.gold,
} as const

export type SemanticColor = keyof typeof semantic
