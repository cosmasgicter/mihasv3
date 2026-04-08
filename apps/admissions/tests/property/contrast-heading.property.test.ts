// Feature: ui-ux-quality-audit, Property 2: suggestAccessibleColor always returns a WCAG-compliant color
// Feature: ui-ux-quality-audit, Property 3: Heading hierarchy validation is correct
/**
 * Property 2: suggestAccessibleColor always returns a WCAG-compliant color
 *
 * For any base foreground color, background color, and target contrast ratio
 * (defaulting to 4.5), the color returned by suggestAccessibleColor SHALL have
 * a contrast ratio >= targetRatio against the given background, as computed by
 * getContrastRatio.
 *
 * **Validates: Requirements 2.1, 2.5**
 *
 * Property 3: Heading hierarchy validation is correct
 *
 * For any array of heading levels (1–6), validateHeadingHierarchy SHALL return
 * true if and only if: (a) the first heading is h1, (b) there is exactly one h1,
 * and (c) no heading level increases by more than 1 from its predecessor.
 * For any array violating these rules, it SHALL return false.
 *
 * **Validates: Requirements 4.1, 4.2, 4.6**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  suggestAccessibleColor,
  getContrastRatio,
  validateHeadingHierarchy,
  type HeadingLevel,
} from '@/lib/accessibility-utils'

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a valid 6-char hex color string prefixed with '#' */
const hexColorArb = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  )
  .map(
    ([r, g, b]) =>
      `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
  )

/** Generate a heading level 1–6 */
const headingLevelArb = fc.integer({ min: 1, max: 6 }) as fc.Arbitrary<HeadingLevel>

/** Generate an array of heading levels */
const headingArrayArb = fc.array(headingLevelArb, { minLength: 1, maxLength: 20 })

// ---------------------------------------------------------------------------
// Property 2: suggestAccessibleColor always returns a WCAG-compliant color
// ---------------------------------------------------------------------------

describe('Property 2: suggestAccessibleColor always returns a WCAG-compliant color', () => {
  it('returned color has contrast ratio >= 4.5 against background (default target)', () => {
    fc.assert(
      fc.property(hexColorArb, hexColorArb, (foreground, background) => {
        const suggested = suggestAccessibleColor(foreground, background)
        const ratio = getContrastRatio(suggested, background)

        // The maximum achievable contrast for any background is
        // max(white_ratio, black_ratio). If even that is below 4.5
        // (physically impossible to meet), we verify the function
        // returns the best possible color instead.
        const maxAchievable = Math.max(
          getContrastRatio('#ffffff', background),
          getContrastRatio('#000000', background),
        )

        if (maxAchievable >= 4.5) {
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        } else {
          // Function should return the best it can
          expect(ratio).toBeCloseTo(maxAchievable, 1)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('returned color has contrast ratio >= custom target ratio when achievable', () => {
    fc.assert(
      fc.property(hexColorArb, hexColorArb, (foreground, background) => {
        // Use a range of target ratios that are physically achievable
        // for this specific background
        const maxAchievable = Math.max(
          getContrastRatio('#ffffff', background),
          getContrastRatio('#000000', background),
        )
        // Pick a target ratio that is achievable (between 1 and maxAchievable)
        const targetRatio = 1 + Math.random() * (Math.min(maxAchievable, 7) - 1)

        const suggested = suggestAccessibleColor(foreground, background, targetRatio)
        const ratio = getContrastRatio(suggested, background)
        expect(ratio).toBeGreaterThanOrEqual(targetRatio)
      }),
      { numRuns: 200 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 3: Heading hierarchy validation is correct
// ---------------------------------------------------------------------------

describe('Property 3: Heading hierarchy validation is correct', () => {
  /**
   * Reference implementation of the heading hierarchy rules:
   * (a) first heading is h1
   * (b) exactly one h1
   * (c) no heading level increases by more than 1 from predecessor
   */
  function referenceValidation(headings: HeadingLevel[]): boolean {
    if (headings.length === 0) return true
    if (headings[0] !== 1) return false
    if (headings.filter((h) => h === 1).length !== 1) return false
    for (let i = 1; i < headings.length; i++) {
      if (headings[i]! > headings[i - 1]! + 1) return false
    }
    return true
  }

  it('matches specification rules for any random heading sequence', () => {
    fc.assert(
      fc.property(headingArrayArb, (headings) => {
        const actual = validateHeadingHierarchy(headings)
        const expected = referenceValidation(headings)
        expect(actual).toBe(expected)
      }),
      { numRuns: 500 },
    )
  })

  it('returns true for empty arrays', () => {
    expect(validateHeadingHierarchy([])).toBe(true)
  })

  it('returns false when first heading is not h1', () => {
    const nonH1Start = fc.integer({ min: 2, max: 6 }) as fc.Arbitrary<HeadingLevel>
    const tail = fc.array(headingLevelArb, { minLength: 0, maxLength: 10 })

    fc.assert(
      fc.property(nonH1Start, tail, (first, rest) => {
        expect(validateHeadingHierarchy([first, ...rest])).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it('returns false when multiple h1s exist', () => {
    // Build arrays guaranteed to have at least 2 h1s
    const arrayWithMultipleH1s = fc
      .array(headingLevelArb, { minLength: 0, maxLength: 10 })
      .map((arr) => {
        // Ensure at least two h1s
        const result: HeadingLevel[] = [1, ...arr, 1]
        return result
      })

    fc.assert(
      fc.property(arrayWithMultipleH1s, (headings) => {
        expect(validateHeadingHierarchy(headings)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it('returns false when heading level skips (increases by more than 1)', () => {
    // Generate a valid prefix then inject a skip
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 2, max: 4 }),
        (prefixLen, skipAmount) => {
          // Build a valid descending sequence starting from h1
          const headings: HeadingLevel[] = [1]
          for (let i = 1; i < prefixLen; i++) {
            headings.push(Math.min(headings[i - 1]! + 1, 6) as HeadingLevel)
          }
          // Now inject a skip: jump by more than 1
          const lastLevel = headings[headings.length - 1]!
          const skippedLevel = Math.min(lastLevel + 1 + skipAmount, 6) as HeadingLevel
          if (skippedLevel > lastLevel + 1) {
            headings.push(skippedLevel)
            expect(validateHeadingHierarchy(headings)).toBe(false)
          }
          // If the skip didn't actually exceed +1 (edge case at level 5/6), skip assertion
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns true for valid hierarchies (h1 followed by sequential levels)', () => {
    // Generate valid hierarchies: start with h1, each next level is <= prev+1, no duplicate h1
    const validHierarchyArb = fc
      .array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 15 })
      .map((deltas) => {
        const headings: HeadingLevel[] = [1]
        let current = 1
        for (const delta of deltas) {
          // delta 0 = same level, 1 = go deeper by 1, 2 = go shallower by 1
          if (delta === 0) {
            // same level (but not h1 again)
            if (current === 1) {
              current = 2
            }
          } else if (delta === 1) {
            // go deeper
            current = Math.min(current + 1, 6)
          } else {
            // go shallower
            current = Math.max(current - 1, 2) // never go back to h1
          }
          headings.push(current as HeadingLevel)
        }
        return headings
      })

    fc.assert(
      fc.property(validHierarchyArb, (headings) => {
        expect(validateHeadingHierarchy(headings)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })
})
