import type { ReactNode } from 'react'

type SectionCardProps = {
  title: string
  description?: string
  children: ReactNode
}

export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <section className="rounded-[28px] border border-line/70 bg-panel/85 p-5 shadow-sm">
      <header className="mb-4">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-muted">{description}</p> : null}
      </header>
      {children}
    </section>
  )
}

