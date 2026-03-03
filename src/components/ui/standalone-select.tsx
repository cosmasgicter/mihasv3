/**
 * @deprecated Use `Select` from '@/components/ui/select' for canonical select primitives.
 * StandaloneSelect Component - Controlled Select without RHF dependency
 * 
 * Provides a form-friendly API for shadcn/ui Select without requiring
 * React Hook Form. Useful for dynamic lists and local state management.
 * 
 * Requirements: 5.2, 5.6, 5.8 - Touch targets, disabled/error states
 */

import * as React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

let hasWarnedStandaloneSelect = false

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface StandaloneSelectProps {
  /** Current value */
  value: string
  /** Callback when value changes */
  onChange: (value: string) => void
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
  /** Accessible label for screen readers when no visible label is present */
  'aria-label'?: string
  /** Test ID for testing */
  'data-testid'?: string
}

/**
 * StandaloneSelect - A controlled Select component without RHF
 * 
 * Maintains 44px minimum touch target for mobile accessibility.
 * 
 * @example
 * ```tsx
 * <StandaloneSelect
 *   value={selectedSubject}
 *   onChange={(value) => setSelectedSubject(value)}
 *   options={subjectOptions}
 *   placeholder="Select subject"
 * />
 * ```
 */
export const StandaloneSelect = React.forwardRef<HTMLButtonElement, StandaloneSelectProps>(
  (
    {
      value,
      onChange,
      options,
      label,
      error,
      placeholder = 'Select an option',
      disabled = false,
      helperText,
      className,
      triggerClassName,
      'aria-label': ariaLabel,
      'data-testid': testId,
      required,
    },
    ref
  ) => {
    if (process.env.NODE_ENV !== 'production' && !hasWarnedStandaloneSelect) {
      hasWarnedStandaloneSelect = true
      console.warn('[DEPRECATED] StandaloneSelect is deprecated. Use canonical Select primitives from @/components/ui.')
    }

    const selectId = React.useId()
    const errorId = `${selectId}-error`
    const helperId = `${selectId}-helper`

    return (
      <div className={cn('space-y-1.5', className)} data-testid={testId}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}

        <Select
          value={value}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger
            id={selectId}
            ref={ref}
            error={!!error}
            className={cn(
              // Ensure 44px minimum touch target
              'min-h-[44px]',
              triggerClassName
            )}
            aria-label={ariaLabel}
            aria-invalid={!!error}
            aria-required={required || undefined}
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
)

StandaloneSelect.displayName = 'StandaloneSelect'

export default StandaloneSelect
