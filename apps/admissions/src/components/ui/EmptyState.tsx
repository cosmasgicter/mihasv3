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
        'flex flex-col items-center justify-center gap-4 py-16 text-center',
        className
      )}
    >
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:h-8 [&>svg]:w-8">
          {icon}
        </div>
      )}
      <div className="space-y-1.5">
        <Heading className="text-lg font-semibold text-foreground">{heading}</Heading>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
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
