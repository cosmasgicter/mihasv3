import React from 'react'
import { motion, type HTMLMotionProps, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'magnetic' | 'glow'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}

const isTestEnvironment = typeof process !== 'undefined' && process.env.NODE_ENV === 'test'

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  const prefersReducedMotion = useReducedMotion()
  const baseClasses = cn(
    'relative inline-flex items-center justify-center rounded-lg font-medium',
    'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    'overflow-hidden group'
  )
  
  const variantClasses = {
    primary: 'bg-primary text-primary-foreground hover:shadow-lg hover:opacity-90',
    secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80',
    outline: 'border-2 border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
    ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-lg'
  }
  
  const sizeClasses = {
    sm: 'h-9 px-3 text-sm min-w-[44px]',
    md: 'h-10 px-4 text-sm min-w-[44px]',
    lg: 'h-11 px-6 text-base min-w-[44px]'
  }

  const buttonVariants = {
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
        className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
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
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      variants={buttonVariants}
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
