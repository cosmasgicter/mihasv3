import * as React from 'react'
import { cn } from '@/lib/utils'

interface PageShellProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '7xl' | 'full'
  className?: string
}

const maxWidthClasses: Record<NonNullable<PageShellProps['maxWidth']>, string> = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
}

export function PageShell({
  title,
  subtitle,
  actions,
  children,
  maxWidth = '4xl',
  className,
}: PageShellProps) {
  const containerClass = maxWidthClasses[maxWidth]

  return (
    <div className={cn('min-h-screen pb-20 md:pb-0', className)}>
      <div className={cn('mx-auto px-4 md:px-6 lg:px-8', containerClass)}>
        <header className="py-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {actions && (
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                {actions}
              </div>
            )}
          </div>
        </header>
        <div id="main-content" role="region" aria-label={title}>{children}</div>
      </div>
    </div>
  )
}

export type { PageShellProps }
