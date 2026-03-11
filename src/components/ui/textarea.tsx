import React from 'react'
import { cn } from '@/lib/utils'

/**
 * Textarea Component - shadcn/ui pattern
 * 
 * Touch-optimized textarea with 44px minimum height.
 * Supports React Hook Form register() spread pattern.
 * Uses pure CSS transitions (no framer-motion) for better performance.
 * 
 * Requirements:
 * - 3.2: shadcn/ui pattern with label/error/helperText props
 * - 3.3: RHF register() spread compatibility
 * - 3.4: Minimum height and auto-resize (resize-y)
 * - 3.5: aria-invalid for error state
 * - 3.6: aria-describedby for error/helper text
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const textareaId = id || React.useId()
    const errorId = `${textareaId}-error`
    const helperId = `${textareaId}-helper`

    return (
      <div className="w-full">
        {label && (
          <label 
            htmlFor={textareaId}
            className="block text-sm font-medium text-foreground mb-2"
          >
            {label}
            {props.required && <span className="text-destructive ml-1">*</span>}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            // Base styles - minimum height for touch targets
            'flex w-full min-h-[100px] px-3 py-2 rounded-md',
            // Background and border
            'bg-background border border-input',
            // Typography - 16px to prevent iOS zoom
            'text-base text-foreground',
            // Placeholder
            'placeholder:text-muted-foreground',
            // Hover state
            'hover:border-primary/50 hover:bg-accent/30',
            // Focus state with ring — keyboard only
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus:border-primary',
            // CSS transitions - respects prefers-reduced-motion
            'transition-colors duration-150',
            'motion-reduce:transition-none',
            // Disabled state
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
            'disabled:hover:border-input disabled:hover:bg-background',
            // Resize behavior
            'resize-y',
            // Error state
            error && 'border-destructive focus:ring-destructive/50 focus:border-destructive hover:border-destructive/70',
            // Touch optimization
            'touch-manipulation',
            className
          )}
          ref={ref}
          aria-invalid={error ? 'true' : 'false'}
          aria-required={props.required || undefined}
          aria-describedby={
            error 
              ? errorId 
              : helperText 
                ? helperId 
                : undefined
          }
          {...props}
        />
        {error && (
          <p
            id={errorId}
            className={cn(
              'mt-1 text-sm text-destructive',
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
            className="mt-1 text-sm text-muted-foreground"
          >
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
