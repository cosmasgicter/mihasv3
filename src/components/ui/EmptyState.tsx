import React from 'react'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({
  className,
  icon: Icon,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/80 px-4 py-12 text-center shadow-sm',
        className
      )}
      {...props}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-primary/5 p-4 text-primary">
          <Icon className="h-8 w-8" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="mb-4 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  )
}
