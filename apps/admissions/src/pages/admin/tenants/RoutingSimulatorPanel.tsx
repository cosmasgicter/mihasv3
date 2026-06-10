import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Building2,
  CircleSlash,
  FileText,
  Route,
  ShieldCheck,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard, StatusBadge } from '@/components/ui'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { toast } from '@/hooks/useToast'
import { catalogService } from '@/services/catalog'
import {
  tenantAdminService,
  type RoutingSimulationResult,
} from '@/services/admin/tenants'
import { tenantErrorMessage } from './errors'
import { TENANT_SELECT_CLASS } from './primitives'

interface SimulatorForm {
  program_id: string
  intake_id: string
  country: string
  nationality: string
  restrictToInstitution: boolean
}

/**
 * "Test routing" simulator (R11.3).
 *
 * Dry-runs the dedicated super-admin endpoint
 * `POST /api/v1/admin/routing/simulate/`, which *reuses* the real
 * `OfferingAssignmentService` rather than reimplementing routing — so the
 * result shown here matches exactly what a real submission would route for the
 * same inputs. Read-only: no application row is created.
 *
 * `institution_id` is optionally pinned to the selected school so an operator
 * can confirm a white-label host routes to this school (not a sibling). When
 * unrestricted, the simulator answers "where would this applicant land across
 * all schools?" — the same question the platform answers at submit time.
 */
export function RoutingSimulatorPanel({
  institutionId,
  institutionName,
}: {
  institutionId: string
  institutionName: string
}) {
  const [form, setForm] = useState<SimulatorForm>({
    program_id: '',
    intake_id: '',
    country: '',
    nationality: '',
    restrictToInstitution: false,
  })
  const [result, setResult] = useState<RoutingSimulationResult | null>(null)

  const programsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'canonical-programs'],
    queryFn: () => catalogService.getCanonicalPrograms(),
  })

  const intakesQuery = useQuery({
    queryKey: ['admin', 'tenants', 'intakes'],
    queryFn: () => catalogService.getIntakes(),
  })

  const programs = useMemo(
    () => [...(programsQuery.data?.programs || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [programsQuery.data?.programs]
  )
  const intakes = useMemo(
    () => [...(intakesQuery.data?.intakes || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [intakesQuery.data?.intakes]
  )

  const simulateMutation = useMutation({
    mutationFn: () =>
      tenantAdminService.simulateRouting({
        program_id: form.program_id,
        intake_id: form.intake_id,
        country: form.country,
        nationality: form.nationality,
        institution_id: form.restrictToInstitution ? institutionId : null,
      }),
    onSuccess: (data) => setResult(data),
    onError: (error) => {
      setResult(null)
      toast.error(tenantErrorMessage(error, 'Routing simulation could not run'))
    },
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!form.program_id || !form.intake_id) {
      toast.error('Choose a program and an intake to simulate')
      return
    }
    setResult(null)
    simulateMutation.mutate()
  }

  const loadError = programsQuery.isError || intakesQuery.isError

  return (
    <SectionCard
      title="Test routing"
      description="Dry-run the real assignment service for a program + intake. The result matches exactly what a real submission would route — no application is created."
      icon={<Route className="h-5 w-5" />}
    >
      {loadError ? (
        <ErrorDisplay
          message="Could not load programs or intakes for the simulator."
          onRetry={() => {
            if (programsQuery.isError) programsQuery.refetch()
            if (intakesQuery.isError) intakesQuery.refetch()
          }}
        />
      ) : (
        <div className="space-y-5">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Canonical program</span>
              <select
                value={form.program_id}
                onChange={event => setForm(prev => ({ ...prev, program_id: event.target.value }))}
                className={TENANT_SELECT_CLASS}
                aria-label="Canonical program"
                disabled={programsQuery.isLoading}
              >
                <option value="">Select a program…</option>
                {programs.map(program => (
                  <option key={program.id} value={program.id}>{program.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Intake</span>
              <select
                value={form.intake_id}
                onChange={event => setForm(prev => ({ ...prev, intake_id: event.target.value }))}
                className={TENANT_SELECT_CLASS}
                aria-label="Intake"
                disabled={intakesQuery.isLoading}
              >
                <option value="">Select an intake…</option>
                {intakes.map(intake => (
                  <option key={intake.id} value={intake.id}>{intake.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Country <span className="text-muted-foreground">(optional)</span></span>
              <Input
                value={form.country}
                onChange={event => setForm(prev => ({ ...prev, country: event.target.value }))}
                placeholder="e.g. Zambia"
                aria-label="Applicant country"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Nationality <span className="text-muted-foreground">(optional)</span></span>
              <Input
                value={form.nationality}
                onChange={event => setForm(prev => ({ ...prev, nationality: event.target.value }))}
                placeholder="e.g. Zambian"
                aria-label="Applicant nationality"
              />
            </label>

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.restrictToInstitution}
                onChange={event => setForm(prev => ({ ...prev, restrictToInstitution: event.target.checked }))}
                className="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="text-foreground">Restrict to {institutionName} (white-label host filter)</span>
            </label>

            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" loading={simulateMutation.isPending}>
                <Route className="h-4 w-4" aria-hidden="true" /> Run simulation
              </Button>
            </div>
          </form>

          {result && <RoutingSimulationOutcome result={result} />}
        </div>
      )}
    </SectionCard>
  )
}

function RoutingSimulationOutcome({ result }: { result: RoutingSimulationResult }) {
  if (!result.assigned) {
    return (
      <div
        role="status"
        className="space-y-2 rounded-lg border border-warning/25 bg-warning/10 p-4"
      >
        <div className="flex items-center gap-2 text-warning">
          <CircleSlash className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="text-sm font-semibold">No eligible offering</p>
          <StatusBadge tone="warning" label={result.error?.code || 'NO_ELIGIBLE_OFFERING'} />
        </div>
        <p className="text-sm text-foreground">
          {result.error?.message || 'No active school offering is available for this program and intake.'}
        </p>
        <p className="text-xs text-muted-foreground">
          A real applicant with these inputs would see a recoverable next step (choose another intake or contact admissions), never a dead-end.
        </p>
      </div>
    )
  }

  const requiredDocuments = result.required_documents || []

  return (
    <div role="status" className="space-y-4 rounded-lg border border-success/25 bg-success/10 p-4">
      <div className="flex items-center gap-2 text-success">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-sm font-semibold">Routed to an offering</p>
        <StatusBadge tone="success" label="Assigned" />
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Assigned school</dt>
            <dd className="break-words text-sm font-medium text-foreground">
              {result.institution?.full_name || result.institution?.name || '—'}
              {result.institution?.code ? <span className="text-muted-foreground"> · {result.institution.code}</span> : null}
            </dd>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Offering</dt>
            <dd className="break-words text-sm font-medium text-foreground">
              {result.offering_name || '—'}
              {result.offering_code ? <span className="font-mono text-muted-foreground"> · {result.offering_code}</span> : null}
            </dd>
          </div>
        </div>

        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Program</dt>
          <dd className="break-words text-sm text-foreground">{result.program_name || '—'}</dd>
        </div>

        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Intake</dt>
          <dd className="break-words text-sm text-foreground">{result.intake_name || '—'}</dd>
        </div>
      </dl>

      {result.decision && (
        <div className="flex flex-wrap gap-2 border-t border-success/20 pt-3">
          <span className="text-xs text-muted-foreground">Decision factors (lower priority wins):</span>
          <StatusBadge tone="muted" label={`Offering priority ${result.decision.offering_priority ?? '—'}`} />
          <StatusBadge tone="muted" label={`Intake priority ${result.decision.program_intake_priority ?? '—'}`} />
          <StatusBadge tone="muted" label={`Status ${result.decision.offering_status ?? '—'}`} />
        </div>
      )}

      <div className="border-t border-success/20 pt-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Required documents</p>
        {requiredDocuments.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No additional documents required for this offering.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Required documents">
            {requiredDocuments.map(doc => (
              <li key={`${doc.document_type}-${doc.label}`}>
                <StatusBadge
                  tone={doc.required ? 'success' : 'muted'}
                  label={`${doc.label}${doc.required ? '' : ' · optional'}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
