/**
 * Progress Indicator Component
 * Shows progress for uploads, downloads, and other async operations
 * Provides visual feedback within 100ms
 */

import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface ProgressIndicatorProps {
  progress: number // 0-100
  status?: 'loading' | 'success' | 'error' | 'idle'
  message?: string
  showPercentage?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ProgressIndicator({
  progress,
  status = 'loading',
  message,
  showPercentage = true,
  size = 'md',
  className,
}: ProgressIndicatorProps) {
  const prefersReducedMotion = useReducedMotion()

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  }

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  }

  const clampedProgress = Math.max(0, Math.min(100, progress))

  return (
    <div className={cn('w-full space-y-2', className)}>
      {/* Progress bar */}
      <div className={cn('w-full bg-slate-200 rounded-full overflow-hidden', sizeClasses[size])}>
        {prefersReducedMotion ? (
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              status === 'success' && 'bg-green-600',
              status === 'error' && 'bg-red-600',
              status === 'loading' && 'bg-blue-600',
              status === 'idle' && 'bg-slate-400'
            )}
            style={{ width: `${clampedProgress}%` }}
          />
        ) : (
          <motion.div
            className={cn(
              'h-full rounded-full',
              status === 'success' && 'bg-green-600',
              status === 'error' && 'bg-red-600',
              status === 'loading' && 'bg-blue-600',
              status === 'idle' && 'bg-slate-400'
            )}
            initial={{ width: 0 }}
            animate={{ width: `${clampedProgress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        )}
      </div>

      {/* Status message and percentage */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-2">
          {status === 'loading' && (
            <Loader2 className={cn('animate-spin text-blue-600', iconSizes[size])} />
          )}
          {status === 'success' && (
            <CheckCircle className={cn('text-green-600', iconSizes[size])} />
          )}
          {status === 'error' && (
            <XCircle className={cn('text-red-600', iconSizes[size])} />
          )}
          {message && (
            <span className="text-slate-700 font-medium">{message}</span>
          )}
        </div>
        {showPercentage && (
          <span className="text-slate-600 font-semibold">
            {Math.round(clampedProgress)}%
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Circular Progress Indicator
 */
interface CircularProgressProps {
  progress: number // 0-100
  size?: number
  strokeWidth?: number
  className?: string
  showPercentage?: boolean
}

export function CircularProgress({
  progress,
  size = 64,
  strokeWidth = 4,
  className,
  showPercentage = true,
}: CircularProgressProps) {
  const prefersReducedMotion = useReducedMotion()
  const clampedProgress = Math.max(0, Math.min(100, progress))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clampedProgress / 100) * circumference

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-slate-200"
        />
        {/* Progress circle */}
        {prefersReducedMotion ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="text-blue-600 transition-all duration-300"
          />
        ) : (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeLinecap="round"
            className="text-blue-600"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        )}
      </svg>
      {showPercentage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold text-slate-700">
            {Math.round(clampedProgress)}%
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Indeterminate Progress (for unknown duration)
 */
interface IndeterminateProgressProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function IndeterminateProgress({
  message,
  size = 'md',
  className,
}: IndeterminateProgressProps) {
  const prefersReducedMotion = useReducedMotion()

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  }

  return (
    <div className={cn('w-full space-y-2', className)}>
      <div className={cn('w-full bg-slate-200 rounded-full overflow-hidden', sizeClasses[size])}>
        {prefersReducedMotion ? (
          <div className="h-full w-1/3 bg-blue-600 rounded-full" />
        ) : (
          <motion.div
            className="h-full w-1/3 bg-blue-600 rounded-full"
            animate={{
              x: ['-100%', '400%'],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}
      </div>
      {message && (
        <p className="text-sm text-slate-700 font-medium">{message}</p>
      )}
    </div>
  )
}
