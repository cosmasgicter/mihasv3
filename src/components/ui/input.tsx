import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Input Component
 * 
 * Touch-optimized input with 44px minimum height.
 * 
 * Requirements: 9.2 - Touch targets at least 44x44 pixels
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, icon, type = 'text', id, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const inputId = id || React.useId()

    return (
      <div className="w-full">
        {label && (
          <label 
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              {icon}
            </div>
          )}
          <input
            type={type}
            id={inputId}
            className={cn(
              // Touch target compliance - 44px minimum height
              'w-full min-h-[44px] px-3 rounded-lg',
              // Background and border
              'bg-background border border-input',
              // Typography - 16px to prevent iOS zoom
              'text-base text-foreground',
              // Placeholder
              'placeholder:text-muted-foreground',
              // Hover state
              'hover:border-primary/50 hover:bg-accent/30',
              // Focus state
              'focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary',
              // Transition
              'transition-all duration-150',
              // Disabled state
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-input disabled:hover:bg-background',
              // Error state
              error && 'border-destructive focus:ring-destructive/50 focus:border-destructive hover:border-destructive/70',
              // Icon padding
              icon && 'pl-10',
              // Touch optimization
              'touch-manipulation',
              className
            )}
            ref={ref}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              error 
                ? `${inputId}-error` 
                : helperText 
                  ? `${inputId}-helper` 
                  : undefined
            }
            {...props}
          />
          {isFocused && (
            <motion.div
              className="absolute inset-0 rounded-lg border-2 border-ring pointer-events-none"
              layoutId="input-focus"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </div>
        {error && (
          <motion.p
            id={`${inputId}-error`}
            className="mt-1.5 text-sm text-destructive"
            role="alert"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {error}
          </motion.p>
        )}
        {helperText && !error && (
          <p 
            id={`${inputId}-helper`} 
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
