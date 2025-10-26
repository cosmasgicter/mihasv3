import React from 'react'
import { motion, type HTMLMotionProps, useReducedMotion } from 'framer-motion'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'relative inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 overflow-hidden group',
  {
    variants: {
      variant: {
        default: 'bg-primary hover:bg-primary/90 text-white shadow-sm hover:shadow-lg',
        primary: 'bg-primary hover:bg-primary/90 text-white shadow-sm hover:shadow-lg',
        secondary: 'bg-secondary hover:bg-secondary/90 text-secondary-foreground border border-border',
        outline: 'border-2 border-primary text-primary hover:bg-primary/5',
        ghost: 'hover:bg-primary/5 text-primary',
        link: 'text-primary underline-offset-4 hover:underline',
        destructive: 'bg-error hover:bg-error/90 text-white shadow-sm hover:shadow-lg',
        success: 'bg-success hover:bg-success/90 text-white shadow-sm hover:shadow-lg',
        warning: 'bg-warning hover:bg-warning/90 text-white shadow-sm hover:shadow-lg',
        gradient: 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl',
      },
      size: {
        // Visual sizing will be applied via inline styles using design tokens / CSS variables
        default: '',
        xs: '',
        sm: '',
        md: '',
        lg: '',
        xl: '',
        icon: '',
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

  // Map semantic sizes to CSS token-backed styles
  const sizeStyles: Record<string, React.CSSProperties> = {
    default: { height: 'var(--touch-target)', paddingInline: '1rem', fontSize: 'var(--type-sm)', minWidth: '44px' },
    xs: { height: '2rem', paddingInline: '0.5rem', fontSize: 'var(--type-xs)', minWidth: '36px' },
    sm: { height: '2.25rem', paddingInline: '0.75rem', fontSize: 'var(--type-sm)', minWidth: '44px' },
    md: { height: 'var(--touch-target)', paddingInline: '1rem', fontSize: 'var(--type-base)', minWidth: '44px' },
    lg: { height: '2.75rem', paddingInline: '1.5rem', fontSize: 'var(--type-lg)', minWidth: '44px' },
    xl: { height: '3rem', paddingInline: '2rem', fontSize: 'var(--type-2xl)', minWidth: '48px' },
    icon: { width: 'var(--touch-target)', height: 'var(--touch-target)', paddingInline: 0 }
  }

  const appliedSizeStyle = sizeStyles[size || 'default'] || sizeStyles.default
  const propsStyle = props.style ? (props.style as React.CSSProperties) : {}
  const mergedStyle: React.CSSProperties = { ...propsStyle, ...appliedSizeStyle }

  if (isTestEnvironment || prefersReducedMotion) {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        onClick={onClick}
        aria-busy={loading}
        style={mergedStyle}
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
      aria-busy={loading}
      style={mergedStyle as any}
      {...props}
    >
      {buttonContent}
    </motion.button>
  )
}
