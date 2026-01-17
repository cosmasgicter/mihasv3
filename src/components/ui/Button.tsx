import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Button Component - shadcn/ui pattern with Radix Slot
 * 
 * Migrated from framer-motion to pure CSS transitions for better performance.
 * Supports all existing variants, sizes, loading state, and accessibility features.
 * 
 * @see Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

const buttonVariants = cva(
  // Base styles with focus-visible ring and touch-manipulation for mobile
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-manipulation [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]',
        primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]',
        secondary: 'bg-secondary text-secondary-foreground border border-border shadow-sm hover:bg-secondary/80 active:scale-[0.98]',
        outline: 'border-2 border-primary text-primary bg-transparent hover:bg-primary/5 active:scale-[0.98]',
        ghost: 'text-primary hover:bg-primary/5 active:scale-[0.98]',
        link: 'text-primary underline-offset-4 hover:underline',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:scale-[0.98]',
        danger: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:scale-[0.98]',
        success: 'bg-success text-white shadow-sm hover:bg-success/90 active:scale-[0.98]',
        warning: 'bg-warning text-white shadow-sm hover:bg-warning/90 active:scale-[0.98]',
        gradient: 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg hover:from-blue-700 hover:to-purple-700 hover:shadow-xl active:scale-[0.98]',
      },
      size: {
        default: 'h-11 min-h-[44px] min-w-[44px] px-4 text-sm',
        xs: 'h-8 min-h-[32px] min-w-[36px] px-2 text-xs',
        sm: 'h-9 min-h-[36px] min-w-[44px] px-3 text-sm',
        md: 'h-11 min-h-[44px] min-w-[44px] px-4 text-base',
        lg: 'h-11 min-h-[44px] min-w-[44px] px-6 text-lg',
        xl: 'h-12 min-h-[48px] min-w-[48px] px-8 text-xl',
        icon: 'h-11 w-11 min-h-[44px] min-w-[44px] p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

// Spinner component for loading state
const Spinner = React.memo(function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 animate-spin', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
})

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as child element (Radix Slot pattern) */
  asChild?: boolean
  /** Show loading spinner and disable interactions */
  loading?: boolean
}

/**
 * Button component following shadcn/ui patterns with Radix UI primitives.
 * 
 * Features:
 * - All existing variants preserved (default, primary, secondary, outline, ghost, link, destructive, danger, success, warning, gradient)
 * - All existing sizes preserved (xs, sm, md, lg, xl, icon)
 * - Loading state with spinner animation
 * - 44px minimum touch targets (WCAG compliant)
 * - Respects prefers-reduced-motion via CSS
 * - Radix Slot support for composition (asChild prop)
 * - Prevents click when disabled or loading
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    
    // Prevent click when loading or disabled
    const handleClick = React.useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (loading || disabled) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        onClick?.(event)
      },
      [loading, disabled, onClick]
    )

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          // Reduced motion: disable scale transforms
          'motion-reduce:transform-none motion-reduce:transition-none'
        )}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        onClick={handleClick}
        {...props}
      >
        {loading && <Spinner className="mr-2" />}
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
