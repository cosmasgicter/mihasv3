/**
 * Canonical Select Component
 *
 * Radix-based select matching the design doc interface.
 * Uses the low-level Radix primitives from select.tsx internally.
 * Styled with design tokens: border-input, focus:ring-ring, rounded-md.
 *
 * Supports two modes:
 * 1. Raw select (no label/error wrapper) — pass `onValueChange`
 * 2. Field-wrapped select (label + error + helperText) — pass `onChange` or `onValueChange`
 *
 * Requirements: 2.3, 9.1, 9.5
 */

import * as React from 'react'
import {
  Select as RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface CanonicalSelectOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

export interface CanonicalSelectProps {
  /** Current value */
  value?: string
  /** Radix-style change handler */
  onValueChange?: (value: string) => void
  /** Alias for onValueChange (StandaloneSelect compat) */
  onChange?: (value: string) => void
  placeholder?: string
  options: Array<{ value: string; label: string; description?: string; disabled?: boolean }>
  disabled?: boolean
  /** Boolean error flag (raw mode) or string error message (field-wrapped mode) */
  error?: boolean | string
  className?: string
  /** Additional classes for the trigger element */
  triggerClassName?: string
  name?: string
  /** Field label — when provided, renders label + error/helper wrapper */
  label?: string
  /** Helper text below the select */
  helperText?: string
  /** Whether the field is required */
  required?: boolean
  'aria-label'?: string
  'aria-describedby'?: string
}

export function CanonicalSelect({
  value,
  onValueChange,
  onChange,
  placeholder = 'Select an option',
  options,
  disabled = false,
  error,
  className,
  triggerClassName,
  name,
  label,
  helperText,
  required = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: CanonicalSelectProps) {
  const selectId = React.useId()
  const errorId = `${selectId}-error`
  const helperId = `${selectId}-helper`

  const hasError = typeof error === 'string' ? !!error : !!error
  const errorMessage = typeof error === 'string' ? error : undefined
  const handleChange = onValueChange ?? onChange

  // Determine aria-describedby: explicit prop > error > helper
  const computedDescribedBy =
    ariaDescribedBy ??
    (errorMessage ? errorId : helperText ? helperId : undefined)

  const selectElement = (
    <RadixSelect
      value={value}
      onValueChange={handleChange}
      disabled={disabled}
      name={name}
    >
      <SelectTrigger
        id={label ? selectId : undefined}
        error={hasError}
        className={cn(
          'min-h-[52px] h-11 rounded-md border-input',
          'focus:ring-ring',
          'transition-colors duration-fast',
          'motion-reduce:transition-none',
          triggerClassName,
          // When no label wrapper, apply outer className to trigger
          !label && className,
        )}
        aria-label={ariaLabel}
        aria-describedby={computedDescribedBy}
        aria-invalid={hasError || undefined}
        aria-required={required || undefined}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="animate-in zoom-in-95 duration-fast">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="px-4"
          >
            <span className="flex min-w-0 max-w-full flex-col">
              <span className="line-clamp-2 break-words text-sm leading-tight sm:line-clamp-1 sm:text-base">
                {option.label}
              </span>
              {option.description ? (
                <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:text-sm">
                  {option.description}
                </span>
              ) : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </RadixSelect>
  )

  // Raw mode — no label wrapper
  if (!label && !errorMessage && !helperText) {
    return selectElement
  }

  // Field-wrapped mode — label + error + helper
  return (
    <div className={cn('space-y-2.5', className)}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-foreground"
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}

      {selectElement}

      {errorMessage && (
        <p id={errorId} className="mt-1 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}

      {helperText && !errorMessage && (
        <p id={helperId} className="mt-1 text-sm text-muted-foreground">
          {helperText}
        </p>
      )}
    </div>
  )
}

CanonicalSelect.displayName = 'CanonicalSelect'
