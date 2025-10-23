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
        'flex flex-col items-center justify-center text-center py-12 px-4',
        className
      )}
      {...props}
    >
      {Icon && (
        <div className="rounded-full bg-secondary/5 p-4 mb-4">
          <Icon className="h-8 w-8 text-foreground/40" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-body mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-body-secondary/60 max-w-md mb-4">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  )
}
