import clsx from 'clsx'

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'insight'

const toneClassName: Record<Tone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  insight: 'bg-insight',
}

type ProgressBarProps = {
  value: number
  max?: number
  tone?: Tone
  size?: 'sm' | 'md'
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'primary',
  size = 'md',
}: ProgressBarProps) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100))

  return (
    <div
      aria-hidden="true"
      className={clsx(
        'overflow-hidden rounded-full bg-canvas/90',
        size === 'sm' ? 'h-2' : 'h-3',
      )}
    >
      <div
        className={clsx('h-full rounded-full transition-[width] duration-500', toneClassName[tone])}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}
