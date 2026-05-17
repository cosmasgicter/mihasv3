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

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-muted text-foreground border-border/60',
  info: 'bg-info/10 text-info border-info/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
  success: 'bg-success/10 text-success border-success/25',
  danger: 'bg-destructive/10 text-destructive border-destructive/25',
  muted: 'bg-muted/60 text-muted-foreground border-border/40',
}

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
  const toneClass = TONE_CLASSES[config.tone]
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
