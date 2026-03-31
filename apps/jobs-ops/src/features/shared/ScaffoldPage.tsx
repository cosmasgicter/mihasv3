import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'

type ScaffoldPageProps = {
  title: string
  description: string
  eyebrow?: string
  routes: string[]
  entities: string[]
  nextSteps: string[]
}

export function ScaffoldPage({
  title,
  description,
  eyebrow,
  routes,
  entities,
  nextSteps,
}: ScaffoldPageProps) {
  return (
    <div className="min-h-full">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <div className="grid gap-5 px-6 py-6 xl:grid-cols-3">
        <SectionCard title="Planned routes" description="These routes already have frontend and backend placeholders.">
          <ul className="grid gap-2 text-sm text-muted">
            {routes.map((route) => (
              <li key={route} className="rounded-2xl border border-line/70 bg-canvas/80 px-3 py-3 font-mono text-xs text-ink">
                {route}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Core entities" description="Use these names consistently across the repo to avoid drift.">
          <ul className="grid gap-2 text-sm text-muted">
            {entities.map((entity) => (
              <li key={entity} className="rounded-2xl border border-line/70 bg-white/80 px-3 py-3">
                {entity}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Next implementation steps" description="These are the first worthwhile follow-ups after scaffold wiring.">
          <ol className="grid gap-2 text-sm text-muted">
            {nextSteps.map((step, index) => (
              <li key={step} className="rounded-2xl border border-line/70 bg-white/80 px-3 py-3">
                <span className="mr-2 font-mono text-xs text-primary">{String(index + 1).padStart(2, '0')}</span>
                {step}
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>
    </div>
  )
}

