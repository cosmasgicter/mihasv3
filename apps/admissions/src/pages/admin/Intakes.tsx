import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { intakeService } from '@/services/catalog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { normalizeDateInputValue } from '@/lib/profileFieldMapping'
import { formatDate } from '@/lib/dateFormat'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog'
import { DashboardSkeleton } from '@/components/ui'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import { Pencil, Trash2, Plus, ArrowLeft, Calendar } from 'lucide-react'
import { useForm, type Resolver } from 'react-hook-form'
import { z } from '@/lib/zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { PageShell } from '@/components/ui/PageShell'
import { Seo } from '@/components/seo/Seo'

interface Intake {
  id: string
  name: string
  year: number
  start_date: string
  end_date: string
  application_deadline: string
  max_capacity: number
  current_enrollment?: number
  is_active?: boolean
}

/** Returns Tailwind classes for the utilization indicator based on enrollment/capacity ratio */
export function getUtilizationColor(enrollment: number, capacity: number): { bg: string; text: string; label: string } {
  if (capacity <= 0) return { bg: 'bg-muted', text: 'text-muted-foreground', label: 'N/A' }
  const ratio = enrollment / capacity
  if (ratio >= 1) return { bg: 'bg-red-100', text: 'text-red-700', label: 'Over capacity' }
  if (ratio >= 0.8) return { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Near capacity' }
  return { bg: 'bg-green-100', text: 'text-green-700', label: 'Available' }
}

export const intakeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  year: z.coerce.number().int().min(2000, 'Year is required'),
  semester: z.string().optional().default(''),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  application_deadline: z.string().min(1, 'Application deadline is required'),
  max_capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
})
  .refine((data) => new Date(data.start_date) <= new Date(data.end_date), {
    message: 'Start date must be before end date',
    path: ['end_date'],
  })
  .refine(
    (data) => new Date(data.application_deadline) <= new Date(data.start_date),
    {
      message: 'Deadline must be before start date',
      path: ['application_deadline'],
    },
  )

export interface IntakeForm {
  name: string
  year: number
  semester: string
  start_date: string
  end_date: string
  application_deadline: string
  max_capacity: number
}

// formatDate imported from @/lib/dateFormat handles null/invalid dates

const IntakeFormFields = ({ register, errors }: { register: any; errors: any }) => (
  <div className="space-y-4 py-4">
    <Input label="Name" {...register('name')} error={errors.name?.message} required />
    <Input label="Year" type="number" {...register('year')} error={errors.year?.message} required />
    <div>
      <label htmlFor="semester" className="block text-sm font-medium text-foreground mb-1">Semester</label>
      <select id="semester" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm h-12" {...register('semester')}>
        <option value="">Select semester</option>
        <option value="1">Semester 1 (January)</option>
        <option value="2">Semester 2 (July)</option>
      </select>
    </div>
    <Input label="Start Date" type="date" {...register('start_date')} error={errors.start_date?.message} required />
    <Input label="End Date" type="date" {...register('end_date')} error={errors.end_date?.message} required />
    <Input label="Application Deadline" type="date" {...register('application_deadline')} error={errors.application_deadline?.message} required />
    <Input label="Max Capacity" type="number" {...register('max_capacity')} error={errors.max_capacity?.message} required />
  </div>
)

/** Extract a user-friendly message from a mutation error */
function getMutationErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'An unexpected error occurred. Please try again.'
}

export default function AdminIntakes() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [currentIntake, setCurrentIntake] = useState<Intake | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<IntakeForm>({
    resolver: zodResolver(intakeSchema) as Resolver<IntakeForm>,
    defaultValues: {
      name: '',
      year: new Date().getFullYear(),
      semester: '',
      start_date: '',
      end_date: '',
      application_deadline: '',
      max_capacity: 0,
    },
  })

  const { data: intakes = [], isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['admin', 'intakes'],
    queryFn: async () => {
      const response = await intakeService.list()
      // After unwrap, response is { intakes: Intake[] } directly
      return (response?.intakes || []).sort((a: Intake, b: Intake) => b.year - a.year)
    },
  })

  const error = queryError?.message || ''

  const openCreate = () => {
    setMutationError(null)
    reset({
      name: '',
      year: new Date().getFullYear(),
      semester: '',
      start_date: '',
      end_date: '',
      application_deadline: '',
      max_capacity: 0,
    })
    setShowCreate(true)
  }

  const openEdit = (intake: Intake) => {
    setMutationError(null)
    setCurrentIntake(intake)
    reset({
      name: intake.name,
      year: intake.year,
      semester: (intake as any).semester || '',
      start_date: normalizeDateInputValue(intake.start_date),
      end_date: normalizeDateInputValue(intake.end_date),
      application_deadline: normalizeDateInputValue(intake.application_deadline),
      max_capacity: intake.max_capacity,
    })
    setShowEdit(true)
  }

  const openDelete = (intake: Intake) => {
    setMutationError(null)
    setCurrentIntake(intake)
    setShowDelete(true)
  }

  const mutationOptions = {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'intakes'] })
    },
  }

  const createMutation = useMutation({
    mutationFn: async (data: IntakeForm) => {
      await intakeService.create({
        name: data.name,
        year: data.year,
        semester: data.semester,
        start_date: data.start_date,
        end_date: data.end_date,
        application_deadline: data.application_deadline,
        max_capacity: data.max_capacity,
      })
    },
    ...mutationOptions,
    onSuccess: () => {
      mutationOptions.onSuccess()
      setMutationError(null)
      setShowCreate(false)
    },
    onError: (err: unknown) => {
      setMutationError(getMutationErrorMessage(err))
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: IntakeForm) => {
      if (!currentIntake) return
      await intakeService.update({
        id: currentIntake.id,
        name: data.name,
        year: data.year,
        semester: data.semester,
        start_date: data.start_date,
        end_date: data.end_date,
        application_deadline: data.application_deadline,
        max_capacity: data.max_capacity,
      })
    },
    ...mutationOptions,
    onSuccess: () => {
      mutationOptions.onSuccess()
      setMutationError(null)
      setShowEdit(false)
      setCurrentIntake(null)
    },
    onError: (err: unknown) => {
      setMutationError(getMutationErrorMessage(err))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!currentIntake) return
      await intakeService.delete(currentIntake.id)
    },
    ...mutationOptions,
    onSuccess: () => {
      mutationOptions.onSuccess()
      setMutationError(null)
      setShowDelete(false)
      setCurrentIntake(null)
    },
    onError: (err: unknown) => {
      setMutationError(getMutationErrorMessage(err))
    },
  })

  const saving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  const createIntake = (data: IntakeForm) => {
    setMutationError(null)
    createMutation.mutate(data)
  }

  const updateIntake = (data: IntakeForm) => {
    if (!currentIntake) return
    setMutationError(null)
    updateMutation.mutate(data)
  }

  const deleteIntake = () => {
    if (!currentIntake) return
    setMutationError(null)
    deleteMutation.mutate()
  }

  return (
    <>
      <Seo
        title="Intakes | MIHAS-KATC Admissions"
        description="Create and manage admission intake periods, deadlines, and capacity."
        path="/admin/intakes"
        noindex
      />
    <PageShell
      title="Intakes"
      subtitle="Manage admission intakes"
      maxWidth="7xl"
      actions={
        <div className="flex items-center gap-2">
          <Link to="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add Intake
          </Button>
        </div>
      }
    >

          {/* Content */}
          <div>

            {loading ? (
              <div className="flex justify-center py-8 sm:py-16">
                <div className="text-center">
                  <DashboardSkeleton />
                </div>
              </div>
            ) : error ? (
              <div className="rounded-xl bg-destructive/5 border border-destructive/30 p-6 text-center">
                <div className="text-6xl mb-4">😱</div>
                <p className="text-destructive font-medium text-lg">{error}</p>
                <Button 
                  onClick={() => refetch()} 
                  variant="outline" 
                  className="mt-4 text-destructive border-destructive/30 hover:bg-destructive/5"
                >
                  Try Again
                </Button>
              </div>
            ) : intakes.length === 0 ? (
              <div className="text-center py-8 sm:py-16">
                <div className="text-8xl mb-6"><Calendar className="w-5 h-5" aria-hidden="true" /></div>
                <h2 className="text-2xl font-bold text-foreground mb-2">No Intakes Yet</h2>
                <p className="text-foreground mb-6 max-w-md mx-auto">
                  Create admission intakes to define application periods, deadlines, and capacity for student enrollment.
                </p>
                <Button onClick={openCreate}>
                  <Plus className="h-5 w-5 mr-2" aria-hidden="true" />
                  Create First Intake
                </Button>
              </div>
            ) : (
              <ResponsiveTable<Intake>
                columns={[
                  {
                    key: 'name',
                    header: 'Name',
                    priority: 'always',
                    render: (_value, row) => (
                      <span className="font-semibold text-foreground">{row.name}</span>
                    ),
                  },
                  {
                    key: 'year',
                    header: 'Year',
                    priority: 'always',
                    render: (_value, row) => (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-secondary/10 text-secondary-foreground">
                        {row.year}
                      </span>
                    ),
                  },
                  {
                    key: 'start_date',
                    header: 'Start',
                    priority: 'desktop',
                    render: (_value, row) => <span>{formatDate(row.start_date)}</span>,
                  },
                  {
                    key: 'end_date',
                    header: 'End',
                    priority: 'desktop',
                    render: (_value, row) => <span>{formatDate(row.end_date)}</span>,
                  },
                  {
                    key: 'application_deadline',
                    header: 'Deadline',
                    priority: 'always',
                    render: (_value, row) => (
                      <span className="text-sm font-medium text-destructive">
                        {formatDate(row.application_deadline)}
                      </span>
                    ),
                  },
                  {
                    key: 'max_capacity',
                    header: 'Capacity',
                    priority: 'desktop',
                    render: (_value, row) => (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-primary/10 text-primary">
                        {row.max_capacity}
                      </span>
                    ),
                  },
                  {
                    key: 'current_enrollment' as keyof Intake,
                    header: 'Enrollment',
                    priority: 'always',
                    render: (_value, row) => {
                      const enrollment = row.current_enrollment ?? 0
                      const { bg, text, label } = getUtilizationColor(enrollment, row.max_capacity)
                      return (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${bg} ${text}`}
                          title={label}
                        >
                          {enrollment}/{row.max_capacity}
                        </span>
                      )
                    },
                  },
                  {
                    key: 'max_capacity' as keyof Intake,
                    header: 'Available',
                    priority: 'always',
                    render: (_value, row) => {
                      const available = Math.max(row.max_capacity - (row.current_enrollment ?? 0), 0)
                      return (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                          available > 0 ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'
                        }`}>
                          {available}/{row.max_capacity}
                        </span>
                      )
                    },
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
                          onClick={(e) => { e.stopPropagation(); openEdit(row) }}
                          className="text-primary"
                          aria-label={`Edit ${row.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          <span className="md:hidden ml-1">Edit</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); openDelete(row) }}
                          className="text-destructive border-destructive/30 hover:bg-destructive/5"
                          aria-label={`Delete ${row.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          <span className="md:hidden ml-1">Delete</span>
                        </Button>
                      </div>
                    ),
                  },
                ]}
                data={intakes}
                caption="Admission intakes"
                loading={false}
              />
            )}
          </div>

      {/* Create Intake Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Intake</DialogTitle>
            <DialogDescription>Enter intake details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(createIntake)}>
            <IntakeFormFields register={register} errors={errors} />
            {mutationError && showCreate && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 mb-4" role="alert">
                {mutationError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreate(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Intake Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Intake</DialogTitle>
            <DialogDescription>Update intake details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(updateIntake)}>
            <IntakeFormFields register={register} errors={errors} />
            {mutationError && showEdit && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 mb-4" role="alert">
                {mutationError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEdit(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Intake Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Intake</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{currentIntake?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {mutationError && showDelete && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2" role="alert">
              {mutationError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDelete(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteIntake} loading={saving}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
    </>
  )
}
