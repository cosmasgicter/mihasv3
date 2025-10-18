import React from 'react'
import { motion } from 'framer-motion'
import { LoadingSpinner } from './LoadingSpinner'
import { cn } from '@/lib/utils'

interface InlineLoaderProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showSpinner?: boolean
  variant?: 'default' | 'minimal' | 'card'
}

export function InlineLoader({
  message = 'Loading...',
  size = 'md',
  className,
  showSpinner = true,
  variant = 'default'
}: InlineLoaderProps) {
  const sizeClasses = {
    sm: 'text-sm py-2',
    md: 'text-base py-4',
    lg: 'text-lg py-6'
  }

  const baseClasses = {
    default: 'flex items-center justify-center space-x-3',
    minimal: 'flex items-center space-x-2 text-gray-600 dark:text-gray-400 dark:text-gray-500',
    card: 'flex items-center justify-center space-x-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 dark:border-gray-300 p-6'
  }

  return (
    <motion.div
      className={cn(baseClasses[variant], sizeClasses[size], className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {showSpinner && (
        <LoadingSpinner 
          size={size === 'lg' ? 'md' : 'sm'} 
          color={variant === 'card' ? 'primary' : 'primary'}
        />
      )}
      <span className={cn(
        'font-medium',
        variant === 'minimal' ? 'text-gray-600 dark:text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300 dark:text-gray-600'
      )}>
        {message}
      </span>
    </motion.div>
  )
}

// Preset loaders for specific contexts
export function DataTableLoader() {
  return (
    <div className="text-center py-8">
      <InlineLoader 
        message="Loading data..." 
        variant="card"
        size="lg"
      />
    </div>
  )
}

export function FormSubmissionLoader() {
  return (
    <InlineLoader 
      message="Submitting..." 
      variant="minimal"
      size="sm"
    />
  )
}

export function PageContentLoader() {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <InlineLoader 
        message="Loading content..." 
        variant="card"
        size="lg"
      />
    </div>
  )
}