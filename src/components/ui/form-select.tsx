/**
 * FormSelect Component - RHF Controller wrapper around CanonicalSelect
 *
 * Provides seamless React Hook Form integration with the canonical
 * Radix-based Select. Uses Controller pattern for proper form binding.
 *
 * Requirements: 2.3, 5.2, 9.1 - Consolidated select, RHF Controller, touch targets
 */

import * as React from 'react'
import { Controller, Control, FieldValues, Path } from 'react-hook-form'
import { CanonicalSelect } from '@/components/ui/CanonicalSelect'
import type { CanonicalSelectOption } from '@/components/ui/CanonicalSelect'

export type SelectOption = CanonicalSelectOption

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
 * Wraps CanonicalSelect with RHF Controller for proper form state management.
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
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <CanonicalSelect
          value={field.value || ''}
          onValueChange={(value) => {
            field.onChange(value)
            onValueChange?.(value)
          }}
          options={options}
          label={label}
          error={error}
          placeholder={placeholder}
          disabled={disabled}
          helperText={helperText}
          className={className}
          triggerClassName={triggerClassName}
          required={required}
        />
      )}
    />
  )
}

FormSelect.displayName = 'FormSelect'

export default FormSelect
