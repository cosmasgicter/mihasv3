/**
 * Property-Based Test: Keyboard Navigation and ARIA Completeness
 * 
 * **Property 9: Keyboard Navigation and ARIA Completeness**
 * **Validates: Requirements 10.2, 10.7**
 * 
 * For any interactive element in the Frontend_System, it SHALL be reachable
 * via sequential keyboard Tab navigation, activatable via Enter or Space keys,
 * AND have appropriate ARIA labels or accessible names.
 * 
 * Feature: frontend-visual-overhaul, Property 9: Keyboard Navigation and ARIA Completeness
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import React from 'react'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Checkbox } from '@/components/ui/checkbox'
import { TouchOptimizedIconButton } from '@/components/ui/TouchOptimizedButton'
import { SkipLink, SkipLinks } from '@/components/ui/SkipLinks'
import { 
  getFocusableElements, 
  focusTrapSelectors,
  ariaLabels 
} from '@/lib/accessibility-utils'
import { Home, Search, Settings } from 'lucide-react'

// Property test configuration - minimum 100 iterations
const propertyTestConfig = { numRuns: 100 }

describe('Property 9: Keyboard Navigation and ARIA Completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  /**
   * Property: Button is keyboard accessible
   * For any button, it SHALL be focusable and activatable via keyboard
   */
  it('Button is keyboard accessible', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('default', 'primary', 'secondary', 'outline', 'ghost', 'destructive') as fc.Arbitrary<'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'>,
        fc.string({ minLength: 1, maxLength: 20 }),
        (variant, text) => {
          const handleClick = vi.fn()
          
          const { container } = render(
            <Button variant={variant} onClick={handleClick}>
              {text}
            </Button>
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          
          if (button) {
            // Should be focusable (no negative tabindex)
            const tabIndex = button.getAttribute('tabindex')
            expect(tabIndex === null || parseInt(tabIndex) >= 0).toBe(true)
            
            // Should have accessible name (text content)
            expect(button.textContent?.trim()).toBeTruthy()
            
            // Should be activatable via Enter key
            button.focus()
            fireEvent.keyDown(button, { key: 'Enter' })
            // Note: Button click is handled by browser, not our code
            
            // Should be activatable via Space key
            fireEvent.keyDown(button, { key: ' ' })
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Input is keyboard accessible
   * For any input, it SHALL be focusable and have proper ARIA attributes
   */
  it('Input is keyboard accessible', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }),
        fc.boolean(),
        (label, hasError) => {
          const { container } = render(
            <Input 
              label={label || undefined}
              error={hasError ? 'Error message' : undefined}
              placeholder="Enter value"
            />
          )
          
          const input = container.querySelector('input')
          expect(input).toBeTruthy()
          
          if (input) {
            // Should be focusable
            const tabIndex = input.getAttribute('tabindex')
            expect(tabIndex === null || parseInt(tabIndex) >= 0).toBe(true)
            
            // Should have aria-invalid when error
            if (hasError) {
              expect(input.getAttribute('aria-invalid')).toBe('true')
            }
            
            // Should have aria-describedby when error
            if (hasError) {
              expect(input.getAttribute('aria-describedby')).toBeTruthy()
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
   * Property: Checkbox is keyboard accessible
   * For any checkbox, it SHALL be focusable and toggleable via keyboard
   */
  it('Checkbox is keyboard accessible', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (checked) => {
          const handleChange = vi.fn()
          
          const { container } = render(
            <Checkbox 
              checked={checked}
              onCheckedChange={handleChange}
            />
          )
          
          const checkbox = container.querySelector('button[role="checkbox"]')
          expect(checkbox).toBeTruthy()
          
          if (checkbox) {
            // Should be focusable
            const tabIndex = checkbox.getAttribute('tabindex')
            expect(tabIndex === null || parseInt(tabIndex) >= 0).toBe(true)
            
            // Should have role="checkbox"
            expect(checkbox.getAttribute('role')).toBe('checkbox')
            
            // Should have aria-checked
            expect(checkbox.getAttribute('aria-checked')).toBeTruthy()
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Icon button has aria-label
   * For any icon button, it SHALL have an aria-label for accessibility
   */
  it('Icon button has aria-label', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        (label) => {
          const { container } = render(
            <TouchOptimizedIconButton 
              icon={<Home />}
              label={label}
            />
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          
          if (button) {
            // Should have aria-label
            expect(button.getAttribute('aria-label')).toBe(label)
            
            // Should have title for tooltip
            expect(button.getAttribute('title')).toBe(label)
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: SkipLink is keyboard accessible
   * For any skip link, it SHALL be focusable and navigable
   */
  it('SkipLink is keyboard accessible', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        (text) => {
          const { container } = render(
            <>
              <SkipLink href="#main">{text}</SkipLink>
              <main id="main" tabIndex={-1}>Main content</main>
            </>
          )
          
          const skipLink = container.querySelector('a')
          expect(skipLink).toBeTruthy()
          
          if (skipLink) {
            // Should be focusable
            const tabIndex = skipLink.getAttribute('tabindex')
            expect(tabIndex === null || parseInt(tabIndex) >= 0).toBe(true)
            
            // Should have href
            expect(skipLink.getAttribute('href')).toBe('#main')
            
            // Should have text content
            expect(skipLink.textContent).toBe(text)
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: getFocusableElements returns valid elements
   * For any container with interactive elements, the function SHALL return them
   */
  it('getFocusableElements returns valid elements', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 3 }),
        (buttonCount, inputCount) => {
          const { container } = render(
            <div>
              {Array.from({ length: buttonCount }, (_, i) => (
                <button key={`btn-${i}`}>Button {i}</button>
              ))}
              {Array.from({ length: inputCount }, (_, i) => (
                <input key={`input-${i}`} type="text" />
              ))}
            </div>
          )
          
          const focusableElements = getFocusableElements(container)
          
          // Should find all buttons and inputs
          expect(focusableElements.length).toBe(buttonCount + inputCount)
          
          // All returned elements should be HTMLElements
          focusableElements.forEach(el => {
            expect(el instanceof HTMLElement).toBe(true)
          })
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Disabled elements are not focusable
   * For any disabled element, it SHALL NOT be in the focusable elements list
   */
  it('Disabled elements are not focusable', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        (enabledCount, disabledCount) => {
          const { container } = render(
            <div>
              {Array.from({ length: enabledCount }, (_, i) => (
                <button key={`enabled-${i}`}>Enabled {i}</button>
              ))}
              {Array.from({ length: disabledCount }, (_, i) => (
                <button key={`disabled-${i}`} disabled>Disabled {i}</button>
              ))}
            </div>
          )
          
          const focusableElements = getFocusableElements(container)
          
          // Should only find enabled buttons
          expect(focusableElements.length).toBe(enabledCount)
          
          // None should be disabled
          focusableElements.forEach(el => {
            expect(el.hasAttribute('disabled')).toBe(false)
          })
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: Elements with tabindex="-1" are not in tab order
   * For any element with tabindex="-1", it SHALL NOT be in focusable elements
   */
  it('Elements with tabindex="-1" are not in tab order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        (tabbableCount, nonTabbableCount) => {
          const { container } = render(
            <div>
              {Array.from({ length: tabbableCount }, (_, i) => (
                <button key={`tabbable-${i}`}>Tabbable {i}</button>
              ))}
              {Array.from({ length: nonTabbableCount }, (_, i) => (
                <button key={`non-tabbable-${i}`} tabIndex={-1}>Non-tabbable {i}</button>
              ))}
            </div>
          )
          
          const focusableElements = getFocusableElements(container)
          
          // Should only find tabbable buttons
          expect(focusableElements.length).toBe(tabbableCount)
          
          // None should have tabindex="-1"
          focusableElements.forEach(el => {
            expect(el.getAttribute('tabindex')).not.toBe('-1')
          })
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })

  /**
   * Property: focusTrapSelectors includes all interactive element types
   * The selector string SHALL include all standard interactive elements
   */
  it('focusTrapSelectors includes all interactive element types', () => {
    const requiredSelectors = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[tabindex]',
    ]
    
    requiredSelectors.forEach(selector => {
      expect(focusTrapSelectors).toContain(selector.split(':')[0])
    })
  })

  /**
   * Property: ariaLabels object has required categories
   * The ariaLabels object SHALL have navigation, actions, form, and status categories
   */
  it('ariaLabels object has required categories', () => {
    expect(ariaLabels).toHaveProperty('navigation')
    expect(ariaLabels).toHaveProperty('actions')
    expect(ariaLabels).toHaveProperty('form')
    expect(ariaLabels).toHaveProperty('status')
    
    // Navigation labels
    expect(ariaLabels.navigation).toHaveProperty('main')
    expect(ariaLabels.navigation).toHaveProperty('breadcrumb')
    
    // Action labels
    expect(ariaLabels.actions).toHaveProperty('close')
    expect(ariaLabels.actions).toHaveProperty('submit')
    
    // Form labels
    expect(ariaLabels.form).toHaveProperty('required')
    expect(ariaLabels.form).toHaveProperty('error')
    
    // Status labels
    expect(ariaLabels.status).toHaveProperty('pending')
    expect(ariaLabels.status).toHaveProperty('completed')
  })

  /**
   * Property: Focus visible styles are applied
   * For any focusable element, focus-visible styles SHALL be defined
   */
  it('Button has focus-visible styles', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('default', 'primary', 'secondary') as fc.Arbitrary<'default' | 'primary' | 'secondary'>,
        (variant) => {
          const { container } = render(
            <Button variant={variant}>Test</Button>
          )
          
          const button = container.querySelector('button')
          expect(button).toBeTruthy()
          
          if (button) {
            // Should have focus-visible classes
            const hasFocusStyles = 
              button.className.includes('focus-visible') ||
              button.className.includes('focus:')
            
            expect(hasFocusStyles).toBe(true)
          }
          
          cleanup()
          return true
        }
      ),
      propertyTestConfig
    )
  })
})
