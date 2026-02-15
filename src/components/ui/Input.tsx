import React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, icon, type = 'text', ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-900 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-900">
              {icon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              'w-full h-10 px-3 rounded-lg touch-target',
              'bg-background',
              'border border-input',
              'text-foreground',
              'placeholder:text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error && 'border-error focus:ring-red-500 focus:ring-red-400',
              icon && 'pl-10',
              className
            )}
            ref={ref}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${props.id}-error` : helperText ? `${props.id}-helper` : undefined}
            {...props}
          />
          {isFocused && (
            <div
              className="absolute inset-0 rounded-lg border-2 border-ring pointer-events-none transition-opacity duration-200 opacity-100"
            />
          )}
        </div>
        {error && (
          <p
            id={`${props.id}-error`}
            className="mt-1.5 text-sm text-destructive animate-fade-in"
            role="alert"
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${props.id}-helper`} className="mt-1.5 text-sm text-gray-900">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
