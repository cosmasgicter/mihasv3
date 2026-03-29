/**
 * FormRadioGroup Component - RHF Controller wrapper for shadcn/ui RadioGroup
 * 
 * Provides seamless React Hook Form integration with Radix-based RadioGroup.
 * Uses Controller pattern for proper form binding.
 * 
 * Requirements: 6.2, 6.6, 6.8, 10.1 - RHF Controller, touch targets, orientation, form binding
 */

import * as React from 'react'
import { Controller, Control, FieldValues, Path } from 'react-hook-form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface RadioOption {
  /** The value submitted to the form */
  value: string
  /** Display label for the option */
  label: string
  /** Optional description text below the label */
  description?: string
  /** Whether this option is disabled */
  disabled?: boolean
}

export interface FormRadioGroupProps<T extends FieldValues> {
  /** Field name for RHF binding */
  name: Path<T>
  /** RHF control object */
  control: Control<T>
  /** Array of options to display */
  options: RadioOption[]
  /** Label text displayed above the radio group */
  label?: string
  /** Error message to display */
  error?: string
  /** Layout orientation */
  orientation?: 'horizontal' | 'vertical'
  /** Whether the entire group is disabled */
  disabled?: boolean
  /** Helper text displayed below the group */
  helperText?: string
  /** Additional CSS classes for the container */
  className?: string
  /** Whether the field is required */
  required?: boolean
  /** Callback when value changes */
  onValueChange?: (value: string) => void
}

/**
 * FormRadioGroup - A React Hook Form compatible RadioGroup component
 * 
 * Uses RHF Controller pattern for proper form state management.
 * Maintains 44px minimum touch target for each option.
 * Supports horizontal and vertical orientations.
 * 
 * @example
 * ```tsx
 * <FormRadioGroup
 *   name="sex"
 *   control={control}
 *   options={[
 *     { value: 'Male', label: 'Male' },
 *     { value: 'Female', label: 'Female' },
 *   ]}
 *   label="Sex"
 *   error={errors.sex?.message}
 *   required
 * />
 * ```
 */
export function FormRadioGroup<T extends FieldValues>({
  name,
  control,
  options,
  label,
  error,
  orientation = 'vertical',
  disabled = false,
  helperText,
  className,
  required = false,
  onValueChange,
}: FormRadioGroupProps<T>) {
  const groupId = React.useId()
  const errorId = `${groupId}-error`
  const helperId = `${groupId}-helper`

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label
          className="text-sm font-medium text-foreground"
          id={`${groupId}-label`}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}

      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <RadioGroup
            value={field.value || ''}
            onValueChange={(value) => {
              field.onChange(value)
              onValueChange?.(value)
            }}
            disabled={disabled}
            orientation={orientation}
            aria-labelledby={label ? `${groupId}-label` : undefined}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            aria-invalid={!!error}
            className={cn(
              orientation === 'horizontal' 
                ? 'flex flex-wrap gap-4' 
                : 'flex flex-col gap-2'
            )}
          >
            {options.map((option) => {
              const optionId = `${groupId}-${option.value}`
              return (
                <div
                  key={option.value}
                  className={cn(
                    // Touch target wrapper - ensures 44px minimum
                    'flex items-start gap-3',
                    'min-h-[44px] py-2',
                    // Disabled styling
                    option.disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {/* Touch target area for the radio */}
                  <div className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 -ml-3">
                    <RadioGroupItem
                      value={option.value}
                      id={optionId}
                      disabled={option.disabled || disabled}
                      aria-describedby={
                        option.description ? `${optionId}-description` : undefined
                      }
                    />
                  </div>
                  <div className="flex flex-col">
                    <Label
                      htmlFor={optionId}
                      className={cn(
                        'text-sm font-medium text-foreground cursor-pointer select-none leading-tight',
                        (option.disabled || disabled) && 'cursor-not-allowed'
                      )}
                    >
                      {option.label}
                    </Label>
                    {option.description && (
                      <span
                        id={`${optionId}-description`}
                        className="text-sm text-muted-foreground mt-0.5"
                      >
                        {option.description}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </RadioGroup>
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

FormRadioGroup.displayName = 'FormRadioGroup'

export default FormRadioGroup
