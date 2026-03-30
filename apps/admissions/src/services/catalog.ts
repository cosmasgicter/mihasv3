import { apiClient } from './client'

type RawInstitution = {
  id: string
  name: string
  full_name?: string
  code?: string
  type?: string
  accreditation_status?: string
  is_active?: boolean
}

type RawProgram = {
  id: string
  name: string
  code?: string
  institution?: RawInstitution | null
  institution_id?: string
  duration_years: number
  application_fee?: number | string
  requirements?: Record<string, unknown> | null
  is_active?: boolean
}

type RawIntake = {
  id: string
  name: string
  year: number
  application_deadline: string
  max_capacity?: number
  is_active?: boolean
}

type RawSubject = {
  id: string
  name: string
  code?: string
  category?: string
  is_core?: boolean
}

export interface Institution {
  id: string
  name: string
  full_name?: string
  code?: string
  description?: string
  is_active?: boolean
  type?: string
  accreditation_status?: string
}

export interface Program {
  id: string
  name: string
  description?: string
  duration_years: number
  institution_id: string
  institutions?: Institution | null
  is_active?: boolean
  code?: string
  application_fee?: number
  requirements?: Record<string, unknown>
}

export interface Intake {
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

export interface Subject {
  id: string
  name: string
  code?: string
  category?: string
  is_active?: boolean
}

type ProgramCollectionResponse = { programs: Program[] }
type IntakeCollectionResponse = { intakes: Intake[] }
type SubjectCollectionResponse = { subjects: Subject[] }
type InstitutionCollectionResponse = { institutions: Institution[] }

type ProgramMutationResponse = { program: Program | null }
type IntakeMutationResponse = { intake: Intake | null }
type InstitutionMutationResponse = { institution: Institution | null }

type CollectionKey = 'programs' | 'intakes' | 'subjects' | 'institutions'

function generateCatalogCode(name: string, prefix: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12)

  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${slug || 'ITEM'}-${suffix}`
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeInstitution(record: RawInstitution | Institution | null | undefined): Institution | null {
  if (!record) {
    return null
  }

  const description =
    'description' in record && typeof record.description === 'string'
      ? record.description
      : typeof record.type === 'string' && record.type !== 'Institution'
        ? record.type
        : ''

  return {
    id: record.id,
    name: record.name,
    full_name: record.full_name,
    code: record.code,
    description,
    is_active: record.is_active,
    type: 'type' in record ? record.type : undefined,
    accreditation_status:
      'accreditation_status' in record ? record.accreditation_status : undefined,
  }
}

function normalizeProgram(record: RawProgram | Program | null | undefined): Program | null {
  if (!record) {
    return null
  }

  if ('institutions' in record) {
    return record
  }

  const requirements =
    record.requirements && typeof record.requirements === 'object'
      ? record.requirements
      : {}

  const summary =
    typeof requirements.summary === 'string'
      ? requirements.summary
      : typeof requirements.description === 'string'
        ? requirements.description
        : ''

  const institution = normalizeInstitution('institution' in record ? record.institution : null)

  return {
    id: record.id,
    name: record.name,
    description: summary,
    duration_years: record.duration_years,
    institution_id: record.institution_id ?? institution?.id ?? '',
    institutions: institution,
    is_active: record.is_active,
    code: record.code,
    application_fee: toNumber(record.application_fee, 0),
    requirements,
  }
}

function normalizeIntake(record: RawIntake | Intake | null | undefined): Intake | null {
  if (!record) {
    return null
  }

  if ('total_capacity' in record) {
    return record
  }

  const deadline = record.application_deadline

  return {
    id: record.id,
    name: record.name,
    year: record.year,
    start_date: deadline,
    end_date: deadline,
    application_deadline: deadline,
    total_capacity: toNumber(record.max_capacity, 0),
    available_spots: toNumber(record.max_capacity, 0),
    is_active: record.is_active,
  }
}

function normalizeSubject(record: RawSubject | Subject | null | undefined): Subject | null {
  if (!record) {
    return null
  }

  if ('is_active' in record) {
    return record
  }

  return {
    id: record.id,
    name: record.name,
    code: record.code,
    category: record.category,
    is_active:
      'is_core' in record
        ? record.is_core ?? true
        : 'is_active' in record
          ? record.is_active ?? true
          : true,
  }
}

function normalizeCollection<T>(
  response: T[] | Record<string, unknown> | null | undefined,
  key: CollectionKey,
  normalizeItem: (item: T | null | undefined) => unknown
): unknown[] {
  const rawItems = Array.isArray(response)
    ? response
    : Array.isArray(response?.[key])
      ? (response[key] as T[])
      : []

  return rawItems
    .map((item) => normalizeItem(item))
    .filter(Boolean) as unknown[]
}

function normalizeProgramsResponse(
  response: RawProgram[] | ProgramCollectionResponse | null | undefined
): ProgramCollectionResponse {
  return {
    programs: normalizeCollection(response, 'programs', normalizeProgram) as Program[],
  }
}

function normalizeIntakesResponse(
  response: RawIntake[] | IntakeCollectionResponse | null | undefined
): IntakeCollectionResponse {
  return {
    intakes: normalizeCollection(response, 'intakes', normalizeIntake) as Intake[],
  }
}

function normalizeSubjectsResponse(
  response: RawSubject[] | SubjectCollectionResponse | null | undefined
): SubjectCollectionResponse {
  return {
    subjects: normalizeCollection(response, 'subjects', normalizeSubject) as Subject[],
  }
}

function normalizeInstitutionsResponse(
  response: RawInstitution[] | InstitutionCollectionResponse | null | undefined
): InstitutionCollectionResponse {
  return {
    institutions: normalizeCollection(response, 'institutions', normalizeInstitution) as Institution[],
  }
}

function normalizeProgramMutationResponse(
  response: RawProgram | ProgramMutationResponse | null | undefined
): ProgramMutationResponse {
  const program = normalizeProgram(
    response && typeof response === 'object' && 'program' in response
      ? response.program as RawProgram | Program | null | undefined
      : response as RawProgram | Program | null | undefined
  )

  return { program }
}

function normalizeIntakeMutationResponse(
  response: RawIntake | IntakeMutationResponse | null | undefined
): IntakeMutationResponse {
  const intake = normalizeIntake(
    response && typeof response === 'object' && 'intake' in response
      ? response.intake as RawIntake | Intake | null | undefined
      : response as RawIntake | Intake | null | undefined
  )

  return { intake }
}

function normalizeInstitutionMutationResponse(
  response: RawInstitution | InstitutionMutationResponse | null | undefined
): InstitutionMutationResponse {
  const institution = normalizeInstitution(
    response && typeof response === 'object' && 'institution' in response
      ? response.institution as RawInstitution | Institution | null | undefined
      : response as RawInstitution | Institution | null | undefined
  )

  return { institution }
}

type ProgramFormData = {
  id?: string
  name: string
  description?: string
  duration_years: number
  institution_id: string
}

type IntakeFormData = {
  id?: string
  name: string
  year: number
  start_date: string
  end_date: string
  application_deadline: string
  total_capacity: number
  available_spots?: number
}

type InstitutionFormData = {
  id?: string
  name: string
  full_name?: string
  code?: string
  description?: string
  is_active?: boolean
}

async function getCurrentProgram(id: string): Promise<RawProgram | null> {
  return apiClient.request<RawProgram>(`/catalog/programs/${encodeURIComponent(id)}/`)
}

async function getCurrentInstitution(id: string): Promise<RawInstitution | null> {
  return apiClient.request<RawInstitution>(`/catalog/institutions/${encodeURIComponent(id)}/`)
}

function buildProgramPayload(data: ProgramFormData, existing?: RawProgram | null) {
  const existingRequirements =
    existing?.requirements && typeof existing.requirements === 'object'
      ? existing.requirements
      : {}

  return {
    name: data.name,
    code: existing?.code ?? generateCatalogCode(data.name, 'PRG'),
    institution_id: data.institution_id,
    duration_years: data.duration_years,
    application_fee: toNumber(existing?.application_fee, 0),
    requirements: data.description
      ? { ...existingRequirements, summary: data.description }
      : existingRequirements,
    is_active: existing?.is_active ?? true,
  }
}

function buildIntakePayload(data: IntakeFormData, existing?: RawIntake | null) {
  return {
    name: data.name,
    year: data.year,
    application_deadline: data.application_deadline,
    max_capacity: data.total_capacity,
    is_active: existing?.is_active ?? true,
  }
}

function buildInstitutionPayload(data: InstitutionFormData, existing?: RawInstitution | null) {
  return {
    name: data.name,
    full_name: data.full_name || data.name,
    code: existing?.code ?? data.code ?? generateCatalogCode(data.name, 'INS'),
    type: data.description?.trim() || existing?.type || 'Institution',
    accreditation_status: existing?.accreditation_status || 'active',
    is_active: data.is_active ?? existing?.is_active ?? true,
  }
}

export const catalogService = {
  getPrograms: async (): Promise<ProgramCollectionResponse> =>
    normalizeProgramsResponse(
      await apiClient.request<RawProgram[] | ProgramCollectionResponse>('/catalog/programs/')
    ),

  getIntakes: async (): Promise<IntakeCollectionResponse> =>
    normalizeIntakesResponse(
      await apiClient.request<RawIntake[] | IntakeCollectionResponse>('/catalog/intakes/')
    ),

  getSubjects: async (): Promise<SubjectCollectionResponse> =>
    normalizeSubjectsResponse(
      await apiClient.request<RawSubject[] | SubjectCollectionResponse>('/catalog/subjects/')
    ),

  getInstitutions: async (): Promise<InstitutionCollectionResponse> =>
    normalizeInstitutionsResponse(
      await apiClient.request<RawInstitution[] | InstitutionCollectionResponse>('/catalog/institutions/')
    ),
}

export const programService = {
  list: () => catalogService.getPrograms(),

  create: async (data: ProgramFormData): Promise<ProgramMutationResponse> =>
    normalizeProgramMutationResponse(
      await apiClient.request<RawProgram | ProgramMutationResponse>('/catalog/programs/', {
        method: 'POST',
        body: JSON.stringify(buildProgramPayload(data)),
      })
    ),

  update: async (data: ProgramFormData): Promise<ProgramMutationResponse> => {
    if (!data.id) {
      throw new Error('Program ID is required')
    }

    const existing = await getCurrentProgram(data.id)

    return normalizeProgramMutationResponse(
      await apiClient.request<RawProgram | ProgramMutationResponse>(`/catalog/programs/${encodeURIComponent(data.id)}/`, {
        method: 'PUT',
        body: JSON.stringify(buildProgramPayload(data, existing)),
      })
    )
  },

  delete: (id: string) =>
    apiClient.request<void>(`/catalog/programs/${encodeURIComponent(id)}/`, {
      method: 'DELETE',
    }),
}

export const intakeService = {
  list: () => catalogService.getIntakes(),

  create: async (data: IntakeFormData): Promise<IntakeMutationResponse> =>
    normalizeIntakeMutationResponse(
      await apiClient.request<RawIntake | IntakeMutationResponse>('/catalog/intakes/', {
        method: 'POST',
        body: JSON.stringify(buildIntakePayload(data)),
      })
    ),

  update: async (data: IntakeFormData): Promise<IntakeMutationResponse> => {
    if (!data.id) {
      throw new Error('Intake ID is required')
    }

    return normalizeIntakeMutationResponse(
      await apiClient.request<RawIntake | IntakeMutationResponse>(`/catalog/intakes/${encodeURIComponent(data.id)}/`, {
        method: 'PUT',
        body: JSON.stringify(buildIntakePayload(data)),
      })
    )
  },

  delete: (id: string) =>
    apiClient.request<void>(`/catalog/intakes/${encodeURIComponent(id)}/`, {
      method: 'DELETE',
    }),
}

export const institutionService = {
  list: () => catalogService.getInstitutions(),

  create: async (data: InstitutionFormData): Promise<InstitutionMutationResponse> =>
    normalizeInstitutionMutationResponse(
      await apiClient.request<RawInstitution | InstitutionMutationResponse>('/catalog/institutions/', {
        method: 'POST',
        body: JSON.stringify(buildInstitutionPayload(data)),
      })
    ),

  update: async (data: InstitutionFormData): Promise<InstitutionMutationResponse> => {
    if (!data.id) {
      throw new Error('Institution ID is required')
    }

    const existing = await getCurrentInstitution(data.id)

    return normalizeInstitutionMutationResponse(
      await apiClient.request<RawInstitution | InstitutionMutationResponse>(`/catalog/institutions/${encodeURIComponent(data.id)}/`, {
        method: 'PUT',
        body: JSON.stringify(buildInstitutionPayload(data, existing)),
      })
    )
  },

  delete: (id: string) =>
    apiClient.request<void>(`/catalog/institutions/${encodeURIComponent(id)}/`, {
      method: 'DELETE',
    }),
}
