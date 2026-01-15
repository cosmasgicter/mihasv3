import React from 'react'
import { cn } from '@/lib/utils'

export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  id?: string
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, id, ...props }, ref) => {
    // Generate a unique ID if not provided
    const radioId = id || `radio-${React.useId()}`
    
    return (
      <div className="flex items-center gap-2">
        <input
          type="radio"
          id={radioId}
          className={cn(
            'w-4 h-4 border-input bg-background text-primary transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
          ref={ref}
          aria-label={!label ? props.name || 'Radio option' : undefined}
          {...props}
        />
        {label && (
          <label 
            htmlFor={radioId}
            className="text-sm text-gray-900 cursor-pointer select-none"
          >
            {label}
          </label>
        )}
      </div>
    )
  }
)

Radio.displayName = 'Radio'
