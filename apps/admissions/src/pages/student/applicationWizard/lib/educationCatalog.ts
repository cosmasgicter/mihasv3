import type { Grade12Subject } from '../types'

type EducationUploadCopy = {
  label: string
  helperText: string
}

// ── ECZ Grade 12 (Senior Secondary Certificate) ──────────────────────────
// Complete list per ECZ examination syllabus

const CORE_SUBJECTS: Grade12Subject[] = [
  { id: 'fallback-english', name: 'English Language', code: 'ENG', category: 'core', level: 'grade12' },
  { id: 'fallback-mathematics', name: 'Mathematics', code: 'MATH', category: 'core', level: 'grade12' },
  { id: 'fallback-civic-education', name: 'Civic Education', code: 'CE', category: 'core', level: 'grade12' },
]

const ELECTIVE_SUBJECTS: Grade12Subject[] = [
  // Sciences
  { id: 'fallback-biology', name: 'Biology', code: 'BIO', category: 'sciences', level: 'grade12' },
  { id: 'fallback-chemistry', name: 'Chemistry', code: 'CHEM', category: 'sciences', level: 'grade12' },
  { id: 'fallback-physics', name: 'Physics', code: 'PHY', category: 'sciences', level: 'grade12' },
  { id: 'fallback-science', name: 'Science', code: 'SCI', category: 'sciences', level: 'grade12' },
  { id: 'fallback-integrated-science', name: 'Integrated Science', code: 'INTSCI', category: 'sciences', level: 'grade12' },
  { id: 'fallback-agricultural-science', name: 'Agricultural Science', code: 'AGR', category: 'sciences', level: 'grade12' },
  { id: 'fallback-additional-mathematics', name: 'Additional Mathematics', code: 'ADDMATH', category: 'sciences', level: 'grade12' },
  { id: 'fallback-ordinary-mathematics', name: 'Ordinary Mathematics', code: 'OMATH', category: 'sciences', level: 'grade12' },
  // Commercial
  { id: 'fallback-commerce', name: 'Commerce', code: 'COM', category: 'commercial', level: 'grade12' },
  { id: 'fallback-principles-of-accounts', name: 'Principles of Accounts', code: 'POA', category: 'commercial', level: 'grade12' },
  { id: 'fallback-economics', name: 'Economics', code: 'ECON', category: 'commercial', level: 'grade12' },
  { id: 'fallback-business-studies', name: 'Business Studies', code: 'BS', category: 'commercial', level: 'grade12' },
  { id: 'fallback-office-practice', name: 'Office Practice', code: 'OP', category: 'commercial', level: 'grade12' },
  { id: 'fallback-entrepreneurship', name: 'Entrepreneurship', code: 'ENT', category: 'commercial', level: 'grade12' },
  // Humanities
  { id: 'fallback-geography', name: 'Geography', code: 'GEO', category: 'humanities', level: 'grade12' },
  { id: 'fallback-history', name: 'History', code: 'HIST', category: 'humanities', level: 'grade12' },
  { id: 'fallback-religious-education', name: 'Religious Education', code: 'RE', category: 'humanities', level: 'grade12' },
  { id: 'fallback-development-studies', name: 'Development Studies', code: 'DS', category: 'humanities', level: 'grade12' },
  { id: 'fallback-literature-in-english', name: 'Literature in English', code: 'LIT', category: 'humanities', level: 'grade12' },
  // Technology
  { id: 'fallback-computer-studies', name: 'Computer Studies', code: 'CS', category: 'technology', level: 'grade12' },
  { id: 'fallback-ict', name: 'ICT', code: 'ICT', category: 'technology', level: 'grade12' },
  { id: 'fallback-design-and-technology', name: 'Design & Technology', code: 'DT', category: 'technology', level: 'grade12' },
  { id: 'fallback-metalwork', name: 'Metalwork', code: 'MW', category: 'technology', level: 'grade12' },
  { id: 'fallback-woodwork', name: 'Woodwork', code: 'WW', category: 'technology', level: 'grade12' },
  { id: 'fallback-technical-drawing', name: 'Technical Drawing', code: 'TD', category: 'technology', level: 'grade12' },
  { id: 'fallback-power-mechanics', name: 'Power Mechanics', code: 'PM', category: 'technology', level: 'grade12' },
  // Practical / Creative
  { id: 'fallback-home-economics', name: 'Home Economics', code: 'HE', category: 'practical', level: 'grade12' },
  { id: 'fallback-food-and-nutrition', name: 'Food & Nutrition', code: 'FN', category: 'practical', level: 'grade12' },
  { id: 'fallback-art-and-design', name: 'Art & Design', code: 'ART', category: 'practical', level: 'grade12' },
  { id: 'fallback-music', name: 'Music', code: 'MUSIC', category: 'practical', level: 'grade12' },
  { id: 'fallback-physical-education', name: 'Physical Education', code: 'PE', category: 'practical', level: 'grade12' },
  { id: 'fallback-fashion-and-fabrics', name: 'Fashion & Fabrics', code: 'FF', category: 'practical', level: 'grade12' },
  // Languages
  { id: 'fallback-french', name: 'French', code: 'FRENCH', category: 'languages', level: 'grade12' },
  { id: 'fallback-portuguese', name: 'Portuguese', code: 'PORT', category: 'languages', level: 'grade12' },
  { id: 'fallback-bemba', name: 'Bemba', code: 'BEMBA', category: 'languages', level: 'grade12' },
  { id: 'fallback-nyanja', name: 'Nyanja', code: 'NYANJA', category: 'languages', level: 'grade12' },
  { id: 'fallback-tonga', name: 'Tonga', code: 'TONGA', category: 'languages', level: 'grade12' },
  { id: 'fallback-lozi', name: 'Lozi', code: 'LOZI', category: 'languages', level: 'grade12' },
  { id: 'fallback-kaonde', name: 'Kaonde', code: 'KAONDE', category: 'languages', level: 'grade12' },
  { id: 'fallback-lunda', name: 'Lunda', code: 'LUNDA', category: 'languages', level: 'grade12' },
  { id: 'fallback-luvale', name: 'Luvale', code: 'LUVALE', category: 'languages', level: 'grade12' },
]

// ── A-Level (GCE Advanced Level / Cambridge) ──────────────────────────────

const A_LEVEL_SUBJECTS: Grade12Subject[] = [
  { id: 'fallback-al-english', name: 'English Language (A-Level)', code: 'AL-ENG', category: 'languages', level: 'alevel' },
  { id: 'fallback-al-pure-mathematics', name: 'Pure Mathematics (A-Level)', code: 'AL-PMATH', category: 'sciences', level: 'alevel' },
  { id: 'fallback-al-further-mathematics', name: 'Further Mathematics (A-Level)', code: 'AL-FMATH', category: 'sciences', level: 'alevel' },
  { id: 'fallback-al-biology', name: 'Biology (A-Level)', code: 'AL-BIO', category: 'sciences', level: 'alevel' },
  { id: 'fallback-al-chemistry', name: 'Chemistry (A-Level)', code: 'AL-CHEM', category: 'sciences', level: 'alevel' },
  { id: 'fallback-al-physics', name: 'Physics (A-Level)', code: 'AL-PHY', category: 'sciences', level: 'alevel' },
  { id: 'fallback-al-geography', name: 'Geography (A-Level)', code: 'AL-GEO', category: 'humanities', level: 'alevel' },
  { id: 'fallback-al-history', name: 'History (A-Level)', code: 'AL-HIST', category: 'humanities', level: 'alevel' },
  { id: 'fallback-al-economics', name: 'Economics (A-Level)', code: 'AL-ECON', category: 'commercial', level: 'alevel' },
  { id: 'fallback-al-accounting', name: 'Accounting (A-Level)', code: 'AL-ACC', category: 'commercial', level: 'alevel' },
  { id: 'fallback-al-business-studies', name: 'Business Studies (A-Level)', code: 'AL-BS', category: 'commercial', level: 'alevel' },
  { id: 'fallback-al-computer-science', name: 'Computer Science (A-Level)', code: 'AL-CS', category: 'technology', level: 'alevel' },
  { id: 'fallback-al-sociology', name: 'Sociology (A-Level)', code: 'AL-SOC', category: 'humanities', level: 'alevel' },
  { id: 'fallback-al-psychology', name: 'Psychology (A-Level)', code: 'AL-PSY', category: 'humanities', level: 'alevel' },
  { id: 'fallback-al-religious-studies', name: 'Religious Studies (A-Level)', code: 'AL-RS', category: 'humanities', level: 'alevel' },
  { id: 'fallback-al-french', name: 'French (A-Level)', code: 'AL-FRENCH', category: 'languages', level: 'alevel' },
  { id: 'fallback-al-literature', name: 'Literature in English (A-Level)', code: 'AL-LIT', category: 'languages', level: 'alevel' },
  { id: 'fallback-al-art-and-design', name: 'Art & Design (A-Level)', code: 'AL-ART', category: 'practical', level: 'alevel' },
  { id: 'fallback-al-law', name: 'Law (A-Level)', code: 'AL-LAW', category: 'humanities', level: 'alevel' },
]

/** Category labels for UI grouping within each level */
export const SUBJECT_CATEGORY_LABELS: Record<string, string> = {
  core: 'Core Subjects',
  sciences: 'Sciences',
  commercial: 'Commercial',
  humanities: 'Humanities',
  technology: 'Technology & Technical',
  practical: 'Practical & Creative',
  languages: 'Languages',
}

const ZAMBIA_SUBJECT_FALLBACKS: Grade12Subject[] = [...CORE_SUBJECTS, ...ELECTIVE_SUBJECTS, ...A_LEVEL_SUBJECTS]
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
    category: subject.category,
    level: subject.level,
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

  // Add backend subjects first (authoritative IDs)
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
      category: canonical.category || fallback?.category,
      level: canonical.level || fallback?.level,
    })
  }

  // Add fallback subjects that don't exist in the backend yet
  for (const fallback of ZAMBIA_SUBJECT_FALLBACKS) {
    const key = normalizeSubjectName(fallback.name)
    if (!key || byName.has(key)) continue
    byName.set(key, fallback)
  }

  // Sort: Grade 12 first, then O-Level, then A-Level, then alphabetical within each
  const levelOrder: Record<string, number> = { grade12: 0, alevel: 1 }
  return Array.from(byName.values()).sort((left, right) => {
    const leftLevel = levelOrder[left.level || 'grade12'] ?? 0
    const rightLevel = levelOrder[right.level || 'grade12'] ?? 0
    if (leftLevel !== rightLevel) return leftLevel - rightLevel
    return left.name.localeCompare(right.name)
  })
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
