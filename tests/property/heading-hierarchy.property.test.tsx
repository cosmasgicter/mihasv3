/**
 * Property-Based Test: Heading Hierarchy Correctness
 * 
 * **Property 11: Heading Hierarchy Correctness**
 * **Validates: Requirements 10.4**
 * 
 * For any page in the Frontend_System, the heading elements (h1-h6) SHALL follow
 * a logical hierarchy where h1 appears exactly once, and subsequent headings do
 * not skip levels (e.g., h2 followed by h4 without h3 is invalid).
 * 
 * Feature: frontend-visual-overhaul, Property 11: Heading Hierarchy Correctness
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { render, cleanup } from '@testing-library/react'
import {
  validateHeadingHierarchy,
  extractHeadingLevels,
  HeadingLevel,
} from '@/lib/accessibility-utils'
import {
  Heading,
  HeadingLevelProvider,
  PageTitle,
  SectionTitle,
  Section,
} from '@/components/ui/HeadingHierarchy'

// Property test configuration - minimum 100 iterations
const propertyTestConfig = { numRuns: 100 }

describe('Property 11: Heading Hierarchy Correctness', () => {
  afterEach(() => {
    cleanup()
  })

  /**
   * Property: Valid hierarchy starts with h1
   * For any valid heading hierarchy, the first heading SHALL be h1
   */
  it('Valid hierarchy starts with h1', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 6 }) as fc.Arbitrary<HeadingLevel>, { minLength: 1, maxLength: 10 }),
        (headings) => {
          // Only test hierarchies that start with h1
          if (headings[0] !== 1) {
            const isValid = validateHeadingHierarchy(headings)
            expect(isValid).toBe(false)
          }
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Valid hierarchy has exactly one h1
   * For any valid heading hierarchy, there SHALL be exactly one h1
   */
  it('Valid hierarchy has exactly one h1', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 6 }) as fc.Arbitrary<HeadingLevel>, { minLength: 2, maxLength: 10 }),
        (headings) => {
          const h1Count = headings.filter(h => h === 1).length
          
          if (h1Count !== 1) {
            const isValid = validateHeadingHierarchy(headings)
            expect(isValid).toBe(false)
          }
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Skipped levels are invalid
   * For any heading sequence that skips levels, validation SHALL fail
   */
  it('Skipped levels are invalid', () => {
    // Test specific cases of skipped levels
    const invalidHierarchies: HeadingLevel[][] = [
      [1, 3], // h1 -> h3 (skips h2)
      [1, 2, 4], // h1 -> h2 -> h4 (skips h3)
      [1, 2, 3, 5], // h1 -> h2 -> h3 -> h5 (skips h4)
      [1, 4], // h1 -> h4 (skips h2, h3)
      [1, 2, 2, 4], // h1 -> h2 -> h2 -> h4 (skips h3)
    ]
    
    invalidHierarchies.forEach(hierarchy => {
      const isValid = validateHeadingHierarchy(hierarchy)
      expect(isValid).toBe(false)
    })
  })

  /**
   * Property: Going down levels is always valid
   * For any heading, going to a lower level (h2 -> h1) SHALL be valid
   */
  it('Going down levels is always valid', () => {
    // Valid hierarchies that go down levels
    const validHierarchies: HeadingLevel[][] = [
      [1, 2, 3, 2], // h1 -> h2 -> h3 -> h2
      [1, 2, 3, 4, 2], // h1 -> h2 -> h3 -> h4 -> h2
      [1, 2, 3, 2, 3], // h1 -> h2 -> h3 -> h2 -> h3
      [1, 2, 2, 2], // h1 -> h2 -> h2 -> h2
      [1, 2, 3, 4, 5, 6, 2], // Deep then back up
    ]
    
    validHierarchies.forEach(hierarchy => {
      const isValid = validateHeadingHierarchy(hierarchy)
      expect(isValid).toBe(true)
    })
  })

  /**
   * Property: Empty hierarchy is valid
   * An empty heading array SHALL be considered valid
   */
  it('Empty hierarchy is valid', () => {
    const isValid = validateHeadingHierarchy([])
    expect(isValid).toBe(true)
  })

  /**
   * Property: Single h1 is valid
   * A hierarchy with only h1 SHALL be valid
   */
  it('Single h1 is valid', () => {
    const isValid = validateHeadingHierarchy([1])
    expect(isValid).toBe(true)
  })

  /**
   * Property: Sequential levels are always valid
   * For any sequence h1 -> h2 -> h3 -> ... -> hn, it SHALL be valid
   */
  it('Sequential levels are always valid', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        (maxLevel) => {
          const hierarchy: HeadingLevel[] = []
          for (let i = 1; i <= maxLevel; i++) {
            hierarchy.push(i as HeadingLevel)
          }
          
          const isValid = validateHeadingHierarchy(hierarchy)
          expect(isValid).toBe(true)
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Heading component renders correct level
   * For any heading level, the Heading component SHALL render the correct tag
   */
  it('Heading component renders correct level', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }) as fc.Arbitrary<HeadingLevel>,
        fc.string({ minLength: 1, maxLength: 50 }),
        (level, text) => {
          const { container } = render(
            <Heading level={level}>{text}</Heading>
          )
          
          const heading = container.querySelector(`h${level}`)
          expect(heading).toBeTruthy()
          expect(heading?.textContent).toBe(text)
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: PageTitle renders as h1
   * PageTitle component SHALL always render as h1
   */
  it('PageTitle renders as h1', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (text) => {
          const { container } = render(
            <PageTitle>{text}</PageTitle>
          )
          
          const h1 = container.querySelector('h1')
          expect(h1).toBeTruthy()
          expect(h1?.textContent).toBe(text)
          
          // Should not have other heading levels
          expect(container.querySelector('h2')).toBeNull()
          expect(container.querySelector('h3')).toBeNull()
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: SectionTitle renders with context level
   * SectionTitle component SHALL render with the level from context
   */
  it('SectionTitle renders with context level', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 2, max: 6 }) as fc.Arbitrary<HeadingLevel>,
        (text, level) => {
          const { container } = render(
            <HeadingLevelProvider level={level}>
              <SectionTitle>{text}</SectionTitle>
            </HeadingLevelProvider>
          )
          
          const heading = container.querySelector(`h${level}`)
          expect(heading).toBeTruthy()
          expect(heading?.textContent).toBe(text)
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Section increments heading level
   * Section component SHALL increment the heading level for children
   */
  it('Section increments heading level', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<HeadingLevel>,
        (text, startLevel) => {
          const expectedLevel = Math.min(startLevel + 1, 6)
          
          const { container } = render(
            <HeadingLevelProvider level={startLevel}>
              <Section>
                <SectionTitle>{text}</SectionTitle>
              </Section>
            </HeadingLevelProvider>
          )
          
          const heading = container.querySelector(`h${expectedLevel}`)
          expect(heading).toBeTruthy()
          expect(heading?.textContent).toBe(text)
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: extractHeadingLevels returns correct levels
   * For any DOM with headings, extractHeadingLevels SHALL return correct levels
   */
  it('extractHeadingLevels returns correct levels', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 6 }) as fc.Arbitrary<HeadingLevel>, { minLength: 1, maxLength: 5 }),
        (levels) => {
          const { container } = render(
            <div>
              {levels.map((level, index) => (
                <Heading key={index} level={level}>
                  Heading {index}
                </Heading>
              ))}
            </div>
          )
          
          const extracted = extractHeadingLevels(container)
          
          expect(extracted).toEqual(levels)
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Nested sections maintain hierarchy
   * Nested Section components SHALL produce valid hierarchy
   */
  it('Nested sections maintain hierarchy', () => {
    const { container } = render(
      <HeadingLevelProvider level={1}>
        <Heading level={1}>Page Title</Heading>
        <Section>
          <SectionTitle>Section 1</SectionTitle>
          <Section>
            <SectionTitle>Subsection 1.1</SectionTitle>
          </Section>
        </Section>
        <Section>
          <SectionTitle>Section 2</SectionTitle>
        </Section>
      </HeadingLevelProvider>
    )
    
    const levels = extractHeadingLevels(container)
    const isValid = validateHeadingHierarchy(levels)
    
    expect(isValid).toBe(true)
    expect(levels).toEqual([1, 2, 3, 2])
  })

  /**
   * Property: Heading has accessible attributes
   * For any heading, it SHALL have proper accessibility attributes
   */
  it('Heading has accessible attributes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }) as fc.Arbitrary<HeadingLevel>,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
        (level, text, id) => {
          const { container } = render(
            <Heading level={level} id={id}>
              {text}
            </Heading>
          )
          
          const heading = container.querySelector(`h${level}`)
          expect(heading).toBeTruthy()
          
          // If id provided, should be set
          if (id) {
            expect(heading?.getAttribute('id')).toBe(id)
          }
          
          // Should have text content (accessible name)
          expect(heading?.textContent?.trim()).toBeTruthy()
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })
})
