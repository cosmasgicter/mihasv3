import React from 'react'
import { cn } from '@/lib/utils'

type HeaderVariant = 'default' | 'tinted' | 'plain'
type PaddingScale = 'sm' | 'md' | 'lg'

const headerVariantStyles: Record<HeaderVariant, string> = {
  default: 'bg-card',
  tinted: 'bg-gradient-to-r from-muted to-muted/50',
  plain: 'bg-transparent'
}

const paddingScale: Record<PaddingScale, string> = {
  sm: 'px-4 py-4 sm:px-5 sm:py-5',
  md: 'px-6 py-6',
  lg: 'px-8 py-8'
}

export interface SectionCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  contentClassName?: string
  headerClassName?: string
  padding?: PaddingScale
  headerVariant?: HeaderVariant
  stickyHeader?: boolean
}

export function SectionCard({
  title,
  description,
  icon,
  actions,
  children,
  footer,
  className,
  contentClassName,
  headerClassName,
  padding = 'md',
  headerVariant = 'default',
  stickyHeader = false,
  ...props
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || icon || actions)

  return (
    <section
      className={cn('rounded-2xl border border-border/70 bg-card shadow-lg backdrop-blur-sm', className)}
      {...props}
    >
      {hasHeader && (
        <div
          className={cn(
            'flex flex-col gap-3 border-b border-border/70 px-6 py-5 sm:flex-row sm:items-center sm:justify-between',
            headerVariantStyles[headerVariant],
            stickyHeader && 'sticky top-[4.25rem] z-10 backdrop-blur-md',
            headerClassName
          )}
        >
          <div className="flex flex-1 items-start gap-3">
            {icon && (
              <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-info-strong">
                {icon}
              </div>
            )}
            <div className="space-y-1">
              {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
              {description && <p className="text-sm text-foreground">{description}</p>}
            </div>
          </div>
          {actions && <div className="mt-2 flex shrink-0 flex-wrap gap-2 sm:mt-0 sm:justify-end">{actions}</div>}
        </div>
      )}

      <div className={cn('space-y-4', paddingScale[padding], contentClassName)}>{children}</div>

      {footer && (
        <div className={cn('border-t border-border/70', paddingScale[padding])}>{footer}</div>
      )}
    </section>
  )
}
