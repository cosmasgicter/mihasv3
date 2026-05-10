/**
 * Unit tests — PDF theme system
 *
 * Verifies the shape of the exported design tokens and confirms that
 * Font.register() is called exactly once per family regardless of how many
 * times registerPdfFonts() is invoked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @react-pdf/renderer *before* importing the theme module so that
// Font.register doesn't throw in jsdom. Spies are hoisted via vi.hoisted()
// because vi.mock is hoisted to the top of the file and cannot reference
// regular top-level consts.
const { fontRegisterSpy, hyphenationSpy } = vi.hoisted(() => ({
  fontRegisterSpy: vi.fn(),
  hyphenationSpy: vi.fn(),
}))

vi.mock('@react-pdf/renderer', () => ({
  Font: {
    register: fontRegisterSpy,
    registerHyphenationCallback: hyphenationSpy,
  },
}))

import {
  FONT_FAMILY,
  __resetFontRegistration,
  colors,
  getInstitution,
  institutions,
  logos,
  pageDimensions,
  radius,
  registerPdfFonts,
  semantic,
  space,
  spacing,
  textStyles,
  typeScale,
} from '@/lib/pdf/theme'

describe('PDF theme — color system', () => {
  it('exposes the full ink scale with hex values', () => {
    expect(colors.ink[900]).toBe('#0B1F3A')
    expect(colors.ink[700]).toBe('#1D3557')
    expect(colors.ink[500]).toBe('#5C6B7A')
    expect(colors.ink[300]).toBe('#B8C3CF')
    expect(colors.ink[50]).toBe('#F3F6FA')
  })

  it('provides semantic aliases that resolve to concrete hex', () => {
    expect(semantic.titleText).toBe(colors.ink[900])
    expect(semantic.sectionHeading).toBe(colors.ink[700])
    expect(semantic.mutedText).toBe(colors.ink[500])
    expect(semantic.statusApproved).toBe(colors.accent.green)
    expect(semantic.statusConditional).toBe(colors.accent.red)
  })

  it('colors are valid 6-digit hex strings', () => {
    const hexRegex = /^#[0-9A-F]{6}$/
    const allColors = [
      ...Object.values(colors.ink),
      colors.paper,
      ...Object.values(colors.accent),
    ]
    for (const c of allColors) {
      expect(c).toMatch(hexRegex)
    }
  })
})

describe('PDF theme — spacing system', () => {
  it('exposes a 4pt baseline grid', () => {
    expect(spacing[1]).toBe(4)
    expect(spacing[2]).toBe(8)
    expect(spacing[4]).toBe(16)
    expect(spacing[8]).toBe(32)
  })

  it('provides semantic spacing aliases', () => {
    expect(space.pageMarginX).toBe(spacing[10])
    // sectionGap was tightened from 32pt to 16pt during QA review to ensure
    // typical-content documents fit on a single page.
    expect(space.sectionGap).toBe(spacing[4])
    expect(space.cardPadding).toBe(spacing[4])
  })

  it('A4 page dimensions are standard 595x842 pt', () => {
    expect(pageDimensions.a4Width).toBe(595)
    expect(pageDimensions.a4Height).toBe(842)
    expect(pageDimensions.contentWidth).toBe(595 - 40 - 40)
  })

  it('radius scale is monotonic', () => {
    expect(radius.none).toBeLessThan(radius.sm)
    expect(radius.sm).toBeLessThan(radius.md)
    expect(radius.md).toBeLessThan(radius.lg)
  })
})

describe('PDF theme — typography', () => {
  beforeEach(() => {
    fontRegisterSpy.mockClear()
    hyphenationSpy.mockClear()
    __resetFontRegistration()
  })

  it('exposes four font families', () => {
    expect(FONT_FAMILY.display).toBe('Playfair Display')
    expect(FONT_FAMILY.body).toBe('Source Sans 3')
    expect(FONT_FAMILY.mono).toBe('JetBrains Mono')
    expect(FONT_FAMILY.script).toBe('Pinyon Script')
  })

  it('type scale follows increasing size order', () => {
    expect(typeScale.micro.size).toBeLessThan(typeScale.caption.size)
    expect(typeScale.caption.size).toBeLessThan(typeScale.body.size)
    expect(typeScale.body.size).toBeLessThan(typeScale.heading.size)
    expect(typeScale.heading.size).toBeLessThan(typeScale.title.size)
    expect(typeScale.title.size).toBeLessThan(typeScale.display.size)
  })

  it('every text style references a registered font family', () => {
    const validFamilies = new Set(Object.values(FONT_FAMILY))
    for (const style of Object.values(textStyles)) {
      expect(validFamilies.has(style.fontFamily)).toBe(true)
    }
  })

  it('registerPdfFonts registers all four families on first call', () => {
    registerPdfFonts()
    expect(fontRegisterSpy).toHaveBeenCalledTimes(4)
    const families = fontRegisterSpy.mock.calls.map(([arg]) => arg.family)
    expect(families).toEqual([
      'Playfair Display',
      'Source Sans 3',
      'JetBrains Mono',
      'Pinyon Script',
    ])
  })

  it('registerPdfFonts is idempotent across repeated calls', () => {
    registerPdfFonts()
    registerPdfFonts()
    registerPdfFonts()
    expect(fontRegisterSpy).toHaveBeenCalledTimes(4) // still 4, not 12
  })

  it('registers hyphenation callback that returns the word unchanged', () => {
    registerPdfFonts()
    expect(hyphenationSpy).toHaveBeenCalledTimes(1)
    const callback = hyphenationSpy.mock.calls[0][0] as (w: string) => string[]
    expect(callback('admission')).toEqual(['admission'])
    expect(callback('Kalulushi')).toEqual(['Kalulushi'])
  })
})

describe('PDF theme — institutions', () => {
  it('exposes MIHAS and KATC with full metadata', () => {
    expect(institutions.MIHAS.fullName).toBe(
      'Mukuba Institute of Health and Applied Sciences',
    )
    expect(institutions.KATC.fullName).toBe('Kalulushi Training Centre')
    expect(institutions.MIHAS.email).toBe('info@mihas.edu.zm')
    expect(institutions.KATC.email).toBe('info@katc.edu.zm')
  })

  it('exposes the real MIHAS address (Kalulushi, not the placeholder Kitwe address)', () => {
    // Regression: the initial migration guessed "Private Bag E10, Kitwe"
    // — MIHAS actually operates in Kalulushi. The short form must fit in
    // the BrandHeader's narrow address column; detailedAddress carries
    // the landmarks for letters and the contact page.
    expect(institutions.MIHAS.address).toBe(
      'Plot 3375 Off President Avenue, Kalulushi, Zambia',
    )
    expect(institutions.MIHAS.detailedAddress).toContain('Civic Centre')
    expect(institutions.MIHAS.detailedAddress).toContain('Kalulushi General Hospital')
    // Never accidentally re-introduce the wrong city
    expect(institutions.MIHAS.address).not.toContain('Kitwe')
  })

  it('exposes the KATC address distinct from MIHAS', () => {
    // Real KATC address per Google Business Profile — Dag Hammarskjöld
    // Road (note the ö — keep this to catch accidental ASCII flattening).
    expect(institutions.KATC.address).toContain('Dag Hammarskjöld')
    expect(institutions.KATC.address).toContain('Kalulushi')
    expect(institutions.KATC.address).toContain('10101')
    // Different physical location from MIHAS — share a city, not a plot
    expect(institutions.KATC.address).not.toBe(institutions.MIHAS.address)
    expect(institutions.KATC.address).not.toContain('President Avenue')
  })

  it('logos point to existing PNG files in /public', () => {
    expect(logos.mihas).toBe('/images/logos/mihas-logo.png')
    expect(logos.katc).toBe('/images/logos/katc-logo.png')
    expect(logos.mihasFull).toContain('mukuba institute')
    expect(logos.katcFull).toContain('kalulushi training')
  })

  it('getInstitution resolves short codes case-insensitively', () => {
    expect(getInstitution('MIHAS').code).toBe('MIHAS')
    expect(getInstitution('mihas').code).toBe('MIHAS')
    expect(getInstitution('katc').code).toBe('KATC')
  })

  it('getInstitution falls back to MIHAS for null or empty codes silently', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(getInstitution(null).code).toBe('MIHAS')
    expect(getInstitution(undefined).code).toBe('MIHAS')
    expect(getInstitution('').code).toBe('MIHAS')
    // Null/undefined/empty are explicit "no preference" — no warning expected.
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('getInstitution falls back to MIHAS for unknown codes with a console warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(getInstitution('UNZA').code).toBe('MIHAS')
    expect(getInstitution('ZamPost').code).toBe('MIHAS')
    // Each unknown code should produce exactly one warning.
    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Unknown institution code')
    expect(warnSpy.mock.calls[0]?.[0]).toContain('UNZA')
    warnSpy.mockRestore()
  })
})
