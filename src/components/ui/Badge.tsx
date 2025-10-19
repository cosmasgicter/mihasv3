import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gradient'
  size?: 'sm' | 'md' | 'lg'
  animate?: boolean
}

export function Badge({
  variant = 'default',
  size = 'md',
  animate = false,
  className,
  children,
  ...props
}: BadgeProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-full transition-all duration-200'

  const variantClasses = {
    default: 'bg-accent dark:bg-gray-200 text-foreground border border-border',
    success: 'bg-accent/10 text-green-700 dark:text-green-400 border border-accent/30',
    warning: 'bg-accent/10 text-yellow-700 dark:text-yellow-400 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800',
    danger: 'bg-destructive/10 text-red-700 dark:text-red-400 border border-destructive/30',
    info: 'bg-primary/10 text-blue-700 dark:text-blue-400 border border-primary/30',
    gradient: 'bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-500 dark:to-purple-500 text-white border-none'
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base'
  }

  const Component = animate ? motion.span : 'span'

  return (
    <Component
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...(animate && {
        initial: { scale: 0.8, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        transition: { type: 'spring', duration: 0.3 }
      })}
      {...props}
    >
      {children}
    </Component>
  )
}
