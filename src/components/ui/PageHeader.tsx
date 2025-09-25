import React from 'react'
import { cn } from '@/lib/utils'

type StatAccent = 'primary' | 'secondary' | 'success' | 'warning' | 'neutral'

export interface PageHeaderStat {
  label: React.ReactNode
  value: React.ReactNode
  icon?: React.ReactNode
  accent?: StatAccent
}

export interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  stats?: PageHeaderStat[]
  children?: React.ReactNode
  className?: string
  variant?: 'gradient' | 'surface' | 'subtle'
  align?: 'start' | 'center'
}

const variantStyles: Record<NonNullable<PageHeaderProps['variant']>, string> = {
  gradient: 'bg-gradient-to-r from-primary to-secondary text-white border-white/20 shadow-2xl',
  surface: 'bg-white text-gray-900 border border-gray-100 shadow-xl',
  subtle: 'bg-white/90 text-gray-900 border border-white/60 shadow-lg backdrop-blur-sm'
}

const statAccentStyles: Record<StatAccent, string> = {
  primary: 'bg-primary/10 border-primary/20 text-primary-700',
  secondary: 'bg-secondary/10 border-secondary/20 text-secondary-700',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  neutral: 'bg-gray-50 border-gray-200 text-gray-900'
}

const alignmentStyles: Record<NonNullable<PageHeaderProps['align']>, string> = {
  start: 'sm:items-start sm:text-left',
  center: 'sm:items-center sm:text-center'
}

export function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
  stats,
  children,
  className,
  variant = 'surface',
  align = 'start'
}: PageHeaderProps) {
  const isGradient = variant === 'gradient'

  const renderStat = (stat: PageHeaderStat, index: number) => {
    const { label, value, icon: statIcon, accent = 'neutral' } = stat

    const baseClasses = isGradient
      ? 'bg-white/15 border-white/30 text-white'
      : statAccentStyles[accent]

    return (
      <div
        key={index}
        className={cn(
          'flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-sm',
          baseClasses
        )}
      >
        {statIcon && <span className="shrink-0 text-lg">{statIcon}</span>}
        <div className="space-y-1">
          <p className={cn('text-xs font-semibold uppercase tracking-wide', isGradient ? 'text-white/80' : 'text-gray-500')}>
            {label}
          </p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </div>
    )
  }

  return (
    <header
      className={cn(
        'relative overflow-hidden rounded-3xl px-6 py-6 sm:px-8 sm:py-8',
        variantStyles[variant],
        className
      )}
    >
      <div className="absolute inset-0 pointer-events-none">
        {variant === 'gradient' && (
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-white/0 opacity-40" />
        )}
      </div>
      <div className={cn('relative flex flex-col gap-6 sm:flex-row sm:justify-between', alignmentStyles[align])}>
        <div className="space-y-4 sm:max-w-2xl">
          {eyebrow && (
            <p className={cn('text-xs font-semibold uppercase tracking-wide', isGradient ? 'text-white/70' : 'text-primary')}>
              {eyebrow}
            </p>
          )}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {icon && (
              <div
                className={cn(
                  'flex h-14 w-14 items-center justify-center rounded-2xl border text-2xl shadow-inner',
                  isGradient ? 'border-white/30 bg-white/15 text-white' : 'border-primary/10 bg-primary/5 text-primary'
                )}
              >
                {icon}
              </div>
            )}
            <div className="space-y-3">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{title}</h1>
              {description && (
                <p className={cn('text-base sm:text-lg', isGradient ? 'text-white/80' : 'text-gray-600')}>{description}</p>
              )}
              {children}
            </div>
          </div>
        </div>

        {(actions || (stats && stats.length > 0)) && (
          <div className="flex flex-col gap-4 sm:items-end">
            {actions && <div className="flex flex-wrap justify-end gap-3">{actions}</div>}
            {stats && stats.length > 0 && (
              <div className="flex flex-wrap justify-end gap-3">{stats.map(renderStat)}</div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

