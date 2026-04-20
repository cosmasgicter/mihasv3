import * as React from 'react'
import { cn } from '@/lib/utils'
import { validateHeadingHierarchy, extractHeadingLevels } from '@/lib/accessibility-utils'

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
  const shellRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    if (!shellRef.current) return

    const headings = extractHeadingLevels(shellRef.current)
    if (headings.length > 0 && !validateHeadingHierarchy(headings)) {
      console.warn(
        `[PageShell] Heading hierarchy violation detected on "${title}". ` +
        `Found levels: [${headings.join(', ')}]. ` +
        `Headings must start with h1, have exactly one h1, and not skip levels.`
      )
    }
  })

  return (
    <div ref={shellRef} className={cn('min-h-screen scroll-smooth pb-20 md:pb-0', className)}>
      <div className={cn('mx-auto px-4 sm:px-6 lg:px-8', containerClass)}>
        <header className="py-6 sm:py-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
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
