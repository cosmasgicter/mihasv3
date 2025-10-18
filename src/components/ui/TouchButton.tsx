import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useTouchFeedback } from '@/hooks/useTouchFeedback'

interface TouchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function TouchButton({ 
  children, 
  variant = 'primary', 
  className, 
  ...props 
}: TouchButtonProps) {
  const { isPressed, touchHandlers } = useTouchFeedback()

  const variantClasses = {
    primary: 'bg-gradient-to-r from-blue-600 to-purple-600 text-white',
    secondary: 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700',
    ghost: 'text-gray-700 dark:text-gray-300'
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
