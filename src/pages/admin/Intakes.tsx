import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { intakeService } from '@/services/catalog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Pencil, Trash2, Plus, ArrowLeft, Calendar, BarChart3, Target } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

interface Intake {
  id: string
  name: string
  year: number
  start_date: string
  end_date: string
  application_deadline: string
  total_capacity: number
  available_spots?: number
  is_active?: boolean
}

const intakeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  year: z.coerce.number().int().min(2000, 'Year is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  application_deadline: z.string().min(1, 'Application deadline is required'),
  total_capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
  available_spots: z.coerce.number().int().min(0, 'Available spots must be 0 or more'),
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
  .refine((data) => data.available_spots <= data.total_capacity, {
    message: 'Available spots cannot exceed total capacity',
    path: ['available_spots'],
  })

export type IntakeForm = z.infer<typeof intakeSchema>

const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'Invalid date'
  try {
    return new Date(dateString).toLocaleDateString()
  } catch {
    return 'Invalid date'
  }
}

const IntakeFormFields = ({ register, errors }: { register: any; errors: any }) => (
  <div className="space-y-4 py-4">
    <Input label="Name" {...register('name')} error={errors.name?.message} required />
    <Input label="Year" type="number" {...register('year')} error={errors.year?.message} required />
    <Input label="Start Date" type="date" {...register('start_date')} error={errors.start_date?.message} required />
    <Input label="End Date" type="date" {...register('end_date')} error={errors.end_date?.message} required />
    <Input label="Application Deadline" type="date" {...register('application_deadline')} error={errors.application_deadline?.message} required />
    <Input label="Total Capacity" type="number" {...register('total_capacity')} error={errors.total_capacity?.message} required />
    <Input label="Available Spots" type="number" {...register('available_spots')} error={errors.available_spots?.message} required />
  </div>
)

export default function AdminIntakes() {
  const [intakes, setIntakes] = useState<Intake[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [currentIntake, setCurrentIntake] = useState<Intake | null>(null)
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<IntakeForm>({
    resolver: zodResolver(intakeSchema),
    defaultValues: {
      name: '',
      year: new Date().getFullYear(),
      start_date: '',
      end_date: '',
      application_deadline: '',
      total_capacity: 0,
      available_spots: 0,
    },
  })

  useEffect(() => {
    loadIntakes()
  }, [])

  const loadIntakes = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await intakeService.list()
      // After unwrap, response is { intakes: Intake[] } directly
      const sortedIntakes = (response?.intakes || []).sort((a: Intake, b: Intake) => b.year - a.year)
      setIntakes(sortedIntakes)
    } catch (err: any) {
      setError(err.message || 'Failed to load intakes')
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    reset({
      name: '',
      year: new Date().getFullYear(),
      start_date: '',
      end_date: '',
      application_deadline: '',
      total_capacity: 0,
      available_spots: 0,
    })
    setShowCreate(true)
  }

  const openEdit = (intake: Intake) => {
    setCurrentIntake(intake)
    reset({
      name: intake.name,
      year: intake.year,
      start_date: intake.start_date,
      end_date: intake.end_date,
      application_deadline: intake.application_deadline,
      total_capacity: intake.total_capacity,
      available_spots: intake.available_spots,
    })
    setShowEdit(true)
  }

  const openDelete = (intake: Intake) => {
    setCurrentIntake(intake)
    setShowDelete(true)
  }

  const handleOperation = async (operation: () => any, onSuccess: () => void) => {
    try {
      setSaving(true)
      setError('')
      await operation()
      onSuccess()
      await loadIntakes()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const createIntake = (data: IntakeForm) => handleOperation(
    () => intakeService.create({
      name: data.name,
      year: data.year,
      start_date: data.start_date,
      end_date: data.end_date,
      application_deadline: data.application_deadline,
      total_capacity: data.total_capacity,
      available_spots: data.available_spots
    }),
    () => setShowCreate(false)
  )

  const updateIntake = (data: IntakeForm) => {
    if (!currentIntake) return
    handleOperation(
      () => intakeService.update({
        id: currentIntake.id,
        name: data.name,
        year: data.year,
        start_date: data.start_date,
        end_date: data.end_date,
        application_deadline: data.application_deadline,
        total_capacity: data.total_capacity,
        available_spots: data.available_spots
      }),
      () => {
        setShowEdit(false)
        setCurrentIntake(null)
      }
    )
  }

  const deleteIntake = () => {
    if (!currentIntake) return
    handleOperation(
      () => intakeService.delete(currentIntake.id),
      () => {
        setShowDelete(false)
        setCurrentIntake(null)
      }
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container-mobile py-4 sm:py-6 lg:py-8 safe-area-bottom">
        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          {/* Header - Mobile First */}
          <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 p-6 text-white">
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4">
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 border-white">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                </Link>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold"><Calendar className="w-5 h-5" /> Intakes</h1>
                  <p className="text-white/90 text-sm sm:text-base">Manage admission intakes</p>
                </div>
              </div>
              <Button 
                onClick={openCreate}
                className="bg-card text-secondary hover:bg-accent font-semibold shadow-lg"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Intake
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">

            {loading ? (
              <div className="flex justify-center py-8 sm:py-16">
                <div className="text-center">
                  <LoadingSpinner size="lg" />
                  <p className="mt-4 text-lg text-foreground">Loading intakes...</p>
                </div>
              </div>
            ) : error ? (
              <div className="rounded-xl bg-destructive/5 border border-destructive/30 p-6 text-center">
                <div className="text-6xl mb-4">😱</div>
                <p className="text-destructive font-medium text-lg">{error}</p>
                <Button 
                  onClick={loadIntakes} 
                  variant="outline" 
                  className="mt-4 text-destructive border-destructive/30 hover:bg-destructive/5"
                >
                  Try Again
                </Button>
              </div>
            ) : intakes.length === 0 ? (
              <div className="text-center py-8 sm:py-16">
                <div className="text-8xl mb-6"><Calendar className="w-5 h-5" /></div>
                <h3 className="text-2xl font-bold text-foreground mb-2">No Intakes Yet</h3>
                <p className="text-foreground mb-6 max-w-md mx-auto">
                  Create admission intakes to define application periods, deadlines, and capacity for student enrollment.
                </p>
                <Button onClick={openCreate} className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 text-white font-semibold">
                  <Plus className="h-5 w-5 mr-2" />
                  Create First Intake
                </Button>
              </div>
            ) : (
              <>
                {/* Mobile Cards View */}
                <div className="block lg:hidden space-y-4">
                  {intakes.map((intake) => (
                    <div key={intake.id} className="bg-muted rounded-xl p-4 border border-border">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-foreground">{intake.name}</h3>
                          <p className="text-sm text-foreground">Year: {intake.year}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          intake.available_spots > 0 ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'
                        }`}>
                          {intake.available_spots}/{intake.total_capacity} spots
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                        <div>
                          <span className="text-foreground">Start:</span>
                          <div className="font-medium">{formatDate(intake.start_date)}</div>
                        </div>
                        <div>
                          <span className="text-foreground">End:</span>
                          <div className="font-medium">{formatDate(intake.end_date)}</div>
                        </div>
                        <div className="col-span-2">
                          <span className="text-foreground">Application Deadline:</span>
                          <div className="font-medium text-destructive">{formatDate(intake.application_deadline)}</div>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => openEdit(intake)}
                          className="flex-1 text-primary border-blue-300 hover:bg-primary/5 min-h-[44px]"
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => openDelete(intake)}
                          className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/5 min-h-[44px]"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto -mx-6">
                  <div className="inline-block min-w-full px-6">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-gradient-to-r from-muted to-purple-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                          <Calendar className="w-5 h-5" /> Name
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                          📆 Year
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                          🟢 Start
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                          🔴 End
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                          ⏰ Deadline
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                          <BarChart3 className="w-5 h-5" /> Capacity
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                          <Target className="w-5 h-5" /> Available
                        </th>
                        <th className="px-6 py-4 text-right text-sm font-bold text-foreground uppercase tracking-wider">
                          ⚙️ Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {intakes.map((intake) => (
                        <tr key={intake.id} className="hover:bg-secondary/5 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-foreground">{intake.name}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-secondary/10 text-purple-800">
                              {intake.year}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-foreground">
                            {formatDate(intake.start_date)}
                          </td>
                          <td className="px-6 py-4 text-sm text-foreground">
                            {formatDate(intake.end_date)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-medium text-destructive">
                              {formatDate(intake.application_deadline)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary-foreground">
                              {intake.total_capacity}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                              intake.available_spots > 0 ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'
                            }`}>
                              {intake.available_spots}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => openEdit(intake)}
                                className="text-primary border-blue-300 hover:bg-primary/5"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => openDelete(intake)}
                                className="text-destructive border-destructive/30 hover:bg-destructive/5"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
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
    </div>
  )
}

