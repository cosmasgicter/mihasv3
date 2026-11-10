import { toError } from '@/lib/toError'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCatalogIntakes, useIntakeMutations } from '@/hooks/admin/useCatalogAdmin'
import type { CatalogIntake } from '@/services/admin/catalog'
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
import { Pencil, Trash2, Plus, ArrowLeft, Calendar, AlertTriangle, AlertOctagon, CheckCircle2, CircleDashed } from 'lucide-react'
import { useForm, type FieldErrors, type Resolver, type UseFormRegister } from 'react-hook-form'
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
  semester?: string
}

/** Map a canonical intake period (nullable fields) to the page's display shape. */
function toIntake(raw: CatalogIntake): Intake {
  return {
    id: raw.id,
    name: raw.name,
    year: raw.year,
    start_date: raw.start_date ?? '',
    end_date: raw.end_date ?? '',
    application_deadline: raw.application_deadline ?? '',
    max_capacity: raw.max_capacity ?? 0,
    current_enrollment: raw.current_enrollment ?? 0,
    is_active: raw.is_active,
    semester: raw.semester ?? undefined,
  }
}

/**
 * Returns Tailwind classes for the utilization indicator based on
 * enrollment/capacity ratio.
 *
 * Tokenised as part of the 2026-05-26 admin audit fix: the badge no longer
 * encodes raw red/amber/green palette utilities. The `tone` field is the
 * semantic source of truth — callers should pair the badge with the
 * matching icon (see `getUtilizationIcon`) so status colour is never
 * communicated alone.
 *
 * The tone is the fill and the border; the label is `text-foreground`
 * (admissions-v2 task 11.5, R16.2). `text-destructive` on `bg-destructive/10`
 * measures 4.20 : 1 and `text-warning` on `bg-warning/10` 4.37 : 1 — both under
 * AA, and both are the branches this badge takes when an intake is in trouble.
 * `StatusPill` and `StatusBadge` were corrected the same way in the same task.
 */
export type UtilizationTone = 'destructive' | 'warning' | 'success' | 'muted'

export function getUtilizationColor(
  enrollment: number,
  capacity: number,
): { bg: string; text: string; label: string; tone: UtilizationTone } {
  if (capacity <= 0) {
    return {
      bg: 'bg-muted border-border/60',
      text: 'text-muted-foreground',
      label: 'N/A',
      tone: 'muted',
    }
  }
  const ratio = enrollment / capacity
  if (ratio >= 1) {
    return {
      bg: 'bg-destructive/10 border-destructive/40',
      text: 'text-foreground',
      label: 'Over capacity',
      tone: 'destructive',
    }
  }
  if (ratio >= 0.8) {
    return {
      bg: 'bg-warning/10 border-warning/40',
      text: 'text-foreground',
      label: 'Near capacity',
      tone: 'warning',
    }
  }
  return {
    bg: 'bg-success/10 border-success/40',
    text: 'text-foreground',
    label: 'Available',
    tone: 'success',
  }
}

/** Lucide icon partner for each utilization tone — never use colour alone. */
export function getUtilizationIcon(tone: UtilizationTone) {
  switch (tone) {
    case 'destructive':
      return AlertOctagon
    case 'warning':
      return AlertTriangle
    case 'success':
      return CheckCircle2
    case 'muted':
    default:
      return CircleDashed
  }
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

const IntakeFormFields = ({
  register,
  errors,
}: {
  register: UseFormRegister<IntakeForm>
  errors: FieldErrors<IntakeForm>
}) => (
  <div className="space-y-4 py-4">
    <Input label="Name" {...register('name')} error={errors.name?.message} required />
    <Input label="Year" type="number" {...register('year')} error={errors.year?.message} required />
    <div>
      <label htmlFor="semester" className="block text-sm font-medium text-foreground mb-1">Semester</label>
      <select id="semester" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm h-12" {...register('semester')}>
        <option value="">Select semester</option>
        <option value="1">Semester 1 (January)</option>
        <option value="2">Semester 2 (July)</option>
      </select>
    </div>
    <Input label="Start date" type="date" {...register('start_date')} error={errors.start_date?.message} required />
    <Input label="End date" type="date" {...register('end_date')} error={errors.end_date?.message} required />
    <Input label="Application deadline" type="date" {...register('application_deadline')} error={errors.application_deadline?.message} required />
    <Input label="Max capacity" type="number" {...register('max_capacity')} error={errors.max_capacity?.message} required />
  </div>
)

/** Extract a user-friendly message from a mutation error. */
function getMutationErrorMessage(err: unknown): string {
  return toError(err).message || 'An unexpected error occurred. Please try again.'
}

export default function AdminIntakes() {
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

  // Canonical intake-period reads through the catalog domain hook (R7.3). The
  // legacy `intakeService` (/catalog/intakes/) writes are retired here.
  const { data: intakesRaw = [], isLoading: loading, error: queryError, refetch } = useCatalogIntakes()
  const intakes = useMemo<Intake[]>(
    () => intakesRaw.map(toIntake).sort((a, b) => b.year - a.year),
    [intakesRaw],
  )

  const error = queryError instanceof Error ? queryError.message : ''

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
      semester: intake.semester || '',
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

  const { create, update, deactivate } = useIntakeMutations()
  const saving = create.isPending || update.isPending || deactivate.isPending

  const buildPayload = (data: IntakeForm) => ({
    name: data.name,
    year: data.year,
    semester: data.semester || undefined,
    start_date: data.start_date,
    end_date: data.end_date,
    // Intakes open at their start date unless a separate window is configured.
    application_start_date: data.start_date,
    application_deadline: data.application_deadline,
    max_capacity: data.max_capacity,
  })

  const createIntake = (data: IntakeForm) => {
    setMutationError(null)
    create.mutate(buildPayload(data), {
      onSuccess: () => {
        setMutationError(null)
        setShowCreate(false)
      },
      onError: (err: unknown) => setMutationError(getMutationErrorMessage(err)),
    })
  }

  const updateIntake = (data: IntakeForm) => {
    if (!currentIntake) return
    setMutationError(null)
    update.mutate(
      { id: currentIntake.id, data: buildPayload(data) },
      {
        onSuccess: () => {
          setMutationError(null)
          setShowEdit(false)
          setCurrentIntake(null)
        },
        onError: (err: unknown) => setMutationError(getMutationErrorMessage(err)),
      },
    )
  }

  const deleteIntake = () => {
    if (!currentIntake) return
    setMutationError(null)
    deactivate.mutate(currentIntake.id, {
      onSuccess: () => {
        setMutationError(null)
        setShowDelete(false)
        setCurrentIntake(null)
      },
      onError: (err: unknown) => setMutationError(getMutationErrorMessage(err)),
    })
  }

  return (
    <>
      <Seo
        title="Intakes | Beanola Admissions"
        description="Create and manage admission intake periods, deadlines, and capacity."
        path="/admin/intakes"
        noindex
      />
    <PageShell
      title="Intakes"
      eyebrow="Admissions calendar"
      subtitle="Manage admission intakes, windows, deadlines, and readiness for upcoming cohorts."
      maxWidth="7xl"
      tone="admin"
      /*
        No `metrics` row (task 11.5, R16.5; task 11.4 §11 named these four).

        None of the four was a number an operator acts on: a count the record
        list below states by existing, a "Year focus" reading the first row's
        year, a "State" tile reading this page's own loading/error state, and a
        "Next action" tile whose value was the literal label of the "Add intake"
        button in this same header. Four passive tiles held the first viewport,
        which is why 11.4's journey had to scroll an intake record into view to
        photograph it.
      */
      actions={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Link to="/admin" className="w-full sm:w-auto">
            <Button variant="ghost" size="sm" className="w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" /> Add intake
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
              <div className="rounded-lg bg-destructive/5 border border-destructive/30 p-6 text-center">
                <AlertTriangle className="mx-auto h-10 w-10 text-destructive mb-4" aria-hidden="true" />
                {/*
                  The tone is the icon above; the message is `text-foreground`.
                  On `PageShell`'s `bg-muted` surface `text-destructive` is
                  4.44 : 1 — under AA (admissions-v2 task 11.5, R16.2) — and an
                  icon is a non-text graphic held to 3 : 1, which it clears.
                */}
                <p className="text-foreground font-medium text-lg">{error}</p>
                <Button 
                  onClick={() => refetch()} 
                  variant="outline" 
                  className="mt-4 text-destructive border-destructive/30 hover:bg-destructive/5"
                >
                  Try again
                </Button>
              </div>
            ) : intakes.length === 0 ? (
              <div className="text-center py-8 sm:py-16">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Calendar className="h-10 w-10" aria-hidden="true" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">No intakes yet</h2>
                <p className="text-foreground mb-6 max-w-md mx-auto">
                  Create admission intakes to define application periods, deadlines, and capacity for student enrollment.
                </p>
                <Button onClick={openCreate}>
                  <Plus className="h-5 w-5 mr-2" aria-hidden="true" />
                  Create first intake
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
                    // A deadline is **data**, not an alarm (admissions-v2 task
                    // 11.5, R16.4). This date was printed in `text-destructive`
                    // for every intake, including ones with months to run — a
                    // colour-alone signal that said "problem" unconditionally —
                    // and on `PageShell`'s `bg-muted` surface #dc2626 measures
                    // 4.44 : 1, which is under AA. axe flagged it on every row of
                    // the desktop table. The column header already says
                    // "Deadline"; the utilization badge beside it is where a
                    // tone belongs.
                    render: (_value, row) => (
                      <span className="text-sm font-medium text-foreground">
                        {formatDate(row.application_deadline)}
                      </span>
                    ),
                  },
                  {
                    key: 'max_capacity',
                    header: 'Capacity',
                    priority: 'desktop',
                    // `text-primary` #2563eb on a 10 % wash of itself is
                    // 4.48 : 1 — axe called it `[serious] color-contrast` on
                    // every record in this list (admissions-v2 task 11.5, R16.2).
                    // The tint stays; the number is `text-foreground`.
                    render: (_value, row) => (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-sm font-medium text-foreground">
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
                      const { bg, text, label, tone } = getUtilizationColor(enrollment, row.max_capacity)
                      const Icon = getUtilizationIcon(tone)
                      return (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-medium ${bg} ${text}`}
                          title={label}
                          aria-label={`${enrollment} of ${row.max_capacity} enrolled — ${label}`}
                        >
                          <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>{enrollment}/{row.max_capacity}</span>
                        </span>
                      )
                    },
                  },
                  {
                    id: 'available_capacity',
                    key: 'max_capacity' as keyof Intake,
                    header: 'Available',
                    priority: 'always',
                    render: (_value, row) => {
                      const available = Math.max(row.max_capacity - (row.current_enrollment ?? 0), 0)
                      // `text-destructive-foreground` is **white**, and it was
                      // being painted on a 10 % destructive wash over white — a
                      // full intake printed its seat count at roughly 1.1 : 1,
                      // which is invisible (admissions-v2 task 11.5, R16.2). The
                      // tone belongs to the fill and the border; the number is
                      // `text-foreground`, the same correction `StatusPill` and
                      // `StatusBadge` took.
                      return (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-sm font-medium text-foreground ${
                          available > 0 ? 'border-border/60 bg-accent/40' : 'border-destructive/40 bg-destructive/10'
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
            <DialogTitle>Create intake</DialogTitle>
            <DialogDescription>Enter intake details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(createIntake)}>
            <IntakeFormFields register={register} errors={errors} />
            {mutationError && showCreate && (
              <p className="text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md px-3 py-2 mb-4" role="alert">
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
            <DialogTitle>Edit intake</DialogTitle>
            <DialogDescription>Update intake details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(updateIntake)}>
            <IntakeFormFields register={register} errors={errors} />
            {mutationError && showEdit && (
              <p className="text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md px-3 py-2 mb-4" role="alert">
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
            <DialogTitle>Delete intake</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{currentIntake?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {mutationError && showDelete && (
            <p className="text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md px-3 py-2" role="alert">
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
