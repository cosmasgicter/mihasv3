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
  const heroToneClass = {
    default: 'from-sky-600/12 via-white to-cyan-500/10',
    admin: 'from-blue-700/12 via-white to-emerald-500/10',
    student: 'from-cyan-600/12 via-white to-blue-500/10',
    application: 'from-indigo-700/12 via-white to-sky-500/10',
    public: 'from-teal-600/12 via-white to-blue-500/10',
  }[tone]
  const orbToneClass = {
    default: 'bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.16),transparent_70%)]',
    admin: 'bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.18),transparent_70%)]',
    student: 'bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.18),transparent_70%)]',
    application: 'bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.18),transparent_70%)]',
    public: 'bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.18),transparent_70%)]',
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
      className={cn('relative min-h-screen scroll-smooth overflow-hidden pb-20 md:pb-0', className)}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[26rem] overflow-hidden">
        <div className={cn('absolute inset-0 bg-gradient-to-br', heroToneClass)} />
        <div className={cn('absolute left-[-8rem] top-[-4rem] h-56 w-56 rounded-full blur-3xl', orbToneClass)} />
        <div className="absolute right-[-5rem] top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.08),transparent_72%)] blur-3xl" />
      </div>
      <div className={cn('mx-auto px-4 sm:px-6 lg:px-8', containerClass)}>
        <header className="py-3 sm:py-8">
          <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/82 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur-xl">
            <div className="border-b border-slate-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(255,255,255,0.72))] px-4 py-3 sm:px-7 sm:py-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  {eyebrow && (
                    <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-primary/80">
                      {eyebrow}
                    </p>
                  )}
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
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
              <div className="grid gap-2 bg-slate-50/85 px-4 py-2.5 sm:gap-3 sm:grid-cols-2 sm:px-7 sm:py-4 lg:grid-cols-4">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 sm:px-4 sm:py-3 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.55)]"
                  >
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {metric.label}
                    </p>
                    <div className="mt-1 text-lg font-semibold text-slate-950 sm:text-xl">
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
