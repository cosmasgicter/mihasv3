import React from 'react'
import { cn } from '@/lib/utils'

export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, ...props }, ref) => {
    return (
      <div className="flex items-center gap-2">
        <input
          type="radio"
          className={cn(
            'w-4 h-4 border-input bg-background text-primary transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
          ref={ref}
          {...props}
        />
        {label && (
          <label className="text-sm text-foreground cursor-pointer select-none">
            {label}
          </label>
        )}
      </div>
    )
  }
)

Radio.displayName = 'Radio'
