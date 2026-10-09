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
  canonical_program_id?: string
  duration_years?: number
  duration_months?: number
  application_fee?: number | string
  requirements?: Record<string, unknown> | null
  is_active?: boolean
  available_offerings?: RawProgram[]
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

type RawCatalogContext = {
  portal_type: 'shared' | 'white_label'
  institution_id?: string | null
  institution_code?: string | null
  brand: {
    name: string
    owner?: string
    primary_color?: string
    secondary_color?: string
    support_email?: string
    admissions_email?: string
  }
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
  canonical_program_id?: string
  institutions?: Institution | null
  is_active?: boolean
  code?: string
  application_fee?: number
  requirements?: Record<string, unknown>
  available_offerings?: Program[]
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

export interface CatalogContext {
  portal_type: 'shared' | 'white_label'
  institution_id: string | null
  institution_code?: string | null
  brand: RawCatalogContext['brand']
}

export interface AssignmentPreviewRequiredDocument {
  document_type: string
  label: string
  required: boolean
  rules: Record<string, unknown>
}

export interface AssignmentPreviewFee {
  amount: string
  currency: string
  residency_category: string
  source: string
}

export interface AssignmentPreviewContact {
  email?: string | null
  phone?: string | null
  website?: string | null
}

export interface AssignmentPreview {
  program_id: string
  intake_id: string
  program_offering_id: string
  institution_id: string
  assigned_school: {
    id: string
    name: string
    full_name?: string | null
    code?: string | null
  }
  program_name: string
  intake_name: string
  fee: AssignmentPreviewFee | null
  required_documents: AssignmentPreviewRequiredDocument[]
  contact: AssignmentPreviewContact
}

export interface AssignmentPreviewParams {
  programId: string
  intakeId: string
  nationality?: string | null
  country?: string | null
  institution?: string | null
}

type ProgramCollectionResponse = { programs: Program[] }
type IntakeCollectionResponse = { intakes: Intake[] }
type SubjectCollectionResponse = { subjects: Subject[] }
type InstitutionCollectionResponse = { institutions: Institution[] }

type ProgramMutationResponse = { program: Program | null }
// (`IntakeMutationResponse` / `InstitutionMutationResponse` deleted by task
//  12.5 with the legacy intake/institution writers that were their only users.)

// (`CollectionKey` deleted by task 12.2: it existed only to index the
//  `{programs|intakes|subjects|institutions: […]}` branch normalizeCollection
//  no longer has.)

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
    canonical_program_id: record.canonical_program_id,
    institutions: institution,
    is_active: record.is_active,
    code: record.code,
    application_fee: toNumber(record.application_fee, 0),
    requirements,
    available_offerings: Array.isArray(record.available_offerings)
      ? record.available_offerings.map(item => normalizeProgram(item)).filter(Boolean) as Program[]
      : 'available_offerings' in record && Array.isArray(record.available_offerings)
        ? record.available_offerings
        : undefined,
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

/**
 * Read the item list out of a catalog collection response.
 *
 * **This is a strict contract read, not a permissive normalizer** (task 12.2,
 * R14.5, finding API-02). Two shapes are accepted and both are real:
 *
 * - `{page, pageSize, totalCount, results}` — what every catalog list endpoint
 *   returns. `StandardPagination.page_size` is 20, so `paginate_queryset` never
 *   declines and this is the shape in practice.
 * - a bare array — the un-paginated branch each catalog view still carries
 *   (`return {"success": True, "data": serializer.data}` when the paginator
 *   declines). Kept because the *producer* still has it; the day the backend
 *   drops that branch this one goes with it.
 *
 * What was deleted, and why it could not be reached:
 *
 * - the `{programs: […]}` / `{intakes: […]}` / `{subjects: […]}` /
 *   `{institutions: […]}` domain-keyed branch. `apiClient.request` unwraps
 *   exactly one `{success, data}` level (`httpClient.unwrapApiResponse`), and no
 *   catalog view puts a domain key inside `data`.
 * - the "first array-valued property" fallback with its `logger.warn`. It could
 *   only fire on a shape no endpoint emits, and its effect was to *guess* which
 *   array was the list — a normalizer that invents a contract is worse than a
 *   parse failure, because the guess is silent.
 *
 * Both had **zero** first-party callers, measured by
 * `scripts/v1_surface_telemetry.py` (surface `normalizer.catalog.*`).
 */
function normalizeCollection<T>(
  response: T[] | RawPaginatedCollection<T> | null | undefined,
  normalizeItem: (item: T | null | undefined) => unknown
): unknown[] {
  const rawItems: T[] = Array.isArray(response)
    ? response
    : Array.isArray(response?.results)
      ? (response.results as T[])
      : []

  return rawItems
    .map((item) => normalizeItem(item))
    .filter(Boolean) as unknown[]
}

function normalizeProgramsResponse(
  response: RawProgram[] | RawPaginatedCollection<RawProgram> | null | undefined
): ProgramCollectionResponse {
  return {
    programs: normalizeCollection(response, normalizeProgram) as Program[],
  }
}

function normalizeIntakesResponse(
  response: RawIntake[] | RawPaginatedCollection<RawIntake> | null | undefined
): IntakeCollectionResponse {
  return {
    intakes: normalizeCollection(response, normalizeIntake) as Intake[],
  }
}

function normalizeSubjectsResponse(
  response: RawSubject[] | RawPaginatedCollection<RawSubject> | null | undefined
): SubjectCollectionResponse {
  return {
    subjects: normalizeCollection(response, normalizeSubject) as Subject[],
  }
}

function normalizeInstitutionsResponse(
  response: RawInstitution[] | RawPaginatedCollection<RawInstitution> | null | undefined
): InstitutionCollectionResponse {
  return {
    institutions: normalizeCollection(response, normalizeInstitution) as Institution[],
  }
}

// The three mutation readers below take the record the endpoint returns and map
// it to the domain type. Task 12.2 (R14.5) deleted the `'program' in response`
// / `'intake' in response` / `'institution' in response` pre-step each one had:
// it re-unwrapped a domain key out of a payload `apiClient.request` had ALREADY
// unwrapped one `{success, data}` level from, so it could only fire on a
// `{data: {program: {…}}}` double envelope that no catalog write emits. Zero
// first-party callers (`scripts/v1_surface_telemetry.py`, surface
// `normalizer.catalog.mutation_key_sniff`). What remains is the per-field map,
// which is a strict contract read.

function normalizeProgramMutationResponse(
  response: RawProgram | Program | null | undefined
): ProgramMutationResponse {
  return { program: normalizeProgram(response) }
}

// `normalizeIntakeMutationResponse` / `normalizeInstitutionMutationResponse`
// went with the legacy intake/institution writers that were their only callers
// (task 12.5). The program one stays: `programService.create` is the canonical
// offering-create path.

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

// (`InstitutionFormData` deleted by task 12.5: it typed the payload of
//  `institutionService.create`/`update`, both removed. The canonical institution
//  write shape lives in `services/admin/tenants.ts`.)

// `getCurrentProgram` / `getCurrentInstitution` went with the legacy PATCH
// writers that were their only callers (task 12.5). They existed to read a row
// back before merging a partial update into it — a read-modify-write the
// canonical admin services do not need, because the canonical write endpoints
// take a partial payload.
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

// `buildInstitutionPayload` went with `institutionService.create`/`update`, its
// only callers (task 12.5). Canonical institution writes are
// `services/admin/tenants.ts`, which builds its own payload against the
// `/api/v1/admin/institutions/` contract.

export const catalogService = {
  getContext: async (): Promise<CatalogContext> => {
    const endpoint = '/catalog/context/'
    try {
      const response = await apiClient.request<RawCatalogContext>(endpoint)
      return {
        portal_type: response?.portal_type === 'white_label' ? 'white_label' : 'shared',
        institution_id: response?.institution_id ?? null,
        institution_code: response?.institution_code ?? null,
        brand: response?.brand ?? { name: 'Beanola Admissions', owner: 'Beanola Technologies' },
      }
    } catch (error) {
      logApiError('catalog', endpoint, error)
      return {
        portal_type: 'shared',
        institution_id: null,
        brand: { name: 'Beanola Admissions', owner: 'Beanola Technologies' },
      }
    }
  },

  getPrograms: async (params?: QueryParams): Promise<ProgramCollectionResponse> => {
    const query = buildQueryString(params ?? {})
    const endpoint = `/catalog/programs/${query}`
    try {
      return normalizeProgramsResponse(
        await apiClient.request<RawProgram[] | RawPaginatedCollection<RawProgram>>(endpoint)
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
        await apiClient.request<RawProgram[] | RawPaginatedCollection<RawProgram>>(
          `/catalog/programs/?intake=${encodeURIComponent(intakeId)}`
        )
      )
    } catch (error) {
      logApiError('catalog', `/catalog/programs/?intake=${intakeId}`, error)
      throw error
    }
  },

  getCanonicalPrograms: async (params?: QueryParams): Promise<ProgramCollectionResponse> => {
    const query = buildQueryString(params ?? {})
    const endpoint = `/catalog/canonical-programs/${query}`
    try {
      return normalizeProgramsResponse(
        await apiClient.request<RawProgram[] | RawPaginatedCollection<RawProgram>>(endpoint)
      )
    } catch (error) {
      logApiError('catalog', endpoint, error)
      throw error
    }
  },

  /**
   * Resolve the assigned school (offering), fee, required documents, and
   * school contact for a chosen canonical program + intake (R10.2). Read-only
   * preview — creates no application row. Throws on a non-2xx response so the
   * wizard can surface a recoverable assignment-failure path (R10.4 / task 21.2).
   */
  getAssignmentPreview: async (params: AssignmentPreviewParams): Promise<AssignmentPreview> => {
    const query = buildQueryString({
      program_id: params.programId,
      intake_id: params.intakeId,
      ...(params.nationality ? { nationality: params.nationality } : {}),
      ...(params.country ? { country: params.country } : {}),
      ...(params.institution ? { institution: params.institution } : {}),
    })
    const endpoint = `/catalog/assignment-preview/${query}`
    try {
      const response = await apiClient.request<AssignmentPreview>(endpoint)
      if (!response) {
        throw new Error('No assignment returned')
      }
      return response
    } catch (error) {
      logApiError('catalog', endpoint, error)
      throw error
    }
  },

  getIntakes: async (): Promise<IntakeCollectionResponse> => {
    try {
      return normalizeIntakesResponse(
        await apiClient.request<RawIntake[] | RawPaginatedCollection<RawIntake>>('/catalog/intakes/')
      )
    } catch (error) {
      logApiError('catalog', '/catalog/intakes/', error)
      throw error
    }
  },

  getSubjects: async (): Promise<SubjectCollectionResponse> => {
    try {
      return normalizeSubjectsResponse(
        await apiClient.request<RawSubject[] | RawPaginatedCollection<RawSubject>>('/catalog/subjects/')
      )
    } catch (error) {
      logApiError('catalog', '/catalog/subjects/', error)
      throw error
    }
  },

  getInstitutions: async (): Promise<InstitutionCollectionResponse> => {
    try {
      return normalizeInstitutionsResponse(
        await apiClient.request<RawInstitution[] | RawPaginatedCollection<RawInstitution>>('/catalog/institutions/')
      )
    } catch (error) {
      logApiError('catalog', '/catalog/institutions/', error)
      throw error
    }
  },
}

/**
 * Program offering service.
 *
 * `list` and `create` only. The **legacy writers are gone** (admissions-v2 task
 * 12.5, R7.3/R14.5): `programService.update`/`delete`,
 * `intakeService.create`/`update`/`delete` and
 * `institutionService.create`/`update`/`delete` issued the catalog write routes
 * task 5.1 froze, and task 12.5 measured **zero** production callers for all
 * eight — every mention outside this file was a comment recording the retirement
 * or a test. By task 12.2 §6.4's own rule a private function with no caller and
 * no published contract is dead code to delete, not compatibility to register:
 * the *route* carries the window (`catalog.legacy_{institution,intake,program}
 * _write` in `apps/common/compatibility_register.py`, end date 2027-02-07,
 * because an external caller may still use it); the *client* owed no window.
 *
 * `POST /catalog/programs/` stays because it is the **canonical** offering-create
 * path (R7.1) and the register's own exit criteria say so explicitly. Canonical
 * admin writes go through `services/admin/catalog.ts` and
 * `services/admin/tenants.ts`.
 *
 * Task 12.2's zero report did not see these eight, and the reason is recorded in
 * `docs/v2-evidence/12.5/README.md` §3: its `route.catalog.legacy_*_write`
 * patterns require the endpoint literal and `, { method: 'POST'` on one line,
 * and the telemetry tool shells out to line-oriented `grep -E`.
 */
export const programService = {
  list: (params?: QueryParams) => catalogService.getPrograms(params),

  create: async (data: ProgramFormData): Promise<ProgramMutationResponse> => {
    try {
      return normalizeProgramMutationResponse(
        await apiClient.request<RawProgram>('/catalog/programs/', {
          method: 'POST',
          body: JSON.stringify(buildProgramPayload(data)),
        })
      )
    } catch (error) {
      logApiError('catalog', 'POST /catalog/programs/', error)
      throw error
    }
  },
}

export const intakeService = {
  list: () => catalogService.getIntakes(),
}

export const institutionService = {
  list: () => catalogService.getInstitutions(),
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
