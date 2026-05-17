import React from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from '@/components/ui/Button'

export interface EmptyStateProps {
  icon?: React.ReactNode
  heading: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    variant?: ButtonProps['variant']
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
  headingLevel = 'h3',
}: EmptyStateProps) {
  const Heading = headingLevel
  const displayIcon = icon ?? <Inbox />

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-5 px-6 py-20 text-center',
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:h-6 [&>svg]:w-6">
        {displayIcon}
      </div>
      <div className="space-y-1.5">
        <Heading className="text-base font-semibold text-foreground">{heading}</Heading>
        {description && (
          <p className="mx-auto max-w-xs text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <Button variant={action.variant ?? 'primary'} onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      )}
    </div>
  )
}
