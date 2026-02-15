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
 gradient: 'bg-gradient-to-r from-blue-600 to-purple-600 text-gray-900 border-card/20 shadow-2xl',
 surface: 'bg-card text-gray-900 border border-border shadow-xl',
 subtle: 'bg-card/90 text-gray-900 border border-card/60 shadow-lg backdrop-blur-sm'
}

const statAccentStyles: Record<StatAccent, string> = {
 primary: 'bg-primary/5 border-primary/30 text-primary',
 secondary: 'bg-secondary/5 border-input/30 text-purple-700',
 success: 'bg-success/10 border-success/30 text-success',
 warning: 'bg-warning/10 border-warning/30 text-accent',
 neutral: 'bg-muted border-border text-foreground'
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
 ? 'bg-card/95 border-card/40 text-gray-900 backdrop-blur-md'
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
 <p className={cn('text-xs font-semibold uppercase tracking-wide', isGradient ? 'text-foreground/70' : 'text-foreground')}>
 {label}
 </p>
 <p className={cn('text-lg sm:text-xl md:text-2xl font-bold break-words', isGradient ? 'text-foreground' : '')}>{value}</p>
 </div>
 </div>
 )
 }

	 return (
		 <div className="animate-fade-in">
			 <header
				 className={cn(
					 'relative overflow-hidden rounded-3xl section-padding',
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
							 <p className={cn('font-semibold uppercase tracking-wide', isGradient ? 'text-foreground/70' : 'text-primary')} style={{ fontSize: 'var(--type-xs)' }}>
								 {eyebrow}
							 </p>
						 )}
						 <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
							 {icon && (
								 <div
									 className={cn(
										 'flex items-center justify-center rounded-2xl border shadow-inner',
										 isGradient ? 'border-card/40 bg-card/95 text-gray-900 backdrop-blur-md' : 'border-primary/10 bg-primary/5 text-primary'
									 )}
									 style={{ width: '3.5rem', height: '3.5rem', fontSize: 'var(--type-2xl)' }}
								 >
									 {icon}
								 </div>
							 )}
							 <div className="space-y-3">
								 <h1 style={{ fontSize: 'clamp(1.25rem, 1.8vw + 0.9rem, 2.5rem)', fontWeight: 700 }} className="tracking-tight break-words">{title}</h1>
								 {description && (
									 <p className={cn('', isGradient ? 'text-foreground/80' : 'text-foreground')} style={{ fontSize: 'var(--type-base)' }}>{description}</p>
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
		 </div>
	 )
}
