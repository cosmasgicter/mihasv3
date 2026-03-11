import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { institutionService, programService } from '@/services/catalog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CanonicalSelect } from '@/components/ui/CanonicalSelect'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  Building2,
  GraduationCap,
  Pencil,
  Plus,
  School,
  Trash2,
} from 'lucide-react'
import { PageShell } from '@/components/ui/PageShell'

interface Institution {
  id: string
  name: string
  full_name?: string
  code?: string
  description?: string
  is_active?: boolean
}

interface Program {
  id: string
  name: string
  description?: string
  duration_years: number
  institution_id: string
  is_active?: boolean
  institutions?: Institution | null
}

type CatalogTab = 'programs' | 'institutions'
type InstitutionStatus = 'active' | 'archived'
type ProgramDialogTarget = 'create-program' | 'edit-program' | null

const initialProgramForm = {
  name: '',
  description: '',
  duration_years: 1,
  institution_id: '',
}

const initialInstitutionForm = {
  name: '',
  full_name: '',
  code: '',
  description: '',
  status: 'active' as InstitutionStatus,
}

function isInstitutionActive(institution: Institution) {
  return institution.is_active !== false
}

function getInstitutionDisplayName(institution: Institution) {
  return institution.full_name?.trim() || institution.name
}

function getInstitutionOptionLabel(institution: Institution) {
  const name = getInstitutionDisplayName(institution)
  return institution.code ? `${name} (${institution.code})` : name
}

export default function AdminPrograms() {
  const [activeTab, setActiveTab] = useState<CatalogTab>('programs')
  const [programs, setPrograms] = useState<Program[]>([])
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [showProgramCreate, setShowProgramCreate] = useState(false)
  const [showProgramEdit, setShowProgramEdit] = useState(false)
  const [showProgramDelete, setShowProgramDelete] = useState(false)
  const [currentProgram, setCurrentProgram] = useState<Program | null>(null)
  const [programForm, setProgramForm] = useState(initialProgramForm)

  const [showInstitutionCreate, setShowInstitutionCreate] = useState(false)
  const [showInstitutionEdit, setShowInstitutionEdit] = useState(false)
  const [showInstitutionDelete, setShowInstitutionDelete] = useState(false)
  const [currentInstitution, setCurrentInstitution] = useState<Institution | null>(null)
  const [institutionForm, setInstitutionForm] = useState(initialInstitutionForm)
  const [institutionCreateReturnTarget, setInstitutionCreateReturnTarget] = useState<ProgramDialogTarget>(null)

  const activeInstitutions = institutions.filter(isInstitutionActive)

  const loadCatalog = useCallback(async (showLoadingState = false) => {
    try {
      if (showLoadingState) {
        setLoading(true)
      }

      setError('')

      const [programResponse, institutionResponse] = await Promise.all([
        programService.list(),
        institutionService.list(),
      ])

      const sortedPrograms = (programResponse?.programs || []).sort((a: Program, b: Program) =>
        a.name.localeCompare(b.name)
      )
      const sortedInstitutions = (institutionResponse?.institutions || []).sort(
        (a: Institution, b: Institution) => getInstitutionDisplayName(a).localeCompare(getInstitutionDisplayName(b))
      )

      setPrograms(sortedPrograms)
      setInstitutions(sortedInstitutions)
    } catch (err: any) {
      setError(err.message || 'Failed to load catalog')
    } finally {
      if (showLoadingState) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadCatalog(true)
  }, [loadCatalog])

  const getInstitutionProgramCount = useCallback(
    (institutionId: string) =>
      programs.filter((program) => program.institution_id === institutionId && program.is_active !== false).length,
    [programs]
  )

  const handleProgramFieldChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target
      setProgramForm((current) => ({
        ...current,
        [name]: name === 'duration_years' ? Number(value) : value,
      }))
    },
    []
  )

  const handleInstitutionFieldChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target
      setInstitutionForm((current) => ({
        ...current,
        [name]: value,
      }))
    },
    []
  )

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value === 'institutions' ? 'institutions' : 'programs')
    setError('')
  }, [])

  const openProgramCreate = useCallback(() => {
    if (activeInstitutions.length === 0) {
      setActiveTab('institutions')
      setInstitutionCreateReturnTarget(null)
      setInstitutionForm(initialInstitutionForm)
      setShowInstitutionCreate(true)
      setError('Create an institution before adding programs.')
      return
    }

    setError('')
    setCurrentProgram(null)
    setProgramForm({
      ...initialProgramForm,
      institution_id: activeInstitutions[0]?.id || '',
    })
    setShowProgramCreate(true)
  }, [activeInstitutions])

  const openProgramEdit = useCallback((program: Program) => {
    setError('')
    setCurrentProgram(program)
    setProgramForm({
      name: program.name,
      description: program.description || '',
      duration_years: program.duration_years,
      institution_id: program.institution_id,
    })
    setShowProgramEdit(true)
  }, [])

  const openProgramDelete = useCallback((program: Program) => {
    setError('')
    setCurrentProgram(program)
    setShowProgramDelete(true)
  }, [])

  const openInstitutionCreate = useCallback((returnTarget: ProgramDialogTarget = null) => {
    setError('')
    setCurrentInstitution(null)
    setInstitutionCreateReturnTarget(returnTarget)
    setInstitutionForm(initialInstitutionForm)
    setShowInstitutionCreate(true)
  }, [])

  const openInstitutionEdit = useCallback((institution: Institution) => {
    setError('')
    setCurrentInstitution(institution)
    setInstitutionForm({
      name: institution.name,
      full_name: institution.full_name || '',
      code: institution.code || '',
      description: institution.description || '',
      status: isInstitutionActive(institution) ? 'active' : 'archived',
    })
    setShowInstitutionEdit(true)
  }, [])

  const openInstitutionDelete = useCallback((institution: Institution) => {
    setError('')
    setCurrentInstitution(institution)
    setShowInstitutionDelete(true)
  }, [])

  const openInstitutionCreateFromProgram = useCallback((target: Exclude<ProgramDialogTarget, null>) => {
    setError('')
    setCurrentInstitution(null)
    setInstitutionCreateReturnTarget(target)
    setInstitutionForm(initialInstitutionForm)
    if (target === 'create-program') {
      setShowProgramCreate(false)
    } else {
      setShowProgramEdit(false)
    }
    setShowInstitutionCreate(true)
  }, [])

  const handleOperation = async (operation: () => Promise<void>, onSuccess: () => void) => {
    try {
      setSaving(true)
      setError('')
      await operation()
      onSuccess()
      await loadCatalog(false)
    } catch (err: any) {
      setError(err.message || 'Unable to save changes')
    } finally {
      setSaving(false)
    }
  }

  const createProgram = () => {
    if (!programForm.name.trim()) {
      setError('Program name is required')
      return
    }
    if (!programForm.institution_id) {
      setError('Institution is required')
      return
    }
    if (programForm.duration_years < 1 || programForm.duration_years > 10) {
      setError('Duration must be between 1 and 10 years')
      return
    }

    void handleOperation(
      async () => {
        await programService.create({
          name: programForm.name.trim(),
          description: programForm.description.trim(),
          duration_years: programForm.duration_years,
          institution_id: programForm.institution_id,
        })
      },
      () => {
        setShowProgramCreate(false)
        setProgramForm(initialProgramForm)
      }
    )
  }

  const updateProgram = () => {
    if (!currentProgram) {
      return
    }
    if (!programForm.name.trim()) {
      setError('Program name is required')
      return
    }
    if (!programForm.institution_id) {
      setError('Institution is required')
      return
    }
    if (programForm.duration_years < 1 || programForm.duration_years > 10) {
      setError('Duration must be between 1 and 10 years')
      return
    }

    void handleOperation(
      async () => {
        await programService.update({
          id: currentProgram.id,
          name: programForm.name.trim(),
          description: programForm.description.trim(),
          duration_years: programForm.duration_years,
          institution_id: programForm.institution_id,
        })
      },
      () => {
        setShowProgramEdit(false)
        setCurrentProgram(null)
      }
    )
  }

  const deleteProgram = () => {
    if (!currentProgram) {
      return
    }

    void handleOperation(
      async () => {
        await programService.delete(currentProgram.id)
      },
      () => {
        setShowProgramDelete(false)
        setCurrentProgram(null)
      }
    )
  }

  const createInstitution = () => {
    const name = institutionForm.name.trim()
    const returnTarget = institutionCreateReturnTarget

    if (!name) {
      setError('Institution name is required')
      return
    }

    void handleOperation(
      async () => {
        const response = await institutionService.create({
          name,
          full_name: institutionForm.full_name.trim() || name,
          code: institutionForm.code.trim() || undefined,
          description: institutionForm.description.trim() || undefined,
        })

        const createdInstitution = response?.institution
        if (createdInstitution?.id) {
          setProgramForm((current) => ({
            ...current,
            institution_id: createdInstitution.id,
          }))
        }
      },
      () => {
        setShowInstitutionCreate(false)
        setInstitutionCreateReturnTarget(null)
        setInstitutionForm(initialInstitutionForm)
        if (returnTarget === 'create-program') {
          setShowProgramCreate(true)
        }
        if (returnTarget === 'edit-program') {
          setShowProgramEdit(true)
        }
      }
    )
  }

  const updateInstitution = () => {
    if (!currentInstitution) {
      return
    }

    const name = institutionForm.name.trim()

    if (!name) {
      setError('Institution name is required')
      return
    }

    void handleOperation(
      async () => {
        await institutionService.update({
          id: currentInstitution.id,
          name,
          full_name: institutionForm.full_name.trim() || name,
          code: institutionForm.code.trim() || undefined,
          description: institutionForm.description.trim() || undefined,
          is_active: institutionForm.status === 'active',
        })
      },
      () => {
        setShowInstitutionEdit(false)
        setCurrentInstitution(null)
      }
    )
  }

  const deleteInstitution = () => {
    if (!currentInstitution) {
      return
    }

    void handleOperation(
      async () => {
        await institutionService.delete(currentInstitution.id)
      },
      () => {
        setShowInstitutionDelete(false)
        setCurrentInstitution(null)
      }
    )
  }

  const totalPrograms = programs.length
  const totalInstitutions = institutions.length
  const archivedInstitutions = institutions.filter((institution) => !isInstitutionActive(institution)).length
  const currentInstitutionProgramCount = currentInstitution ? getInstitutionProgramCount(currentInstitution.id) : 0

  const renderProgramGrid = () => {
    if (programs.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-14 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
            <GraduationCap className="h-10 w-10" />
          </div>
          <h3 className="text-2xl font-bold text-foreground">No Programs Yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Build the institution catalog first, then add the academic programs students can apply for.
          </p>
          <div className="mt-6 flex justify-center">
            <Button onClick={activeInstitutions.length > 0 ? openProgramCreate : () => openInstitutionCreate()}>
              <Plus className="h-4 w-4 mr-2" />
              {activeInstitutions.length > 0 ? 'Create First Program' : 'Create Institution First'}
            </Button>
          </div>
        </div>
      )
    }

    return (
      <ResponsiveTable<Program>
        columns={[
          {
            key: 'name',
            header: 'Program',
            priority: 'always',
            render: (_value, row) => (
              <span className="font-semibold text-foreground">{row.name}</span>
            ),
          },
          {
            key: 'institution_id',
            header: 'Institution',
            priority: 'always',
            render: (_value, row) => (
              <Badge variant="secondary">
                {row.institutions?.name || 'Unknown institution'}
              </Badge>
            ),
          },
          {
            key: 'duration_years',
            header: 'Duration',
            priority: 'desktop',
            render: (_value, row) => (
              <span className="text-sm text-muted-foreground">
                {row.duration_years} year{row.duration_years !== 1 ? 's' : ''}
              </span>
            ),
          },
          {
            key: 'description',
            header: 'Description',
            priority: 'desktop',
            render: (_value, row) => (
              <div className="max-w-sm truncate text-sm text-muted-foreground">
                {row.description || 'No description provided yet.'}
              </div>
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
                  onClick={(e) => { e.stopPropagation(); openProgramEdit(row) }}
                  aria-label={`Edit ${row.name}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  <span className="md:hidden ml-1">Edit</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); openProgramDelete(row) }}
                  className="text-destructive border-destructive/30 hover:bg-destructive/5"
                  aria-label={`Archive ${row.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span className="md:hidden ml-1">Archive</span>
                </Button>
              </div>
            ),
          },
        ]}
        data={programs}
        caption="Academic programs"
        loading={false}
      />
    )
  }

  const renderInstitutionGrid = () => {
    if (institutions.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-14 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="h-10 w-10" />
          </div>
          <h3 className="text-2xl font-bold text-foreground">No Institutions Yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Add institutions here first so program setup, admissions routing, and student applications stay aligned.
          </p>
          <div className="mt-6 flex justify-center">
            <Button onClick={() => openInstitutionCreate()}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Institution
            </Button>
          </div>
        </div>
      )
    }

    return (
      <ResponsiveTable<Institution>
        columns={[
          {
            key: 'name',
            header: 'Institution',
            priority: 'always',
            render: (_value, row) => (
              <div>
                <div className="font-semibold text-foreground">{row.name}</div>
                {row.full_name && row.full_name !== row.name ? (
                  <div className="text-xs text-muted-foreground">{row.full_name}</div>
                ) : null}
              </div>
            ),
          },
          {
            key: 'code',
            header: 'Code',
            priority: 'desktop',
            render: (_value, row) => (
              <span className="text-sm text-muted-foreground">{row.code || '—'}</span>
            ),
          },
          {
            key: 'is_active',
            header: 'Status',
            priority: 'always',
            render: (_value, row) => {
              const archived = !isInstitutionActive(row)
              return (
                <Badge variant={archived ? 'outline' : 'success'}>
                  {archived ? 'Archived' : 'Active'}
                </Badge>
              )
            },
          },
          {
            key: 'id',
            header: 'Active Programs',
            priority: 'desktop',
            render: (_value, row) => (
              <span className="text-sm text-muted-foreground">
                {getInstitutionProgramCount(row.id)}
              </span>
            ),
          },
          {
            key: 'description',
            header: 'Description',
            priority: 'desktop',
            render: (_value, row) => (
              <div className="max-w-sm truncate text-sm text-muted-foreground">
                {row.description || 'No institution summary provided yet.'}
              </div>
            ),
          },
          {
            key: 'full_name',
            header: 'Actions',
            priority: 'always',
            render: (_value, row) => {
              const archived = !isInstitutionActive(row)
              const activeProgramCount = getInstitutionProgramCount(row.id)
              return (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); openInstitutionEdit(row) }}
                    aria-label={`Edit ${row.name}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    <span className="md:hidden ml-1">Edit</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); openInstitutionDelete(row) }}
                    disabled={archived || activeProgramCount > 0}
                    className="text-destructive border-destructive/30 hover:bg-destructive/5"
                    aria-label={`Archive ${row.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span className="md:hidden ml-1">Archive</span>
                  </Button>
                </div>
              )
            },
          },
        ]}
        data={institutions}
        caption="Institutions"
        loading={false}
      />
    )
  }

  const primaryActionLabel =
    activeTab === 'institutions' || activeInstitutions.length === 0 ? 'Add Institution' : 'Add Program'
  const primaryActionHandler =
    activeTab === 'institutions' || activeInstitutions.length === 0
      ? () => openInstitutionCreate()
      : openProgramCreate

  return (
    <PageShell
      title="Programs & Institutions"
      subtitle="Manage the academic catalog and the institutions that own each program."
      maxWidth="7xl"
      actions={
        <div className="flex items-center gap-2">
          <Link to="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <Button onClick={primaryActionHandler}>
            <Plus className="h-4 w-4 mr-2" />
            {primaryActionLabel}
          </Button>
        </div>
      }
    >
          <div className="space-y-6">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="text-center">
                  <UnifiedLoader variant="page" label="Loading catalog..." />
                </div>
              </div>
            ) : (
              <>
                {error ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">Catalog action needs attention</p>
                        <p className="text-sm">{error}</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => void loadCatalog(false)}
                        className="border-destructive/30 text-destructive hover:bg-destructive/5"
                      >
                        Reload Catalog
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
                    <CardHeader className="pb-3">
                      <CardDescription>Total Programs</CardDescription>
                      <CardTitle className="flex items-center gap-2 text-3xl">
                        <GraduationCap className="h-6 w-6 text-primary" />
                        {totalPrograms}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Active application options configured across the platform.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
                    <CardHeader className="pb-3">
                      <CardDescription>Institutions</CardDescription>
                      <CardTitle className="flex items-center gap-2 text-3xl">
                        <Building2 className="h-6 w-6 text-primary" />
                        {totalInstitutions}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Institutions available for program assignment and admissions routing.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
                    <CardHeader className="pb-3">
                      <CardDescription>Archived Institutions</CardDescription>
                      <CardTitle className="flex items-center gap-2 text-3xl">
                        <School className="h-6 w-6 text-primary" />
                        {archivedInstitutions}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Archived institutions stay visible for admin clean-up and controlled reactivation.
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="programs">Programs</TabsTrigger>
                    <TabsTrigger value="institutions">Institutions</TabsTrigger>
                  </TabsList>

                  <TabsContent value="programs" className="space-y-6">
                    {activeInstitutions.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold">Programs need an institution first</p>
                            <p className="text-sm text-amber-800">
                              Create at least one active institution before adding or reassigning programs.
                            </p>
                          </div>
                          <Button onClick={() => openInstitutionCreate()}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Institution
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {renderProgramGrid()}
                  </TabsContent>

                  <TabsContent value="institutions" className="space-y-6">
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                      <p className="text-sm font-semibold text-foreground">Institution management rules</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Institutions can be edited or archived here. Archiving is blocked while active programs still point to the institution.
                      </p>
                    </div>

                    {renderInstitutionGrid()}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>

      <Dialog open={showProgramCreate} onOpenChange={setShowProgramCreate}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Create Program</DialogTitle>
            <DialogDescription>Add the academic program details and assign it to an institution.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input label="Program name" name="name" value={programForm.name} onChange={handleProgramFieldChange} required />
            <CanonicalSelect
              label="Institution"
              value={programForm.institution_id}
              onChange={(value) => setProgramForm((current) => ({ ...current, institution_id: value }))}
              placeholder="Select an institution"
              options={activeInstitutions.map((institution) => ({
                value: institution.id,
                label: getInstitutionOptionLabel(institution),
              }))}
              required
            />
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="text-sm text-muted-foreground">Need a new institution before saving this program?</p>
              <Button variant="ghost" size="sm" onClick={() => openInstitutionCreateFromProgram('create-program')}>
                <Plus className="h-4 w-4 mr-1" />
                Add institution
              </Button>
            </div>
            <Textarea
              label="Program description"
              name="description"
              value={programForm.description}
              onChange={handleProgramFieldChange}
              helperText="Use this to clarify the course focus for admissions teams and applicants."
            />
            <Input
              label="Duration (years)"
              type="number"
              min={1}
              max={10}
              name="duration_years"
              value={programForm.duration_years}
              onChange={handleProgramFieldChange}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProgramCreate(false)} disabled={saving}>Cancel</Button>
            <Button onClick={createProgram} loading={saving}>Create Program</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showProgramEdit} onOpenChange={setShowProgramEdit}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit Program</DialogTitle>
            <DialogDescription>Update the academic program details and institution ownership.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input label="Program name" name="name" value={programForm.name} onChange={handleProgramFieldChange} required />
            <CanonicalSelect
              label="Institution"
              value={programForm.institution_id}
              onChange={(value) => setProgramForm((current) => ({ ...current, institution_id: value }))}
              placeholder="Select an institution"
              options={activeInstitutions.map((institution) => ({
                value: institution.id,
                label: getInstitutionOptionLabel(institution),
              }))}
              required
            />
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="text-sm text-muted-foreground">Need to register a missing institution first?</p>
              <Button variant="ghost" size="sm" onClick={() => openInstitutionCreateFromProgram('edit-program')}>
                <Plus className="h-4 w-4 mr-1" />
                Add institution
              </Button>
            </div>
            <Textarea
              label="Program description"
              name="description"
              value={programForm.description}
              onChange={handleProgramFieldChange}
              helperText="Use this to clarify the course focus for admissions teams and applicants."
            />
            <Input
              label="Duration (years)"
              type="number"
              min={1}
              max={10}
              name="duration_years"
              value={programForm.duration_years}
              onChange={handleProgramFieldChange}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProgramEdit(false)} disabled={saving}>Cancel</Button>
            <Button onClick={updateProgram} loading={saving}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showProgramDelete} onOpenChange={setShowProgramDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Program</DialogTitle>
            <DialogDescription>
              Archive "{currentProgram?.name}" to remove it from active admissions setup while keeping historical records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProgramDelete(false)} disabled={saving}>Cancel</Button>
            <Button variant="danger" onClick={deleteProgram} loading={saving}>Archive Program</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInstitutionCreate} onOpenChange={(open) => {
        setShowInstitutionCreate(open)
        if (!open) {
          setInstitutionCreateReturnTarget(null)
        }
      }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Create Institution</DialogTitle>
            <DialogDescription>Add the institution first so programs can be assigned to it immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              label="Institution name"
              name="name"
              value={institutionForm.name}
              onChange={handleInstitutionFieldChange}
              helperText="Use the short operational name used throughout the system."
              required
            />
            <Input
              label="Full name"
              name="full_name"
              value={institutionForm.full_name}
              onChange={handleInstitutionFieldChange}
              helperText="Optional, but recommended for formal reports and applicant-facing labels."
            />
            <Input
              label="Institution code"
              name="code"
              value={institutionForm.code}
              onChange={handleInstitutionFieldChange}
              helperText="Short internal code such as MIHAS."
            />
            <Textarea
              label="Description"
              name="description"
              value={institutionForm.description}
              onChange={handleInstitutionFieldChange}
              helperText="Briefly describe the institution for admins managing programs and applications."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInstitutionCreate(false)} disabled={saving}>Cancel</Button>
            <Button onClick={createInstitution} loading={saving}>Create Institution</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInstitutionEdit} onOpenChange={setShowInstitutionEdit}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit Institution</DialogTitle>
            <DialogDescription>Update institution details and control whether it stays active in the admissions catalog.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              label="Institution name"
              name="name"
              value={institutionForm.name}
              onChange={handleInstitutionFieldChange}
              helperText="Use the short operational name used throughout the system."
              required
            />
            <Input
              label="Full name"
              name="full_name"
              value={institutionForm.full_name}
              onChange={handleInstitutionFieldChange}
              helperText="Optional, but recommended for formal reports and applicant-facing labels."
            />
            <Input
              label="Institution code"
              name="code"
              value={institutionForm.code}
              onChange={handleInstitutionFieldChange}
              helperText="Short internal code such as MIHAS."
            />
            <Textarea
              label="Description"
              name="description"
              value={institutionForm.description}
              onChange={handleInstitutionFieldChange}
              helperText="Briefly describe the institution for admins managing programs and applications."
            />
            <CanonicalSelect
              label="Status"
              value={institutionForm.status}
              onChange={(value) =>
                setInstitutionForm((current) => ({
                  ...current,
                  status: value === 'archived' ? 'archived' : 'active',
                }))
              }
              options={[
                { value: 'active', label: 'Active' },
                { value: 'archived', label: 'Archived' },
              ]}
              helperText="Archived institutions remain visible to admins but should not receive new programs."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInstitutionEdit(false)} disabled={saving}>Cancel</Button>
            <Button onClick={updateInstitution} loading={saving}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInstitutionDelete} onOpenChange={setShowInstitutionDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Institution</DialogTitle>
            <DialogDescription>
              {currentInstitution ? (
                <>
                  Archive "{currentInstitution.name}" once there are no active programs still linked to it.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {currentInstitutionProgramCount > 0 ? (
              <>
                This institution still has {currentInstitutionProgramCount} active program{currentInstitutionProgramCount !== 1 ? 's' : ''}.
                Reassign or archive those programs before archiving the institution.
              </>
            ) : (
              <>The institution will be removed from active program assignment but stay available for historical admin records.</>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInstitutionDelete(false)} disabled={saving}>Cancel</Button>
            <Button
              variant="danger"
              onClick={deleteInstitution}
              loading={saving}
              disabled={saving || currentInstitutionProgramCount > 0 || !currentInstitution || !isInstitutionActive(currentInstitution)}
            >
              Archive Institution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
