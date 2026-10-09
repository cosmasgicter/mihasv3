/**
 * Onboarding canonical-catalog steps (admissions-v2-canonical-rebuild, task 4.3).
 *
 * These three step bodies replace the wizard's former **instructional
 * placeholders** for Program assignment and Intake availability (finding
 * TEN-02) with **real canonical mutations**, and add the previously-missing
 * **fee** step:
 *
 *   - {@link WizardProgramsStep}  → assign a Canonical_Program to the tenant,
 *       creating an Institution_Program_Offering via
 *       `tenantAdminService.createOffering` (`POST /catalog/programs/`). The
 *       write authority is the canonical program id — never a display string
 *       (TEN-03) — chosen from an accessible, tenant-agnostic **search
 *       selector**, not a raw UUID field (TEN-05).
 *   - {@link WizardIntakesStep}   → link an offering to a global Intake with a
 *       seat **capacity** via `createProgramIntake`
 *       (`POST /admin/program-intakes/`) — the ProgramIntake create API now has
 *       a real frontend consumer (TEN-03). Offering + intake are chosen from
 *       scoped selectors (TEN-05).
 *   - {@link WizardFeesStep}      → configure a canonical application/tuition
 *       fee per offering + residency via `createProgramFee`
 *       (`POST /programs/{id}/fees/`). One active fee per
 *       (offering, type, residency); a duplicate returns `DUPLICATE_ACTIVE_FEE`.
 *
 * Each step is self-contained (owns its queries + mutations) and, on success,
 * invalidates the shared `['admin','tenants', …]` query keys the wizard reads
 * so the launch-readiness aggregate (design §6.2, reused from task 4.1's
 * `build_tenant_readiness`) updates live. All controls use the canonical
 * primitives (`Button`, `Input`, `select` via `TENANT_SELECT_CLASS`), Lucide
 * icons, ≥44px targets, light-only tokens, and no nested cards — the wizard's
 * step `SectionCard` is the single card layer (design §13.3).
 */
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Coins, Info, Layers, Plus } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { toast } from '@/hooks/useToast'
import { catalogService } from '@/services/catalog'
import {
  tenantAdminService,
  type TenantProgramFee
} from '@/services/admin/tenants'

import { tenantErrorMessage } from './errors'
import { TENANT_SELECT_CLASS } from './primitives'

/** Invalidate every tenant read the wizard shares (offerings, fees, readiness). */
function useInvalidateTenant() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
}

function StepIntro({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

// ---------------------------------------------------------------------------
// Programs — assign a Canonical_Program → Institution_Program_Offering (TEN-03)
// ---------------------------------------------------------------------------

export function WizardProgramsStep({ institutionId }: { institutionId: string }) {
  const invalidate = useInvalidateTenant()
  const [canonicalId, setCanonicalId] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  const canonicalQuery = useQuery({
    queryKey: ['admin', 'tenants', 'canonical-programs'],
    queryFn: () => catalogService.getCanonicalPrograms(),
  })
  const offeringsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'offerings', institutionId],
    queryFn: () => tenantAdminService.listOfferings(institutionId),
    enabled: Boolean(institutionId),
  })

  const canonicalPrograms = useMemo(
    () => [...(canonicalQuery.data?.programs || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [canonicalQuery.data?.programs],
  )
  const offerings = useMemo(
    () => [...(offeringsQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [offeringsQuery.data],
  )
  // Which canonical programs are already assigned to this tenant (offering
  // exists), so the operator sees what is done and does not double-assign.
  const assignedCanonicalIds = useMemo(
    () => new Set(offerings.map((o) => o.canonical_program_id).filter(Boolean) as string[]),
    [offerings],
  )
  const selectedCanonical = canonicalPrograms.find((p) => p.id === canonicalId) || null

  // Prefill the offering name/code from the chosen canonical program; the
  // operator can still tailor the tenant-facing name.
  useEffect(() => {
    if (selectedCanonical) {
      setName((prev) => prev || selectedCanonical.name)
      setCode((prev) => prev || (selectedCanonical.code ? String(selectedCanonical.code) : ''))
    }
  }, [selectedCanonical])

  const assignMutation = useMutation({
    mutationFn: () =>
      tenantAdminService.createOffering(institutionId, {
        canonical_program_id: canonicalId,
        name: name.trim(),
        code: code.trim(),
        offering_status: 'active',
      }),
    onSuccess: () => {
      setCanonicalId('')
      setName('')
      setCode('')
      invalidate()
      offeringsQuery.refetch()
      toast.success('Program assigned to this school')
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Program was not assigned')),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canonicalId) {
      toast.error('Choose a canonical program to assign')
      return
    }
    if (!name.trim() || !code.trim()) {
      toast.error('An offering name and code are required')
      return
    }
    assignMutation.mutate()
  }

  return (
    <div className="space-y-5">
      <StepIntro>
        Assign a canonical Beanola program to this school. That creates the school&apos;s own
        offering — routing, fees, and required documents attach to it. The canonical program is
        the only write authority; pick it from the list rather than pasting an identifier.
      </StepIntro>

      {canonicalQuery.isError ? (
        <ErrorDisplay message="Could not load canonical programs." onRetry={() => canonicalQuery.refetch()} />
      ) : (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-foreground">Canonical program</span>
            <select
              value={canonicalId}
              onChange={(e) => setCanonicalId(e.target.value)}
              className={TENANT_SELECT_CLASS}
              aria-label="Canonical program"
              disabled={canonicalQuery.isLoading}
            >
              <option value="">Select a canonical program…</option>
              {canonicalPrograms.map((program) => {
                const assigned = assignedCanonicalIds.has(program.id)
                return (
                  <option key={program.id} value={program.id}>
                    {program.name}
                    {program.code ? ` (${program.code})` : ''}
                    {assigned ? ' — already assigned' : ''}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Offering name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="School-facing program name" aria-label="Offering name" />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Offering code</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. DRN" aria-label="Offering code" />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" loading={assignMutation.isPending} disabled={!canonicalId}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Assign program
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {offerings.length > 0 ? `${offerings.length} offering${offerings.length === 1 ? '' : 's'} assigned` : 'No offerings assigned yet'}
        </p>
        {offerings.map((offering) => (
          <div key={offering.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-foreground">{offering.name}</p>
              <p className="text-xs text-muted-foreground">{offering.code}</p>
            </div>
            <StatusBadge
              tone={(offering.offering_status || 'active') === 'active' && offering.is_active !== false ? 'success' : 'muted'}
              label={offering.offering_status || 'active'}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Intakes — link an offering to an Intake with capacity (TEN-03)
// ---------------------------------------------------------------------------

interface LinkedIntake {
  id: string
  offeringName: string
  intakeName: string
  capacity: number | null
}

export function WizardIntakesStep({ institutionId }: { institutionId: string }) {
  const invalidate = useInvalidateTenant()
  const [offeringId, setOfferingId] = useState('')
  const [intakeId, setIntakeId] = useState('')
  const [capacity, setCapacity] = useState('')
  const [linked, setLinked] = useState<LinkedIntake[]>([])

  const offeringsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'offerings', institutionId],
    queryFn: () => tenantAdminService.listOfferings(institutionId),
    enabled: Boolean(institutionId),
  })
  const intakesQuery = useQuery({
    queryKey: ['admin', 'tenants', 'intakes'],
    queryFn: () => catalogService.getIntakes(),
  })

  const offerings = useMemo(
    () => [...(offeringsQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [offeringsQuery.data],
  )
  const intakes = useMemo(
    () => [...(intakesQuery.data?.intakes || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [intakesQuery.data?.intakes],
  )

  const linkMutation = useMutation({
    mutationFn: () =>
      tenantAdminService.createProgramIntake({
        program_id: offeringId,
        intake_id: intakeId,
        max_capacity: capacity.trim() === '' ? null : Number(capacity),
      }),
    onSuccess: (created) => {
      const offering = offerings.find((o) => o.id === offeringId)
      const intake = intakes.find((i) => i.id === intakeId)
      setLinked((prev) => [
        {
          id: created?.id || `${offeringId}-${intakeId}`,
          offeringName: offering?.name || 'Offering',
          intakeName: intake?.name || 'Intake',
          capacity: created?.max_capacity ?? (capacity.trim() === '' ? null : Number(capacity)),
        },
        ...prev,
      ])
      setIntakeId('')
      setCapacity('')
      invalidate()
      toast.success('Intake linked to offering')
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Intake was not linked')),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!offeringId || !intakeId) {
      toast.error('Choose an offering and an intake to link')
      return
    }
    if (capacity.trim() !== '') {
      const parsed = Number(capacity)
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error('Capacity must be a non-negative number')
        return
      }
    }
    linkMutation.mutate()
  }

  const hasOfferings = offerings.length > 0

  return (
    <div className="space-y-5">
      <StepIntro>
        Link an offering to an intake period and set its seat capacity. Applicants can only be
        routed to an offering that participates in an open intake. Capacity feeds the last-seat
        and waitlist rules.
      </StepIntro>

      {offeringsQuery.isError || intakesQuery.isError ? (
        <ErrorDisplay
          message="Could not load offerings or intakes."
          onRetry={() => {
            if (offeringsQuery.isError) offeringsQuery.refetch()
            if (intakesQuery.isError) intakesQuery.refetch()
          }}
        />
      ) : !hasOfferings ? (
        <StepIntro>Assign at least one program offering first, then return here to link intakes.</StepIntro>
      ) : (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Offering</span>
            <select
              value={offeringId}
              onChange={(e) => setOfferingId(e.target.value)}
              className={TENANT_SELECT_CLASS}
              aria-label="Offering"
            >
              <option value="">Select an offering…</option>
              {offerings.map((offering) => (
                <option key={offering.id} value={offering.id}>{offering.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Intake</span>
            <select
              value={intakeId}
              onChange={(e) => setIntakeId(e.target.value)}
              className={TENANT_SELECT_CLASS}
              aria-label="Intake"
              disabled={intakesQuery.isLoading}
            >
              <option value="">Select an intake…</option>
              {intakes.map((intake) => (
                <option key={intake.id} value={intake.id}>{intake.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Seat capacity <span className="text-muted-foreground">(optional)</span></span>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="e.g. 100"
              aria-label="Seat capacity"
            />
          </label>
          <div className="flex items-end justify-end">
            <Button type="submit" loading={linkMutation.isPending} disabled={!offeringId || !intakeId} className="w-full sm:w-auto">
              <Layers className="h-4 w-4" aria-hidden="true" /> Link intake
            </Button>
          </div>
        </form>
      )}

      {linked.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Linked this session</p>
          {linked.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-foreground">{item.offeringName}</p>
                <p className="text-xs text-muted-foreground">{item.intakeName}</p>
              </div>
              <StatusBadge tone="info" label={item.capacity == null ? 'No cap' : `${item.capacity} seats`} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fees — configure a canonical application/tuition fee per offering
// ---------------------------------------------------------------------------

const FEE_TYPES = [
  { value: 'application', label: 'Application fee' },
  { value: 'tuition', label: 'Tuition fee' },
]
const RESIDENCY_CATEGORIES = [
  { value: 'local', label: 'Local' },
  { value: 'international', label: 'International' },
]
const FEE_CURRENCIES = ['ZMW', 'USD']

export function WizardFeesStep({ institutionId }: { institutionId: string }) {
  const invalidate = useInvalidateTenant()
  const [offeringId, setOfferingId] = useState('')
  const [feeType, setFeeType] = useState('application')
  const [residency, setResidency] = useState('local')
  const [currency, setCurrency] = useState('ZMW')
  const [amount, setAmount] = useState('')

  const offeringsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'offerings', institutionId],
    queryFn: () => tenantAdminService.listOfferings(institutionId),
    enabled: Boolean(institutionId),
  })
  const offerings = useMemo(
    () => [...(offeringsQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [offeringsQuery.data],
  )

  const feesQuery = useQuery({
    queryKey: ['admin', 'tenants', 'fees', offeringId],
    queryFn: () => tenantAdminService.listProgramFees(offeringId),
    enabled: Boolean(offeringId),
  })
  const fees = (feesQuery.data || []) as TenantProgramFee[]

  const addFeeMutation = useMutation({
    mutationFn: () =>
      tenantAdminService.createProgramFee(offeringId, {
        fee_type: feeType,
        residency_category: residency,
        amount: amount.trim(),
        currency,
      }),
    onSuccess: () => {
      setAmount('')
      invalidate()
      feesQuery.refetch()
      toast.success('Fee configured')
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Fee was not configured')),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!offeringId) {
      toast.error('Choose an offering to price')
      return
    }
    const parsed = Number(amount)
    if (amount.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      toast.error('Enter a valid non-negative amount')
      return
    }
    addFeeMutation.mutate()
  }

  const hasOfferings = offerings.length > 0

  return (
    <div className="space-y-5">
      <StepIntro>
        Set the canonical fee for an offering and residency. The backend returns this exact amount
        as an expiring quote at payment time — students never see an invented or hardcoded fee. One
        active fee is allowed per offering, type, and residency.
      </StepIntro>

      {offeringsQuery.isError ? (
        <ErrorDisplay message="Could not load offerings." onRetry={() => offeringsQuery.refetch()} />
      ) : !hasOfferings ? (
        <StepIntro>Assign at least one program offering first, then return here to price it.</StepIntro>
      ) : (
        <>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium text-foreground">Offering</span>
              <select
                value={offeringId}
                onChange={(e) => setOfferingId(e.target.value)}
                className={TENANT_SELECT_CLASS}
                aria-label="Offering"
              >
                <option value="">Select an offering…</option>
                {offerings.map((offering) => (
                  <option key={offering.id} value={offering.id}>{offering.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Fee type</span>
              <select value={feeType} onChange={(e) => setFeeType(e.target.value)} className={TENANT_SELECT_CLASS} aria-label="Fee type">
                {FEE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Residency</span>
              <select value={residency} onChange={(e) => setResidency(e.target.value)} className={TENANT_SELECT_CLASS} aria-label="Residency category">
                {RESIDENCY_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Amount</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 150.00"
                aria-label="Fee amount"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={TENANT_SELECT_CLASS} aria-label="Currency">
                {FEE_CURRENCIES.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" loading={addFeeMutation.isPending} disabled={!offeringId}>
                <Coins className="h-4 w-4" aria-hidden="true" /> Add fee
              </Button>
            </div>
          </form>

          {offeringId && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Configured fees</p>
              {feesQuery.isError ? (
                <ErrorDisplay message="Could not load fees for this offering." onRetry={() => feesQuery.refetch()} />
              ) : fees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No fees configured for this offering yet.</p>
              ) : (
                fees.map((fee) => (
                  <div key={fee.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-foreground">
                        {fee.currency} {fee.amount}
                      </p>
                      <p className="text-xs text-muted-foreground">{fee.fee_type} · {fee.residency_category}</p>
                    </div>
                    <StatusBadge tone={fee.is_active === false ? 'muted' : 'success'} label={fee.is_active === false ? 'Inactive' : 'Active'} />
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
