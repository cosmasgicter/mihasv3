/**
 * Property-based tests for Select component migration
 * Tests keyboard navigation, accessibility, and touch target compliance
 * 
 * Requirements: 9.2 - Touch targets at least 44x44 pixels
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fc from 'fast-check'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator
} from '@/components/ui/select'

// Helper to render a basic Select with options
const renderSelect = (props: {
  value?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  error?: boolean
  placeholder?: string
  options?: Array<{ value: string; label: string; disabled?: boolean }>
}) => {
  const {
    value,
    onValueChange = vi.fn(),
    disabled = false,
    error = false,
    placeholder = 'Select an option',
    options = [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' }
    ]
  } = props

  return render(
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger error={error} data-testid="select-trigger">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            data-testid={`select-item-${option.value}`}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

describe('Select Component Property Tests', () => {
  describe('Touch Target Compliance', () => {
    it('should have minimum 44px height on trigger for any content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (placeholder) => {
            const { unmount } = renderSelect({ placeholder })
            const trigger = screen.getByTestId('select-trigger')
            
            const styles = window.getComputedStyle(trigger)
            const minHeight = parseInt(styles.minHeight) || 0
            
            // Check class is present
            expect(trigger).toHaveClass('min-h-[44px]')
            
            unmount()
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should have touch-manipulation class on trigger', () => {
      renderSelect({})
      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toHaveClass('touch-manipulation')
    })
  })

  describe('Error State Accessibility', () => {
    it('should set aria-invalid correctly based on error prop', () => {
      fc.assert(
        fc.property(fc.boolean(), (hasError) => {
          const { unmount } = renderSelect({ error: hasError })
          const trigger = screen.getByTestId('select-trigger')
          
          expect(trigger).toHaveAttribute(
            'aria-invalid',
            hasError ? 'true' : 'false'
          )
          
          unmount()
        }),
        { numRuns: 20 }
      )
    })

    it('should have error border styling when error is true', () => {
      renderSelect({ error: true })
      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toHaveClass('border-destructive')
    })

    it('should have normal border styling when error is false', () => {
      renderSelect({ error: false })
      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toHaveClass('border-input')
      expect(trigger).not.toHaveClass('border-destructive')
    })
  })

  describe('Disabled State', () => {
    it('should have disabled styling when disabled', () => {
      renderSelect({ disabled: true })
      const trigger = screen.getByTestId('select-trigger')
      
      expect(trigger).toBeDisabled()
      expect(trigger).toHaveClass('disabled:opacity-50')
      expect(trigger).toHaveClass('disabled:cursor-not-allowed')
    })

    it('should not be disabled when disabled prop is false', () => {
      renderSelect({ disabled: false })
      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).not.toBeDisabled()
    })
  })

  describe('Reduced Motion Compliance', () => {
    it('should have motion-reduce:transition-none on trigger', () => {
      renderSelect({})
      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toHaveClass('motion-reduce:transition-none')
    })

    it('should have transition-colors for smooth interactions', () => {
      renderSelect({})
      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toHaveClass('transition-colors')
      expect(trigger).toHaveClass('duration-150')
    })
  })

  describe('Focus Styling', () => {
    it('should have focus ring classes', () => {
      renderSelect({})
      const trigger = screen.getByTestId('select-trigger')
      
      expect(trigger).toHaveClass('focus:outline-none')
      expect(trigger).toHaveClass('focus:ring-2')
      expect(trigger).toHaveClass('focus:ring-ring')
      expect(trigger).toHaveClass('focus:ring-offset-2')
    })

    it('should have error focus ring when error is true', () => {
      renderSelect({ error: true })
      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toHaveClass('focus:ring-destructive')
    })
  })

  describe('Value Selection', () => {
    it('should call onValueChange with correct value when option selected', async () => {
      const user = userEvent.setup()
      const onValueChange = vi.fn()
      
      renderSelect({ onValueChange })
      
      const trigger = screen.getByTestId('select-trigger')
      await user.click(trigger)
      
      // Wait for content to appear
      const option = await screen.findByTestId('select-item-option2')
      await user.click(option)
      
      expect(onValueChange).toHaveBeenCalledWith('option2')
    })

    it('should display selected value', async () => {
      const user = userEvent.setup()
      const onValueChange = vi.fn()
      
      const { rerender } = render(
        <Select value="option1" onValueChange={onValueChange}>
          <SelectTrigger data-testid="select-trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
            <SelectItem value="option2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toHaveTextContent('Option 1')
    })
  })

  describe('Placeholder Display', () => {
    it('should display placeholder when no value selected', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (placeholder) => {
            const { unmount } = renderSelect({ placeholder, value: undefined })
            const trigger = screen.getByTestId('select-trigger')
            
            expect(trigger).toHaveTextContent(placeholder)
            
            unmount()
          }
        ),
        { numRuns: 30 }
      )
    })
  })

  describe('Styling Classes', () => {
    it('should have proper base styling classes', () => {
      renderSelect({})
      const trigger = screen.getByTestId('select-trigger')
      
      expect(trigger).toHaveClass('flex')
      expect(trigger).toHaveClass('w-full')
      expect(trigger).toHaveClass('items-center')
      expect(trigger).toHaveClass('justify-between')
      expect(trigger).toHaveClass('rounded-lg')
      expect(trigger).toHaveClass('border')
      expect(trigger).toHaveClass('bg-background')
      expect(trigger).toHaveClass('px-3')
      expect(trigger).toHaveClass('py-2')
      expect(trigger).toHaveClass('text-base')
      expect(trigger).toHaveClass('text-foreground')
    })
  })

  describe('Icon Accessibility', () => {
    it('should have aria-hidden on chevron icon', () => {
      renderSelect({})
      const trigger = screen.getByTestId('select-trigger')
      const icon = trigger.querySelector('svg')
      
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('ARIA Attributes', () => {
    it('should have proper combobox role', () => {
      renderSelect({})
      const trigger = screen.getByTestId('select-trigger')
      
      // Radix Select uses combobox role
      expect(trigger).toHaveAttribute('role', 'combobox')
    })

    it('should have aria-expanded attribute', () => {
      renderSelect({})
      const trigger = screen.getByTestId('select-trigger')
      
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })

    it('should have aria-autocomplete attribute', () => {
      renderSelect({})
      const trigger = screen.getByTestId('select-trigger')
      
      expect(trigger).toHaveAttribute('aria-autocomplete', 'none')
    })
  })

  describe('Custom className Support', () => {
    it('should merge custom className with default classes', () => {
      render(
        <Select>
          <SelectTrigger className="custom-class" data-testid="select-trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test">Test</SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toHaveClass('custom-class')
      expect(trigger).toHaveClass('min-h-[44px]') // Still has default classes
    })
  })

  describe('Multiple Options Generation', () => {
    it('should render any number of options correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              value: fc.string({ minLength: 1, maxLength: 20 }),
              label: fc.string({ minLength: 1, maxLength: 50 })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (options) => {
            // Ensure unique values
            const uniqueOptions = options.filter(
              (opt, idx, arr) => arr.findIndex(o => o.value === opt.value) === idx
            )
            
            if (uniqueOptions.length === 0) return true
            
            const { unmount } = render(
              <Select>
                <SelectTrigger data-testid="select-trigger">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueOptions.map((opt, idx) => (
                    <SelectItem key={idx} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
            
            const trigger = screen.getByTestId('select-trigger')
            expect(trigger).toBeInTheDocument()
            
            unmount()
            return true
          }
        ),
        { numRuns: 30 }
      )
    })
  })
})

describe('SelectItem Component Property Tests', () => {
  describe('Touch Target Compliance', () => {
    it('should have minimum 44px height class', async () => {
      const user = userEvent.setup()
      
      render(
        <Select>
          <SelectTrigger data-testid="select-trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test" data-testid="select-item">
              Test Option
            </SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('select-trigger')
      await user.click(trigger)
      
      const item = await screen.findByTestId('select-item')
      expect(item).toHaveClass('min-h-[44px]')
      expect(item).toHaveClass('touch-manipulation')
    })
  })

  describe('Reduced Motion on Items', () => {
    it('should have motion-reduce classes on items', async () => {
      const user = userEvent.setup()
      
      render(
        <Select>
          <SelectTrigger data-testid="select-trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test" data-testid="select-item">
              Test Option
            </SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('select-trigger')
      await user.click(trigger)
      
      const item = await screen.findByTestId('select-item')
      expect(item).toHaveClass('motion-reduce:transition-none')
    })
  })

  describe('Disabled Items', () => {
    it('should have disabled styling on disabled items', async () => {
      const user = userEvent.setup()
      
      render(
        <Select>
          <SelectTrigger data-testid="select-trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test" disabled data-testid="select-item">
              Disabled Option
            </SelectItem>
          </SelectContent>
        </Select>
      )
      
      const trigger = screen.getByTestId('select-trigger')
      await user.click(trigger)
      
      const item = await screen.findByTestId('select-item')
      expect(item).toHaveAttribute('data-disabled')
    })
  })
})


/**
 * Property 6: Select Default Value Preservation
 * 
 * For any Select component with a defaultValue or value prop,
 * when the form loads, the Select SHALL display the correct selected option matching that value.
 * 
 * **Validates: Requirements 5.4**
 * **Feature: shadcn-ui-migration, Property 6: Select Default Value Preservation**
 */
describe('Property 6: Select Default Value Preservation', () => {
  it('should display the correct selected option for any valid value', () => {
    fc.assert(
      fc.property(
        // Generate a list of options and pick one as the selected value
        fc.array(
          fc.record({
            value: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            label: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
          }),
          { minLength: 2, maxLength: 10 }
        ).filter(arr => {
          // Ensure unique values
          const values = arr.map(o => o.value)
          return new Set(values).size === values.length
        }),
        (options) => {
          // Pick a random option to be the selected value
          const selectedIndex = Math.floor(Math.random() * options.length)
          const selectedOption = options[selectedIndex]
          
          const { unmount } = render(
            <Select value={selectedOption.value}>
              <SelectTrigger data-testid="select-trigger">
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt, idx) => (
                  <SelectItem key={idx} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
          
          const trigger = screen.getByTestId('select-trigger')
          
          // The trigger should display the label of the selected option
          expect(trigger).toHaveTextContent(selectedOption.label)
          
          unmount()
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve value when options change but selected value remains valid', () => {
    fc.assert(
      fc.property(
        fc.record({
          value: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          label: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
        }),
        (selectedOption) => {
          // Create initial options including the selected one
          const initialOptions = [
            selectedOption,
            { value: 'other1', label: 'Other 1' },
            { value: 'other2', label: 'Other 2' }
          ]
          
          const { rerender, unmount } = render(
            <Select value={selectedOption.value}>
              <SelectTrigger data-testid="select-trigger">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {initialOptions.map((opt, idx) => (
                  <SelectItem key={idx} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
          
          let trigger = screen.getByTestId('select-trigger')
          expect(trigger).toHaveTextContent(selectedOption.label)
          
          // Rerender with different options but keep the selected value
          const newOptions = [
            selectedOption,
            { value: 'new1', label: 'New 1' },
            { value: 'new2', label: 'New 2' }
          ]
          
          rerender(
            <Select value={selectedOption.value}>
              <SelectTrigger data-testid="select-trigger">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {newOptions.map((opt, idx) => (
                  <SelectItem key={idx} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
          
          trigger = screen.getByTestId('select-trigger')
          // Value should still be preserved
          expect(trigger).toHaveTextContent(selectedOption.label)
          
          unmount()
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should show placeholder when value is empty string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (placeholder) => {
          const { unmount } = render(
            <Select value="">
              <SelectTrigger data-testid="select-trigger">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="option1">Option 1</SelectItem>
                <SelectItem value="option2">Option 2</SelectItem>
              </SelectContent>
            </Select>
          )
          
          const trigger = screen.getByTestId('select-trigger')
          expect(trigger).toHaveTextContent(placeholder)
          
          unmount()
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})


/**
 * Property 8: Select Keyboard Navigation
 * 
 * For any Select component, keyboard navigation SHALL work correctly:
 * - Enter/Space opens the dropdown
 * - Arrow keys navigate options
 * - Enter selects the focused option
 * - Escape closes the dropdown
 * 
 * **Validates: Requirements 5.5**
 * **Feature: shadcn-ui-migration, Property 8: Select Keyboard Navigation**
 */
describe('Property 8: Select Keyboard Navigation', () => {
  it('should open dropdown with Enter key', async () => {
    const user = userEvent.setup()
    
    render(
      <Select>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
          <SelectItem value="option3">Option 3</SelectItem>
        </SelectContent>
      </Select>
    )
    
    const trigger = screen.getByTestId('select-trigger')
    trigger.focus()
    
    await user.keyboard('{Enter}')
    
    // Dropdown should be open - options should be visible
    expect(await screen.findByText('Option 1')).toBeInTheDocument()
    expect(await screen.findByText('Option 2')).toBeInTheDocument()
    expect(await screen.findByText('Option 3')).toBeInTheDocument()
  })

  it('should open dropdown with Space key', async () => {
    const user = userEvent.setup()
    
    render(
      <Select>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    )
    
    const trigger = screen.getByTestId('select-trigger')
    trigger.focus()
    
    await user.keyboard(' ')
    
    // Dropdown should be open
    expect(await screen.findByText('Option 1')).toBeInTheDocument()
  })

  it('should close dropdown with Escape key', async () => {
    const user = userEvent.setup()
    
    render(
      <Select>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    )
    
    const trigger = screen.getByTestId('select-trigger')
    await user.click(trigger)
    
    // Verify dropdown is open
    expect(await screen.findByText('Option 1')).toBeInTheDocument()
    
    // Press Escape to close
    await user.keyboard('{Escape}')
    
    // Dropdown should be closed - trigger should still be there but options hidden
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('should select option with Enter key after navigation', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
          <SelectItem value="option3">Option 3</SelectItem>
        </SelectContent>
      </Select>
    )
    
    const trigger = screen.getByTestId('select-trigger')
    await user.click(trigger)
    
    // Wait for dropdown to open
    await screen.findByText('Option 1')
    
    // Navigate down and select
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
    
    // Should have selected an option
    expect(onValueChange).toHaveBeenCalled()
  })

  it('should navigate through options with arrow keys for any number of options', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            value: fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z0-9]+$/i.test(s)),
            label: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
          }),
          { minLength: 2, maxLength: 5 }
        ).filter(arr => {
          const values = arr.map(o => o.value)
          return new Set(values).size === values.length
        }),
        async (options) => {
          const user = userEvent.setup()
          const onValueChange = vi.fn()
          
          const { unmount } = render(
            <Select onValueChange={onValueChange}>
              <SelectTrigger data-testid="select-trigger">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt, idx) => (
                  <SelectItem key={idx} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
          
          const trigger = screen.getByTestId('select-trigger')
          await user.click(trigger)
          
          // Wait for dropdown to open
          await screen.findByText(options[0].label)
          
          // Navigate down and select
          await user.keyboard('{ArrowDown}')
          await user.keyboard('{Enter}')
          
          // Should have called onValueChange
          expect(onValueChange).toHaveBeenCalled()
          
          unmount()
          return true
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should not open dropdown when disabled', async () => {
    const user = userEvent.setup()
    
    render(
      <Select disabled>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    )
    
    const trigger = screen.getByTestId('select-trigger')
    trigger.focus()
    
    await user.keyboard('{Enter}')
    
    // Dropdown should remain closed
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('should maintain focus on trigger after selection', async () => {
    const user = userEvent.setup()
    
    render(
      <Select>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    )
    
    const trigger = screen.getByTestId('select-trigger')
    await user.click(trigger)
    
    // Wait for dropdown
    const option = await screen.findByText('Option 1')
    await user.click(option)
    
    // Focus should return to trigger
    expect(trigger).toHaveFocus()
  })
})

/**
 * Property 7: Form Payload Round-Trip Integrity
 * 
 * For any form containing Select components with React Hook Form,
 * the submitted payload SHALL contain the exact values selected by the user.
 * 
 * **Validates: Requirements 5.7, 11.5**
 * **Feature: shadcn-ui-migration, Property 7: Form Payload Round-Trip Integrity**
 */
describe('Property 7: Form Payload Round-Trip Integrity', () => {
  // Import React Hook Form for these tests
  const { useForm, Controller } = require('react-hook-form')
  const React = require('react')

  // Test wrapper component
  const FormWrapper = ({ 
    options, 
    defaultValue, 
    onSubmit 
  }: { 
    options: Array<{ value: string; label: string }>
    defaultValue?: string
    onSubmit: (data: { testField: string }) => void 
  }) => {
    const { control, handleSubmit } = useForm({
      defaultValues: { testField: defaultValue || '' }
    })
    
    return (
      <form onSubmit={handleSubmit(onSubmit)} data-testid="test-form">
        <Controller
          name="testField"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger data-testid="select-trigger">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt, idx) => (
                  <SelectItem key={idx} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <button type="submit" data-testid="submit-btn">Submit</button>
      </form>
    )
  }

  it('should submit the selected value correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            value: fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z0-9_-]+$/i.test(s)),
            label: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)
          }),
          { minLength: 2, maxLength: 6 }
        ).filter(arr => {
          const values = arr.map(o => o.value)
          return new Set(values).size === values.length
        }),
        async (options) => {
          const user = userEvent.setup()
          const onSubmit = vi.fn()
          const selectedIndex = Math.floor(Math.random() * options.length)
          const selectedOption = options[selectedIndex]
          
          const { unmount } = render(
            <FormWrapper options={options} onSubmit={onSubmit} />
          )
          
          // Open select and choose an option
          const trigger = screen.getByTestId('select-trigger')
          await user.click(trigger)
          
          const optionElement = await screen.findByText(selectedOption.label)
          await user.click(optionElement)
          
          // Submit the form
          const submitBtn = screen.getByTestId('submit-btn')
          await user.click(submitBtn)
          
          // Verify the submitted value matches
          expect(onSubmit).toHaveBeenCalledWith({ testField: selectedOption.value })
          
          unmount()
          return true
        }
      ),
      { numRuns: 15 }
    )
  })

  it('should preserve default value in submission when unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            value: fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z0-9_-]+$/i.test(s)),
            label: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)
          }),
          { minLength: 2, maxLength: 6 }
        ).filter(arr => {
          const values = arr.map(o => o.value)
          return new Set(values).size === values.length
        }),
        async (options) => {
          const user = userEvent.setup()
          const onSubmit = vi.fn()
          const defaultIndex = Math.floor(Math.random() * options.length)
          const defaultOption = options[defaultIndex]
          
          const { unmount } = render(
            <FormWrapper 
              options={options} 
              defaultValue={defaultOption.value}
              onSubmit={onSubmit} 
            />
          )
          
          // Verify default is displayed
          const trigger = screen.getByTestId('select-trigger')
          expect(trigger).toHaveTextContent(defaultOption.label)
          
          // Submit without changing
          const submitBtn = screen.getByTestId('submit-btn')
          await user.click(submitBtn)
          
          // Verify default value is preserved
          expect(onSubmit).toHaveBeenCalledWith({ testField: defaultOption.value })
          
          unmount()
          return true
        }
      ),
      { numRuns: 15 }
    )
  })

  it('should update form value when selection changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            value: fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z0-9_-]+$/i.test(s)),
            label: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)
          }),
          { minLength: 3, maxLength: 6 }
        ).filter(arr => {
          const values = arr.map(o => o.value)
          return new Set(values).size === values.length
        }),
        async (options) => {
          const user = userEvent.setup()
          const onSubmit = vi.fn()
          
          // Start with first option, change to second
          const initialOption = options[0]
          const newOption = options[1]
          
          const { unmount } = render(
            <FormWrapper 
              options={options} 
              defaultValue={initialOption.value}
              onSubmit={onSubmit} 
            />
          )
          
          // Change selection
          const trigger = screen.getByTestId('select-trigger')
          await user.click(trigger)
          
          const optionElement = await screen.findByText(newOption.label)
          await user.click(optionElement)
          
          // Submit
          const submitBtn = screen.getByTestId('submit-btn')
          await user.click(submitBtn)
          
          // Verify new value is submitted
          expect(onSubmit).toHaveBeenCalledWith({ testField: newOption.value })
          
          unmount()
          return true
        }
      ),
      { numRuns: 15 }
    )
  })

  it('should handle empty initial value correctly', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const options = [
      { value: 'opt1', label: 'Option 1' },
      { value: 'opt2', label: 'Option 2' }
    ]
    
    render(
      <FormWrapper options={options} onSubmit={onSubmit} />
    )
    
    // Select an option
    const trigger = screen.getByTestId('select-trigger')
    await user.click(trigger)
    
    const optionElement = await screen.findByText('Option 1')
    await user.click(optionElement)
    
    // Submit
    const submitBtn = screen.getByTestId('submit-btn')
    await user.click(submitBtn)
    
    expect(onSubmit).toHaveBeenCalledWith({ testField: 'opt1' })
  })
})
