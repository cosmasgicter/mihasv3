import React from 'react'
import { motion, type HTMLMotionProps, useReducedMotion } from 'framer-motion'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'relative inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 overflow-hidden group',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:shadow-lg hover:opacity-90',
        primary: 'bg-primary text-primary-foreground hover:shadow-lg hover:opacity-90',
        secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80',
        outline: 'border-2 border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-lg',
        success: 'bg-success text-success-foreground hover:bg-success/90 hover:shadow-lg',
        warning: 'bg-warning text-warning-foreground hover:bg-warning/90 hover:shadow-lg',
      },
      size: {
        default: 'h-10 px-4 text-sm min-w-[44px]',
        xs: 'h-8 px-2 text-xs min-w-[36px]',
        sm: 'h-9 px-3 text-sm min-w-[44px]',
        md: 'h-10 px-4 text-sm min-w-[44px]',
        lg: 'h-11 px-6 text-base min-w-[44px]',
        xl: 'h-12 px-8 text-lg min-w-[48px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'magnetic' | 'glow'>, VariantProps<typeof buttonVariants> {
  loading?: boolean
  children: React.ReactNode
}

const isTestEnvironment = typeof process !== 'undefined' && process.env.NODE_ENV === 'test'

export function Button({
  variant,
  size,
  loading = false,
  className,
  children,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  const prefersReducedMotion = useReducedMotion()

  const motionVariants = {
    hover: { scale: 1.02, transition: { duration: 0.2 } },
    tap: { scale: 0.98, transition: { duration: 0.1 } }
  }

  const buttonContent = (
    <>
      {loading && (
        prefersReducedMotion ? (
          <div className="mr-2 h-4 w-4 rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <motion.div
            className="mr-2 h-4 w-4 rounded-full border-2 border-current border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        )
      )}
      {children}
    </>
  )

  if (isTestEnvironment || prefersReducedMotion) {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        onClick={onClick}
        {...props}
      >
        {buttonContent}
      </button>
    )
  }

  return (
    <motion.button
      className={cn(buttonVariants({ variant, size, className }))}
      variants={motionVariants}
      whileHover="hover"
      whileTap="tap"
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {buttonContent}
    </motion.button>
  )
}
