import React from 'react'
import { cn } from '@/lib/utils'

type HeaderVariant = 'default' | 'tinted' | 'plain'
type PaddingScale = 'sm' | 'md' | 'lg'

const headerVariantStyles: Record<HeaderVariant, string> = {
  default: 'bg-white dark:bg-gray-800 dark:bg-gray-200',
  tinted: 'bg-gradient-to-r from-gray-50 to-blue-50',
  plain: 'bg-transparent'
}

const paddingScale: Record<PaddingScale, string> = {
  sm: 'px-4 py-4 sm:px-5 sm:py-5',
  md: 'px-6 py-6',
  lg: 'px-8 py-8'
}

export interface SectionCardProps {
  title?: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
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
  stickyHeader = false
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || icon || actions)

  return (
    <section
      className={cn('rounded-2xl border border-gray-200 dark:border-gray-700/70 bg-white dark:bg-gray-800 dark:bg-gray-200 shadow-lg backdrop-blur-sm', className)}
    >
      {hasHeader && (
        <div
          className={cn(
            'flex flex-col gap-3 border-b border-gray-200 dark:border-gray-700/70 px-6 py-5 sm:flex-row sm:items-center sm:justify-between',
            headerVariantStyles[headerVariant],
            stickyHeader && 'sticky top-[4.25rem] z-10 backdrop-blur-md',
            headerClassName
          )}
        >
          <div className="flex flex-1 items-start gap-3">
            {icon && (
              <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/300/10 text-blue-600 dark:text-blue-400">
                {icon}
              </div>
            )}
            <div className="space-y-1">
              {title && <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>}
              {description && <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>}
            </div>
          </div>
          {actions && <div className="mt-2 flex shrink-0 flex-wrap gap-2 sm:mt-0 sm:justify-end">{actions}</div>}
        </div>
      )}

      <div className={cn('space-y-4', paddingScale[padding], contentClassName)}>{children}</div>

      {footer && (
        <div className={cn('border-t border-gray-200 dark:border-gray-700/70', paddingScale[padding])}>{footer}</div>
      )}
    </section>
  )
}

