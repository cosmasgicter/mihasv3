import clsx from 'clsx'
import type { ReactNode } from 'react'

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'insight'

const toneClassName: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
  insight: 'bg-insight/12 text-insight',
}

type StatusBadgeProps = {
  children: ReactNode
  tone?: Tone
}

export function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]',
        toneClassName[tone],
      )}
    >
      {children}
    </span>
  )
}

