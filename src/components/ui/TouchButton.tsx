// @ts-nocheck
import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useTouchFeedback } from '@/hooks/useTouchFeedback'

/**
 * @deprecated Use `Button` from '@/components/ui/Button' instead.
 * This component will be removed in a future release.
 */
interface TouchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
}

/**
 * @deprecated Use `Button` from '@/components/ui/Button' instead.
 * This component will be removed in a future release.
 */
export function TouchButton({ 
  children, 
  variant = 'primary', 
  className, 
  ...props 
}: TouchButtonProps) {
  const { isPressed, touchHandlers } = useTouchFeedback()

  const variantClasses = {
    primary: 'bg-gradient-to-r from-blue-600 to-purple-600 text-foreground',
    secondary: 'bg-card text-gray-900 border border-border',
    ghost: 'text-foreground'
  }

  return (
    <motion.button
      className={cn(
        'relative min-h-[44px] min-w-[44px] px-4 rounded-lg font-medium',
        'transition-all duration-200 active:scale-95',
        variantClasses[variant],
        isPressed && 'scale-95',
        className
      )}
      whileTap={{ scale: 0.95 }}
      {...touchHandlers}
      {...props}
    >
      {children}
    </motion.button>
  )
}
