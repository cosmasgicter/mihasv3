import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
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
    sm: 'w-[var(--spinner-sm)] h-[var(--spinner-sm)]',
    md: 'w-[var(--spinner-md)] h-[var(--spinner-md)]',
    lg: 'w-[var(--spinner-lg)] h-[var(--spinner-lg)]',
    xl: 'w-[2.5rem] h-[2.5rem]'
  }

  const colorClasses = {
    primary: 'border-border border-t-primary',
    secondary: 'border-border border-t-secondary', 
    white: 'border-card/20 border-t-white'
  }

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg'
  }

  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      {prefersReducedMotion ? (
        <div className={cn('rounded-full border-2', sizeClasses[size], colorClasses[color], className)} />
      ) : (
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
      )}

      {message && (
        prefersReducedMotion ? (
          <p className={cn('text-gray-900 font-medium text-center', textSizeClasses[size])}>{message}</p>
        ) : (
          <motion.p 
            className={cn(
              'text-gray-900 font-medium text-center',
              textSizeClasses[size]
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {message}
          </motion.p>
        )
      )}

      {showPulse && (prefersReducedMotion ? (
        <div className="flex space-x-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-2 h-2 bg-primary rounded-full opacity-80" />
          ))}
        </div>
      ) : (
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
      ))}
    </div>
  )
}