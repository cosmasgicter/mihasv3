/**
 * FormSelect Component - RHF Controller wrapper for shadcn/ui Select
 * 
 * Provides seamless React Hook Form integration with Radix-based Select.
 * Uses Controller pattern for proper form binding.
 * 
 * Requirements: 5.2, 5.6, 5.8, 10.1 - RHF Controller, touch targets, disabled/error states
 */

import * as React from 'react'
import { Controller, Control, FieldValues, Path } from 'react-hook-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface FormSelectProps<T extends FieldValues> {
  /** Field name for RHF binding */
  name: Path<T>
  /** RHF control object */
  control: Control<T>
  /** Array of options to display */
  options: SelectOption[]
  /** Label text displayed above the select */
  label?: string
  /** Error message to display */
  error?: string
  /** Placeholder text when no value selected */
  placeholder?: string
  /** Whether the select is disabled */
  disabled?: boolean
  /** Helper text displayed below the select */
  helperText?: string
  /** Additional CSS classes for the container */
  className?: string
  /** Additional CSS classes for the trigger */
  triggerClassName?: string
  /** Whether the field is required */
  required?: boolean
  /** Callback when value changes */
  onValueChange?: (value: string) => void
}

/**
 * FormSelect - A React Hook Form compatible Select component
 * 
 * Uses RHF Controller pattern for proper form state management.
 * Maintains 44px minimum touch target for mobile accessibility.
 * 
 * @example
 * ```tsx
 * <FormSelect
 *   name="sex"
 *   control={control}
 *   options={[
 *     { value: 'Male', label: 'Male' },
 *     { value: 'Female', label: 'Female' },
 *   ]}
 *   label="Sex"
 *   placeholder="Select sex"
 *   error={errors.sex?.message}
 *   required
 * />
 * ```
 */
export function FormSelect<T extends FieldValues>({
  name,
  control,
  options,
  label,
  error,
  placeholder = 'Select an option',
  disabled = false,
  helperText,
  className,
  triggerClassName,
  required = false,
  onValueChange,
}: FormSelectProps<T>) {
  const selectId = React.useId()
  const errorId = `${selectId}-error`
  const helperId = `${selectId}-helper`

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-foreground"
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}

      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            value={field.value || ''}
            onValueChange={(value) => {
              field.onChange(value)
              onValueChange?.(value)
            }}
            disabled={disabled}
          >
            <SelectTrigger
              id={selectId}
              ref={field.ref}
              error={!!error}
              className={cn(
                // Ensure 44px minimum touch target
                'min-h-[44px]',
                triggerClassName
              )}
              aria-invalid={!!error}
              aria-describedby={
                error ? errorId : helperText ? helperId : undefined
              }
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />

      {error && (
        <p
          id={errorId}
          className="text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {helperText && !error && (
        <p
          id={helperId}
          className="text-sm text-muted-foreground"
        >
          {helperText}
        </p>
      )}
    </div>
  )
}

FormSelect.displayName = 'FormSelect'

export default FormSelect
