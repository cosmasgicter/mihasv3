import React from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, icon, type = 'text', ...props }, ref) => {
    const generatedId = React.useId()
    const inputId = props.id ?? generatedId

    const describedByIds = [
      error ? `${inputId}-error` : null,
      helperText && !error ? `${inputId}-helper` : null,
    ].filter(Boolean)

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-foreground mb-2">
            {label}
            {props.required && <span className="text-destructive ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground">
              {icon}
            </div>
          )}
          <input
            type={type}
            id={inputId}
            className={cn(
              'w-full h-12 px-4 rounded-xl touch-target',
              'bg-background/80',
              'border border-border/60',
              'text-foreground text-base',
              'placeholder:text-muted-foreground',
              'hover:border-primary/50 hover:bg-accent/30',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'disabled:hover:border-input disabled:hover:bg-background',
              error && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20 hover:border-destructive/70',
              icon && 'pl-10',
              className
            )}
            ref={ref}
            aria-invalid={error ? 'true' : undefined}
            aria-required={props.required || undefined}
            aria-describedby={describedByIds.length > 0 ? describedByIds.join(' ') : undefined}
            {...props}
          />
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            className="mt-1 flex items-center gap-1.5 text-sm text-destructive animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="mt-1 text-sm text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
