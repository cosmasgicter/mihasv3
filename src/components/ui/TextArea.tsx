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
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          id={finalId}
          className={cn(
            'flex min-h-[80px] w-full rounded-md border border-secondary bg-white px-3 py-2 text-sm placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-500 focus:ring-red-500 focus:border-red-500',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
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