import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  color?: 'primary' | 'secondary' | 'white'
  message?: string
  showPulse?: boolean
}

export function LoadingSpinner({ 
  size = 'md', 
  className, 
  color = 'primary',
  message,
  showPulse = false
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  }

  const colorClasses = {
    primary: 'border-gray-200 dark:border-gray-700 dark:border-gray-300 border-t-primary',
    secondary: 'border-gray-200 dark:border-gray-700 dark:border-gray-300 border-t-secondary', 
    white: 'border-white/20 border-t-white'
  }

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg'
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <motion.div 
        className={cn(
          'animate-spin rounded-full border-2',
          sizeClasses[size],
          colorClasses[color],
          className
        )}
        animate={{ rotate: 360 }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: "linear"
        }}
      />
      {message && (
        <motion.p 
          className={cn(
            'text-gray-600 dark:text-gray-400 dark:text-gray-500 font-medium text-center',
            textSizeClasses[size]
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {message}
        </motion.p>
      )}
      {showPulse && (
        <motion.div
          className="flex space-x-1"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.3,
                repeat: Infinity,
                repeatType: "reverse",
                duration: 1.5
              }
            }
          }}
        >
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-primary rounded-full"
              variants={{
                hidden: { opacity: 0.3 },
                visible: { opacity: 1 }
              }}
            />
          ))}
        </motion.div>
      )}
    </div>
  )
}