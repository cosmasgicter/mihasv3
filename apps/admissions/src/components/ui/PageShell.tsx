import * as React from 'react'
import { cn } from '@/lib/utils'
import { validateHeadingHierarchy, extractHeadingLevels } from '@/lib/accessibility-utils'

interface PageShellProps {
  title: string
  subtitle?: string
  eyebrow?: string
  actions?: React.ReactNode
  metrics?: Array<{
    label: string
    value: React.ReactNode
    helper?: string
  }>
  children: React.ReactNode
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '7xl' | 'full'
  tone?: 'default' | 'admin' | 'student' | 'application' | 'public'
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
  eyebrow,
  actions,
  metrics,
  children,
  maxWidth = '4xl',
  tone = 'default',
  className,
}: PageShellProps) {
  const containerClass = maxWidthClasses[maxWidth]
  const shellRef = React.useRef<HTMLDivElement>(null)
  const accentClass = {
    default: 'border-primary/25',
    admin: 'border-primary/25',
    student: 'border-cyan-600/25',
    application: 'border-primary/25',
    public: 'border-teal-600/25',
  }[tone]

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
    <div
      ref={shellRef}
      className={cn('relative min-h-screen scroll-smooth bg-slate-50 pb-20 md:pb-0', className)}
    >
      <div className={cn('mx-auto px-4 sm:px-6 lg:px-8', containerClass)}>
        <header className="py-3 sm:py-6">
          <div className={cn('overflow-hidden rounded-lg border bg-white shadow-sm', accentClass)}>
            <div className="border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  {eyebrow && (
                    <p className="mb-2 text-xs font-semibold uppercase text-primary">
                      {eyebrow}
                    </p>
                  )}
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      {subtitle}
                    </p>
                  )}
                </div>
                {actions && (
                  <div className="flex flex-col gap-2 md:min-w-[12rem] md:items-end md:justify-start md:self-start">
                    {actions}
                  </div>
                )}
              </div>
            </div>
            {metrics && metrics.length > 0 && (
              <div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="bg-slate-50 px-4 py-3 sm:px-5"
                  >
                    <p className="text-xs font-medium uppercase text-slate-500">
                      {metric.label}
                    </p>
                    <div className="mt-1 text-lg font-semibold text-slate-950">
                      {metric.value}
                    </div>
                    {metric.helper && (
                      <p className="mt-1 text-xs leading-5 text-slate-500">{metric.helper}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>
        <div id="main-content" role="region" aria-label={title}>
          {children}
        </div>
      </div>
    </div>
  )
}

export type { PageShellProps }
