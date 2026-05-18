import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { ButtonSpinner } from './ButtonSpinner'

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
  'relative inline-flex min-w-0 items-center justify-center gap-2 whitespace-normal break-words rounded-lg text-center font-semibold leading-tight ring-offset-background transition-all transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-smooth-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-manipulation [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]',
        primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]',
        secondary: 'bg-secondary text-secondary-foreground border border-border/35 shadow-sm hover:bg-secondary/80 active:scale-[0.98]',
        outline: 'border border-border/60 bg-background text-foreground shadow-sm hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-[0.98]',
        ghost: 'text-primary hover:bg-primary/5 active:scale-[0.98]',
        link: 'text-primary underline-offset-4 hover:underline',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:scale-[0.98]',
        danger: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:scale-[0.98]',
        success: 'bg-success text-white shadow-sm hover:bg-success/90 active:scale-[0.98]',
        warning: 'bg-warning text-white shadow-sm hover:bg-warning/90 active:scale-[0.98]',
        gradient: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]',
      },
      size: {
        default: 'h-11 min-h-touch h-auto px-4 py-2 text-sm',      // 44px - meets touch target minimum
        xs: 'min-h-touch h-auto px-2 py-1.5 text-xs',             // 44px - touch target enforced
        sm: 'min-h-touch h-auto px-3 py-2 text-sm',               // 44px - touch target enforced
        md: 'min-h-touch h-auto px-4 py-2 text-base',             // 44px - medium
        lg: 'min-h-touch-lg h-auto px-6 py-2.5 text-lg',          // 48px - large
        xl: 'min-h-touch-lg h-auto px-8 py-2.5 text-xl',          // 48px - extra large
        icon: 'h-11 w-11 min-h-touch min-w-touch p-0',            // 44px - icon only, meets touch target
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
    const isDev = process.env.NODE_ENV !== 'production'

    let slotChild: React.ReactNode = children

    if (asChild) {
      if (isDev && (!React.isValidElement(children) || React.Children.count(children) !== 1)) {
        throw new Error(
          'Button with asChild expects exactly one valid React element child. Example: <Button asChild><a /></Button>.'
        )
      }

      if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
        slotChild = React.cloneElement(children, undefined, (
          <>
            {loading && <ButtonSpinner size="sm" className="mr-2" />}
            {children.props.children}
          </>
        ))
      }
    }
    
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
        {asChild ? slotChild : (
          <>
            {loading && <ButtonSpinner size="sm" className="mr-2" />}
            {children}
          </>
        )}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
