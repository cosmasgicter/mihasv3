/**
 * Admin Program Fee Management Page (Admissions V2, tasks 5.1 and 8.4).
 *
 * Canonical FeeSchedule management for a program offering. Writes go through the
 * canonical catalog domain hooks/service (`useCatalogAdmin` /
 * `catalogAdminService`) — never the raw transport client (task 5.1, R14.3/R14.5).
 *
 * **Task 8.4 (findings ADM-06, AUTH-02) changed how this page reads.** It used to
 * load every offering and then fire one `/programs/{id}/fees/` request per
 * offering, flatten the results in the browser, and derive its headline numbers —
 * fee rules, programs with fees, coverage — from whatever had arrived. That made
 * the request count grow with the catalogue and made the totals describe the
 * loaded payload rather than the tenant's real configuration. It now reads the
 * one scoped, server-filtered, server-paginated fee report
 * (`GET /api/v1/admin/fees/`), whose aggregates are computed over the whole
 * filtered set, and it prints the server's amount strings rather than
 * re-formatting money itself.
 *
 * Fees resolve per offering, fee type, and residency category; one active fee is
 * enforced per `(offering, fee_type, residency)` on the backend and a duplicate
 * race returns `DUPLICATE_ACTIVE_FEE` (409) surfaced as an error (R7.4). Fee
 * writes require the platform offering-configuration capability; a read-only
 * tenant admin can read this page and not mutate it (R3.1).
 *
 * Requirements: R3.1, R6.5, R7.3, R7.4, R14.3, R14.5.
 */

import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from '@/lib/zod'
import { toError } from '@/lib/toError'
import {
  useCatalogOfferings,
  useFeeMutations,
} from '@/hooks/admin/useCatalogAdmin'
import { useFeeExport, useFeeReport } from '@/hooks/admin/useMoneyAdmin'
import type { FeeAdminRow } from '@/services/admin/settlement'
import { formatServerAmount } from '@/lib/serverAmount'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { CanonicalSelect } from '@/components/ui/CanonicalSelect'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { DashboardSkeleton } from '@/components/ui'
import { PageShell } from '@/components/ui/PageShell'
import { Seo } from '@/components/seo/Seo'
import { ArrowLeft, DollarSign, Download, Pencil, Plus, Trash2 } from 'lucide-react'

// --- Types ---

/** One row of the server's fee report, as this page renders it. */
type FeeWithProgram = FeeAdminRow & { programName: string; program_id: string }

export const feeFormSchema = z.object({
  fee_type: z.enum(['application', 'tuition'], { error: 'Fee type is required' }),
  residency_category: z.enum(['local', 'international'], { error: 'Residency category is required' }),
  amount: z.string().min(1, 'Amount is required').refine(
    (val) => { const n = Number(val); return !Number.isNaN(n) && n > 0 },
    { message: 'Amount must be a valid positive number' }
  ),
  currency: z.enum(['ZMW', 'USD'], { error: 'Currency is required' }),
})

export type FeeFormData = z.infer<typeof feeFormSchema>

const FEE_TYPE_OPTIONS = [
  { value: 'application', label: 'Application' },
  { value: 'tuition', label: 'Tuition' },
]

const RESIDENCY_OPTIONS = [
  { value: 'local', label: 'Local' },
  { value: 'international', label: 'International' },
]

const CURRENCY_OPTIONS = [
  { value: 'ZMW', label: 'ZMW (Zambian Kwacha)' },
  { value: 'USD', label: 'USD (US Dollar)' },
]

const initialFeeForm: FeeFormData = {
  fee_type: 'application',
  residency_category: 'local',
  amount: '',
  currency: 'ZMW',
}

/** Rows per server page (task 8.4 — the page is the server's, not the payload's). */
const PAGE_SIZE = 20

export function validateFeeAmount(amount: string): string | null {
  const parsedAmount = Number(amount)
  if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return 'Amount must be a valid positive number'
  }
  return null
}

/**
 * Display a server-authored fee amount.
 *
 * Task 8.4: this used to be `Number(amount).toFixed(2)` with a `'0.00'` fallback —
 * a client-side re-quantisation of money plus an invented amount when parsing
 * failed. The server sends already-quantised decimal strings, so the only job
 * left is putting a currency marker in front of them, which is what the one
 * canonical formatter does. A missing amount renders as an em dash rather than a
 * fabricated zero.
 */
export function formatFeeAmount(currency: string, amount: string | null | undefined): string {
  return formatServerAmount(amount, currency) || '—'
}

// --- Component ---

export default function ProgramFees() {
  const [error, setError] = useState('')

  // Dialog state
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [currentFee, setCurrentFee] = useState<FeeWithProgram | null>(null)

  const createFeeForm = useForm<FeeFormData>({
    resolver: zodResolver(feeFormSchema),
    defaultValues: initialFeeForm,
  })

  const editFeeForm = useForm<FeeFormData>({
    resolver: zodResolver(feeFormSchema),
    defaultValues: initialFeeForm,
  })

  // The offering list is still needed to *write* a fee (the create dialog picks
  // an offering); it is no longer the source of the fee rows.
  const { data: offeringsData, isLoading: loadingPrograms } = useCatalogOfferings()
  const programs = useMemo(
    () =>
      (offeringsData ?? [])
        .map((offering) => ({ id: offering.id, name: offering.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [offeringsData],
  )

  // One scoped, server-filtered, server-paginated fee report (task 8.4). Not one
  // request per offering, and not a client-side flatten.
  const [page, setPage] = useState(1)
  const feeQuery = useMemo(() => ({ page, pageSize: PAGE_SIZE }), [page])
  const { data: feeReport, isLoading: loadingFees } = useFeeReport(feeQuery)
  const exportMutation = useFeeExport()

  const fees = useMemo<FeeWithProgram[]>(
    () =>
      (feeReport?.results ?? []).map((row) => ({
        ...row,
        program_id: row.program_offering_id ?? '',
        programName: row.program_name,
      })),
    [feeReport],
  )
  const aggregates = feeReport?.aggregates
  // The page count is the server's answer, not a division done here.
  const totalPages = feeReport?.totalPages ?? 1
  const loading = loadingPrograms || loadingFees

  const { create, update, deactivate } = useFeeMutations()
  const saving = create.isPending || update.isPending || deactivate.isPending

  // --- Handlers ---

  const runMutation = useCallback(
    async (op: () => Promise<unknown>, onSuccess: () => void) => {
      setError('')
      try {
        await op()
        onSuccess()
      } catch (err: unknown) {
        setError(toError(err).message || 'Unable to save changes')
      }
    },
    [],
  )

  const openCreate = useCallback(() => {
    if (programs.length === 0) return
    setError('')
    setSelectedProgramId(programs[0]?.id ?? '')
    createFeeForm.reset(initialFeeForm)
    setShowCreate(true)
  }, [programs, createFeeForm])

  const openEdit = useCallback((fee: FeeWithProgram) => {
    setError('')
    setCurrentFee(fee)
    setSelectedProgramId(fee.program_id)
    editFeeForm.reset({
      // The server's amount string is put back verbatim; the form never
      // re-derives or re-rounds it (R12.1).
      fee_type: fee.fee_type as 'application' | 'tuition',
      residency_category: fee.residency_category as 'local' | 'international',
      amount: fee.amount ?? '',
      currency: fee.currency as 'ZMW' | 'USD',
    })
    setShowEdit(true)
  }, [editFeeForm])

  const openDelete = useCallback((fee: FeeWithProgram) => {
    setError('')
    setCurrentFee(fee)
    setShowDelete(true)
  }, [])

  const handleCreate = createFeeForm.handleSubmit((values) => {
    if (!selectedProgramId) {
      setError('Please select a program')
      return
    }
    void runMutation(
      () => create.mutateAsync({ offeringId: selectedProgramId, data: values }),
      () => {
        setShowCreate(false)
        createFeeForm.reset(initialFeeForm)
      },
    )
  })

  const handleUpdate = editFeeForm.handleSubmit((values) => {
    if (!currentFee) return
    void runMutation(
      () => update.mutateAsync({ offeringId: currentFee.program_id, feeId: currentFee.id, data: values }),
      () => {
        setShowEdit(false)
        setCurrentFee(null)
      },
    )
  })

  const handleDelete = () => {
    if (!currentFee) return
    void runMutation(
      () => deactivate.mutateAsync({ offeringId: currentFee.program_id, feeId: currentFee.id }),
      () => {
        setShowDelete(false)
        setCurrentFee(null)
      },
    )
  }

  // --- Stats (server aggregates, over the whole filtered set) ---
  //
  // These three numbers used to be `fees.length`, a `Set` over the loaded rows,
  // and a ratio against however many offerings had come back — all derived from
  // one payload (ADM-06). They are now the server's answer for the actor's whole
  // scope, so they do not change when the operator turns a page.
  const totalFees = aggregates?.fee_count ?? 0
  const programsWithFees = aggregates?.configured_offering_count ?? 0
  const offeringsInScope = aggregates?.offerings_in_scope ?? 0
  const unconfiguredOfferings = aggregates?.unconfigured_offering_count ?? 0
  const mayExport = feeReport?.can_export ?? false

  return (
    <>
      <Seo
        title="Program Fees | Beanola Admissions"
        description="Manage application and tuition fees for each program and residency category."
        path="/admin/program-fees"
        noindex
      />
    <PageShell
      title="Program Fees"
      eyebrow="Pricing Controls"
      subtitle="Manage application and tuition fees for each program and residency category."
      maxWidth="7xl"
      tone="admin"
      /*
        No `metrics` row (task 11.5, R16.5). Task 8.4's server coverage
        aggregates are kept and still rendered **once**, in this page's own
        summary block below. Three of these four tiles were the same aggregates a
        second time in the first viewport; the fourth read the page's own
        loading/error state.
      */
      actions={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Link to="/admin" className="w-full sm:w-auto">
            <Button variant="ghost" size="sm" className="w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          {mayExport && (
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              loading={exportMutation.isPending}
              onClick={() => exportMutation.mutate(feeQuery)}
            >
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
              Export CSV
            </Button>
          )}
          <Button onClick={openCreate} disabled={programs.length === 0} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Fee
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <DashboardSkeleton />
          </div>
        ) : (
          <>
            {exportMutation.isError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
                {toError(exportMutation.error).message}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Action needs attention</p>
                    <p className="text-sm">{error}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setError('')}
                    className="border-destructive/30 text-destructive hover:bg-destructive/5"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="rounded-lg border-border/60 shadow-sm">
                <CardHeader className="pb-3">
                  <CardDescription>Active Fees</CardDescription>
                  <CardTitle className="flex items-center gap-2 text-3xl tracking-tight">
                    <DollarSign className="h-6 w-6 text-primary" />
                    {totalFees}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Fee configurations across all programs.
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-lg border-border/60 shadow-sm">
                <CardHeader className="pb-3">
                  <CardDescription>Offerings with Fees</CardDescription>
                  <CardTitle className="flex items-center gap-2 text-3xl tracking-tight">
                    <DollarSign className="h-6 w-6 text-primary" />
                    {programsWithFees} / {offeringsInScope}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {/*
                      The actionable half of coverage, from task 8.4's server
                      aggregate. It used to be reachable only from the retired
                      first-viewport tile row (task 11.5); the operator still
                      needs to know how many offerings have no fee at all.
                    */}
                    {unconfiguredOfferings === 0
                      ? 'Every offering in your scope has at least one active fee configured.'
                      : `${unconfiguredOfferings} offering${unconfiguredOfferings === 1 ? '' : 's'} in your scope still have no fee configured.`}
                  </p>
                </CardContent>
              </Card>
            </div>

            {fees.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/40 px-6 py-14 text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <DollarSign className="h-10 w-10" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">No Fees Configured</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Add application or tuition fees for your programs so students see the correct amount during payment.
                </p>
                <div className="mt-6 flex justify-center">
                  <Button onClick={openCreate} disabled={programs.length === 0}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Fee
                  </Button>
                </div>
              </div>
            ) : (
              <ResponsiveTable<FeeWithProgram>
                columns={[
                  {
                    key: 'programName',
                    header: 'Program',
                    priority: 'always',
                    render: (_value, row) => (
                      <span className="font-semibold text-foreground">
                        {row.programName}
                      </span>
                    ),
                  },
                  {
                    key: 'fee_type',
                    header: 'Fee Type',
                    priority: 'always',
                    render: (_value, row) => (
                      <Badge variant="secondary" className="capitalize">
                        {row.fee_type}
                      </Badge>
                    ),
                  },
                  {
                    key: 'residency_category',
                    header: 'Residency',
                    priority: 'always',
                    render: (_value, row) => (
                      <Badge
                        variant={row.residency_category === 'local' ? 'default' : 'outline'}
                        className="capitalize"
                      >
                        {row.residency_category}
                      </Badge>
                    ),
                  },
                  {
                    key: 'amount',
                    header: 'Amount',
                    priority: 'always',
                    render: (_value, row) => (
                      <span className="font-mono text-sm text-foreground">
                        {formatFeeAmount(row.currency, row.amount)}
                      </span>
                    ),
                  },
                  {
                    key: 'id',
                    header: 'Actions',
                    priority: 'always',
                    render: (_value, row) => (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEdit(row)
                          }}
                          aria-label={`Edit ${row.programName} ${row.fee_type} fee`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          <span className="md:hidden ml-1">Edit</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            openDelete(row)
                          }}
                          className="text-destructive border-destructive/30 hover:bg-destructive/5"
                          aria-label={`Delete ${row.programName} ${row.fee_type} fee`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          <span className="md:hidden ml-1">Delete</span>
                        </Button>
                      </div>
                    ),
                  },
                ]}
                data={fees}
                caption="Program fees"
                loading={false}
              />
            )}

            {totalPages > 1 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {feeReport?.page ?? page} of {totalPages} · {feeReport?.totalCount ?? 0} fee rules
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(feeReport?.page ?? page) <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(feeReport?.page ?? page) >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Fee Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Add Program Fee</DialogTitle>
            <DialogDescription>
              Configure a new fee for a program and residency category.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
          <div className="space-y-4 py-4">
            <CanonicalSelect
              label="Program"
              value={selectedProgramId}
              onChange={(value) => setSelectedProgramId(value)}
              placeholder="Select a program"
              options={programs.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              required
            />
            <CanonicalSelect
              label="Fee Type"
              value={createFeeForm.watch('fee_type')}
              onChange={(value) => createFeeForm.setValue('fee_type', value as 'application' | 'tuition')}
              options={FEE_TYPE_OPTIONS}
              required
              error={createFeeForm.formState.errors.fee_type?.message}
            />
            <CanonicalSelect
              label="Residency Category"
              value={createFeeForm.watch('residency_category')}
              onChange={(value) => createFeeForm.setValue('residency_category', value as 'local' | 'international')}
              options={RESIDENCY_OPTIONS}
              required
              error={createFeeForm.formState.errors.residency_category?.message}
            />
            <Input
              label="Amount"
              type="number"
              min={0}
              step="0.01"
              {...createFeeForm.register('amount')}
              error={createFeeForm.formState.errors.amount?.message}
              required
            />
            <CanonicalSelect
              label="Currency"
              value={createFeeForm.watch('currency')}
              onChange={(value) => createFeeForm.setValue('currency', value as 'ZMW' | 'USD')}
              options={CURRENCY_OPTIONS}
              required
              error={createFeeForm.formState.errors.currency?.message}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
              disabled={saving}
              type="button"
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create Fee
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Fee Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit Program Fee</DialogTitle>
            <DialogDescription>
              Update the fee for {currentFee?.programName}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate}>
          <div className="space-y-4 py-4">
            <CanonicalSelect
              label="Fee Type"
              value={editFeeForm.watch('fee_type')}
              onChange={(value) => editFeeForm.setValue('fee_type', value as 'application' | 'tuition')}
              options={FEE_TYPE_OPTIONS}
              required
              error={editFeeForm.formState.errors.fee_type?.message}
            />
            <CanonicalSelect
              label="Residency Category"
              value={editFeeForm.watch('residency_category')}
              onChange={(value) => editFeeForm.setValue('residency_category', value as 'local' | 'international')}
              options={RESIDENCY_OPTIONS}
              required
              error={editFeeForm.formState.errors.residency_category?.message}
            />
            <Input
              label="Amount"
              type="number"
              min={0}
              step="0.01"
              {...editFeeForm.register('amount')}
              error={editFeeForm.formState.errors.amount?.message}
              required
            />
            <CanonicalSelect
              label="Currency"
              value={editFeeForm.watch('currency')}
              onChange={(value) => editFeeForm.setValue('currency', value as 'ZMW' | 'USD')}
              options={CURRENCY_OPTIONS}
              required
              error={editFeeForm.formState.errors.currency?.message}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEdit(false)}
              disabled={saving}
              type="button"
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save Changes
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete Fee</DialogTitle>
            <DialogDescription>
              This will deactivate the {currentFee?.fee_type} fee (
              {currentFee?.residency_category}) for {currentFee?.programName}.
              The record is soft-deleted and can be replaced with a new fee.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDelete(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              loading={saving}
            >
              Delete Fee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
    </>
  )
}
