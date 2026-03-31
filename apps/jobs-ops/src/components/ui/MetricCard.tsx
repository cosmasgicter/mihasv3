import type { ReactNode } from 'react'

type MetricCardProps = {
  label: string
  value: string
  hint: string
  icon?: ReactNode
}

export function MetricCard({ label, value, hint, icon }: MetricCardProps) {
  return (
    <article className="rounded-[28px] border border-line/70 bg-white/88 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
          <p className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">{value}</p>
        </div>
        {icon ? <div className="rounded-2xl bg-canvas p-3 text-primary">{icon}</div> : null}
      </div>
      <p className="mt-4 text-sm leading-6 text-muted">{hint}</p>
    </article>
  )
}

