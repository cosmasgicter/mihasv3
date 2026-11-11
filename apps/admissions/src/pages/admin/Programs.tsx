import { useCallback, useReducer } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { catalogService } from '@/services/catalog'
import { catalogAdminService } from '@/services/admin/catalog'
import { Button } from '@/components/ui/Button'
import { DashboardSkeleton } from '@/components/ui'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  GraduationCap,
  Plus,
  School,
} from 'lucide-react'
import { PageShell } from '@/components/ui/PageShell'
import { Seo } from '@/components/seo/Seo'
import {
  programsReducer,
  initialProgramsState,
} from './lib/programsReducer'
import type { Program, Institution } from './lib/programsReducer'
import { ProgramDialogs } from '@/components/admin/programs/ProgramDialogs'
import { InstitutionDialogs } from '@/components/admin/programs/InstitutionDialogs'
import { ProgramsTable } from '@/components/admin/programs/ProgramsTable'
import { InstitutionsTable } from '@/components/admin/programs/InstitutionsTable'
import {
  programFormSchema,
  institutionFormSchema,
  defaultProgramForm,
  defaultInstitutionForm,
} from '@/components/admin/programs/programFormSchemas'
import type { ProgramFormData, InstitutionFormData } from '@/components/admin/programs/programFormSchemas'

function isInstitutionActive(institution: Institution) {
  return institution.is_active !== false
}

/** Generate a unique offering code from the offering name (Program.code is unique). */
function generateOfferingCode(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12)
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `OFR-${slug || 'PROGRAM'}-${suffix}`
}

function getInstitutionDisplayName(institution: Institution) {
  return institution.full_name?.trim() || institution.name
}

export default function AdminPrograms() {
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(programsReducer, initialProgramsState)

  const programForm = useForm<ProgramFormData>({
    resolver: zodResolver(programFormSchema),
    defaultValues: defaultProgramForm,
  })

  const institutionForm = useForm<InstitutionFormData>({
    resolver: zodResolver(institutionFormSchema),
    defaultValues: defaultInstitutionForm,
  })

  const { data: catalogData, isLoading: loading } = useQuery({
    queryKey: ['admin', 'catalog'],
    queryFn: async () => {
      const [programResponse, institutionResponse, canonicalResponse] = await Promise.all([
        catalogService.getPrograms(),
        catalogService.getInstitutions(),
        catalogAdminService.listCanonicalPrograms(),
      ])

      const sortedPrograms = (programResponse?.programs || []).sort((a: Program, b: Program) =>
        a.name.localeCompare(b.name)
      )
      const sortedInstitutions = (institutionResponse?.institutions || []).sort(
        (a: Institution, b: Institution) => getInstitutionDisplayName(a).localeCompare(getInstitutionDisplayName(b))
      )
      const sortedCanonical = [...(canonicalResponse || [])].sort((a, b) => a.name.localeCompare(b.name))

      return { programs: sortedPrograms, institutions: sortedInstitutions, canonicalPrograms: sortedCanonical }
    },
  })

  const programs = catalogData?.programs || []
  const institutions = catalogData?.institutions || []
  const canonicalPrograms = catalogData?.canonicalPrograms || []
  const activeInstitutions = institutions.filter(isInstitutionActive)

  const invalidateCatalog = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] })
  }, [queryClient])

  const getInstitutionProgramCount = useCallback(
    (institutionId: string) =>
      programs.filter((program) => program.institution_id === institutionId && program.is_active !== false).length,
    [programs]
  )

  const handleTabChange = useCallback((value: string) => {
    dispatch({ type: 'SET_TAB', payload: value === 'institutions' ? 'institutions' : 'programs' })
  }, [])

  const openProgramCreate = useCallback(() => {
    if (activeInstitutions.length === 0) {
      dispatch({ type: 'SET_TAB', payload: 'institutions' })
      institutionForm.reset(defaultInstitutionForm)
      dispatch({ type: 'OPEN_INSTITUTION_CREATE' })
      dispatch({ type: 'SET_ERROR', payload: 'Create an institution before adding programmes.' })
      return
    }

    programForm.reset({
      ...defaultProgramForm,
      institution_id: activeInstitutions[0]?.id || '',
    })
    dispatch({ type: 'OPEN_PROGRAM_CREATE' })
  }, [activeInstitutions, programForm, institutionForm])

  const openProgramEdit = useCallback((program: Program) => {
    programForm.reset({
      name: program.name,
      canonical_program_id: program.canonical_program_id || '',
      description: program.description || '',
      duration_years: program.duration_years,
      institution_id: program.institution_id,
      tuition_fee: program.tuition_fee || '',
      regulatory_body: program.regulatory_body || '',
      accreditation_status: program.accreditation_status || 'active',
    })
    dispatch({ type: 'OPEN_PROGRAM_EDIT', program })
  }, [programForm])

  const openProgramDelete = useCallback((program: Program) => {
    dispatch({ type: 'OPEN_PROGRAM_DELETE', program })
  }, [])

  const openInstitutionCreate = useCallback(() => {
    institutionForm.reset(defaultInstitutionForm)
    dispatch({ type: 'OPEN_INSTITUTION_CREATE' })
  }, [institutionForm])

  const openInstitutionEdit = useCallback((institution: Institution) => {
    institutionForm.reset({
      name: institution.name,
      full_name: institution.full_name || '',
      code: institution.code || '',
      description: institution.description || '',
      status: isInstitutionActive(institution) ? 'active' : 'archived',
      address: institution.address || '',
      phone: institution.phone || '',
      email: institution.email || '',
      website: institution.website || '',
    })
    dispatch({ type: 'OPEN_INSTITUTION_EDIT', institution })
  }, [institutionForm])

  const openInstitutionDelete = useCallback((institution: Institution) => {
    dispatch({ type: 'OPEN_INSTITUTION_DELETE', institution })
  }, [])

  const openInstitutionCreateFromProgram = useCallback((target: 'create-program' | 'edit-program') => {
    institutionForm.reset(defaultInstitutionForm)
    dispatch({ type: 'OPEN_INSTITUTION_CREATE_FROM_PROGRAM', target })
  }, [institutionForm])

  const handleOperation = async (operation: () => Promise<void>, onSuccess: () => void) => {
    try {
      dispatch({ type: 'SET_SAVING', payload: true })
      dispatch({ type: 'SET_ERROR', payload: '' })
      await operation()
      onSuccess()
      invalidateCatalog()
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Unable to save changes' })
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false })
    }
  }

  // Canonical offering write helpers (R7.1, TEN-03). Programs are created as
  // Institution_Program_Offerings that reference a Canonical_Program; the
  // backend rejects a write without `canonical_program_id`. Offering fields map
  // to duration_months + the offering's own tuition/regulatory/requirements.
  const buildOfferingFields = (values: ProgramFormData) => ({
    canonical_program_id: values.canonical_program_id,
    name: values.name.trim(),
    duration_months: Math.max(1, Math.round(values.duration_years * 12)),
    ...(values.tuition_fee ? { tuition_fee: Number(values.tuition_fee) } : {}),
    ...(values.regulatory_body ? { regulatory_body: values.regulatory_body } : {}),
    ...(values.accreditation_status ? { accreditation_status: values.accreditation_status } : {}),
    ...(values.description?.trim() ? { requirements: { summary: values.description.trim() } } : {}),
  })

  const createProgram = programForm.handleSubmit((values) => {
    void handleOperation(
      async () => {
        await catalogAdminService.createOffering(values.institution_id, {
          ...buildOfferingFields(values),
          code: generateOfferingCode(values.name),
          offering_status: 'active',
        })
      },
      () => {
        dispatch({ type: 'CLOSE_PROGRAM_CREATE' })
        programForm.reset(defaultProgramForm)
      }
    )
  })

  const updateProgram = programForm.handleSubmit((values) => {
    if (!state.currentProgram) return

    void handleOperation(
      async () => {
        await catalogAdminService.updateOffering(
          values.institution_id,
          state.currentProgram!.id,
          buildOfferingFields(values),
        )
      },
      () => {
        dispatch({ type: 'CLOSE_PROGRAM_EDIT' })
      }
    )
  })

  const deleteProgram = () => {
    if (!state.currentProgram) return

    void handleOperation(
      async () => {
        await catalogAdminService.deactivateOffering(
          state.currentProgram!.institution_id,
          state.currentProgram!.id,
        )
      },
      () => {
        dispatch({ type: 'CLOSE_PROGRAM_DELETE' })
      }
    )
  }

  const createInstitution = institutionForm.handleSubmit((values) => {
    const name = values.name.trim()

    void handleOperation(
      async () => {
        const created = await catalogAdminService.createInstitution({
          name,
          full_name: values.full_name?.trim() || name,
          code: values.code?.trim() || undefined,
          description: values.description?.trim() || undefined,
          address: values.address?.trim() || undefined,
          phone: values.phone?.trim() || undefined,
          email: values.email?.trim() || undefined,
          website: values.website?.trim() || undefined,
        })

        if (created?.id) {
          programForm.setValue('institution_id', created.id)
        }
      },
      () => {
        dispatch({ type: 'INSTITUTION_CREATED_RETURN' })
        institutionForm.reset(defaultInstitutionForm)
      }
    )
  })

  const updateInstitution = institutionForm.handleSubmit((values) => {
    if (!state.currentInstitution) return

    const name = values.name.trim()

    void handleOperation(
      async () => {
        await catalogAdminService.updateInstitution(state.currentInstitution!.id, {
          name,
          full_name: values.full_name?.trim() || name,
          code: values.code?.trim() || undefined,
          description: values.description?.trim() || undefined,
          is_active: values.status === 'active',
          address: values.address?.trim() || undefined,
          phone: values.phone?.trim() || undefined,
          email: values.email?.trim() || undefined,
          website: values.website?.trim() || undefined,
        })
      },
      () => {
        dispatch({ type: 'CLOSE_INSTITUTION_EDIT' })
      }
    )
  })

  const deleteInstitution = () => {
    if (!state.currentInstitution) return

    void handleOperation(
      async () => {
        await catalogAdminService.deactivateInstitution(state.currentInstitution!.id)
      },
      () => {
        dispatch({ type: 'CLOSE_INSTITUTION_DELETE' })
      }
    )
  }

  const totalPrograms = programs.length
  const totalInstitutions = institutions.length
  const archivedInstitutions = institutions.filter((i) => !isInstitutionActive(i)).length
  const currentInstitutionProgramCount = state.currentInstitution
    ? getInstitutionProgramCount(state.currentInstitution.id)
    : 0

  const primaryActionLabel =
    state.activeTab === 'institutions' || activeInstitutions.length === 0 ? 'Add institution' : 'Add programme'
  const primaryActionHandler =
    state.activeTab === 'institutions' || activeInstitutions.length === 0
      ? openInstitutionCreate
      : openProgramCreate

  return (
    <>
      <Seo
        title="Programmes & Intakes | Beanola Admissions"
        description="Manage academic programmes, institutions, and intake configurations."
        path="/admin/programs"
        noindex
      />
      <PageShell
        title="Programmes & Institutions"
        eyebrow="Academic catalog"
        subtitle="Manage the academic catalog and the institutions that own each programme."
        maxWidth="7xl"
        tone="admin"
        /*
          No `metrics` row (task 11.5, R16.5). `totalPrograms` and
          `totalInstitutions` are still rendered — once, in the page's own
          summary block below — so these two tiles were a second copy of the same
          two numbers in the first viewport. The other two were a tile whose
          value was the label of a button in this header and a tile reading the
          page's loading/error state.
        */
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Link to="/admin" className="w-full sm:w-auto">
              <Button variant="ghost" size="sm" className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <Button onClick={primaryActionHandler} className="w-full sm:w-auto">
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
                <DashboardSkeleton />
              </div>
            </div>
          ) : (
            <>
              {state.error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">Catalog action needs attention</p>
                      <p className="text-sm">{state.error}</p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => invalidateCatalog()}
                      className="border-destructive/30 text-destructive hover:bg-destructive/5"
                    >
                      Reload catalog
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-3">
                <Card className="rounded-lg border-border/60 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardDescription>Total programmes</CardDescription>
                    <CardTitle className="flex items-center gap-2 text-3xl tracking-tight">
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

                <Card className="rounded-lg border-border/60 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardDescription>Institutions</CardDescription>
                    <CardTitle className="flex items-center gap-2 text-3xl tracking-tight">
                      <Building2 className="h-6 w-6 text-primary" />
                      {totalInstitutions}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Institutions available for programme assignment and admissions routing.
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-lg border-border/60 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardDescription>Archived institutions</CardDescription>
                    <CardTitle className="flex items-center gap-2 text-3xl tracking-tight">
                      <School className="h-6 w-6 text-muted-foreground" />
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

              <Tabs value={state.activeTab} onValueChange={handleTabChange} className="space-y-6">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="programs">Programmes</TabsTrigger>
                  <TabsTrigger value="institutions">Institutions</TabsTrigger>
                </TabsList>

                <TabsContent value="programs" className="space-y-6">
                  {activeInstitutions.length === 0 ? (
                    <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-foreground">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                          <div>
                            <p className="font-semibold text-foreground">Programmes need an institution first</p>
                            <p className="text-sm text-muted-foreground">
                              Create at least one active institution before adding or reassigning programmes.
                            </p>
                          </div>
                        </div>
                        <Button onClick={openInstitutionCreate}>
                          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                          Add institution
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <ProgramsTable
                    programs={programs}
                    activeInstitutions={activeInstitutions}
                    onEdit={openProgramEdit}
                    onDelete={openProgramDelete}
                    onCreateProgram={openProgramCreate}
                    onCreateInstitution={openInstitutionCreate}
                  />
                </TabsContent>

                <TabsContent value="institutions" className="space-y-6">
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm font-semibold text-foreground">Institution management rules</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Institutions can be edited or archived here. Archiving is blocked while active programmes still point to the institution.
                    </p>
                  </div>

                  <InstitutionsTable
                    institutions={institutions}
                    getInstitutionProgramCount={getInstitutionProgramCount}
                    onEdit={openInstitutionEdit}
                    onDelete={openInstitutionDelete}
                    onCreate={openInstitutionCreate}
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        <ProgramDialogs
          showCreate={state.showProgramCreate}
          showEdit={state.showProgramEdit}
          showDelete={state.showProgramDelete}
          currentProgram={state.currentProgram}
          saving={state.saving}
          form={programForm}
          activeInstitutions={activeInstitutions}
          canonicalPrograms={canonicalPrograms}
          onCloseCreate={() => dispatch({ type: 'CLOSE_PROGRAM_CREATE' })}
          onCloseEdit={() => dispatch({ type: 'CLOSE_PROGRAM_EDIT' })}
          onCloseDelete={() => dispatch({ type: 'CLOSE_PROGRAM_DELETE' })}
          onSubmitCreate={createProgram}
          onSubmitEdit={updateProgram}
          onDelete={deleteProgram}
          onAddInstitutionFromCreate={() => openInstitutionCreateFromProgram('create-program')}
          onAddInstitutionFromEdit={() => openInstitutionCreateFromProgram('edit-program')}
        />

        <InstitutionDialogs
          showCreate={state.showInstitutionCreate}
          showEdit={state.showInstitutionEdit}
          showDelete={state.showInstitutionDelete}
          currentInstitution={state.currentInstitution}
          currentInstitutionProgramCount={currentInstitutionProgramCount}
          saving={state.saving}
          form={institutionForm}
          onCloseCreate={() => dispatch({ type: 'CLOSE_INSTITUTION_CREATE' })}
          onCloseEdit={() => dispatch({ type: 'CLOSE_INSTITUTION_EDIT' })}
          onCloseDelete={() => dispatch({ type: 'CLOSE_INSTITUTION_DELETE' })}
          onSubmitCreate={createInstitution}
          onSubmitEdit={updateInstitution}
          onDelete={deleteInstitution}
          onOpenChangeCreate={(open) => {
            if (!open) dispatch({ type: 'CLOSE_INSTITUTION_CREATE' })
          }}
        />
      </PageShell>
    </>
  )
}
