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
import { toneSurfaceClasses, type StatusTone } from '@/lib/statusTone'

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

/**
 * The tone lives in the **fill and the border**; the label is `text-foreground`.
 *
 * That is a contrast measurement, not a preference (admissions-v2 task 11.5,
 * R16.2, and `DESIGN.md` §1's "WCAG AA on every text + background pair"). A
 * tone-coloured label on its own 10 % wash of the same tone does not clear
 * 4.5 : 1 — `text-warning` #b45309 on `bg-warning/10` is **4.37 : 1**,
 * `text-destructive` #dc2626 on `bg-destructive/10` is **4.20 : 1**, and
 * `text-info` #2563eb on `bg-info/10` is **4.48 : 1**. Only `success` passed, at
 * 4.83 : 1. axe reported the same class of failure on the history timeline's
 * pills (`[serious] color-contrast @ .bg-info/15`) the first time that map was
 * tokenized, which is what sent this primitive to be measured too.
 *
 * `text-foreground` #0f172a on any of these washes is ≈ 16 : 1. Nothing is lost:
 * a fill is a large flat area, not text, so it is not held to 4.5 : 1, and the
 * tone is still carried by the fill, the border, and the icon this component
 * requires — "never colour alone" was never about the *label's* colour.
 */
/** `StatusBadge` says `destructive`; the shared map says `danger`. */
const TONE_FOR_BADGE: Record<StatusBadgeTone, StatusTone> = {
  neutral: 'neutral',
  info: 'info',
  warning: 'warning',
  destructive: 'danger',
  success: 'success',
  muted: 'muted',
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
        toneSurfaceClasses(TONE_FOR_BADGE[tone]),
        sizeClass,
        className,
      )}
    >
      <Icon className={cn(iconClass, 'shrink-0')} aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  )
}
