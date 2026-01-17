import React from 'react'
import { cn } from '@/lib/utils'

/**
 * Input Component - shadcn/ui pattern
 * 
 * Touch-optimized input with 44px minimum height.
 * Supports React Hook Form register() spread pattern.
 * Uses pure CSS transitions (no framer-motion) for better performance.
 * 
 * Requirements:
 * - 2.2: shadcn/ui pattern with label/error/helperText/icon props
 * - 2.3: RHF register() spread compatibility
 * - 2.4: 44px minimum height for touch targets
 * - 2.5: 16px font size for iOS zoom prevention
 * - 2.6: Hover and focus states with CSS transitions
 * - 2.7: aria-invalid for error state
 * - 2.8: aria-describedby for error/helper text
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, icon, type = 'text', id, ...props }, ref) => {
    const inputId = id || React.useId()
    const errorId = `${inputId}-error`
    const helperId = `${inputId}-helper`

    return (
      <div className="w-full">
        {label && (
          <label 
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            {label}
            {props.required && <span className="text-destructive ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10">
              {icon}
            </div>
          )}
          <input
            type={type}
            id={inputId}
            className={cn(
              // Touch target compliance - 44px minimum height
              'flex w-full min-h-[44px] px-3 py-2 rounded-lg',
              // Background and border
              'bg-background border border-input',
              // Typography - 16px to prevent iOS zoom
              'text-base text-foreground',
              // Placeholder
              'placeholder:text-muted-foreground',
              // Hover state
              'hover:border-primary/50 hover:bg-accent/30',
              // Focus state with ring
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 focus:border-primary',
              // CSS transitions - respects prefers-reduced-motion
              'transition-colors duration-150',
              'motion-reduce:transition-none',
              // Disabled state
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
              'disabled:hover:border-input disabled:hover:bg-background',
              // Error state
              error && 'border-destructive focus:ring-destructive/50 focus:border-destructive hover:border-destructive/70',
              // Icon padding
              icon && 'pl-10',
              // Touch optimization
              'touch-manipulation',
              // File input styling
              'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
              className
            )}
            ref={ref}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              error 
                ? errorId 
                : helperText 
                  ? helperId 
                  : undefined
            }
            {...props}
          />
        </div>
        {error && (
          <p
            id={errorId}
            className={cn(
              'mt-1.5 text-sm text-destructive',
              // CSS animation for error appearance
              'animate-in fade-in-0 slide-in-from-top-1 duration-150',
              'motion-reduce:animate-none'
            )}
            role="alert"
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p 
            id={helperId} 
            className="mt-1.5 text-sm text-muted-foreground"
          >
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
