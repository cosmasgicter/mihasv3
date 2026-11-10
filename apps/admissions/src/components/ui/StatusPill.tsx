import { type ReactNode } from 'react'
import {
  FileEdit,
  Send,
  Search,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Ban,
  TimerOff,
  GraduationCap,
  CalendarOff,
} from 'lucide-react'
import { formatApplicationStatus, type ApplicationStatus } from '@/types/applicationStatus'

type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'muted'

interface StatusConfig {
  tone: StatusTone
  icon: ReactNode
}

/**
 * The tone is the fill and the border; the label is `text-foreground`
 * (admissions-v2 task 11.5, R16.2).
 *
 * `text-warning` on `bg-warning/10` measures **4.37 : 1**, `text-destructive` on
 * `bg-destructive/10` **4.20 : 1**, `text-info` on `bg-info/10` **4.48 : 1** —
 * all under AA, on the pill that states an application's status on the student
 * dashboard and every admin roster. `text-foreground` on the same washes is
 * ≈ 16 : 1. The colour signal is unchanged (fill + border + the icon this
 * component always renders), and `StatusBadge` was corrected the same way for
 * the same reason.
 */

const STATUS_MAP: Record<ApplicationStatus, StatusConfig> = {
  draft: { tone: 'neutral', icon: <FileEdit className="h-3 w-3" /> },
  submitted: { tone: 'info', icon: <Send className="h-3 w-3" /> },
  under_review: { tone: 'warning', icon: <Search className="h-3 w-3" /> },
  waitlisted: { tone: 'warning', icon: <Clock className="h-3 w-3" /> },
  conditionally_approved: { tone: 'success', icon: <ShieldCheck className="h-3 w-3" /> },
  approved: { tone: 'success', icon: <CheckCircle2 className="h-3 w-3" /> },
  enrolled: { tone: 'success', icon: <GraduationCap className="h-3 w-3" /> },
  rejected: { tone: 'danger', icon: <XCircle className="h-3 w-3" /> },
  withdrawn: { tone: 'muted', icon: <Ban className="h-3 w-3" /> },
  expired: { tone: 'danger', icon: <TimerOff className="h-3 w-3" /> },
  enrollment_expired: { tone: 'danger', icon: <CalendarOff className="h-3 w-3" /> },
}

interface StatusPillProps {
  status: ApplicationStatus | string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Unified status pill used across all admin and student surfaces.
 * Always pairs color with an icon — never color alone.
 */
export function StatusPill({ status, size = 'sm', className = '' }: StatusPillProps) {
  const config = STATUS_MAP[status as ApplicationStatus] ?? { tone: 'neutral' as StatusTone, icon: <FileEdit className="h-3 w-3" /> }
  const toneClass = toneSurfaceClasses(config.tone)
  const sizeClass = size === 'sm' ? 'rounded-full px-2.5 py-0.5 text-xs' : 'rounded-full px-3 py-1 text-sm'

  return (
    <span
      className={`inline-flex items-center gap-1 border font-medium whitespace-nowrap ${toneClass} ${sizeClass} ${className}`}
    >
      {config.icon}
      {formatApplicationStatus(status)}
    </span>
  )
}
