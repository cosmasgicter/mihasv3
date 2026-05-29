import * as React from 'react'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * MetricTile — canonical metric-tile primitive.
 *
 * Replaces the five reinventions catalogued in the 2026-05-26 admin audit:
 *   1. Dashboard "Needs attention" hand-rolled Link tiles (raw palette).
 *   2. AuditTrail summary tiles (`rounded-lg border border-border/60 bg-card p-4`).
 *   3. Programs `<Card>/<CardHeader>/<CardTitle>` stat blocks.
 *   4. RealtimeMetricsDisplay.MetricCard (with raw `'blue' | 'yellow' | …` enum).
 *   5. Dashboard "Weekly Overview" centre-aligned numbers.
 *
 * Hard contract:
 *   - `tone` is semantic (`neutral` | `info` | `warning` | `destructive` |
 *     `success` | `accent`). Never raw palette names.
 *   - When `href` (or `to`) is provided the whole tile is the click target,
 *     `min-h-touch` is enforced, and the trailing CTA chevron is rendered.
 *   - Status colour is always paired with an icon — colour-only badges are
 *     impossible because the icon is a required prop when tone ≠ neutral.
 */

export type MetricTileTone =
  | 'neutral'
  | 'info'
  | 'warning'
  | 'destructive'
  | 'success'
  | 'accent'

interface ToneStyles {
  border: string
  surface: string
  hoverSurface: string
  iconBackplate: string
  icon: string
  cta: string
}

const TONE_STYLES: Record<MetricTileTone, ToneStyles> = {
  neutral: {
    border: 'border-border/60',
    surface: 'bg-card',
    hoverSurface: 'hover:bg-muted/40',
    iconBackplate: 'bg-foreground/5',
    icon: 'text-foreground',
    cta: 'text-foreground',
  },
  info: {
    border: 'border-info/30',
    surface: 'bg-info/5',
    hoverSurface: 'hover:bg-info/10',
    iconBackplate: 'bg-info/10',
    icon: 'text-info',
    cta: 'text-info',
  },
  warning: {
    border: 'border-warning/30',
    surface: 'bg-warning/5',
    hoverSurface: 'hover:bg-warning/10',
    iconBackplate: 'bg-warning/10',
    icon: 'text-warning',
    cta: 'text-warning',
  },
  destructive: {
    border: 'border-destructive/30',
    surface: 'bg-destructive/5',
    hoverSurface: 'hover:bg-destructive/10',
    iconBackplate: 'bg-destructive/10',
    icon: 'text-destructive',
    cta: 'text-destructive',
  },
  success: {
    border: 'border-success/30',
    surface: 'bg-success/5',
    hoverSurface: 'hover:bg-success/10',
    iconBackplate: 'bg-success/10',
    icon: 'text-success',
    cta: 'text-success',
  },
  accent: {
    border: 'border-primary/30',
    surface: 'bg-primary/5',
    hoverSurface: 'hover:bg-primary/10',
    iconBackplate: 'bg-primary/10',
    icon: 'text-primary',
    cta: 'text-primary',
  },
}

export interface MetricTileProps {
  /** Big number / primary metric value. */
  value: React.ReactNode
  /** Label printed below the value (e.g. "Reviews past SLA"). */
  label: React.ReactNode
  /** Optional helper text printed under the value (e.g. trailing helper info). */
  helper?: React.ReactNode
  /** Optional CTA copy — when present, renders an arrow at the bottom. */
  cta?: React.ReactNode
  /** Lucide icon. Always paired with tone — required when tone ≠ neutral. */
  icon?: LucideIcon
  /** Semantic tone. Defaults to `neutral`. */
  tone?: MetricTileTone
  /**
   * If provided the tile becomes a link via the supplied `as` element.
   * Pass a `Link` from your router or just an anchor — the tile will
   * forward all extra props to it.
   */
  as?: React.ElementType
  /** href / to / onClick are forwarded to the underlying element when `as` is supplied. */
  href?: string
  to?: string
  onClick?: React.MouseEventHandler
  /** Density toggle for compact dashboard layouts. */
  compact?: boolean
  className?: string
  ariaLabel?: string
}

export function MetricTile({
  value,
  label,
  helper,
  cta,
  icon: Icon,
  tone = 'neutral',
  as,
  href,
  to,
  onClick,
  compact = false,
  className,
  ariaLabel,
  ...rest
}: MetricTileProps & Omit<React.HTMLAttributes<HTMLElement>, 'onClick'>) {
  const styles = TONE_STYLES[tone]
  const isInteractive = Boolean(as || href || to || onClick)
  const Component: React.ElementType = as ?? (href ? 'a' : 'div')

  const interactiveProps = isInteractive
    ? {
        href,
        to,
        onClick,
        'aria-label': ariaLabel,
      }
    : {}

  return (
    <Component
      {...rest}
      {...interactiveProps}
      className={cn(
        'group block rounded-lg border p-4 transition-colors',
        styles.border,
        styles.surface,
        isInteractive && [styles.hoverSurface, 'min-h-touch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'],
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <div className={cn('shrink-0 rounded-lg p-2', styles.iconBackplate)}>
            <Icon className={cn('h-5 w-5', styles.icon)} aria-hidden="true" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'break-words font-bold tracking-tight text-foreground',
              compact ? 'text-xl' : 'text-2xl',
            )}
          >
            {value}
          </p>
          <p className="break-words text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
      {helper ? (
        <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
      ) : null}
      {cta ? (
        <p
          className={cn(
            'mt-2 inline-flex items-center gap-1 text-xs font-medium',
            styles.cta,
          )}
        >
          {cta}
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </p>
      ) : null}
    </Component>
  )
}

/**
 * NeedsAttentionGrid — even-cadence grid for MetricTile rows.
 *
 * Selects responsive cadence automatically based on the number of children.
 * Eliminates the lonely-card class of bug (e.g. 7-tile grid in
 * `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`).
 *
 * Cadence map (chosen so no breakpoint orphans the last card):
 *   1 → 1 col always
 *   2 → 1 / 2  / 2
 *   3 → 1 / 3  / 3
 *   4 → 2 / 2  / 4
 *   5 → 1 / 2  / 5  (lg-only `lg:grid-cols-5` accepted)
 *   6 → 2 / 3  / 6     (default split, even at every breakpoint)
 *   7 → 2 / 4  / 4 with the first tile spanning 2 cols at lg
 *   8 → 2 / 4  / 4
 *  9+ → 2 / 3  / 4
 */

export interface NeedsAttentionGridProps {
  children: React.ReactNode
  className?: string
}

export function NeedsAttentionGrid({ children, className }: NeedsAttentionGridProps) {
  const childArray = React.Children.toArray(children).filter(Boolean)
  const count = childArray.length

  let layoutClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  if (count <= 1) layoutClass = 'grid-cols-1'
  else if (count === 2) layoutClass = 'grid-cols-1 sm:grid-cols-2'
  else if (count === 3) layoutClass = 'grid-cols-1 sm:grid-cols-3'
  else if (count === 4) layoutClass = 'grid-cols-2 lg:grid-cols-4'
  else if (count === 5) layoutClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5'
  else if (count === 6) layoutClass = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
  else if (count === 8) layoutClass = 'grid-cols-2 sm:grid-cols-4'
  else layoutClass = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'

  return (
    <div className={cn('grid gap-4', layoutClass, className)}>{children}</div>
  )
}
