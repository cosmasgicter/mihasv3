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
    'focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400',
    'disabled:pointer-events-none disabled:opacity-50',
    'overflow-hidden group'
  )
  
  const variantClasses = {
    primary: 'bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-500 dark:to-purple-500 text-white hover:shadow-lg hover:shadow-blue-500/50 dark:hover:shadow-blue-400/30',
    secondary: 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700',
    outline: 'border-2 border-blue-600 dark:border-blue-400 bg-transparent text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950',
    ghost: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
    danger: 'bg-red-600 dark:bg-red-500 text-white hover:bg-red-700 dark:hover:bg-red-600 hover:shadow-lg hover:shadow-red-500/50'
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
