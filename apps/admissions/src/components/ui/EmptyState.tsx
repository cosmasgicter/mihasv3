import React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

export interface EmptyStateProps {
  icon?: React.ReactNode
  heading: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    variant?: 'primary' | 'outline'
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  headingLevel?: 'h2' | 'h3'
  className?: string
}

export function EmptyState({
  className,
  icon,
  heading,
  description,
  action,
  secondaryAction,
  headingLevel = 'h3',
}: EmptyStateProps) {
  const Heading = headingLevel

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
      <Heading className="text-lg font-semibold">{heading}</Heading>
      {description && (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action && (
            <Button
              variant={action.variant === 'outline' ? 'outline' : 'primary'}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="outline"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
