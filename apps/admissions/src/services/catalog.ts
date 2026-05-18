import { apiClient, buildQueryString, type QueryParams } from './client'
import { logApiError } from '@/lib/apiErrorLogger'
import { logger } from '@/lib/logger'

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
  description?: string
  institution?: RawInstitution | null
  institution_id?: string
  duration_years?: number
  duration_months?: number
  application_fee?: number | string
  requirements?: Record<string, unknown> | null
  is_active?: boolean
}

type RawIntake = {
  id: string
  name: string
  year: number
  start_date?: string
  end_date?: string
  application_start_date?: string
  application_deadline: string
  max_capacity?: number
  current_enrollment?: number
  is_active?: boolean
}

type RawSubject = {
  id: string
  name: string
  code?: string
  category?: string
  is_core?: boolean
  curriculum_type?: string
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
  max_capacity: number
  current_enrollment?: number
  is_active?: boolean
}

export interface Subject {
  id: string
  name: string
  code?: string
  category?: string
  curriculum_type?: string
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

type RawPaginatedCollection<T> = {
  results?: T[]
  count?: number
  totalCount?: number
  page?: number
  pageSize?: number
}

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
  if (!record || typeof record !== 'object') {
    return null
  }

  const missing: string[] = []
  if (!record.id) missing.push('id')
  if (!record.name) missing.push('name')
  if (missing.length > 0) {
    logger.warn(
      `[catalog] normalizeInstitution: missing required fields [${missing.join(', ')}]`,
      { keys: Object.keys(record) }
    )
    if (!record.id) return null
  }

  const description =
    'description' in record && typeof record.description === 'string'
      ? record.description
      : typeof record.type === 'string' && record.type !== 'Institution'
        ? record.type
        : ''

  return {
    id: record.id,
    name: record.name || '',
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
  if (!record || typeof record !== 'object') {
    return null
  }

  const missing: string[] = []
  if (!record.id) missing.push('id')
  if (!record.name) missing.push('name')
  if (missing.length > 0) {
    logger.warn(
      `[catalog] normalizeProgram: missing required fields [${missing.join(', ')}]`,
      { keys: Object.keys(record) }
    )
    if (!record.id) return null
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
        : typeof record.description === 'string'
          ? record.description
          : ''

  const institution = normalizeInstitution('institution' in record ? record.institution : null)
  const durationYears =
    typeof record.duration_years === 'number'
      ? record.duration_years
      : typeof (record as RawProgram).duration_months === 'number'
        ? Number(((record as RawProgram).duration_months! / 12).toFixed(1))
        : 0

  return {
    id: record.id,
    name: record.name || '',
    description: summary,
    duration_years: durationYears,
    institution_id: record.institution_id ?? institution?.id ?? '',
    institutions: institution,
    is_active: record.is_active,
    code: record.code,
    application_fee: toNumber(record.application_fee, 0),
    requirements,
  }
}

function normalizeIntake(record: RawIntake | Intake | null | undefined): Intake | null {
  if (!record || typeof record !== 'object') {
    return null
  }

  const missing: string[] = []
  if (!record.id) missing.push('id')
  if (!record.name) missing.push('name')
  if (missing.length > 0) {
    logger.warn(
      `[catalog] normalizeIntake: missing required fields [${missing.join(', ')}]`,
      { keys: Object.keys(record) }
    )
    if (!record.id) return null
  }

  if ('max_capacity' in record && typeof record.max_capacity === 'number') {
    return record as Intake
  }

  const rawRecord = record as RawIntake
  const deadline = rawRecord.application_deadline
  const startDate = rawRecord.start_date || rawRecord.application_start_date || deadline
  const endDate = rawRecord.end_date || deadline

  return {
    id: record.id,
    name: record.name || '',
    year: record.year,
    start_date: startDate,
    end_date: endDate,
    application_deadline: deadline,
    max_capacity: toNumber(record.max_capacity, 0),
    current_enrollment: toNumber(record.current_enrollment, 0),
    is_active: record.is_active,
  }
}

function normalizeSubject(record: RawSubject | Subject | null | undefined): Subject | null {
  if (!record || typeof record !== 'object') {
    return null
  }

  const missing: string[] = []
  if (!record.id) missing.push('id')
  if (!record.name) missing.push('name')
  if (missing.length > 0) {
    logger.warn(
      `[catalog] normalizeSubject: missing required fields [${missing.join(', ')}]`,
      { keys: Object.keys(record) }
    )
    if (!record.id) return null
  }

  if ('is_active' in record && !('is_core' in record)) {
    return record as Subject
  }

  return {
    id: record.id,
    name: record.name || '',
    code: record.code,
    category: record.category,
    curriculum_type: 'curriculum_type' in record ? record.curriculum_type : undefined,
    is_active:
      'is_core' in record
        ? record.is_core ?? true
        : 'is_active' in record
          ? record.is_active ?? true
          : true,
  }
}

function normalizeCollection<T>(
  response: T[] | RawPaginatedCollection<T> | Record<string, unknown> | null | undefined,
  key: CollectionKey,
  normalizeItem: (item: T | null | undefined) => unknown
): unknown[] {
  let rawItems: T[]

  if (Array.isArray(response)) {
    rawItems = response
  } else if (Array.isArray((response as RawPaginatedCollection<T> | undefined)?.results)) {
    rawItems = (response as RawPaginatedCollection<T>).results as T[]
  } else if (Array.isArray((response as Record<string, unknown> | undefined)?.[key])) {
    rawItems = (response as Record<string, unknown>)[key] as T[]
  } else if (response != null && typeof response === 'object' && !Array.isArray(response)) {
    // Defensive fallback: extract the first array-valued property from an unexpected shape
    const firstArrayProp = Object.values(response).find((v) => Array.isArray(v)) as T[] | undefined
    if (firstArrayProp) {
      logger.warn(
        `[catalog] normalizeCollection: unexpected response shape for "${key}". ` +
        `Expected array, {results}, or {${key}} but got keys: [${Object.keys(response).join(', ')}]. ` +
        `Using fallback array property.`
      )
      rawItems = firstArrayProp
    } else {
      if (Object.keys(response).length > 0) {
        logger.warn(
          `[catalog] normalizeCollection: non-null response for "${key}" yielded no items. ` +
          `Response keys: [${Object.keys(response).join(', ')}]`
        )
      }
      rawItems = []
    }
  } else {
    rawItems = []
  }

  return rawItems
    .map((item) => normalizeItem(item))
    .filter(Boolean) as unknown[]
}

function normalizeProgramsResponse(
  response: RawProgram[] | ProgramCollectionResponse | RawPaginatedCollection<RawProgram> | null | undefined
): ProgramCollectionResponse {
  return {
    programs: normalizeCollection(response, 'programs', normalizeProgram) as Program[],
  }
}

function normalizeIntakesResponse(
  response: RawIntake[] | IntakeCollectionResponse | RawPaginatedCollection<RawIntake> | null | undefined
): IntakeCollectionResponse {
  return {
    intakes: normalizeCollection(response, 'intakes', normalizeIntake) as Intake[],
  }
}

function normalizeSubjectsResponse(
  response: RawSubject[] | SubjectCollectionResponse | RawPaginatedCollection<RawSubject> | null | undefined
): SubjectCollectionResponse {
  return {
    subjects: normalizeCollection(response, 'subjects', normalizeSubject) as Subject[],
  }
}

function normalizeInstitutionsResponse(
  response: RawInstitution[] | InstitutionCollectionResponse | RawPaginatedCollection<RawInstitution> | null | undefined
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
  tuition_fee?: string | number
  regulatory_body?: string
  accreditation_status?: string
}

export type IntakeFormData = {
  id?: string
  name: string
  year: number
  semester?: string
  start_date: string
  end_date: string
  application_deadline: string
  max_capacity: number
}

type InstitutionFormData = {
  id?: string
  name: string
  full_name?: string
  code?: string
  description?: string
  is_active?: boolean
  address?: string
  phone?: string
  email?: string
  website?: string
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
    duration_months: Math.max(0, Math.round(data.duration_years * 12)),
    application_fee: toNumber(existing?.application_fee, 0),
    requirements: data.description
      ? { ...existingRequirements, summary: data.description }
      : existingRequirements,
    is_active: existing?.is_active ?? true,
    ...(data.tuition_fee ? { tuition_fee: Number(data.tuition_fee) } : {}),
    ...(data.regulatory_body ? { regulatory_body: data.regulatory_body } : {}),
    ...(data.accreditation_status ? { accreditation_status: data.accreditation_status } : {}),
  }
}

function buildIntakePayload(data: IntakeFormData, existing?: RawIntake | null) {
  return {
    name: data.name,
    year: data.year,
    ...(data.semester ? { semester: data.semester } : {}),
    start_date: data.start_date,
    end_date: data.end_date,
    application_start_date: data.start_date,
    application_deadline: data.application_deadline,
    max_capacity: data.max_capacity,
    is_active: existing?.is_active ?? true,
  }
}

function buildInstitutionPayload(data: InstitutionFormData, existing?: RawInstitution | null) {
  return {
    name: data.name,
    full_name: data.full_name || data.name,
    code: existing?.code ?? data.code ?? generateCatalogCode(data.name, 'INS'),
    type: existing?.type || 'Institution',
    accreditation_status: existing?.accreditation_status || 'active',
    is_active: data.is_active ?? existing?.is_active ?? true,
    description: data.description ?? '',
    ...(data.address ? { address: data.address } : {}),
    ...(data.phone ? { phone: data.phone } : {}),
    ...(data.email ? { email: data.email } : {}),
    ...(data.website ? { website: data.website } : {}),
  }
}

export const catalogService = {
  getPrograms: async (params?: QueryParams): Promise<ProgramCollectionResponse> => {
    const query = buildQueryString(params ?? {})
    const endpoint = `/catalog/programs/${query}`
    try {
      return normalizeProgramsResponse(
        await apiClient.request<RawProgram[] | ProgramCollectionResponse | RawPaginatedCollection<RawProgram>>(endpoint)
      )
    } catch (error) {
      logApiError('catalog', endpoint, error)
      throw error
    }
  },

  /** Get programs available for a specific intake (uses program_intakes junction). */
  getProgramsForIntake: async (intakeId: string): Promise<ProgramCollectionResponse> => {
    try {
      return normalizeProgramsResponse(
        await apiClient.request<RawProgram[] | ProgramCollectionResponse | RawPaginatedCollection<RawProgram>>(
          `/catalog/programs/?intake=${encodeURIComponent(intakeId)}`
        )
      )
    } catch (error) {
      logApiError('catalog', `/catalog/programs/?intake=${intakeId}`, error)
      throw error
    }
  },

  getIntakes: async (): Promise<IntakeCollectionResponse> => {
    try {
      return normalizeIntakesResponse(
        await apiClient.request<RawIntake[] | IntakeCollectionResponse | RawPaginatedCollection<RawIntake>>('/catalog/intakes/')
      )
    } catch (error) {
      logApiError('catalog', '/catalog/intakes/', error)
      throw error
    }
  },

  getSubjects: async (): Promise<SubjectCollectionResponse> => {
    try {
      return normalizeSubjectsResponse(
        await apiClient.request<RawSubject[] | SubjectCollectionResponse | RawPaginatedCollection<RawSubject>>('/catalog/subjects/')
      )
    } catch (error) {
      logApiError('catalog', '/catalog/subjects/', error)
      throw error
    }
  },

  getInstitutions: async (): Promise<InstitutionCollectionResponse> => {
    try {
      return normalizeInstitutionsResponse(
        await apiClient.request<RawInstitution[] | InstitutionCollectionResponse | RawPaginatedCollection<RawInstitution>>('/catalog/institutions/')
      )
    } catch (error) {
      logApiError('catalog', '/catalog/institutions/', error)
      throw error
    }
  },
}

export const programService = {
  list: (params?: QueryParams) => catalogService.getPrograms(params),

  create: async (data: ProgramFormData): Promise<ProgramMutationResponse> => {
    try {
      return normalizeProgramMutationResponse(
        await apiClient.request<RawProgram | ProgramMutationResponse>('/catalog/programs/', {
          method: 'POST',
          body: JSON.stringify(buildProgramPayload(data)),
        })
      )
    } catch (error) {
      logApiError('catalog', 'POST /catalog/programs/', error)
      throw error
    }
  },

  update: async (data: ProgramFormData): Promise<ProgramMutationResponse> => {
    if (!data.id) {
      throw new Error('Program ID is required')
    }

    try {
      const existing = await getCurrentProgram(data.id)

      return normalizeProgramMutationResponse(
        await apiClient.request<RawProgram | ProgramMutationResponse>(`/catalog/programs/${encodeURIComponent(data.id)}/`, {
          method: 'PATCH',
          body: JSON.stringify(buildProgramPayload(data, existing)),
        })
      )
    } catch (error) {
      logApiError('catalog', `PATCH /catalog/programs/${data.id}/`, error)
      throw error
    }
  },

  delete: async (id: string) => {
    try {
      return await apiClient.request<void>(`/catalog/programs/${encodeURIComponent(id)}/`, {
        method: 'DELETE',
      })
    } catch (error) {
      logApiError('catalog', `DELETE /catalog/programs/${id}/`, error)
      throw error
    }
  },
}

export const intakeService = {
  list: () => catalogService.getIntakes(),

  create: async (data: IntakeFormData): Promise<IntakeMutationResponse> => {
    try {
      return normalizeIntakeMutationResponse(
        await apiClient.request<RawIntake | IntakeMutationResponse>('/catalog/intakes/', {
          method: 'POST',
          body: JSON.stringify(buildIntakePayload(data)),
        })
      )
    } catch (error) {
      logApiError('catalog', 'POST /catalog/intakes/', error)
      throw error
    }
  },

  update: async (data: IntakeFormData): Promise<IntakeMutationResponse> => {
    if (!data.id) {
      throw new Error('Intake ID is required')
    }

    try {
      return normalizeIntakeMutationResponse(
        await apiClient.request<RawIntake | IntakeMutationResponse>(`/catalog/intakes/${encodeURIComponent(data.id)}/`, {
          method: 'PATCH',
          body: JSON.stringify(buildIntakePayload(data)),
        })
      )
    } catch (error) {
      logApiError('catalog', `PATCH /catalog/intakes/${data.id}/`, error)
      throw error
    }
  },

  delete: async (id: string) => {
    try {
      return await apiClient.request<void>(`/catalog/intakes/${encodeURIComponent(id)}/`, {
        method: 'DELETE',
      })
    } catch (error) {
      logApiError('catalog', `DELETE /catalog/intakes/${id}/`, error)
      throw error
    }
  },
}

export const institutionService = {
  list: () => catalogService.getInstitutions(),

  create: async (data: InstitutionFormData): Promise<InstitutionMutationResponse> => {
    try {
      return normalizeInstitutionMutationResponse(
        await apiClient.request<RawInstitution | InstitutionMutationResponse>('/catalog/institutions/', {
          method: 'POST',
          body: JSON.stringify(buildInstitutionPayload(data)),
        })
      )
    } catch (error) {
      logApiError('catalog', 'POST /catalog/institutions/', error)
      throw error
    }
  },

  update: async (data: InstitutionFormData): Promise<InstitutionMutationResponse> => {
    if (!data.id) {
      throw new Error('Institution ID is required')
    }

    try {
      const existing = await getCurrentInstitution(data.id)

      return normalizeInstitutionMutationResponse(
        await apiClient.request<RawInstitution | InstitutionMutationResponse>(`/catalog/institutions/${encodeURIComponent(data.id)}/`, {
          method: 'PATCH',
          body: JSON.stringify(buildInstitutionPayload(data, existing)),
        })
      )
    } catch (error) {
      logApiError('catalog', `PATCH /catalog/institutions/${data.id}/`, error)
      throw error
    }
  },

  delete: async (id: string) => {
    try {
      return await apiClient.request<void>(`/catalog/institutions/${encodeURIComponent(id)}/`, {
        method: 'DELETE',
      })
    } catch (error) {
      logApiError('catalog', `DELETE /catalog/institutions/${id}/`, error)
      throw error
    }
  },
}

// Exported for property testing
export {
  normalizeProgram,
  normalizeIntake,
  normalizeSubject,
  normalizeInstitution,
  normalizeProgramsResponse,
  normalizeIntakesResponse,
  normalizeSubjectsResponse,
  normalizeInstitutionsResponse,
  buildIntakePayload,
}
