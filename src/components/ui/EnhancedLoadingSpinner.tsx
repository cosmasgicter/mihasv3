/**
 * @deprecated This component is deprecated. Use LoadingSpinner from '@/components/ui/LoadingSpinner' instead.
 * This file will be removed in a future version.
 * 
 * Migration:
 * - Replace `<EnhancedLoadingSpinner />` with `<LoadingSpinner />`
 * - Replace `<EnhancedLoadingSpinner variant="dots" />` with `<LoadingSpinner showPulse />`
 * - Replace `<FullScreenLoader />` with `<LoadingOverlay />` from '@/components/ui/LoadingOverlay'
 * - Replace `<SkeletonCard />` with `<SkeletonCard />` from '@/components/uiLoader'
 */
import React from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import {
  SkeletonCard as BaseSkeletonCard,
  SkeletonTable as BaseSkeletonTable,
  SkeletonForm as BaseSkeletonForm,
} from './skeletons'

/** @deprecated Use LoadingSpinner from '@/components/ui/LoadingSpinner' instead */
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
  primary: 'text-primary',
  secondary: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error'
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
    <div className="fixed inset-0 bg-card/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <EnhancedLoadingSpinner size="xl" variant={variant} color="primary" />
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">{text}</h3>
          {subtext && (
            <p className="text-sm text-foreground">{subtext}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// Skeleton components for better loading states
export function SkeletonCard() {
  return <BaseSkeletonCard showAvatar={false} lines={2} />
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number, cols?: number }) {
  return <BaseSkeletonTable rows={rows} columns={cols} />
}

export function SkeletonForm() {
  return <BaseSkeletonForm />
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
        'bg-primary text-foreground hover:bg-primary focus-visible:ring-blue-500',
        className
      )}
    >
      {loading && <EnhancedLoadingSpinner size="sm" color="secondary" />}
      {children}
    </button>
  )
}
