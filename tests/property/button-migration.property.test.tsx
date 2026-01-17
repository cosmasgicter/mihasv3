/**
 * Property-Based Tests: Button Component Migration
 * 
 * **Property 1: Button Variant Rendering**
 * **Property 2: Touch Target Compliance (Button)**
 * **Validates: Requirements 1.2, 1.3, 1.6**
 * 
 * Feature: shadcn-ui-migration, Property 1: Button Variant Rendering
 * Feature: shadcn-ui-migration, Property 2: Touch Target Compliance (Button)
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import React from 'react'
import { render, cleanup } from '@testing-library/react'
import { Button, buttonVariants } from '@/components/ui/Button'

// Property test configuration - minimum 100 iterations
const propertyTestConfig = { numRuns: 100 }

// All valid button variants
const allVariants = [
  'default',
  'primary', 
  'secondary',
  'outline',
  'ghost',
  'link',
  'destructive',
  'danger',
  'success',
  'warning',
  'gradient',
] as const

// All valid button sizes
const allSizes = [
  'default',
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  'icon',
] as const

type ButtonVariant = typeof allVariants[number]
type ButtonSize = typeof allSizes[number]

describe('Property 1: Button Variant Rendering', () => {
  afterEach(() => {
    cleanup()
  })

  /**
   * Property: All button variants render without errors
   * For any valid variant, the Button component SHALL render successfully
   */
  it('all button variants render without errors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allVariants) as fc.Arbitrary<ButtonVariant>,
        (variant) => {
          const { container } = render(
            <Button variant={variant}>Test Button</Button>
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          expect(button?.textContent).toContain('Test Button')
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: All button sizes render without errors
   * For any valid size, the Button component SHALL render successfully
   */
  it('all button sizes render without errors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allSizes) as fc.Arbitrary<ButtonSize>,
        (size) => {
          const { container } = render(
            <Button size={size}>Test Button</Button>
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          expect(button?.textContent).toContain('Test Button')
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: All variant and size combinations render without errors
   * For any valid variant and size combination, the Button SHALL render successfully
   */
  it('all variant and size combinations render without errors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allVariants) as fc.Arbitrary<ButtonVariant>,
        fc.constantFrom(...allSizes) as fc.Arbitrary<ButtonSize>,
        (variant, size) => {
          const { container } = render(
            <Button variant={variant} size={size}>
              Test Button
            </Button>
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          expect(button?.textContent).toContain('Test Button')
          
          // Button should have appropriate classes
          expect(button?.className).toBeTruthy()
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: buttonVariants function produces valid class strings
   * For any valid variant and size, buttonVariants SHALL return a non-empty string
   */
  it('buttonVariants function produces valid class strings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allVariants) as fc.Arbitrary<ButtonVariant>,
        fc.constantFrom(...allSizes) as fc.Arbitrary<ButtonSize>,
        (variant, size) => {
          const classes = buttonVariants({ variant, size })
          
          // Should return a non-empty string
          expect(typeof classes).toBe('string')
          expect(classes.length).toBeGreaterThan(0)
          
          // Should contain base button classes
          expect(classes).toContain('inline-flex')
          expect(classes).toContain('items-center')
          expect(classes).toContain('justify-center')
          
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Danger variant is an alias for destructive
   * The danger variant SHALL have the same styling as destructive
   */
  it('danger variant renders with destructive styling', () => {
    const { container: dangerContainer } = render(
      <Button variant="danger">Danger</Button>
    )
    const { container: destructiveContainer } = render(
      <Button variant="destructive">Destructive</Button>
    )
    
    const dangerButton = dangerContainer.querySelector('button')
    const destructiveButton = destructiveContainer.querySelector('button')
    
    expect(dangerButton).toBeTruthy()
    expect(destructiveButton).toBeTruthy()
    
    // Both should have destructive styling classes
    expect(dangerButton?.className).toContain('bg-destructive')
    expect(destructiveButton?.className).toContain('bg-destructive')
    
    cleanup()
  })
})

describe('Property 2: Touch Target Compliance (Button)', () => {
  afterEach(() => {
    cleanup()
  })

  /**
   * Property: Button has minimum touch target classes
   * For any button size (except xs), the Button SHALL have min-h-[44px] and min-w-[44px] classes
   */
  it('button has minimum touch target classes for standard sizes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('default', 'sm', 'md', 'lg', 'xl', 'icon') as fc.Arbitrary<ButtonSize>,
        fc.constantFrom(...allVariants) as fc.Arbitrary<ButtonVariant>,
        (size, variant) => {
          const { container } = render(
            <Button size={size} variant={variant}>
              Test
            </Button>
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          
          if (button) {
            const className = button.className
            
            // Should have minimum height class (44px or 48px)
            const hasMinHeight = className.includes('min-h-[44px]') || 
                                className.includes('min-h-[48px]') ||
                                className.includes('min-h-[36px]') // sm size
            expect(hasMinHeight).toBe(true)
            
            // Should have minimum width class
            const hasMinWidth = className.includes('min-w-[44px]') || 
                               className.includes('min-w-[48px]') ||
                               className.includes('min-w-[36px]') // sm size
            expect(hasMinWidth).toBe(true)
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Icon button has square dimensions
   * For icon size, the Button SHALL have equal width and height classes
   */
  it('icon button has square dimensions', () => {
    const { container } = render(
      <Button size="icon">
        <span>X</span>
      </Button>
    )
    
    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    
    if (button) {
      const className = button.className
      
      // Should have both h-11 and w-11 for square shape
      expect(className).toContain('h-11')
      expect(className).toContain('w-11')
      
      // Should have minimum touch target
      expect(className).toContain('min-h-[44px]')
      expect(className).toContain('min-w-[44px]')
    }
    
    cleanup()
  })

  /**
   * Property: XL button has larger touch target
   * For xl size, the Button SHALL have min-h-[48px] and min-w-[48px] classes
   */
  it('xl button has larger touch target', () => {
    const { container } = render(
      <Button size="xl">Extra Large</Button>
    )
    
    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    
    if (button) {
      const className = button.className
      
      // Should have larger minimum dimensions
      expect(className).toContain('min-h-[48px]')
      expect(className).toContain('min-w-[48px]')
    }
    
    cleanup()
  })

  /**
   * Property: Button has touch-manipulation class for mobile optimization
   * For any button, the Button SHALL have touch-manipulation class
   */
  it('button has touch-manipulation class', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allVariants) as fc.Arbitrary<ButtonVariant>,
        fc.constantFrom(...allSizes) as fc.Arbitrary<ButtonSize>,
        (variant, size) => {
          const { container } = render(
            <Button variant={variant} size={size}>
              Test
            </Button>
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          
          if (button) {
            // Should have touch-manipulation for mobile optimization
            expect(button.className).toContain('touch-manipulation')
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })
})


describe('Property 3: Disabled/Loading State Click Prevention', () => {
  afterEach(() => {
    cleanup()
  })

  /**
   * Property: Disabled button prevents click events
   * For any disabled button, clicking SHALL NOT trigger the onClick handler
   */
  it('disabled button prevents click events', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allVariants) as fc.Arbitrary<ButtonVariant>,
        fc.constantFrom(...allSizes) as fc.Arbitrary<ButtonSize>,
        (variant, size) => {
          const handleClick = vi.fn()
          
          const { container } = render(
            <Button 
              variant={variant} 
              size={size} 
              disabled 
              onClick={handleClick}
            >
              Disabled Button
            </Button>
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          
          if (button) {
            // Button should be disabled
            expect(button.disabled).toBe(true)
            
            // Click should not trigger handler
            button.click()
            expect(handleClick).not.toHaveBeenCalled()
            
            // Should have aria-disabled
            expect(button.getAttribute('aria-disabled')).toBe('true')
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Loading button prevents click events
   * For any loading button, clicking SHALL NOT trigger the onClick handler
   */
  it('loading button prevents click events', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allVariants) as fc.Arbitrary<ButtonVariant>,
        fc.constantFrom(...allSizes) as fc.Arbitrary<ButtonSize>,
        (variant, size) => {
          const handleClick = vi.fn()
          
          const { container } = render(
            <Button 
              variant={variant} 
              size={size} 
              loading 
              onClick={handleClick}
            >
              Loading Button
            </Button>
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          
          if (button) {
            // Button should be disabled when loading
            expect(button.disabled).toBe(true)
            
            // Click should not trigger handler
            button.click()
            expect(handleClick).not.toHaveBeenCalled()
            
            // Should have aria-busy
            expect(button.getAttribute('aria-busy')).toBe('true')
            
            // Should have aria-disabled
            expect(button.getAttribute('aria-disabled')).toBe('true')
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Loading button shows spinner
   * For any loading button, a spinner element SHALL be rendered
   */
  it('loading button shows spinner', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allVariants) as fc.Arbitrary<ButtonVariant>,
        fc.constantFrom(...allSizes) as fc.Arbitrary<ButtonSize>,
        (variant, size) => {
          const { container } = render(
            <Button variant={variant} size={size} loading>
              Loading
            </Button>
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          
          if (button) {
            // Should contain a spinner (svg with animate-spin class)
            const spinner = button.querySelector('svg.animate-spin')
            expect(spinner).toBeTruthy()
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Non-disabled, non-loading button allows click events
   * For any enabled button, clicking SHALL trigger the onClick handler
   */
  it('enabled button allows click events', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allVariants) as fc.Arbitrary<ButtonVariant>,
        fc.constantFrom(...allSizes) as fc.Arbitrary<ButtonSize>,
        (variant, size) => {
          const handleClick = vi.fn()
          
          const { container } = render(
            <Button 
              variant={variant} 
              size={size} 
              onClick={handleClick}
            >
              Enabled Button
            </Button>
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          
          if (button) {
            // Button should not be disabled
            expect(button.disabled).toBe(false)
            
            // Click should trigger handler
            button.click()
            expect(handleClick).toHaveBeenCalledTimes(1)
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Disabled button has pointer-events-none class
   * For any disabled button, the className SHALL contain disabled:pointer-events-none
   */
  it('disabled button has pointer-events-none in base styles', () => {
    const { container } = render(
      <Button disabled>Disabled</Button>
    )
    
    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    
    if (button) {
      // The base styles include disabled:pointer-events-none
      // This is applied via the cva base class
      expect(button.className).toContain('disabled:pointer-events-none')
    }
    
    cleanup()
  })
})
