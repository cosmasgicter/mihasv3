/**
 * InlineLoader Component
 * 
 * Lightweight inline loading placeholder using skeleton primitives.
 * 
 * @requirements 5.1, 5.2 - Fast page loading
 */

import { Skeleton } from './skeleton'
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
    minimal: 'flex items-center space-x-2 text-foreground',
    card: 'flex items-center justify-center space-x-3 bg-muted rounded-lg border border-border p-6'
  }

  return (
    <div
      className={cn(
        baseClasses[variant], 
        sizeClasses[size], 
        'animate-fade-in motion-reduce:animate-none',
        className
      )}
    >
      {showSpinner && (
        <Skeleton className={cn('rounded-full', size === 'lg' ? 'h-6 w-6' : 'h-4 w-4')} />
      )}
      <div className="space-y-2">
        <span className="font-medium text-foreground">
          {message}
        </span>
        <Skeleton className={cn(size === 'lg' ? 'h-2 w-40' : 'h-2 w-28')} />
      </div>
    </div>
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
