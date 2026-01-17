/**
 * Property-Based Tests for Input Component Migration
 * 
 * Tests the migrated Input component for:
 * - Property 5: Input Error State Accessibility
 * - Touch target compliance (44px minimum)
 * - RHF register() compatibility
 * - Reduced motion compliance
 * 
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { Input } from '@/components/ui/Input'
import { useForm } from 'react-hook-form'

// Clean up after each test
afterEach(() => {
  cleanup()
})

// Test configuration - minimum 100 iterations
const propertyTestConfig = { numRuns: 100 }

// Arbitrary generators
const validErrorMessages = fc.string({ minLength: 1, maxLength: 200 })
const validHelperTexts = fc.string({ minLength: 1, maxLength: 200 })
const validLabels = fc.string({ minLength: 1, maxLength: 50 })
const validPlaceholders = fc.string({ minLength: 0, maxLength: 100 })
const inputTypes = fc.constantFrom('text', 'email', 'password', 'tel', 'number', 'date', 'url')

describe('Input Migration Property Tests', () => {
  describe('Property 5: Input Error State Accessibility', () => {
    it('Input with error has aria-invalid="true"', () => {
      fc.assert(
        fc.property(validErrorMessages, (errorMessage) => {
          const { container } = render(
            <Input error={errorMessage} data-testid="input" />
          )
          const input = container.querySelector('input')
          
          // Must have aria-invalid="true" when error is present
          const hasAriaInvalid = input?.getAttribute('aria-invalid') === 'true'
          
          cleanup()
          return hasAriaInvalid
        }),
        propertyTestConfig
      )
    })

    it('Input with error has aria-describedby pointing to error element', () => {
      fc.assert(
        fc.property(validErrorMessages, (errorMessage) => {
          const { container } = render(
            <Input error={errorMessage} id="test-input" />
          )
          const input = container.querySelector('input')
          const describedBy = input?.getAttribute('aria-describedby')
          
          // aria-describedby should point to the error element
          const errorElement = describedBy ? document.getElementById(describedBy) : null
          const hasCorrectDescribedBy = errorElement !== null && 
            errorElement.textContent === errorMessage
          
          cleanup()
          return hasCorrectDescribedBy
        }),
        propertyTestConfig
      )
    })

    it('Input without error has aria-invalid="false"', () => {
      fc.assert(
        fc.property(validPlaceholders, (placeholder) => {
          const { container } = render(
            <Input placeholder={placeholder} />
          )
          const input = container.querySelector('input')
          
          // Must have aria-invalid="false" when no error
          const hasAriaInvalidFalse = input?.getAttribute('aria-invalid') === 'false'
          
          cleanup()
          return hasAriaInvalidFalse
        }),
        propertyTestConfig
      )
    })

    it('Input with helperText has aria-describedby pointing to helper element', () => {
      fc.assert(
        fc.property(validHelperTexts, (helperText) => {
          const { container } = render(
            <Input helperText={helperText} id="test-input" />
          )
          const input = container.querySelector('input')
          const describedBy = input?.getAttribute('aria-describedby')
          
          // aria-describedby should point to the helper element
          const helperElement = describedBy ? document.getElementById(describedBy) : null
          const hasCorrectDescribedBy = helperElement !== null && 
            helperElement.textContent === helperText
          
          cleanup()
          return hasCorrectDescribedBy
        }),
        propertyTestConfig
      )
    })

    it('Error message has role="alert" for screen readers', () => {
      fc.assert(
        fc.property(validErrorMessages, (errorMessage) => {
          const { container } = render(
            <Input error={errorMessage} />
          )
          
          // Find the error element and check for role="alert"
          const errorElement = container.querySelector('[role="alert"]')
          const hasAlertRole = errorElement !== null && 
            errorElement.textContent === errorMessage
          
          cleanup()
          return hasAlertRole
        }),
        propertyTestConfig
      )
    })
  })

  describe('Touch Target Compliance', () => {
    it('Input has minimum 44px height for touch targets', () => {
      fc.assert(
        fc.property(inputTypes, (type) => {
          const { container } = render(
            <Input type={type} />
          )
          const input = container.querySelector('input')
          
          // Check computed min-height class is present
          const hasMinHeight = input?.classList.contains('min-h-[44px]')
          
          cleanup()
          return hasMinHeight
        }),
        propertyTestConfig
      )
    })

    it('Input has touch-manipulation class for mobile optimization', () => {
      fc.assert(
        fc.property(inputTypes, (type) => {
          const { container } = render(
            <Input type={type} />
          )
          const input = container.querySelector('input')
          
          const hasTouchManipulation = input?.classList.contains('touch-manipulation')
          
          cleanup()
          return hasTouchManipulation
        }),
        propertyTestConfig
      )
    })
  })

  describe('Label and Required Indicator', () => {
    it('Input with label renders label element with correct htmlFor', () => {
      fc.assert(
        fc.property(validLabels, (label) => {
          const { container } = render(
            <Input label={label} id="test-input" />
          )
          const labelElement = container.querySelector('label')
          const input = container.querySelector('input')
          
          const hasCorrectLabel = labelElement !== null &&
            labelElement.textContent?.includes(label) &&
            labelElement.getAttribute('for') === input?.id
          
          cleanup()
          return hasCorrectLabel
        }),
        propertyTestConfig
      )
    })

    it('Required Input shows required indicator in label', () => {
      fc.assert(
        fc.property(validLabels, (label) => {
          const { container } = render(
            <Input label={label} required />
          )
          const labelElement = container.querySelector('label')
          
          // Should contain the asterisk for required fields
          const hasRequiredIndicator = labelElement?.textContent?.includes('*') ?? false
          
          cleanup()
          return hasRequiredIndicator
        }),
        propertyTestConfig
      )
    })
  })

  describe('Icon Support', () => {
    it('Input with icon has correct padding class', () => {
      fc.assert(
        fc.property(validPlaceholders, (placeholder) => {
          const { container } = render(
            <Input 
              placeholder={placeholder} 
              icon={<span data-testid="icon">🔍</span>} 
            />
          )
          const input = container.querySelector('input')
          
          // Should have left padding for icon
          const hasIconPadding = input?.classList.contains('pl-10')
          
          cleanup()
          return hasIconPadding
        }),
        propertyTestConfig
      )
    })

    it('Input without icon does not have icon padding class', () => {
      fc.assert(
        fc.property(validPlaceholders, (placeholder) => {
          const { container } = render(
            <Input placeholder={placeholder} />
          )
          const input = container.querySelector('input')
          
          // Should NOT have left padding for icon
          const hasNoIconPadding = !input?.classList.contains('pl-10')
          
          cleanup()
          return hasNoIconPadding
        }),
        propertyTestConfig
      )
    })
  })

  describe('Disabled State', () => {
    it('Disabled Input has correct styling classes', () => {
      fc.assert(
        fc.property(validPlaceholders, (placeholder) => {
          const { container } = render(
            <Input placeholder={placeholder} disabled />
          )
          const input = container.querySelector('input')
          
          const hasDisabledClasses = 
            input?.classList.contains('disabled:opacity-50') &&
            input?.classList.contains('disabled:cursor-not-allowed') &&
            input?.classList.contains('disabled:pointer-events-none')
          
          cleanup()
          return hasDisabledClasses
        }),
        propertyTestConfig
      )
    })
  })

  describe('Reduced Motion Compliance', () => {
    it('Input has motion-reduce:transition-none class', () => {
      fc.assert(
        fc.property(inputTypes, (type) => {
          const { container } = render(
            <Input type={type} />
          )
          const input = container.querySelector('input')
          
          const hasReducedMotionClass = input?.classList.contains('motion-reduce:transition-none')
          
          cleanup()
          return hasReducedMotionClass
        }),
        propertyTestConfig
      )
    })
  })

  describe('Error State Styling', () => {
    it('Input with error has destructive border styling', () => {
      fc.assert(
        fc.property(validErrorMessages, (errorMessage) => {
          const { container } = render(
            <Input error={errorMessage} />
          )
          const input = container.querySelector('input')
          
          const hasErrorStyling = input?.classList.contains('border-destructive')
          
          cleanup()
          return hasErrorStyling
        }),
        propertyTestConfig
      )
    })
  })
})

// Test wrapper for RHF integration
function RHFTestWrapper({ 
  onSubmit, 
  defaultValue = '' 
}: { 
  onSubmit: (data: { testField: string }) => void
  defaultValue?: string 
}) {
  const { register, handleSubmit } = useForm({
    defaultValues: { testField: defaultValue }
  })
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} data-testid="rhf-form">
      <Input {...register('testField')} data-testid="rhf-input" />
      <button type="submit" data-testid="submit">Submit</button>
    </form>
  )
}

describe('React Hook Form Integration', () => {
  it('Input works with RHF register() spread pattern', async () => {
    const onSubmit = vi.fn()
    
    render(<RHFTestWrapper onSubmit={onSubmit} />)
    
    const input = screen.getByTestId('rhf-input') as HTMLInputElement
    
    // Simulate typing using fireEvent
    fireEvent.change(input, { target: { value: 'test value' } })
    expect(input.value).toBe('test value')
    
    const form = screen.getByTestId('rhf-form')
    fireEvent.submit(form)
    
    // Wait for form submission
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ testField: 'test value' }),
        expect.anything()
      )
    })
  })

  it('Input preserves default values from RHF', async () => {
    const onSubmit = vi.fn()
    
    render(<RHFTestWrapper onSubmit={onSubmit} defaultValue="default value" />)
    
    const input = screen.getByTestId('rhf-input') as HTMLInputElement
    expect(input.value).toBe('default value')
    
    const form = screen.getByTestId('rhf-form')
    fireEvent.submit(form)
    
    // Wait for form submission
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ testField: 'default value' }),
        expect.anything()
      )
    })
  })
})
