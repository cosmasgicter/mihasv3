/**
 * Admin Program Fee Management Page
 *
 * CRUD interface for managing per-program application fees.
 * Calls ProgramFeeViewSet endpoints: GET/POST/PUT/DELETE /api/v1/programs/{id}/fees/
 * Soft delete via DELETE (sets is_active=false).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from '@/lib/zod'
import { apiClient } from '@/services/client'
import { programService } from '@/services/catalog'
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
import { ArrowLeft, DollarSign, Pencil, Plus, Trash2 } from 'lucide-react'

// --- Types ---

interface Program {
  id: string
  name: string
  code?: string
}

interface ProgramFee {
  id: string
  program_id: string
  fee_type: string
  residency_category: string
  amount: string | number
  currency: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type ProgramFeeListResponse =
  | ProgramFee[]
  | {
      results?: ProgramFee[]
      fees?: ProgramFee[]
      data?: ProgramFee[] | { results?: ProgramFee[]; fees?: ProgramFee[] }
    }

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

export function validateFeeAmount(amount: string): string | null {
  const parsedAmount = Number(amount)
  if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return 'Amount must be a valid positive number'
  }
  return null
}

export function formatFeeAmount(currency: string, amount: string | number): string {
  const parsedAmount = Number(amount)
  const formattedAmount = Number.isFinite(parsedAmount) ? parsedAmount.toFixed(2) : '0.00'
  return `${currency} ${formattedAmount}`
}

// --- API helpers ---

export function normalizeProgramFeeResponse(result: ProgramFeeListResponse | null | undefined): ProgramFee[] {
  if (!result) return []
  if (Array.isArray(result)) return result
  if (Array.isArray(result.results)) return result.results
  if (Array.isArray(result.fees)) return result.fees
  if (Array.isArray(result.data)) return result.data
  if (result.data && typeof result.data === 'object') {
    if (Array.isArray(result.data.results)) return result.data.results
    if (Array.isArray(result.data.fees)) return result.data.fees
  }
  return []
}

async function fetchFeesForProgram(programId: string): Promise<ProgramFee[]> {
  const result = await apiClient.request<ProgramFeeListResponse>(
    `/programs/${encodeURIComponent(programId)}/fees/`
  )
  return normalizeProgramFeeResponse(result)
}

async function createFee(programId: string, data: FeeFormData): Promise<ProgramFee | null> {
  return apiClient.request<ProgramFee>(
    `/programs/${encodeURIComponent(programId)}/fees/`,
    {
      method: 'POST',
      body: JSON.stringify({
        fee_type: data.fee_type,
        residency_category: data.residency_category,
        amount: data.amount,
        currency: data.currency,
      }),
    }
  )
}

async function updateFee(
  programId: string,
  feeId: string,
  data: FeeFormData
): Promise<ProgramFee | null> {
  return apiClient.request<ProgramFee>(
    `/programs/${encodeURIComponent(programId)}/fees/${encodeURIComponent(feeId)}/`,
    {
      method: 'PUT',
      body: JSON.stringify({
        fee_type: data.fee_type,
        residency_category: data.residency_category,
        amount: data.amount,
        currency: data.currency,
      }),
    }
  )
}

async function deleteFee(programId: string, feeId: string): Promise<void> {
  await apiClient.request<void>(
    `/programs/${encodeURIComponent(programId)}/fees/${encodeURIComponent(feeId)}/`,
    { method: 'DELETE' }
  )
}

// --- Component ---

export default function ProgramFees() {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Dialog state
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [currentFee, setCurrentFee] = useState<(ProgramFee & { programName: string }) | null>(null)

  const createFeeForm = useForm<FeeFormData>({
    resolver: zodResolver(feeFormSchema),
    defaultValues: initialFeeForm,
  })

  const editFeeForm = useForm<FeeFormData>({
    resolver: zodResolver(feeFormSchema),
    defaultValues: initialFeeForm,
  })

  // Fetch programs
  const { data: programsData, isLoading: loadingPrograms } = useQuery({
    queryKey: ['admin', 'programs-for-fees'],
    queryFn: async () => {
      const response = await programService.list({ pageSize: 500 })
      const programs = (response?.programs || []) as Program[]
      return programs.sort((a, b) => a.name.localeCompare(b.name))
    },
  })

  const programs = programsData || []

  // Fetch fees for all programs
  const { data: allFees, isLoading: loadingFees } = useQuery({
    queryKey: ['admin', 'program-fees'],
    queryFn: async () => {
      if (programs.length === 0) return []
      const results = await Promise.all(
        programs.map(async (program) => {
          const fees = await fetchFeesForProgram(program.id)
          return fees.map((fee) => ({ ...fee, programName: program.name }))
        })
      )
      return results.flat()
    },
    enabled: programs.length > 0,
  })

  const fees = allFees || []
  const loading = loadingPrograms || loadingFees

  const invalidateFees = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'program-fees'] })
  }, [queryClient])

  // --- Handlers ---

  const handleOperation = async (operation: () => Promise<void>, onSuccess: () => void) => {
    try {
      setSaving(true)
      setError('')
      await operation()
      onSuccess()
      invalidateFees()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to save changes'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  const openCreate = useCallback(() => {
    if (programs.length === 0) return
    setError('')
    setSelectedProgramId(programs[0]?.id ?? '')
    createFeeForm.reset(initialFeeForm)
    setShowCreate(true)
  }, [programs, createFeeForm])

  const openEdit = useCallback((fee: ProgramFee & { programName: string }) => {
    setError('')
    setCurrentFee(fee)
    setSelectedProgramId(fee.program_id)
    editFeeForm.reset({
      fee_type: fee.fee_type as 'application' | 'tuition',
      residency_category: fee.residency_category as 'local' | 'international',
      amount: String(fee.amount),
      currency: fee.currency as 'ZMW' | 'USD',
    })
    setShowEdit(true)
  }, [editFeeForm])

  const openDelete = useCallback((fee: ProgramFee & { programName: string }) => {
    setError('')
    setCurrentFee(fee)
    setShowDelete(true)
  }, [])

  const handleCreate = createFeeForm.handleSubmit((values) => {
    if (!selectedProgramId) {
      setError('Please select a program')
      return
    }

    void handleOperation(
      () => createFee(selectedProgramId, values).then(() => undefined),
      () => {
        setShowCreate(false)
        createFeeForm.reset(initialFeeForm)
      }
    )
  })

  const handleUpdate = editFeeForm.handleSubmit((values) => {
    if (!currentFee) return

    void handleOperation(
      () =>
        updateFee(currentFee.program_id, currentFee.id, values).then(
          () => undefined
        ),
      () => {
        setShowEdit(false)
        setCurrentFee(null)
      }
    )
  })

  const handleDelete = () => {
    if (!currentFee) return

    void handleOperation(
      () => deleteFee(currentFee.program_id, currentFee.id),
      () => {
        setShowDelete(false)
        setCurrentFee(null)
      }
    )
  }

  // --- Stats ---

  const totalFees = fees.length
  const programsWithFees = new Set(fees.map((f) => f.program_id)).size

  // Group fees by program for display
  type FeeWithProgram = ProgramFee & { programName: string }

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
      metrics={[
        { label: 'Fee rules', value: totalFees, helper: `${programsWithFees} programs currently configured` },
        { label: 'Programs', value: programs.length, helper: 'Available catalog programs' },
        { label: 'Coverage', value: `${programsWithFees}/${programs.length || 0}`, helper: 'Programs with at least one fee configured' },
        { label: 'State', value: loading ? 'Loading' : error ? 'Needs attention' : 'Ready', helper: error || 'Fees can be updated safely' },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <Button onClick={openCreate} disabled={programs.length === 0}>
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
                  <CardDescription>Programs with Fees</CardDescription>
                  <CardTitle className="flex items-center gap-2 text-3xl tracking-tight">
                    <DollarSign className="h-6 w-6 text-primary" />
                    {programsWithFees} / {programs.length}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Programs that have at least one active fee configured.
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
