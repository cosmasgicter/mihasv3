/**
 * Admin Program Fee Management Page
 *
 * CRUD interface for managing per-program application fees.
 * Calls ProgramFeeViewSet endpoints: GET/POST/PUT/DELETE /api/v1/programs/{id}/fees/
 * Soft delete via DELETE (sets is_active=false).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import React, { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/services/client'
import { programService } from '@/services/catalog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { CanonicalSelect } from '@/components/ui/CanonicalSelect'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'
import { PageShell } from '@/components/ui/PageShell'
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

interface FeeFormData {
  fee_type: string
  residency_category: string
  amount: string
  currency: string
}

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

// --- API helpers ---

async function fetchFeesForProgram(programId: string): Promise<ProgramFee[]> {
  const result = await apiClient.request<ProgramFee[]>(
    `/programs/${encodeURIComponent(programId)}/fees/`
  )
  return Array.isArray(result) ? result : []
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
  const [feeForm, setFeeForm] = useState<FeeFormData>(initialFeeForm)

  // Fetch programs
  const { data: programsData, isLoading: loadingPrograms } = useQuery({
    queryKey: ['admin', 'programs-for-fees'],
    queryFn: async () => {
      const response = await programService.list()
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
    setFeeForm(initialFeeForm)
    setShowCreate(true)
  }, [programs])

  const openEdit = useCallback((fee: ProgramFee & { programName: string }) => {
    setError('')
    setCurrentFee(fee)
    setSelectedProgramId(fee.program_id)
    setFeeForm({
      fee_type: fee.fee_type,
      residency_category: fee.residency_category,
      amount: String(fee.amount),
      currency: fee.currency,
    })
    setShowEdit(true)
  }, [])

  const openDelete = useCallback((fee: ProgramFee & { programName: string }) => {
    setError('')
    setCurrentFee(fee)
    setShowDelete(true)
  }, [])

  const handleCreate = () => {
    if (!selectedProgramId) {
      setError('Please select a program')
      return
    }
    if (!feeForm.amount || Number(feeForm.amount) <= 0) {
      setError('Amount must be greater than 0')
      return
    }

    void handleOperation(
      () => createFee(selectedProgramId, feeForm).then(() => undefined),
      () => {
        setShowCreate(false)
        setFeeForm(initialFeeForm)
      }
    )
  }

  const handleUpdate = () => {
    if (!currentFee) return
    if (!feeForm.amount || Number(feeForm.amount) <= 0) {
      setError('Amount must be greater than 0')
      return
    }

    void handleOperation(
      () =>
        updateFee(currentFee.program_id, currentFee.id, feeForm).then(
          () => undefined
        ),
      () => {
        setShowEdit(false)
        setCurrentFee(null)
      }
    )
  }

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
    <PageShell
      title="Program Fees"
      subtitle="Manage application and tuition fees for each program and residency category."
      maxWidth="7xl"
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
            <UnifiedLoader variant="page" label="Loading program fees..." />
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
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
              <Card className="border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
                <CardHeader className="pb-3">
                  <CardDescription>Active Fees</CardDescription>
                  <CardTitle className="flex items-center gap-2 text-3xl">
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

              <Card className="border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
                <CardHeader className="pb-3">
                  <CardDescription>Programs with Fees</CardDescription>
                  <CardTitle className="flex items-center gap-2 text-3xl">
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
              <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-14 text-center">
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
                        {row.currency} {Number(row.amount).toFixed(2)}
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
              value={feeForm.fee_type}
              onChange={(value) =>
                setFeeForm((prev) => ({ ...prev, fee_type: value }))
              }
              options={FEE_TYPE_OPTIONS}
              required
            />
            <CanonicalSelect
              label="Residency Category"
              value={feeForm.residency_category}
              onChange={(value) =>
                setFeeForm((prev) => ({ ...prev, residency_category: value }))
              }
              options={RESIDENCY_OPTIONS}
              required
            />
            <Input
              label="Amount"
              type="number"
              min={0}
              step="0.01"
              name="amount"
              value={feeForm.amount}
              onChange={(e) =>
                setFeeForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              required
            />
            <CanonicalSelect
              label="Currency"
              value={feeForm.currency}
              onChange={(value) =>
                setFeeForm((prev) => ({ ...prev, currency: value }))
              }
              options={CURRENCY_OPTIONS}
              required
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={saving}>
              Create Fee
            </Button>
          </DialogFooter>
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
          <div className="space-y-4 py-4">
            <CanonicalSelect
              label="Fee Type"
              value={feeForm.fee_type}
              onChange={(value) =>
                setFeeForm((prev) => ({ ...prev, fee_type: value }))
              }
              options={FEE_TYPE_OPTIONS}
              required
            />
            <CanonicalSelect
              label="Residency Category"
              value={feeForm.residency_category}
              onChange={(value) =>
                setFeeForm((prev) => ({ ...prev, residency_category: value }))
              }
              options={RESIDENCY_OPTIONS}
              required
            />
            <Input
              label="Amount"
              type="number"
              min={0}
              step="0.01"
              name="amount"
              value={feeForm.amount}
              onChange={(e) =>
                setFeeForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              required
            />
            <CanonicalSelect
              label="Currency"
              value={feeForm.currency}
              onChange={(value) =>
                setFeeForm((prev) => ({ ...prev, currency: value }))
              }
              options={CURRENCY_OPTIONS}
              required
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEdit(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} loading={saving}>
              Save Changes
            </Button>
          </DialogFooter>
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
  )
}
