import React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

export interface EmptyStateProps {
  icon?: React.ReactNode
  heading: string
  /** @deprecated Use `heading` instead */
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    variant?: 'primary' | 'outline'
  }
  className?: string
}

export function EmptyState({
  className,
  icon,
  heading,
  title,
  description,
  action,
}: EmptyStateProps) {
  const displayHeading = heading || title || ''

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 text-center',
        className
      )}
    >
      {icon && (
        <div className="text-muted-foreground [&>svg]:h-12 [&>svg]:w-12">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold">{displayHeading}</h3>
      {description && (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button
          variant={action.variant === 'outline' ? 'outline' : 'primary'}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
