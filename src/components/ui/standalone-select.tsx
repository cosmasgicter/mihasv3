/**
 * StandaloneSelect — a non-RHF select component for admin forms and other
 * contexts where React Hook Form Controller binding is not needed.
 *
 * Uses the same Radix Select primitives as FormSelect for visual consistency.
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

export interface StandaloneSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface StandaloneSelectProps {
  value: string
  onChange: (value: string) => void
  options: StandaloneSelectOption[]
  label?: string
  placeholder?: string
  disabled?: boolean
  helperText?: string
  error?: string
  className?: string
  required?: boolean
}

export function StandaloneSelect({
  value,
  onChange,
  options,
  label,
  placeholder = 'Select an option',
  disabled = false,
  helperText,
  error,
  className,
  required = false,
}: StandaloneSelectProps) {
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

      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={selectId}
          error={!!error}
          className="min-h-[44px]"
          aria-invalid={!!error}
          aria-required={required || undefined}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
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
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {helperText && !error && (
        <p id={helperId} className="text-sm text-muted-foreground">
          {helperText}
        </p>
      )}
    </div>
  )
}

StandaloneSelect.displayName = 'StandaloneSelect'
