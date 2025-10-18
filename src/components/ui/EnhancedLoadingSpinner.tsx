import React from 'react'
import { cn } from '@/lib/utils'
import { Loader2, RefreshCw } from 'lucide-react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'default' | 'dots' | 'pulse' | 'bounce'
  text?: string
  className?: string
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error'
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6', 
  lg: 'w-8 h-8',
  xl: 'w-12 h-12'
}

const colorClasses = {
  primary: 'text-blue-600',
  secondary: 'text-gray-600 dark:text-gray-400',
  success: 'text-green-600',
  warning: 'text-yellow-600',
  error: 'text-red-600'
}

export function EnhancedLoadingSpinner({ 
  size = 'md', 
  variant = 'default',
  text,
  className,
  color = 'primary'
}: LoadingSpinnerProps) {
  const renderSpinner = () => {
    const baseClasses = cn(
      sizeClasses[size],
      colorClasses[color],
      'smooth-spin',
      className
    )

    switch (variant) {
      case 'dots':
        return (
          <div className={cn('flex space-x-1', className)}>
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-full bg-current',
                  size === 'sm' ? 'w-1 h-1' : size === 'md' ? 'w-2 h-2' : 'w-3 h-3',
                  colorClasses[color]
                )}
                style={{
                  animation: `smoothBounce 1.4s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.16}s infinite both`
                }}
              />
            ))}
          </div>
        )
      
      case 'pulse':
        return (
          <div className={cn(
            'rounded-full bg-current smooth-pulse',
            sizeClasses[size],
            colorClasses[color],
            className
          )} />
        )
      
      case 'bounce':
        return (
          <div className={cn(
            'rounded-full bg-current smooth-bounce',
            sizeClasses[size], 
            colorClasses[color],
            className
          )} />
        )
      
      default:
        return <Loader2 className={baseClasses} data-testid="loading-spinner" />
    }
  }

  if (text) {
    return (
      <div className="flex items-center space-x-2">
        {renderSpinner()}
        <span className={cn(
          'text-sm font-medium',
          colorClasses[color]
        )}>
          {text}
        </span>
      </div>
    )
  }

  return renderSpinner()
}

// Full screen loading with enhanced animations
export function FullScreenLoader({ 
  text = 'Loading...',
  subtext,
  variant = 'default'
}: {
  text?: string
  subtext?: string
  variant?: 'default' | 'dots' | 'pulse'
}) {
  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-800/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <EnhancedLoadingSpinner size="xl" variant={variant} color="primary" />
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{text}</h3>
          {subtext && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{subtext}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// Skeleton components for better loading states
export function SkeletonCard() {
  return (
    <div className="smooth-pulse">
      <div className="smooth-skeleton rounded-lg h-48 w-full mb-4"></div>
      <div className="space-y-2">
        <div className="smooth-skeleton rounded h-4 w-3/4"></div>
        <div className="smooth-skeleton rounded h-4 w-1/2"></div>
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number, cols?: number }) {
  return (
    <div className="smooth-pulse">
      <div className="smooth-skeleton rounded h-10 w-full mb-4"></div>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex space-x-4 mb-3">
          {[...Array(cols)].map((_, j) => (
            <div key={j} className="smooth-skeleton rounded h-8 flex-1"></div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonForm() {
  return (
    <div className="smooth-pulse space-y-4">
      <div className="smooth-skeleton rounded h-10 w-full"></div>
      <div className="smooth-skeleton rounded h-10 w-full"></div>
      <div className="smooth-skeleton rounded h-20 w-full"></div>
      <div className="smooth-skeleton rounded h-10 w-32"></div>
    </div>
  )
}

// Loading button component
export function LoadingButton({ 
  loading, 
  children, 
  className,
  size = 'md',
  ...props 
}: {
  loading: boolean
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button 
      {...props}
      disabled={loading || props.disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:pointer-events-none',
        {
          'h-8 px-3 text-sm': size === 'sm',
          'h-10 px-4': size === 'md', 
          'h-12 px-6 text-lg': size === 'lg'
        },
        'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
        className
      )}
    >
      {loading && <EnhancedLoadingSpinner size="sm" color="secondary" />}
      {children}
    </button>
  )
}
