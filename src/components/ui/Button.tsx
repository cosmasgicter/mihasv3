import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { LoadingSpinner } from './LoadingSpinner'

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
        default: 'h-10 px-4 text-sm',           // 40px - standard
        xs: 'h-8 px-2 text-xs',                  // 32px - extra small
        sm: 'h-9 px-3 text-sm',                  // 36px - small
        md: 'h-10 px-4 text-base',               // 40px - medium (same as default)
        lg: 'h-11 px-6 text-lg',                 // 44px - large
        xl: 'h-12 px-8 text-xl',                 // 48px - extra large
        icon: 'h-10 w-10 p-0',                   // 40px - icon only
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

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
 * - Touch-manipulation CSS for mobile accessibility
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
        {loading && <LoadingSpinner size="sm" color="current" className="mr-2" />}
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
