import React from 'react'
import { motion } from 'framer-motion'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { inputVariants } from '@/design-system/variants'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>,
  VariantProps<typeof inputVariants> {
  label?: string
  error?: string
  helperText?: string
  icon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant = 'default', label, error, helperText, icon, type = 'text', ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {label}
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
            className={cn(
              inputVariants({ variant }),
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
            id={`${props.id}-error`}
            className="mt-1.5 text-sm text-destructive"
            role="alert"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {error}
          </motion.p>
        )}
        {helperText && !error && (
          <p id={`${props.id}-helper`} className="mt-1.5 text-sm text-foreground">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
