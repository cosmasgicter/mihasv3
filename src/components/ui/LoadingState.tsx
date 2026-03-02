import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Skeleton as BaseSkeleton,
  SkeletonTable as BaseSkeletonTable,
  SkeletonCard as BaseSkeletonCard,
} from './skeleton'

interface LoadingStateProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
  fullScreen?: boolean
}

export function LoadingState({ message = 'Loading...', size = 'md', fullScreen = false }: LoadingStateProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  }

  const content = (
    <div className="flex flex-col items-center justify-center gap-3">
      <Loader2 className={cn('animate-spin text-primary', sizeClasses[size])} aria-hidden="true" />
      <p className="text-sm text-foreground-secondary" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
        {content}
      </div>
    )
  }

  return <div className="py-8">{content}</div>
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <BaseSkeleton className={className} {...props} />
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return <BaseSkeletonTable rows={rows} columns={columns} />
}

export function CardSkeleton() {
  return <BaseSkeletonCard />
}
