import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  fullScreen?: boolean
}

export function Loading({ size = 'md', text, fullScreen = false }: LoadingProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  }

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative">
        {/* Outer ring */}
        <motion.div
          className={cn(
            'rounded-full border-2 border-border',
            sizeClasses[size]
          )}
        />
        {/* Spinning gradient ring */}
        <motion.div
          className={cn(
            'absolute inset-0 rounded-full border-2 border-transparent border-t-primary',
            sizeClasses[size]
          )}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
      {text && (
        <motion.p
          className="text-sm text-body-secondary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {text}
        </motion.p>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-card/80 backdrop-blur-sm">
        {spinner}
      </div>
    )
  }

  return spinner
}

export function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <motion.div
      className={cn('bg-skeleton rounded', className)}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}
