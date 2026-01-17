/**
 * Property-Based Tests for Textarea Component Migration
 * 
 * Tests the migrated Textarea component for:
 * - Property 5: Input Error State Accessibility (applies to Textarea too)
 * - Touch target compliance
 * - RHF register() compatibility
 * - Reduced motion compliance
 * 
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { Textarea } from '@/components/ui/textarea'
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
const validRows = fc.integer({ min: 1, max: 20 })

describe('Textarea Migration Property Tests', () => {
  describe('Property 5: Textarea Error State Accessibility', () => {
    it('Textarea with error has aria-invalid="true"', () => {
      fc.assert(
        fc.property(validErrorMessages, (errorMessage) => {
          const { container } = render(
            <Textarea error={errorMessage} data-testid="textarea" />
          )
          const textarea = container.querySelector('textarea')
          
          // Must have aria-invalid="true" when error is present
          const hasAriaInvalid = textarea?.getAttribute('aria-invalid') === 'true'
          
          cleanup()
          return hasAriaInvalid
        }),
        propertyTestConfig
      )
    })

    it('Textarea with error has aria-describedby pointing to error element', () => {
      fc.assert(
        fc.property(validErrorMessages, (errorMessage) => {
          const { container } = render(
            <Textarea error={errorMessage} id="test-textarea" />
          )
          const textarea = container.querySelector('textarea')
          const describedBy = textarea?.getAttribute('aria-describedby')
          
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

    it('Textarea without error has aria-invalid="false"', () => {
      fc.assert(
        fc.property(validPlaceholders, (placeholder) => {
          const { container } = render(
            <Textarea placeholder={placeholder} />
          )
          const textarea = container.querySelector('textarea')
          
          // Must have aria-invalid="false" when no error
          const hasAriaInvalidFalse = textarea?.getAttribute('aria-invalid') === 'false'
          
          cleanup()
          return hasAriaInvalidFalse
        }),
        propertyTestConfig
      )
    })

    it('Textarea with helperText has aria-describedby pointing to helper element', () => {
      fc.assert(
        fc.property(validHelperTexts, (helperText) => {
          const { container } = render(
            <Textarea helperText={helperText} id="test-textarea" />
          )
          const textarea = container.querySelector('textarea')
          const describedBy = textarea?.getAttribute('aria-describedby')
          
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
            <Textarea error={errorMessage} />
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

  describe('Touch Target and Styling Compliance', () => {
    it('Textarea has minimum 100px height class', () => {
      fc.assert(
        fc.property(validRows, (rows) => {
          const { container } = render(
            <Textarea rows={rows} />
          )
          const textarea = container.querySelector('textarea')
          
          // Check min-height class is present
          const hasMinHeight = textarea?.classList.contains('min-h-[100px]')
          
          cleanup()
          return hasMinHeight
        }),
        propertyTestConfig
      )
    })

    it('Textarea has touch-manipulation class for mobile optimization', () => {
      fc.assert(
        fc.property(validPlaceholders, (placeholder) => {
          const { container } = render(
            <Textarea placeholder={placeholder} />
          )
          const textarea = container.querySelector('textarea')
          
          const hasTouchManipulation = textarea?.classList.contains('touch-manipulation')
          
          cleanup()
          return hasTouchManipulation
        }),
        propertyTestConfig
      )
    })

    it('Textarea has resize-y class for vertical resizing', () => {
      fc.assert(
        fc.property(validPlaceholders, (placeholder) => {
          const { container } = render(
            <Textarea placeholder={placeholder} />
          )
          const textarea = container.querySelector('textarea')
          
          const hasResizeY = textarea?.classList.contains('resize-y')
          
          cleanup()
          return hasResizeY
        }),
        propertyTestConfig
      )
    })
  })

  describe('Label and Required Indicator', () => {
    it('Textarea with label renders label element with correct htmlFor', () => {
      fc.assert(
        fc.property(validLabels, (label) => {
          const { container } = render(
            <Textarea label={label} id="test-textarea" />
          )
          const labelElement = container.querySelector('label')
          const textarea = container.querySelector('textarea')
          
          const hasCorrectLabel = labelElement !== null &&
            labelElement.textContent?.includes(label) &&
            labelElement.getAttribute('for') === textarea?.id
          
          cleanup()
          return hasCorrectLabel
        }),
        propertyTestConfig
      )
    })

    it('Required Textarea shows required indicator in label', () => {
      fc.assert(
        fc.property(validLabels, (label) => {
          const { container } = render(
            <Textarea label={label} required />
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

  describe('Disabled State', () => {
    it('Disabled Textarea has correct styling classes', () => {
      fc.assert(
        fc.property(validPlaceholders, (placeholder) => {
          const { container } = render(
            <Textarea placeholder={placeholder} disabled />
          )
          const textarea = container.querySelector('textarea')
          
          const hasDisabledClasses = 
            textarea?.classList.contains('disabled:opacity-50') &&
            textarea?.classList.contains('disabled:cursor-not-allowed') &&
            textarea?.classList.contains('disabled:pointer-events-none')
          
          cleanup()
          return hasDisabledClasses
        }),
        propertyTestConfig
      )
    })
  })

  describe('Reduced Motion Compliance', () => {
    it('Textarea has motion-reduce:transition-none class', () => {
      fc.assert(
        fc.property(validPlaceholders, (placeholder) => {
          const { container } = render(
            <Textarea placeholder={placeholder} />
          )
          const textarea = container.querySelector('textarea')
          
          const hasReducedMotionClass = textarea?.classList.contains('motion-reduce:transition-none')
          
          cleanup()
          return hasReducedMotionClass
        }),
        propertyTestConfig
      )
    })

    it('Error message has motion-reduce:animate-none class', () => {
      fc.assert(
        fc.property(validErrorMessages, (errorMessage) => {
          const { container } = render(
            <Textarea error={errorMessage} />
          )
          
          const errorElement = container.querySelector('[role="alert"]')
          const hasReducedMotionClass = errorElement?.classList.contains('motion-reduce:animate-none')
          
          cleanup()
          return hasReducedMotionClass
        }),
        propertyTestConfig
      )
    })
  })

  describe('Error State Styling', () => {
    it('Textarea with error has destructive border styling', () => {
      fc.assert(
        fc.property(validErrorMessages, (errorMessage) => {
          const { container } = render(
            <Textarea error={errorMessage} />
          )
          const textarea = container.querySelector('textarea')
          
          const hasErrorStyling = textarea?.classList.contains('border-destructive')
          
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
      <Textarea {...register('testField')} data-testid="rhf-textarea" />
      <button type="submit" data-testid="submit">Submit</button>
    </form>
  )
}

describe('React Hook Form Integration', () => {
  it('Textarea works with RHF register() spread pattern', async () => {
    const onSubmit = vi.fn()
    
    render(<RHFTestWrapper onSubmit={onSubmit} />)
    
    const textarea = screen.getByTestId('rhf-textarea') as HTMLTextAreaElement
    
    // Simulate typing using fireEvent
    fireEvent.change(textarea, { target: { value: 'test value' } })
    expect(textarea.value).toBe('test value')
    
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

  it('Textarea preserves default values from RHF', async () => {
    const onSubmit = vi.fn()
    
    render(<RHFTestWrapper onSubmit={onSubmit} defaultValue="default value" />)
    
    const textarea = screen.getByTestId('rhf-textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('default value')
    
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

  it('Textarea handles multiline text correctly', async () => {
    const onSubmit = vi.fn()
    
    render(<RHFTestWrapper onSubmit={onSubmit} />)
    
    const textarea = screen.getByTestId('rhf-textarea') as HTMLTextAreaElement
    const multilineText = 'Line 1\nLine 2\nLine 3'
    
    // Simulate typing multiline text
    fireEvent.change(textarea, { target: { value: multilineText } })
    expect(textarea.value).toBe(multilineText)
    
    const form = screen.getByTestId('rhf-form')
    fireEvent.submit(form)
    
    // Wait for form submission
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ testField: multilineText }),
        expect.anything()
      )
    })
  })
})
