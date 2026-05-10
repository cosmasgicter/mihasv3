/**
 * MIHAS-KATC PDF Spacing System
 *
 * 4-point baseline grid. Values are in points (1 pt = 1/72 inch).
 * @react-pdf/renderer uses points as its unit when no suffix is given.
 *
 * Why this scale:
 *   - 4pt baseline is the print design standard (Bringhurst).
 *   - A4 at 72dpi is 595 × 842 pt; with 42pt margins (6×7 grid multiple),
 *     content area is 511 × 758 — a clean 32-step vertical rhythm.
 *   - Every value is a power-of-two multiple of 4 OR a common typographic
 *     ratio — avoids the "arbitrary number" trap.
 */

export const spacing = {
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const

/**
 * Semantic spacing aliases.
 */
export const space = {
  // Between inline label and value
  fieldGap: spacing[2],

  // Between paragraph lines (paragraph margin-bottom)
  paragraphGap: spacing[2],

  // Between sections within a page — intentionally tight so documents fit
  // on one page for typical content. Letters and forms both benefit from
  // a smaller rhythm than the generous 32pt we started with.
  sectionGap: spacing[4],

  // Inside a card/container
  cardPadding: spacing[4],

  // Between card and its surroundings
  cardMargin: spacing[3],

  // Page margins (A4 safe zone)
  pageMarginX: spacing[10], // 40pt left/right
  pageMarginTop: spacing[6], // 24pt top (header sits inside)
  pageMarginBottom: spacing[10], // 40pt bottom (footer sits inside)
} as const

/**
 * A4 dimensions at 72dpi (pt). @react-pdf/renderer expects `size="A4"` on
 * Page but these constants let us compute offsets for fixed-position elements.
 */
export const pageDimensions = {
  a4Width: 595,
  a4Height: 842,
  get contentWidth() {
    return this.a4Width - space.pageMarginX * 2
  },
  get contentHeight() {
    return this.a4Height - space.pageMarginTop - space.pageMarginBottom
  },
} as const

/**
 * Radius scale — kept minimal. Real documents don't have bubble corners.
 */
export const radius = {
  none: 0,
  sm: 2, // subtle — status badges, chip pills
  md: 4, // cards
  lg: 6, // large surfaces
} as const

/**
 * Border widths in points.
 */
export const borderWidth = {
  hairline: 0.5, // dividers, quiet borders
  thin: 1,
  medium: 1.5,
} as const
