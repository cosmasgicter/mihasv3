/**
 * Property-based tests for color contrast WCAG AA compliance
 * Feature: website-quality-remediation, Property 21: Color contrast meets WCAG AA
 *
 * **Validates: Requirements 15.1, 15.2, 15.3, 15.5**
 *
 * Tests verify that all color token pairs defined in tailwind.config.js
 * meet WCAG 2.1 AA contrast ratio requirements:
 * - Normal text: minimum 4.5:1 contrast ratio
 * - Large text / UI components: minimum 3:1 contrast ratio
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ── WCAG Contrast Ratio Utilities ───────────────────────────────────────

/**
 * Parse a hex color string to RGB components.
 * Supports #RGB, #RRGGBB formats.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '')
  let r: number, g: number, b: number

  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16)
    g = parseInt(cleaned[1] + cleaned[1], 16)
    b = parseInt(cleaned[2] + cleaned[2], 16)
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.substring(0, 2), 16)
    g = parseInt(cleaned.substring(2, 4), 16)
    b = parseInt(cleaned.substring(4, 6), 16)
  } else {
    throw new Error(`Invalid hex color: ${hex}`)
  }

  return { r, g, b }
}

/**
 * Calculate relative luminance per WCAG 2.1 definition.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)

  const linearize = (c: number): number => {
    const sRGB = c / 255
    return sRGB <= 0.04045
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4)
  }

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/**
 * Calculate contrast ratio between two colors per WCAG 2.1.
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 * Returns a value >= 1 (e.g., 4.5 means 4.5:1)
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ── Color Tokens from tailwind.config.js ────────────────────────────────

/** Text color pairs: foreground on background — must meet 4.5:1 (normal text) */
const TEXT_COLOR_PAIRS: Array<{ name: string; fg: string; bg: string }> = [
  { name: 'foreground on background', fg: '#0f172a', bg: '#ffffff' },
  { name: 'primary.foreground on primary', fg: '#ffffff', bg: '#2563eb' },
  { name: 'secondary.foreground on secondary', fg: '#1e293b', bg: '#e0e7ff' },
  { name: 'destructive.foreground on destructive', fg: '#ffffff', bg: '#cc2424' },
  { name: 'muted.foreground on muted', fg: '#374151', bg: '#f1f5f9' },
  { name: 'accent.foreground on accent', fg: '#1e40af', bg: '#dbeafe' },
  { name: 'popover.foreground on popover', fg: '#0f172a', bg: '#ffffff' },
  { name: 'card.foreground on card', fg: '#0f172a', bg: '#ffffff' },
  { name: 'error.foreground on error', fg: '#ffffff', bg: '#cc2424' },
  { name: 'warning.foreground on warning', fg: '#ffffff', bg: '#b45309' },
  { name: 'info.foreground on info', fg: '#ffffff', bg: '#2563eb' },
  { name: 'success.foreground on success', fg: '#ffffff', bg: '#047857' },
  { name: 'admin.text on admin.bg', fg: '#111827', bg: '#f9fafb' },
  { name: 'admin.text-secondary on admin.bg', fg: '#374151', bg: '#f9fafb' },
  { name: 'admin.text-muted on admin.bg', fg: '#6b7280', bg: '#f9fafb' },
]

/** Status/semantic colors on white background — must meet 4.5:1 (normal text) */
const STATUS_ON_WHITE_PAIRS: Array<{ name: string; fg: string; bg: string }> = [
  { name: 'primary on white', fg: '#2563eb', bg: '#ffffff' },
  { name: 'destructive on white', fg: '#cc2424', bg: '#ffffff' },
  { name: 'error on white', fg: '#cc2424', bg: '#ffffff' },
  { name: 'warning on white', fg: '#b45309', bg: '#ffffff' },
  { name: 'success on white', fg: '#047857', bg: '#ffffff' },
  { name: 'info on white', fg: '#2563eb', bg: '#ffffff' },
  { name: 'link on white', fg: '#2563eb', bg: '#ffffff' },
  { name: 'link.hover on white', fg: '#1d4ed8', bg: '#ffffff' },
  { name: 'link.visited on white', fg: '#7c3aed', bg: '#ffffff' },
]

/** UI component colors (borders, icons, focus rings) — must meet 3:1 */
const UI_COMPONENT_PAIRS: Array<{ name: string; fg: string; bg: string }> = [
  { name: 'border on background', fg: '#6b7280', bg: '#ffffff' },
  { name: 'input border on background', fg: '#6b7280', bg: '#ffffff' },
  { name: 'ring (focus) on background', fg: '#2563eb', bg: '#ffffff' },
  { name: 'admin.border on white', fg: '#858c98', bg: '#ffffff' },
  { name: 'admin.border on admin.bg', fg: '#858c98', bg: '#f9fafb' },
]

// ── Property Tests ──────────────────────────────────────────────────────

describe('Color Contrast Property Tests (P21)', () => {

  // **Validates: Requirements 15.1, 15.2, 15.3, 15.5**

  describe('WCAG contrast ratio calculation correctness', () => {
    it('black on white yields 21:1', () => {
      const ratio = contrastRatio('#000000', '#ffffff')
      expect(ratio).toBeCloseTo(21, 0)
    })

    it('white on white yields 1:1', () => {
      const ratio = contrastRatio('#ffffff', '#ffffff')
      expect(ratio).toBeCloseTo(1, 0)
    })

    it('contrast ratio is symmetric (order-independent)', () => {
      const hexColorArb = fc.tuple(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
      ).map(([r, g, b]) =>
        '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')
      )

      fc.assert(
        fc.property(hexColorArb, hexColorArb, (hex1, hex2) => {
          const r1 = contrastRatio(hex1, hex2)
          const r2 = contrastRatio(hex2, hex1)
          expect(r1).toBeCloseTo(r2, 10)
        }),
        { numRuns: 200 },
      )
    })

    it('contrast ratio is always >= 1', () => {
      const hexColorArb = fc.tuple(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
      ).map(([r, g, b]) =>
        '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')
      )

      fc.assert(
        fc.property(hexColorArb, hexColorArb, (hex1, hex2) => {
          const ratio = contrastRatio(hex1, hex2)
          expect(ratio).toBeGreaterThanOrEqual(1)
        }),
        { numRuns: 200 },
      )
    })
  })

  describe('Normal text: 4.5:1 minimum contrast ratio (Req 15.1)', () => {
    it.each(TEXT_COLOR_PAIRS)(
      '$name meets 4.5:1',
      ({ fg, bg }) => {
        const ratio = contrastRatio(fg, bg)
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      }
    )

    it('all text color pairs meet 4.5:1 (property over all pairs)', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...TEXT_COLOR_PAIRS),
          (pair) => {
            const ratio = contrastRatio(pair.fg, pair.bg)
            expect(ratio).toBeGreaterThanOrEqual(4.5)
          }
        ),
        { numRuns: TEXT_COLOR_PAIRS.length * 10 },
      )
    })
  })

  describe('Status colors on white: 4.5:1 minimum (Req 15.1, 15.4)', () => {
    it.each(STATUS_ON_WHITE_PAIRS)(
      '$name meets 4.5:1',
      ({ fg, bg }) => {
        const ratio = contrastRatio(fg, bg)
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      }
    )

    it('all status color pairs on white meet 4.5:1 (property over all pairs)', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...STATUS_ON_WHITE_PAIRS),
          (pair) => {
            const ratio = contrastRatio(pair.fg, pair.bg)
            expect(ratio).toBeGreaterThanOrEqual(4.5)
          }
        ),
        { numRuns: STATUS_ON_WHITE_PAIRS.length * 10 },
      )
    })
  })

  describe('UI components: 3:1 minimum contrast ratio (Req 15.2, 15.3)', () => {
    it.each(UI_COMPONENT_PAIRS)(
      '$name meets 3:1',
      ({ fg, bg }) => {
        const ratio = contrastRatio(fg, bg)
        expect(ratio).toBeGreaterThanOrEqual(3)
      }
    )

    it('all UI component color pairs meet 3:1 (property over all pairs)', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...UI_COMPONENT_PAIRS),
          (pair) => {
            const ratio = contrastRatio(pair.fg, pair.bg)
            expect(ratio).toBeGreaterThanOrEqual(3)
          }
        ),
        { numRuns: UI_COMPONENT_PAIRS.length * 10 },
      )
    })
  })

  describe('Accessible color tokens in tailwind.config.js (Req 15.5)', () => {
    const ALL_PAIRS = [...TEXT_COLOR_PAIRS, ...STATUS_ON_WHITE_PAIRS, ...UI_COMPONENT_PAIRS]

    it('every defined color pair meets its applicable WCAG AA threshold', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...ALL_PAIRS),
          (pair) => {
            const ratio = contrastRatio(pair.fg, pair.bg)
            const isUIComponent = UI_COMPONENT_PAIRS.includes(pair)
            const threshold = isUIComponent ? 3 : 4.5
            expect(ratio).toBeGreaterThanOrEqual(threshold)
          }
        ),
        { numRuns: ALL_PAIRS.length * 5 },
      )
    })
  })
})
