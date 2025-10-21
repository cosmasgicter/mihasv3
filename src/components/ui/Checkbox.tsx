import React from 'react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className={cn(
            'w-4 h-4 mt-0.5 rounded border-input bg-background text-primary transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-error',
            className
          )}
          ref={ref}
          {...props}
        />
        {label && (
          <label className="text-sm text-foreground cursor-pointer select-none">
            {label}
            {error && <span className="block text-destructive mt-0.5">{error}</span>}
          </label>
        )}
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'
