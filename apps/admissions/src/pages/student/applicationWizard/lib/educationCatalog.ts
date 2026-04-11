import type { Grade12Subject } from '../types'

type EducationUploadCopy = {
  label: string
  helperText: string
}

const CORE_SUBJECTS: Grade12Subject[] = [
  { id: 'fallback-english', name: 'English', code: 'ENG' },
  { id: 'fallback-mathematics', name: 'Mathematics', code: 'MATH' },
  { id: 'fallback-ordinary-mathematics', name: 'Ordinary Mathematics', code: 'OMATH' },
  { id: 'fallback-additional-mathematics', name: 'Additional Mathematics', code: 'ADDMATH' },
  { id: 'fallback-biology', name: 'Biology', code: 'BIO' },
  { id: 'fallback-chemistry', name: 'Chemistry', code: 'CHEM' },
  { id: 'fallback-physics', name: 'Physics', code: 'PHY' },
  { id: 'fallback-science', name: 'Science', code: 'SCI' },
  { id: 'fallback-integrated-science', name: 'Integrated Science', code: 'INTSCI' },
]

const ELECTIVE_SUBJECTS: Grade12Subject[] = [
  { id: 'fallback-agricultural-science', name: 'Agricultural Science', code: 'AGR' },
  { id: 'fallback-geography', name: 'Geography', code: 'GEO' },
  { id: 'fallback-history', name: 'History', code: 'HIST' },
  { id: 'fallback-religious-education', name: 'Religious Education', code: 'RE' },
  { id: 'fallback-civic-education', name: 'Civic Education', code: 'CE' },
  { id: 'fallback-development-studies', name: 'Development Studies', code: 'DS' },
  { id: 'fallback-computer-studies', name: 'Computer Studies', code: 'CS' },
  { id: 'fallback-ict', name: 'ICT', code: 'ICT' },
  { id: 'fallback-principles-of-accounts', name: 'Principles of Accounts', code: 'POA' },
  { id: 'fallback-commerce', name: 'Commerce', code: 'COM' },
  { id: 'fallback-economics', name: 'Economics', code: 'ECON' },
  { id: 'fallback-business-studies', name: 'Business Studies', code: 'BS' },
  { id: 'fallback-home-economics', name: 'Home Economics', code: 'HE' },
  { id: 'fallback-food-and-nutrition', name: 'Food & Nutrition', code: 'FN' },
  { id: 'fallback-design-and-technology', name: 'Design & Technology', code: 'DT' },
  { id: 'fallback-art-and-design', name: 'Art & Design', code: 'ART' },
  { id: 'fallback-music', name: 'Music', code: 'MUSIC' },
  { id: 'fallback-physical-education', name: 'Physical Education', code: 'PE' },
  { id: 'fallback-french', name: 'French', code: 'FRENCH' },
  { id: 'fallback-portuguese', name: 'Portuguese', code: 'PORT' },
  { id: 'fallback-bemba', name: 'Bemba', code: 'BEMBA' },
  { id: 'fallback-nyanja', name: 'Nyanja', code: 'NYANJA' },
  { id: 'fallback-tonga', name: 'Tonga', code: 'TONGA' },
  { id: 'fallback-lozi', name: 'Lozi', code: 'LOZI' },
  { id: 'fallback-kaonde', name: 'Kaonde', code: 'KAONDE' },
  { id: 'fallback-lunda', name: 'Lunda', code: 'LUNDA' },
  { id: 'fallback-luvale', name: 'Luvale', code: 'LUVALE' },
]

const ZAMBIA_SUBJECT_FALLBACKS: Grade12Subject[] = [...CORE_SUBJECTS, ...ELECTIVE_SUBJECTS]
const BACKEND_SUBJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const EDUCATION_UPLOAD_COPY: Record<'resultSlip' | 'identityDocument', EducationUploadCopy> = {
  resultSlip: {
    label: 'Result slip',
    helperText: 'Grade 12 result slip.'
  },
  identityDocument: {
    label: 'NRC or passport',
    helperText: 'NRC or passport copy.'
  }
}

function normalizeSubjectName(value: string | undefined | null): string {
  return (value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toCanonicalSubject(subject: Grade12Subject): Grade12Subject {
  return {
    id: subject.id,
    name: subject.name.trim().replace(/\s+/g, ' '),
    code: subject.code?.trim().toUpperCase() || '',
  }
}

function isBackendSubjectId(value: string): boolean {
  return BACKEND_SUBJECT_ID_PATTERN.test(value)
}

const FALLBACK_SUBJECT_BY_ID = new Map(
  ZAMBIA_SUBJECT_FALLBACKS.map(subject => [subject.id, subject])
)

const FALLBACK_SUBJECT_BY_NAME = new Map(
  ZAMBIA_SUBJECT_FALLBACKS.map(subject => [normalizeSubjectName(subject.name), subject])
)

export function mergeWizardSubjects(subjects: Grade12Subject[]): Grade12Subject[] {
  const byName = new Map<string, Grade12Subject>()

  for (const subject of subjects) {
    const canonical = toCanonicalSubject(subject)
    if (!isBackendSubjectId(canonical.id)) continue
    const key = normalizeSubjectName(canonical.name)
    if (!key) continue
    const fallback = FALLBACK_SUBJECT_BY_NAME.get(key)
    byName.set(key, {
      id: canonical.id,
      name: fallback?.name || canonical.name,
      code: canonical.code || fallback?.code || '',
    })
  }

  return Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name))
}

export function resolveWizardSubjectId(value: string | undefined | null, subjects: Grade12Subject[]): string {
  const trimmed = value?.trim() || ''
  if (!trimmed) return ''

  if (isBackendSubjectId(trimmed)) {
    return trimmed
  }

  const fallbackSubject = FALLBACK_SUBJECT_BY_ID.get(trimmed)
  const fallbackCode = fallbackSubject?.code.trim().toUpperCase()
  const normalizedLookup = normalizeSubjectName(fallbackSubject?.name || trimmed)

  const match = subjects.find(subject => {
    if (!isBackendSubjectId(subject.id)) return false
    const normalizedName = normalizeSubjectName(subject.name)
    const normalizedCode = subject.code.trim().toUpperCase()
    return normalizedName === normalizedLookup || (Boolean(fallbackCode) && normalizedCode === fallbackCode)
  })

  return match?.id || ''
}
