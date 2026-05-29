import * as React from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * StatusBadge — generic status pill that contractually pairs colour with an icon.
 *
 * Use this for any non-application status surface (Settings "Missing/Configured",
 * Intakes capacity, Audit category badges, etc.). For application-status pills
 * use `StatusPill` instead — that one knows the canonical application-status
 * vocabulary.
 *
 * Steering rule (`design-skills.md`):
 *   "Status colours always paired with an icon or label. Never colour alone."
 *
 * The colour `tone` and the `icon` are not optional together — even the
 * neutral tone resolves to a default icon. This is enforced at the type level.
 */

export type StatusBadgeTone =
  | 'neutral'
  | 'info'
  | 'warning'
  | 'destructive'
  | 'success'
  | 'muted'

export interface StatusBadgeProps {
  /** Visible label. Required — colour without a label is also banned. */
  label: React.ReactNode
  /** Semantic tone — drives both colour and the default icon. */
  tone: StatusBadgeTone
  /** Override the default icon for the chosen tone. */
  icon?: LucideIcon
  size?: 'sm' | 'md'
  className?: string
}

const TONE_CLASSES: Record<StatusBadgeTone, string> = {
  neutral: 'bg-muted text-foreground border-border/60',
  info: 'bg-info/10 text-info border-info/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
  destructive: 'bg-destructive/10 text-destructive border-destructive/25',
  success: 'bg-success/10 text-success border-success/25',
  muted: 'bg-muted/60 text-muted-foreground border-border/40',
}

const TONE_DEFAULT_ICONS: Record<StatusBadgeTone, LucideIcon> = {
  neutral: CircleDashed,
  info: Info,
  warning: AlertTriangle,
  destructive: AlertOctagon,
  success: CheckCircle2,
  muted: CircleDashed,
}

export function StatusBadge({
  label,
  tone,
  icon,
  size = 'sm',
  className,
}: StatusBadgeProps) {
  const Icon = icon ?? TONE_DEFAULT_ICONS[tone]
  const sizeClass =
    size === 'sm'
      ? 'rounded-full px-2.5 py-0.5 text-xs'
      : 'rounded-full px-3 py-1 text-sm'
  const iconClass = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border font-semibold whitespace-nowrap',
        TONE_CLASSES[tone],
        sizeClass,
        className,
      )}
    >
      <Icon className={cn(iconClass, 'shrink-0')} aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  )
}
