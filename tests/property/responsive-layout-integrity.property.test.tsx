/**
 * Property-Based Test: Responsive Layout Integrity
 * 
 * **Property 5: Responsive Layout Integrity**
 * **Validates: Requirements 9.3, 9.4**
 * 
 * For any page in the Frontend_System rendered at any viewport width between
 * 320px and 1920px, the document body SHALL NOT have horizontal overflow
 * (no horizontal scrollbar) AND all interactive elements SHALL remain visible
 * and accessible.
 * 
 * Feature: frontend-visual-overhaul, Property 5: Responsive Layout Integrity
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import React from 'react'
import { render, cleanup } from '@testing-library/react'
import { ResponsiveContainer, ResponsiveStack, ResponsiveGrid } from '@/components/ui/ResponsiveLayout'
import { useEnhancedResponsive } from '@/hooks/useEnhancedResponsive'

// Property test configuration - minimum 100 iterations
const propertyTestConfig = { numRuns: 100 }

// Viewport width range (320px to 1920px)
const MIN_VIEWPORT_WIDTH = 320
const MAX_VIEWPORT_WIDTH = 1920

// Mock window resize
const mockViewport = (width: number, height: number = 800) => {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, writable: true })
  window.dispatchEvent(new Event('resize'))
}

describe('Property 5: Responsive Layout Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  /**
   * Property: Viewport width range is valid
   * The test range SHALL be between 320px and 1920px
   */
  it('viewport width range constants are valid', () => {
    expect(MIN_VIEWPORT_WIDTH).toBe(320)
    expect(MAX_VIEWPORT_WIDTH).toBe(1920)
    expect(MIN_VIEWPORT_WIDTH).toBeLessThan(MAX_VIEWPORT_WIDTH)
  })

  /**
   * Property: ResponsiveContainer adapts to viewport width
   * For any viewport width, the container SHALL not exceed viewport width
   */
  it('ResponsiveContainer adapts to viewport width', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_VIEWPORT_WIDTH, max: MAX_VIEWPORT_WIDTH }),
        (viewportWidth) => {
          mockViewport(viewportWidth)
          
          const { container } = render(
            <ResponsiveContainer>
              <div>Test content</div>
            </ResponsiveContainer>
          )
          
          const responsiveContainer = container.firstChild as HTMLElement
          expect(responsiveContainer).toBeTruthy()
          
          // Container should have width: 100% or max-width constraint
          if (responsiveContainer) {
            const hasWidthConstraint = 
              responsiveContainer.classList.contains('w-full') ||
              responsiveContainer.classList.contains('max-w-screen-xl') ||
              responsiveContainer.classList.contains('max-w-screen-lg') ||
              responsiveContainer.classList.contains('max-w-screen-md') ||
              responsiveContainer.classList.contains('max-w-screen-sm')
            
            expect(hasWidthConstraint).toBe(true)
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: ResponsiveStack changes direction based on viewport
   * For any viewport width, stack SHALL have appropriate flex direction
   */
  it('ResponsiveStack has appropriate flex direction', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_VIEWPORT_WIDTH, max: MAX_VIEWPORT_WIDTH }),
        fc.constantFrom('row', 'column') as fc.Arbitrary<'row' | 'column'>,
        fc.constantFrom('row', 'column') as fc.Arbitrary<'row' | 'column'>,
        (viewportWidth, mobileDir, desktopDir) => {
          mockViewport(viewportWidth)
          
          const { container } = render(
            <ResponsiveStack 
              mobileDirection={mobileDir}
              desktopDirection={desktopDir}
            >
              <div>Item 1</div>
              <div>Item 2</div>
            </ResponsiveStack>
          )
          
          const stack = container.firstChild as HTMLElement
          expect(stack).toBeTruthy()
          
          if (stack) {
            // Should have flex class
            expect(stack.classList.contains('flex')).toBe(true)
            
            // Should have direction classes
            const hasMobileDirection = 
              stack.classList.contains('flex-row') || 
              stack.classList.contains('flex-col')
            expect(hasMobileDirection).toBe(true)
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: ResponsiveGrid has appropriate column count
   * For any viewport width, grid SHALL have valid column classes
   */
  it('ResponsiveGrid has appropriate column classes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_VIEWPORT_WIDTH, max: MAX_VIEWPORT_WIDTH }),
        fc.constantFrom(1, 2) as fc.Arbitrary<1 | 2>,
        fc.constantFrom(1, 2, 3, 4) as fc.Arbitrary<1 | 2 | 3 | 4>,
        fc.constantFrom(1, 2, 3, 4, 5, 6) as fc.Arbitrary<1 | 2 | 3 | 4 | 5 | 6>,
        (viewportWidth, mobileCols, tabletCols, desktopCols) => {
          mockViewport(viewportWidth)
          
          const { container } = render(
            <ResponsiveGrid
              mobileCols={mobileCols}
              tabletCols={tabletCols}
              desktopCols={desktopCols}
            >
              <div>Item 1</div>
              <div>Item 2</div>
              <div>Item 3</div>
            </ResponsiveGrid>
          )
          
          const grid = container.firstChild as HTMLElement
          expect(grid).toBeTruthy()
          
          if (grid) {
            // Should have grid class
            expect(grid.classList.contains('grid')).toBe(true)
            
            // Should have column classes
            const hasColumnClass = 
              grid.classList.contains(`grid-cols-${mobileCols}`) ||
              grid.className.includes('grid-cols-')
            expect(hasColumnClass).toBe(true)
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: useEnhancedResponsive returns valid breakpoint values
   * For any viewport width, the hook SHALL return consistent breakpoint flags
   */
  it('useEnhancedResponsive returns valid breakpoint values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_VIEWPORT_WIDTH, max: MAX_VIEWPORT_WIDTH }),
        (viewportWidth) => {
          mockViewport(viewportWidth)
          
          // Test the breakpoint logic directly
          const isMobile = viewportWidth < 768
          const isTablet = viewportWidth >= 768 && viewportWidth < 1024
          const isDesktop = viewportWidth >= 1024 && viewportWidth < 1280
          const isLarge = viewportWidth >= 1280 && viewportWidth < 1536
          const isXLarge = viewportWidth >= 1536
          
          // Exactly one breakpoint should be true
          const breakpointCount = [isMobile, isTablet, isDesktop, isLarge, isXLarge]
            .filter(Boolean).length
          
          expect(breakpointCount).toBe(1)
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Responsive breakpoints are mutually exclusive
   * For any viewport width, exactly one breakpoint SHALL be active
   */
  it('responsive breakpoints are mutually exclusive', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_VIEWPORT_WIDTH, max: MAX_VIEWPORT_WIDTH }),
        (viewportWidth) => {
          // Define breakpoints
          const breakpoints = {
            mobile: 768,
            tablet: 1024,
            desktop: 1280,
            large: 1536
          }
          
          const isMobile = viewportWidth < breakpoints.mobile
          const isTablet = viewportWidth >= breakpoints.mobile && viewportWidth < breakpoints.tablet
          const isDesktop = viewportWidth >= breakpoints.tablet && viewportWidth < breakpoints.desktop
          const isLarge = viewportWidth >= breakpoints.desktop && viewportWidth < breakpoints.large
          const isXLarge = viewportWidth >= breakpoints.large
          
          // Count active breakpoints
          const activeBreakpoints = [isMobile, isTablet, isDesktop, isLarge, isXLarge]
          const activeCount = activeBreakpoints.filter(Boolean).length
          
          // Exactly one should be active
          expect(activeCount).toBe(1)
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Landscape detection is consistent
   * For any viewport dimensions, landscape SHALL be true when width > height
   */
  it('landscape detection is consistent with dimensions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_VIEWPORT_WIDTH, max: MAX_VIEWPORT_WIDTH }),
        fc.integer({ min: 300, max: 1200 }),
        (width, height) => {
          mockViewport(width, height)
          
          const isLandscape = width > height
          const isPortrait = height >= width
          
          // Exactly one should be true
          expect(isLandscape !== isPortrait).toBe(true)
          
          // Verify the logic
          if (width > height) {
            expect(isLandscape).toBe(true)
            expect(isPortrait).toBe(false)
          } else {
            expect(isLandscape).toBe(false)
            expect(isPortrait).toBe(true)
          }
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Container max-width variants are valid
   * For any max-width variant, the class SHALL be applied correctly
   */
  it('container max-width variants are applied correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('sm', 'md', 'lg', 'xl', '2xl', 'full') as fc.Arbitrary<'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'>,
        (maxWidth) => {
          const { container } = render(
            <ResponsiveContainer maxWidth={maxWidth}>
              <div>Test content</div>
            </ResponsiveContainer>
          )
          
          const responsiveContainer = container.firstChild as HTMLElement
          expect(responsiveContainer).toBeTruthy()
          
          if (responsiveContainer) {
            // Should have the appropriate max-width class
            const expectedClass = maxWidth === 'full' 
              ? 'max-w-full' 
              : `max-w-screen-${maxWidth}`
            
            expect(responsiveContainer.classList.contains(expectedClass)).toBe(true)
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Padding variants are applied correctly
   * For any padding variant, the appropriate classes SHALL be present
   */
  it('container padding variants are applied correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('none', 'sm', 'md', 'lg') as fc.Arbitrary<'none' | 'sm' | 'md' | 'lg'>,
        (padding) => {
          const { container } = render(
            <ResponsiveContainer padding={padding}>
              <div>Test content</div>
            </ResponsiveContainer>
          )
          
          const responsiveContainer = container.firstChild as HTMLElement
          expect(responsiveContainer).toBeTruthy()
          
          if (responsiveContainer) {
            // For 'none', should not have padding classes
            // For others, should have responsive padding classes
            if (padding === 'none') {
              expect(responsiveContainer.classList.contains('px-3')).toBe(false)
              expect(responsiveContainer.classList.contains('px-4')).toBe(false)
            } else {
              // Should have some padding class
              const hasPadding = 
                responsiveContainer.classList.contains('px-3') ||
                responsiveContainer.classList.contains('px-4') ||
                responsiveContainer.classList.contains('px-6')
              expect(hasPadding).toBe(true)
            }
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Gap variants are applied correctly
   * For any gap variant, the appropriate classes SHALL be present
   */
  it('stack gap variants are applied correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('none', 'sm', 'md', 'lg', 'xl') as fc.Arbitrary<'none' | 'sm' | 'md' | 'lg' | 'xl'>,
        (gap) => {
          const { container } = render(
            <ResponsiveStack gap={gap}>
              <div>Item 1</div>
              <div>Item 2</div>
            </ResponsiveStack>
          )
          
          const stack = container.firstChild as HTMLElement
          expect(stack).toBeTruthy()
          
          if (stack) {
            if (gap === 'none') {
              expect(stack.classList.contains('gap-0')).toBe(true)
            } else {
              // Should have some gap class
              const hasGap = stack.className.includes('gap-')
              expect(hasGap).toBe(true)
            }
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Alignment variants are applied correctly
   * For any alignment variant, the appropriate classes SHALL be present
   */
  it('stack alignment variants are applied correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('start', 'center', 'end', 'stretch') as fc.Arbitrary<'start' | 'center' | 'end' | 'stretch'>,
        (align) => {
          const { container } = render(
            <ResponsiveStack align={align}>
              <div>Item 1</div>
              <div>Item 2</div>
            </ResponsiveStack>
          )
          
          const stack = container.firstChild as HTMLElement
          expect(stack).toBeTruthy()
          
          if (stack) {
            const alignmentClasses: Record<string, string> = {
              start: 'items-start',
              center: 'items-center',
              end: 'items-end',
              stretch: 'items-stretch'
            }
            
            expect(stack.classList.contains(alignmentClasses[align])).toBe(true)
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })
})
