/**
 * @deprecated This component is deprecated. Use LoadingSpinner from '@/components/ui/LoadingSpinner' instead.
 * This file will be removed in a future version.
 * 
 * Migration:
 * - Replace `<Spinner />` with `<LoadingSpinner />`
 * - Replace `<Spinner size="lg" />` with `<LoadingSpinner size="lg" />`
 * - Replace `<Spinner variant="white" />` with `<LoadingSpinner color="white" />`
 */
import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** @deprecated Use LoadingSpinner instead */
const spinnerVariants = cva('animate-spin rounded-full border-2 border-current border-t-transparent', {
  variants: {
    size: {
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-8 w-8',
      xl: 'h-12 w-12',
    },
    variant: {
      primary: 'text-primary',
      white: 'text-white',
      current: 'text-current',
    },
  },
  defaultVariants: {
    size: 'md',
    variant: 'primary',
  },
})

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerVariants> {}

export function Spinner({ className, size, variant, ...props }: SpinnerProps) {
  return <div className={cn(spinnerVariants({ size, variant }), className)} {...props} />
}
