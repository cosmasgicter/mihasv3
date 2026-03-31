import { useQuery } from '@tanstack/react-query'

import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatRelativeTime, labelize } from '@/lib/format'
import { listAutomationRules, listAutomationRuns } from '@/services/api/automation'

function ruleTone(isEnabled: boolean) {
  return isEnabled ? ('success' as const) : ('warning' as const)
}

function runTone(status: string) {
  if (status === 'completed') return 'success' as const
  if (status === 'running') return 'insight' as const
  if (status === 'blocked') return 'danger' as const
  return 'warning' as const
}

function progressForRun(status: string) {
  if (status === 'completed') return 100
  if (status === 'running') return 66
  if (status === 'blocked') return 52
  return 18
}

export function AutomationRunsPage() {
  const rulesQuery = useQuery({
    queryKey: ['automation-rules'],
    queryFn: listAutomationRules,
  })
  const runsQuery = useQuery({
    queryKey: ['automation-runs'],
    queryFn: listAutomationRuns,
  })

  const rules = rulesQuery.data?.results ?? []
  const runs = runsQuery.data?.results ?? []

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Automation"
        title="Run inspection and policy controls"
        description="The automation surface now shows the actual seeded orchestration state: rules, blockers, trigger sources, and run progress rather than abstract placeholders."
        actions={
          <>
            <StatusBadge tone="success">{rules.filter((rule) => rule.isEnabled).length} rules enabled</StatusBadge>
            <StatusBadge tone="danger">{runs.filter((run) => run.status === 'blocked').length} blocked</StatusBadge>
          </>
        }
      />

      <div className="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1.3fr)_320px]">
        <div className="grid gap-5">
          <SectionCard title="Policy rules" description="Approval thresholds, cooldowns, and caps stay visible beside the execution layer they control.">
            <div className="grid gap-4 md:grid-cols-2">
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-[28px] border border-line/70 bg-white/90 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-display text-xl font-semibold tracking-tight text-ink">{rule.name}</p>
                    <StatusBadge tone={ruleTone(rule.isEnabled)}>
                      {rule.isEnabled ? 'enabled' : 'paused'}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-muted">{labelize(rule.ruleType)}</p>
                  <div className="mt-4 rounded-[20px] border border-line/70 bg-canvas/60 p-3 font-mono text-xs text-ink">
                    {JSON.stringify(rule.config, null, 2)}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Run timeline" description="Runs are legible as operational artifacts with trigger source, blocker reason, and freshness.">
            <div className="grid gap-4">
              {runs.map((run) => (
                <div key={run.id} className="rounded-[28px] border border-line/70 bg-white/90 p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-semibold tracking-tight text-ink">
                        {labelize(run.runType)}
                      </p>
                      <p className="mt-2 text-sm text-muted">{run.summary}</p>
                    </div>
                    <StatusBadge tone={runTone(run.status)}>{labelize(run.status)}</StatusBadge>
                  </div>

                  <div className="mt-4">
                    <ProgressBar tone={runTone(run.status) === 'success' ? 'success' : runTone(run.status)} value={progressForRun(run.status)} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge tone="neutral">{run.triggerSource}</StatusBadge>
                    <StatusBadge tone="insight">Updated {formatRelativeTime(run.updatedAt)}</StatusBadge>
                  </div>

                  {run.blockedReason ? (
                    <div className="mt-4 rounded-[20px] border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                      {run.blockedReason}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-5">
          <SectionCard title="Control notes">
            <div className="grid gap-3 text-sm leading-6 text-muted">
              <div className="rounded-[24px] border border-line/70 bg-white/85 p-4">
                Every risky automation remains approval-gated.
              </div>
              <div className="rounded-[24px] border border-line/70 bg-white/85 p-4">
                Each run preserves trigger source and blocker reason for auditability.
              </div>
              <div className="rounded-[24px] border border-line/70 bg-white/85 p-4">
                The backend already exposes approve and cancel endpoints for run control.
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
