import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const textareaVariants = cva(
  'w-full px-3 py-2 rounded-lg bg-background border text-gray-900 placeholder:text-gray-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-ring resize-none',
  {
    variants: {
      variant: {
        default: 'border-input',
        error: 'border-error focus:ring-red-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  label?: string
  error?: string
  helperText?: string
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, label, error, helperText, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-900 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          className={cn(textareaVariants({ variant: error ? 'error' : variant }), className)}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-destructive">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-gray-900">{helperText}</p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
