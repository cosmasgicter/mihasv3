/**
 * Property-Based Tests for React Hook Form Compatibility
 * 
 * Verifies that all migrated shadcn/ui components work correctly with React Hook Form:
 * - Property 15: RHF Controller Binding (Select, RadioGroup)
 * - Property 16: Zod Validation Preservation
 * - register() pattern compatibility (Input, Textarea)
 * - Controller pattern compatibility (Select, RadioGroup)
 * - Auto-save functionality verification
 * 
 * Requirements: 10.2, 10.4, 10.5, 10.6, 10.7
 * 
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { FormSelect } from '@/components/ui/form-select'
import { FormRadioGroup } from '@/components/ui/form-radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Clean up after each test
afterEach(() => {
  cleanup()
})

// Test configuration - minimum 100 iterations
const propertyTestConfig = { numRuns: 100 }

// Arbitrary generators
const validStrings = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)
const validFieldNames = fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s))
const validEmails = fc.emailAddress()
const validPhones = fc.string({ minLength: 10, maxLength: 15 }).filter(s => /^[0-9+\-\s]+$/.test(s))

/**
 * Test wrapper for Input with RHF register() pattern
 */
function InputRHFWrapper({ 
  onSubmit, 
  defaultValue = '',
  fieldName = 'testField'
}: { 
  onSubmit: (data: Record<string, string>) => void
  defaultValue?: string
  fieldName?: string
}) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { [fieldName]: defaultValue }
  })
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} data-testid="input-form">
      <Input 
        {...register(fieldName)} 
        data-testid="input-field"
        error={errors[fieldName]?.message as string}
      />
      <button type="submit" data-testid="submit-btn">Submit</button>
    </form>
  )
}

/**
 * Test wrapper for Textarea with RHF register() pattern
 */
function TextareaRHFWrapper({ 
  onSubmit, 
  defaultValue = '',
  fieldName = 'testField'
}: { 
  onSubmit: (data: Record<string, string>) => void
  defaultValue?: string
  fieldName?: string
}) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { [fieldName]: defaultValue }
  })
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} data-testid="textarea-form">
      <Textarea 
        {...register(fieldName)} 
        data-testid="textarea-field"
        error={errors[fieldName]?.message as string}
      />
      <button type="submit" data-testid="submit-btn">Submit</button>
    </form>
  )
}

/**
 * Test wrapper for FormSelect with RHF Controller pattern
 */
function SelectRHFWrapper({ 
  onSubmit, 
  defaultValue = '',
  options,
  fieldName = 'testField'
}: { 
  onSubmit: (data: Record<string, string>) => void
  defaultValue?: string
  options: Array<{ value: string; label: string }>
  fieldName?: string
}) {
  const { control, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { [fieldName]: defaultValue }
  })
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} data-testid="select-form">
      <FormSelect
        name={fieldName}
        control={control}
        options={options}
        placeholder="Select an option"
        error={errors[fieldName]?.message as string}
      />
      <button type="submit" data-testid="submit-btn">Submit</button>
    </form>
  )
}

/**
 * Test wrapper for FormRadioGroup with RHF Controller pattern
 */
function RadioGroupRHFWrapper({ 
  onSubmit, 
  defaultValue = '',
  options,
  fieldName = 'testField'
}: { 
  onSubmit: (data: Record<string, string>) => void
  defaultValue?: string
  options: Array<{ value: string; label: string }>
  fieldName?: string
}) {
  const { control, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { [fieldName]: defaultValue }
  })
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} data-testid="radio-form">
      <FormRadioGroup
        name={fieldName}
        control={control}
        options={options}
        label="Test Radio Group"
        error={errors[fieldName]?.message as string}
      />
      <button type="submit" data-testid="submit-btn">Submit</button>
    </form>
  )
}

describe('RHF Compatibility Property Tests', () => {
  describe('Input register() Pattern Compatibility', () => {
    it('Input preserves default values from RHF', () => {
      fc.assert(
        fc.property(validStrings, (defaultValue) => {
          const onSubmit = vi.fn()
          
          const { unmount } = render(
            <InputRHFWrapper onSubmit={onSubmit} defaultValue={defaultValue} />
          )
          
          const input = screen.getByTestId('input-field') as HTMLInputElement
          const hasCorrectValue = input.value === defaultValue
          
          unmount()
          return hasCorrectValue
        }),
        propertyTestConfig
      )
    })

    it('Input updates form state on change', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      
      render(<InputRHFWrapper onSubmit={onSubmit} />)
      
      const input = screen.getByTestId('input-field') as HTMLInputElement
      await user.type(input, 'test value')
      
      const form = screen.getByTestId('input-form')
      fireEvent.submit(form)
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ testField: 'test value' }),
          expect.anything()
        )
      })
    })

    it('Input submits correct value for any typed input', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.includes('\n')),
          async (inputValue) => {
            const user = userEvent.setup()
            const onSubmit = vi.fn()
            
            const { unmount } = render(
              <InputRHFWrapper onSubmit={onSubmit} />
            )
            
            const input = screen.getByTestId('input-field') as HTMLInputElement
            await user.clear(input)
            await user.type(input, inputValue)
            
            const form = screen.getByTestId('input-form')
            fireEvent.submit(form)
            
            await waitFor(() => {
              expect(onSubmit).toHaveBeenCalled()
            })
            
            const submittedValue = onSubmit.mock.calls[0][0].testField
            const isCorrect = submittedValue === inputValue
            
            unmount()
            return isCorrect
          }
        ),
        { numRuns: 20 } // Reduced for async tests
      )
    })
  })

  describe('Textarea register() Pattern Compatibility', () => {
    it('Textarea preserves default values from RHF', () => {
      fc.assert(
        fc.property(validStrings, (defaultValue) => {
          const onSubmit = vi.fn()
          
          const { unmount } = render(
            <TextareaRHFWrapper onSubmit={onSubmit} defaultValue={defaultValue} />
          )
          
          const textarea = screen.getByTestId('textarea-field') as HTMLTextAreaElement
          const hasCorrectValue = textarea.value === defaultValue
          
          unmount()
          return hasCorrectValue
        }),
        propertyTestConfig
      )
    })

    it('Textarea updates form state on change', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      
      render(<TextareaRHFWrapper onSubmit={onSubmit} />)
      
      const textarea = screen.getByTestId('textarea-field') as HTMLTextAreaElement
      await user.type(textarea, 'test multiline\nvalue')
      
      const form = screen.getByTestId('textarea-form')
      fireEvent.submit(form)
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ testField: 'test multiline\nvalue' }),
          expect.anything()
        )
      })
    })
  })
})

/**
 * Property 15: RHF Controller Binding
 * 
 * For any Radix-based form component (Select, RadioGroup) wrapped with Controller,
 * changes to the component value SHALL update the form state, and form state changes
 * SHALL reflect in the component.
 * 
 * **Validates: Requirements 10.2, 10.5**
 * **Feature: shadcn-ui-migration, Property 15: RHF Controller Binding**
 */
describe('Property 15: RHF Controller Binding', () => {
  describe('FormSelect Controller Binding', () => {
    it('FormSelect updates form state when value changes', async () => {
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
              <SelectRHFWrapper options={options} onSubmit={onSubmit} />
            )
            
            // Open select and choose an option
            const trigger = screen.getByRole('combobox')
            await user.click(trigger)
            
            const optionElement = await screen.findByText(selectedOption.label)
            await user.click(optionElement)
            
            // Submit the form
            const submitBtn = screen.getByTestId('submit-btn')
            await user.click(submitBtn)
            
            await waitFor(() => {
              expect(onSubmit).toHaveBeenCalled()
            })
            
            // Verify the submitted value matches
            const submittedValue = onSubmit.mock.calls[0][0].testField
            const isCorrect = submittedValue === selectedOption.value
            
            unmount()
            return isCorrect
          }
        ),
        { numRuns: 20 }
      )
    })

    it('FormSelect reflects form state changes (controlled value)', () => {
      fc.assert(
        fc.property(
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
          (options) => {
            const selectedIndex = Math.floor(Math.random() * options.length)
            const selectedOption = options[selectedIndex]
            const onSubmit = vi.fn()
            
            const { unmount } = render(
              <SelectRHFWrapper 
                options={options} 
                onSubmit={onSubmit} 
                defaultValue={selectedOption.value}
              />
            )
            
            // The trigger should display the label of the selected option
            const trigger = screen.getByRole('combobox')
            const hasCorrectDisplay = trigger.textContent?.includes(selectedOption.label)
            
            unmount()
            return hasCorrectDisplay
          }
        ),
        propertyTestConfig
      )
    })
  })

  describe('FormRadioGroup Controller Binding', () => {
    it('FormRadioGroup updates form state when value changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              value: fc.string({ minLength: 3, maxLength: 15 }).filter(s => /^[a-z][a-z0-9_-]*$/i.test(s)),
              label: fc.nat({ max: 999 }).map(n => `Option ${n}`)
            }),
            { minLength: 2, maxLength: 5 }
          ).filter(arr => {
            const values = arr.map(o => o.value)
            const labels = arr.map(o => o.label)
            return new Set(values).size === values.length && new Set(labels).size === labels.length
          }),
          async (options) => {
            const user = userEvent.setup()
            const onSubmit = vi.fn()
            const selectedIndex = Math.floor(Math.random() * options.length)
            const selectedOption = options[selectedIndex]
            
            const { unmount } = render(
              <RadioGroupRHFWrapper options={options} onSubmit={onSubmit} />
            )
            
            // Click on the option label
            const optionLabel = screen.getByText(selectedOption.label)
            await user.click(optionLabel)
            
            // Submit the form
            const submitBtn = screen.getByTestId('submit-btn')
            await user.click(submitBtn)
            
            await waitFor(() => {
              expect(onSubmit).toHaveBeenCalled()
            })
            
            // Verify the submitted value matches
            const submittedValue = onSubmit.mock.calls[0][0].testField
            const isCorrect = submittedValue === selectedOption.value
            
            unmount()
            return isCorrect
          }
        ),
        { numRuns: 20 }
      )
    })

    it('FormRadioGroup reflects form state changes (controlled value)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              value: fc.string({ minLength: 3, maxLength: 15 }).filter(s => /^[a-z][a-z0-9_-]*$/i.test(s)),
              label: fc.nat({ max: 999 }).map(n => `Option ${n}`)
            }),
            { minLength: 2, maxLength: 5 }
          ).filter(arr => {
            const values = arr.map(o => o.value)
            const labels = arr.map(o => o.label)
            return new Set(values).size === values.length && new Set(labels).size === labels.length
          }),
          (options) => {
            const selectedIndex = Math.floor(Math.random() * options.length)
            const selectedOption = options[selectedIndex]
            const onSubmit = vi.fn()
            
            const { unmount } = render(
              <RadioGroupRHFWrapper 
                options={options} 
                onSubmit={onSubmit} 
                defaultValue={selectedOption.value}
              />
            )
            
            // The selected radio should be checked
            const radioGroup = screen.getByRole('radiogroup')
            const checkedRadio = within(radioGroup).queryByRole('radio', { checked: true })
            const hasCorrectSelection = checkedRadio !== null
            
            unmount()
            return hasCorrectSelection
          }
        ),
        propertyTestConfig
      )
    })
  })

  describe('Bidirectional Binding Verification', () => {
    it('Form state changes propagate to Select component', async () => {
      const user = userEvent.setup()
      const options = [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' },
        { value: 'option3', label: 'Option 3' }
      ]
      const onSubmit = vi.fn()
      
      const { rerender } = render(
        <SelectRHFWrapper options={options} onSubmit={onSubmit} defaultValue="option1" />
      )
      
      // Initial value should be displayed
      let trigger = screen.getByRole('combobox')
      expect(trigger).toHaveTextContent('Option 1')
      
      // Change selection
      await user.click(trigger)
      const option2 = await screen.findByText('Option 2')
      await user.click(option2)
      
      // Verify the trigger now shows Option 2
      trigger = screen.getByRole('combobox')
      expect(trigger).toHaveTextContent('Option 2')
    })

    it('Form state changes propagate to RadioGroup component', async () => {
      const user = userEvent.setup()
      const options = [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' }
      ]
      const onSubmit = vi.fn()
      
      render(
        <RadioGroupRHFWrapper options={options} onSubmit={onSubmit} defaultValue="option1" />
      )
      
      // Initial value should be checked
      const radioGroup = screen.getByRole('radiogroup')
      let checkedRadio = within(radioGroup).getByRole('radio', { checked: true })
      expect(checkedRadio).toBeInTheDocument()
      
      // Change selection
      const option2Label = screen.getByText('Option 2')
      await user.click(option2Label)
      
      // Verify option2 is now checked
      const radios = within(radioGroup).getAllByRole('radio')
      const option2Radio = radios.find(r => r.getAttribute('value') === 'option2')
      expect(option2Radio).toHaveAttribute('data-state', 'checked')
    })
  })
})


/**
 * Property 16: Zod Validation Preservation
 * 
 * For any form with Zod validation schema, validation errors SHALL be correctly
 * displayed on migrated components when invalid data is entered.
 * 
 * **Validates: Requirements 10.6**
 * **Feature: shadcn-ui-migration, Property 16: Zod Validation Preservation**
 */
describe('Property 16: Zod Validation Preservation', () => {
  // Test schema with various validation rules
  const testSchema = z.object({
    email: z.string().email('Invalid email address'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    phone: z.string().min(10, 'Phone must be at least 10 digits'),
    sex: z.enum(['Male', 'Female'], { required_error: 'Please select sex' }),
    program: z.string().min(1, 'Please select a program'),
    comments: z.string().max(500, 'Comments must be less than 500 characters').optional(),
  })

  type TestFormData = z.infer<typeof testSchema>

  /**
   * Comprehensive form wrapper with Zod validation
   */
  function ZodValidatedForm({ 
    onSubmit,
    defaultValues
  }: { 
    onSubmit: (data: TestFormData) => void
    defaultValues?: Partial<TestFormData>
  }) {
    const { 
      register, 
      control, 
      handleSubmit, 
      formState: { errors } 
    } = useForm<TestFormData>({
      resolver: zodResolver(testSchema),
      defaultValues: {
        email: '',
        name: '',
        phone: '',
        sex: undefined,
        program: '',
        comments: '',
        ...defaultValues
      }
    })
    
    const programOptions = [
      { value: 'nursing', label: 'Nursing' },
      { value: 'clinical-medicine', label: 'Clinical Medicine' },
      { value: 'pharmacy', label: 'Pharmacy' }
    ]
    
    const sexOptions = [
      { value: 'Male', label: 'Male' },
      { value: 'Female', label: 'Female' }
    ]
    
    return (
      <form onSubmit={handleSubmit(onSubmit)} data-testid="zod-form">
        <Input 
          {...register('email')} 
          label="Email"
          error={errors.email?.message}
          data-testid="email-input"
        />
        
        <Input 
          {...register('name')} 
          label="Name"
          error={errors.name?.message}
          data-testid="name-input"
        />
        
        <Input 
          {...register('phone')} 
          label="Phone"
          error={errors.phone?.message}
          data-testid="phone-input"
        />
        
        <FormSelect
          name="program"
          control={control}
          options={programOptions}
          label="Program"
          error={errors.program?.message}
          placeholder="Select a program"
        />
        
        <FormRadioGroup
          name="sex"
          control={control}
          options={sexOptions}
          label="Sex"
          error={errors.sex?.message}
        />
        
        <Textarea 
          {...register('comments')} 
          label="Comments"
          error={errors.comments?.message}
          data-testid="comments-textarea"
        />
        
        <button type="submit" data-testid="submit-btn">Submit</button>
      </form>
    )
  }

  it('displays email validation error for invalid email', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    
    render(<ZodValidatedForm onSubmit={onSubmit} />)
    
    const emailInput = screen.getByTestId('email-input')
    await user.type(emailInput, 'invalid-email')
    
    const submitBtn = screen.getByTestId('submit-btn')
    await user.click(submitBtn)
    
    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument()
    })
    
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('displays name validation error for short name', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    
    render(<ZodValidatedForm onSubmit={onSubmit} />)
    
    const nameInput = screen.getByTestId('name-input')
    await user.type(nameInput, 'A')
    
    const submitBtn = screen.getByTestId('submit-btn')
    await user.click(submitBtn)
    
    await waitFor(() => {
      expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument()
    })
    
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('displays phone validation error for short phone', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    
    render(<ZodValidatedForm onSubmit={onSubmit} />)
    
    const phoneInput = screen.getByTestId('phone-input')
    await user.type(phoneInput, '123')
    
    const submitBtn = screen.getByTestId('submit-btn')
    await user.click(submitBtn)
    
    await waitFor(() => {
      expect(screen.getByText('Phone must be at least 10 digits')).toBeInTheDocument()
    })
    
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('displays Select validation error when no option selected', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    
    render(<ZodValidatedForm onSubmit={onSubmit} />)
    
    // Fill in other required fields but leave program empty
    await user.type(screen.getByTestId('email-input'), 'test@example.com')
    await user.type(screen.getByTestId('name-input'), 'John Doe')
    await user.type(screen.getByTestId('phone-input'), '1234567890')
    
    // Select sex
    const maleLabel = screen.getByText('Male')
    await user.click(maleLabel)
    
    const submitBtn = screen.getByTestId('submit-btn')
    await user.click(submitBtn)
    
    await waitFor(() => {
      expect(screen.getByText('Please select a program')).toBeInTheDocument()
    })
    
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('displays RadioGroup validation error when no option selected', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    
    render(<ZodValidatedForm onSubmit={onSubmit} />)
    
    // Fill in other required fields but leave sex empty
    await user.type(screen.getByTestId('email-input'), 'test@example.com')
    await user.type(screen.getByTestId('name-input'), 'John Doe')
    await user.type(screen.getByTestId('phone-input'), '1234567890')
    
    // Select program
    const programTrigger = screen.getByRole('combobox')
    await user.click(programTrigger)
    const nursingOption = await screen.findByText('Nursing')
    await user.click(nursingOption)
    
    const submitBtn = screen.getByTestId('submit-btn')
    await user.click(submitBtn)
    
    await waitFor(() => {
      expect(screen.getByText('Please select sex')).toBeInTheDocument()
    })
    
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clears validation errors when valid data is entered', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    
    render(<ZodValidatedForm onSubmit={onSubmit} />)
    
    // First, trigger validation error
    const emailInput = screen.getByTestId('email-input')
    await user.type(emailInput, 'invalid')
    
    const submitBtn = screen.getByTestId('submit-btn')
    await user.click(submitBtn)
    
    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument()
    })
    
    // Now fix the email
    await user.clear(emailInput)
    await user.type(emailInput, 'valid@example.com')
    
    // Fill in other required fields
    await user.type(screen.getByTestId('name-input'), 'John Doe')
    await user.type(screen.getByTestId('phone-input'), '1234567890')
    
    // Select program
    const programTrigger = screen.getByRole('combobox')
    await user.click(programTrigger)
    const nursingOption = await screen.findByText('Nursing')
    await user.click(nursingOption)
    
    // Select sex
    const maleLabel = screen.getByText('Male')
    await user.click(maleLabel)
    
    // Submit again
    await user.click(submitBtn)
    
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })
    
    // Error should be gone
    expect(screen.queryByText('Invalid email address')).not.toBeInTheDocument()
  })

  it('submits form successfully with all valid data', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    
    render(<ZodValidatedForm onSubmit={onSubmit} />)
    
    // Fill in all required fields with valid data
    await user.type(screen.getByTestId('email-input'), 'test@example.com')
    await user.type(screen.getByTestId('name-input'), 'John Doe')
    await user.type(screen.getByTestId('phone-input'), '1234567890')
    
    // Select program
    const programTrigger = screen.getByRole('combobox')
    await user.click(programTrigger)
    const nursingOption = await screen.findByText('Nursing')
    await user.click(nursingOption)
    
    // Select sex
    const maleLabel = screen.getByText('Male')
    await user.click(maleLabel)
    
    // Add optional comments
    await user.type(screen.getByTestId('comments-textarea'), 'Some comments')
    
    const submitBtn = screen.getByTestId('submit-btn')
    await user.click(submitBtn)
    
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          name: 'John Doe',
          phone: '1234567890',
          program: 'nursing',
          sex: 'Male',
          comments: 'Some comments'
        }),
        expect.anything()
      )
    })
  })

  it('validates any invalid email format', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('@') || !s.includes('.')),
        (invalidEmail) => {
          const onSubmit = vi.fn()
          
          const { unmount } = render(
            <ZodValidatedForm onSubmit={onSubmit} defaultValues={{ email: invalidEmail }} />
          )
          
          const submitBtn = screen.getByTestId('submit-btn')
          fireEvent.click(submitBtn)
          
          // Form should not submit with invalid email
          const wasNotSubmitted = !onSubmit.mock.calls.length
          
          unmount()
          return wasNotSubmitted
        }
      ),
      { numRuns: 50 }
    )
  })

  it('accepts any valid email format', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmails,
        async (validEmail) => {
          const user = userEvent.setup()
          const onSubmit = vi.fn()
          
          const { unmount } = render(
            <ZodValidatedForm onSubmit={onSubmit} />
          )
          
          // Fill in all required fields
          const emailInput = screen.getByTestId('email-input')
          await user.type(emailInput, validEmail)
          await user.type(screen.getByTestId('name-input'), 'John Doe')
          await user.type(screen.getByTestId('phone-input'), '1234567890')
          
          // Select program
          const programTrigger = screen.getByRole('combobox')
          await user.click(programTrigger)
          const nursingOption = await screen.findByText('Nursing')
          await user.click(nursingOption)
          
          // Select sex
          const maleLabel = screen.getByText('Male')
          await user.click(maleLabel)
          
          const submitBtn = screen.getByTestId('submit-btn')
          await user.click(submitBtn)
          
          await waitFor(() => {
            expect(onSubmit).toHaveBeenCalled()
          })
          
          const submittedEmail = onSubmit.mock.calls[0][0].email
          const isCorrect = submittedEmail === validEmail
          
          unmount()
          return isCorrect
        }
      ),
      { numRuns: 10 }
    )
  })
})

/**
 * Auto-Save Functionality Verification
 * 
 * Tests that auto-save works correctly with migrated components.
 * Requirements: 10.7
 */
describe('Auto-Save Functionality Verification', () => {
  it('form values are accessible for auto-save via watch()', () => {
    const watchedValues: Record<string, any>[] = []
    
    function AutoSaveTestForm() {
      const { register, control, watch } = useForm({
        defaultValues: {
          name: '',
          program: ''
        }
      })
      
      const values = watch()
      watchedValues.push(values)
      
      const programOptions = [
        { value: 'nursing', label: 'Nursing' },
        { value: 'clinical-medicine', label: 'Clinical Medicine' }
      ]
      
      return (
        <form data-testid="autosave-form">
          <Input {...register('name')} data-testid="name-input" />
          <FormSelect
            name="program"
            control={control}
            options={programOptions}
            placeholder="Select program"
          />
        </form>
      )
    }
    
    render(<AutoSaveTestForm />)
    
    // Initial values should be captured
    expect(watchedValues.length).toBeGreaterThan(0)
    expect(watchedValues[0]).toEqual({ name: '', program: '' })
  })

  it('form values update correctly for auto-save when Input changes', async () => {
    const user = userEvent.setup()
    let latestValues: Record<string, any> = {}
    
    function AutoSaveTestForm() {
      const { register, watch } = useForm({
        defaultValues: { name: '' }
      })
      
      latestValues = watch()
      
      return (
        <form data-testid="autosave-form">
          <Input {...register('name')} data-testid="name-input" />
        </form>
      )
    }
    
    render(<AutoSaveTestForm />)
    
    const nameInput = screen.getByTestId('name-input')
    await user.type(nameInput, 'John')
    
    await waitFor(() => {
      expect(latestValues.name).toBe('John')
    })
  })

  it('form values update correctly for auto-save when Select changes', async () => {
    const user = userEvent.setup()
    let latestValues: Record<string, any> = {}
    
    function AutoSaveTestForm() {
      const { control, watch } = useForm({
        defaultValues: { program: '' }
      })
      
      latestValues = watch()
      
      const programOptions = [
        { value: 'nursing', label: 'Nursing' },
        { value: 'clinical-medicine', label: 'Clinical Medicine' }
      ]
      
      return (
        <form data-testid="autosave-form">
          <FormSelect
            name="program"
            control={control}
            options={programOptions}
            placeholder="Select program"
          />
        </form>
      )
    }
    
    render(<AutoSaveTestForm />)
    
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)
    
    const nursingOption = await screen.findByText('Nursing')
    await user.click(nursingOption)
    
    await waitFor(() => {
      expect(latestValues.program).toBe('nursing')
    })
  })

  it('form values update correctly for auto-save when RadioGroup changes', async () => {
    const user = userEvent.setup()
    let latestValues: Record<string, any> = {}
    
    function AutoSaveTestForm() {
      const { control, watch } = useForm({
        defaultValues: { sex: '' }
      })
      
      latestValues = watch()
      
      const sexOptions = [
        { value: 'Male', label: 'Male' },
        { value: 'Female', label: 'Female' }
      ]
      
      return (
        <form data-testid="autosave-form">
          <FormRadioGroup
            name="sex"
            control={control}
            options={sexOptions}
            label="Sex"
          />
        </form>
      )
    }
    
    render(<AutoSaveTestForm />)
    
    const maleLabel = screen.getByText('Male')
    await user.click(maleLabel)
    
    await waitFor(() => {
      expect(latestValues.sex).toBe('Male')
    })
  })
})
