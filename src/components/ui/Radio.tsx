import React from 'react'
import { cn } from '@/lib/utils'

/**
 * Radio Component
 * 
 * Touch-optimized radio button with 44x44px minimum touch target.
 * The visual radio is 20x20px but wrapped in a larger touch area.
 * 
 * Requirements: 9.2 - Touch targets at least 44x44 pixels
 */
export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  description?: string
  id?: string
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, description, id, ...props }, ref) => {
    // Generate a unique ID if not provided
    const radioId = id || `radio-${React.useId()}`
    
    return (
      <div className="flex items-start gap-3 min-h-[44px] py-2">
        {/* Touch target wrapper */}
        <div className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 -ml-3">
          <input
            type="radio"
            id={radioId}
            className={cn(
              // Visual radio size
              'w-5 h-5',
              // Styling
              'border-2 border-primary bg-background text-primary',
              // Focus styles
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              // Disabled state
              'disabled:opacity-50 disabled:cursor-not-allowed',
              // Touch optimization
              'touch-manipulation',
              // Transition
              'transition-colors duration-150',
              // Checked state
              'checked:bg-primary checked:border-primary',
              className
            )}
            ref={ref}
            aria-label={!label ? props.name || 'Radio option' : undefined}
            aria-describedby={description ? `${radioId}-description` : undefined}
            {...props}
          />
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <label 
                htmlFor={radioId}
                className="text-sm font-medium text-foreground cursor-pointer select-none leading-tight"
              >
                {label}
              </label>
            )}
            {description && (
              <span 
                id={`${radioId}-description`}
                className="text-sm text-muted-foreground mt-0.5"
              >
                {description}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }
)

Radio.displayName = 'Radio'

/**
 * RadioGroup Component
 * 
 * Groups radio buttons together with proper accessibility.
 */
interface RadioGroupProps {
  children: React.ReactNode
  label?: string
  className?: string
  orientation?: 'horizontal' | 'vertical'
}

export function RadioGroup({ 
  children, 
  label, 
  className,
  orientation = 'vertical' 
}: RadioGroupProps) {
  return (
    <fieldset className={cn('space-y-1', className)}>
      {label && (
        <legend className="text-sm font-medium text-foreground mb-2">
          {label}
        </legend>
      )}
      <div 
        className={cn(
          orientation === 'horizontal' ? 'flex flex-wrap gap-4' : 'space-y-1'
        )}
        role="radiogroup"
      >
        {children}
      </div>
    </fieldset>
  )
}
