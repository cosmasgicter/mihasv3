import React from 'react'
import { cn } from '@/lib/utils'

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
}

const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, label, error, helperText, ...props }, ref) => {
    const id = React.useId()
    const finalId = props.id ?? props.name ?? id
    
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={finalId} className="block text-sm font-medium text-secondary mb-1">
            {label}
            {props.required && <span className="text-error ml-1">*</span>}
          </label>
        )}
        <textarea
          id={finalId}
          className={cn(
            'flex min-h-[80px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-error focus:ring-red-500 focus:border-error',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-destructive">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-sm text-secondary">{helperText}</p>
        )}
      </div>
    )
  }
)
TextArea.displayName = 'TextArea'

export { TextArea }