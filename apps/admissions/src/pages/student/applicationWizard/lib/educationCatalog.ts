/**
 * Presentation metadata for the server-provided subject catalogue.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` — task **7.1**.
 * Requirements: R11.4, R11.5
 * Findings:     STU-11
 * Design:       §9.2 (Grades — "The subject catalog is seeded and versioned by the
 *               backend. Selectors contain only canonical UUIDs.")
 *
 * ## What changed in 7.1
 *
 * This module used to hold 62 `fallback-*` subject objects that the education step
 * merged into the selector whenever the backend catalogue looked incomplete. They
 * were selectable, the readiness meter counted them, and then they were silently
 * dropped at sync time because `application_grades.subject_id` is a real foreign
 * key to `subjects(id)`. A student could reach "5/5 subjects — ready to submit"
 * holding nothing the server would ever store. That is finding STU-11.
 *
 * The fabricated identities are gone. What remains is deliberately identity-free:
 *
 * * {@link SUBJECT_DISPLAY_METADATA} — grouping/labelling hints keyed by
 *   *normalised name*, used to decorate whatever the server returned. If the
 *   server sends a subject this map has never heard of, it still renders (under
 *   its server category); if the server sends nothing, the selector is empty and
 *   says so, rather than inventing a catalogue.
 * * {@link LEGACY_SUBJECT_SLUG_TO_CODE} — the retired slugs mapped to canonical
 *   subject *codes*, so a draft or local snapshot saved before 7.1 is repaired to
 *   the real server ID instead of being thrown away.
 * * {@link SUBJECT_NAME_ALIASES} — a small mirror of the server's versioned alias
 *   catalogue (`GET /api/v1/catalog/subjects/` → `aliases`), used only to resolve
 *   an already-stored or OCR-proposed *name* to a server subject.
 */

import type { Grade12Subject } from '../types'
import { isCanonicalSubjectId } from '@/lib/canonicalSubjectId'
import { findBestSubjectId } from '@/lib/subjectMatcher'

type EducationUploadCopy = {
  label: string
  helperText: string
}

type SubjectDisplayMetadata = {
  /** Canonical display name, so casing/spacing is consistent across tenants. */
  name: string
  category: Grade12Subject['category']
}

/** Category labels for UI grouping within each level. */
export const SUBJECT_CATEGORY_LABELS: Record<string, string> = {
  core: 'Core Subjects',
  sciences: 'Sciences',
  commercial: 'Commercial',
  humanities: 'Humanities',
  technology: 'Technology & Technical',
  practical: 'Practical & Creative',
  languages: 'Languages',
}

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

export function normalizeSubjectName(value: string | undefined | null): string {
  return (value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Display metadata for the ECZ / A-Level subjects the platform seeds, keyed by
 * normalised name. Mirrors `backend/apps/catalog/subject_catalog.py`; a mismatch
 * only affects grouping, never which subjects exist.
 */
const SUBJECT_DISPLAY_ENTRIES: ReadonlyArray<[string, SubjectDisplayMetadata['category']]> = [
  // Core
  ['English Language', 'core'],
  ['Mathematics', 'core'],
  ['Civic Education', 'core'],
  // Sciences
  ['Biology', 'sciences'],
  ['Chemistry', 'sciences'],
  ['Physics', 'sciences'],
  ['Science', 'sciences'],
  ['Integrated Science', 'sciences'],
  ['Agricultural Science', 'sciences'],
  ['Additional Mathematics', 'sciences'],
  // Commercial
  ['Commerce', 'commercial'],
  ['Principles of Accounts', 'commercial'],
  ['Economics', 'commercial'],
  ['Business Studies', 'commercial'],
  ['Office Practice', 'commercial'],
  ['Entrepreneurship', 'commercial'],
  // Humanities
  ['Geography', 'humanities'],
  ['History', 'humanities'],
  ['Religious Education', 'humanities'],
  ['Development Studies', 'humanities'],
  ['Literature in English', 'humanities'],
  // Technology
  ['Computer Studies', 'technology'],
  ['ICT', 'technology'],
  ['Design & Technology', 'technology'],
  ['Metalwork', 'technology'],
  ['Woodwork', 'technology'],
  ['Technical Drawing', 'technology'],
  ['Power Mechanics', 'technology'],
  // Practical / Creative
  ['Home Economics', 'practical'],
  ['Food & Nutrition', 'practical'],
  ['Art & Design', 'practical'],
  ['Music', 'practical'],
  ['Physical Education', 'practical'],
  ['Fashion & Fabrics', 'practical'],
  // Languages
  ['French', 'languages'],
  ['Portuguese', 'languages'],
  ['Bemba', 'languages'],
  ['Nyanja', 'languages'],
  ['Tonga', 'languages'],
  ['Lozi', 'languages'],
  ['Kaonde', 'languages'],
  ['Lunda', 'languages'],
  ['Luvale', 'languages'],
  // A-Level
  ['English Language (A-Level)', 'languages'],
  ['Pure Mathematics (A-Level)', 'sciences'],
  ['Further Mathematics (A-Level)', 'sciences'],
  ['Biology (A-Level)', 'sciences'],
  ['Chemistry (A-Level)', 'sciences'],
  ['Physics (A-Level)', 'sciences'],
  ['Geography (A-Level)', 'humanities'],
  ['History (A-Level)', 'humanities'],
  ['Economics (A-Level)', 'commercial'],
  ['Accounting (A-Level)', 'commercial'],
  ['Business Studies (A-Level)', 'commercial'],
  ['Computer Science (A-Level)', 'technology'],
  ['Sociology (A-Level)', 'humanities'],
  ['Psychology (A-Level)', 'humanities'],
  ['Religious Studies (A-Level)', 'humanities'],
  ['French (A-Level)', 'languages'],
  ['Literature in English (A-Level)', 'languages'],
  ['Art & Design (A-Level)', 'practical'],
  ['Law (A-Level)', 'humanities'],
]

export const SUBJECT_DISPLAY_METADATA: ReadonlyMap<string, SubjectDisplayMetadata> = new Map(
  SUBJECT_DISPLAY_ENTRIES.map(([name, category]) => [
    normalizeSubjectName(name),
    { name, category },
  ])
)

/**
 * Retired `fallback-*` slugs → canonical subject code.
 *
 * Kept for **repair only**: a draft or local snapshot written before 7.1 may
 * still carry these strings, and mapping them to a real server subject is
 * strictly better for the student than discarding their answer. Nothing in the UI
 * can produce a new one.
 */
export const LEGACY_SUBJECT_SLUG_TO_CODE: Readonly<Record<string, string>> = {
  'fallback-english': 'ENG',
  'fallback-mathematics': 'MATH',
  'fallback-civic-education': 'CE',
  'fallback-biology': 'BIO',
  'fallback-chemistry': 'CHEM',
  'fallback-physics': 'PHY',
  'fallback-science': 'SCI',
  'fallback-integrated-science': 'INTSCI',
  'fallback-agricultural-science': 'AGR',
  'fallback-additional-mathematics': 'ADDMATH',
  'fallback-commerce': 'COM',
  'fallback-principles-of-accounts': 'POA',
  'fallback-economics': 'ECON',
  'fallback-business-studies': 'BS',
  'fallback-office-practice': 'OP',
  'fallback-entrepreneurship': 'ENT',
  'fallback-geography': 'GEO',
  'fallback-history': 'HIST',
  'fallback-religious-education': 'RE',
  'fallback-development-studies': 'DS',
  'fallback-literature-in-english': 'LIT',
  'fallback-computer-studies': 'CS',
  'fallback-ict': 'ICT',
  'fallback-design-and-technology': 'DT',
  'fallback-metalwork': 'MW',
  'fallback-woodwork': 'WW',
  'fallback-technical-drawing': 'TD',
  'fallback-power-mechanics': 'PM',
  'fallback-home-economics': 'HE',
  'fallback-food-and-nutrition': 'FN',
  'fallback-art-and-design': 'ART',
  'fallback-music': 'MUSIC',
  'fallback-physical-education': 'PE',
  'fallback-fashion-and-fabrics': 'FF',
  'fallback-french': 'FRENCH',
  'fallback-portuguese': 'PORT',
  'fallback-bemba': 'BEMBA',
  'fallback-nyanja': 'NYANJA',
  'fallback-tonga': 'TONGA',
  'fallback-lozi': 'LOZI',
  'fallback-kaonde': 'KAONDE',
  'fallback-lunda': 'LUNDA',
  'fallback-luvale': 'LUVALE',
  'fallback-al-english': 'AL-ENG',
  'fallback-al-pure-mathematics': 'AL-PMATH',
  'fallback-al-further-mathematics': 'AL-FMATH',
  'fallback-al-biology': 'AL-BIO',
  'fallback-al-chemistry': 'AL-CHEM',
  'fallback-al-physics': 'AL-PHY',
  'fallback-al-geography': 'AL-GEO',
  'fallback-al-history': 'AL-HIST',
  'fallback-al-economics': 'AL-ECON',
  'fallback-al-accounting': 'AL-ACC',
  'fallback-al-business-studies': 'AL-BS',
  'fallback-al-computer-science': 'AL-CS',
  'fallback-al-sociology': 'AL-SOC',
  'fallback-al-psychology': 'AL-PSY',
  'fallback-al-religious-studies': 'AL-RS',
  'fallback-al-french': 'AL-FRENCH',
  'fallback-al-literature': 'AL-LIT',
  'fallback-al-art-and-design': 'AL-ART',
  'fallback-al-law': 'AL-LAW',
}

/**
 * Normalised subject-name alias → canonical code. A read-only mirror of the
 * server's versioned alias catalogue, used to resolve a *stored* or
 * *OCR-proposed* name onto a server subject. Task 7.5 replaces this mirror with
 * the `aliases` the subjects endpoint now publishes.
 */
export const SUBJECT_NAME_ALIASES: Readonly<Record<string, string>> = {
  maths: 'MATH',
  math: 'MATH',
  'ordinary mathematics': 'MATH',
  'ordinary maths': 'MATH',
  eng: 'ENG',
  english: 'ENG',
  civics: 'CE',
  bio: 'BIO',
  chem: 'CHEM',
  phy: 'PHY',
  phys: 'PHY',
  'combined science': 'SCI',
  'general science': 'SCI',
  'physical science': 'SCI',
  'ordinary science': 'SCI',
  'add maths': 'ADDMATH',
  'add math': 'ADDMATH',
  'additional math': 'ADDMATH',
  agric: 'AGR',
  agriculture: 'AGR',
  'agric science': 'AGR',
  'commercial studies': 'COM',
  accounts: 'POA',
  accounting: 'POA',
  'principles of accounting': 'POA',
  poa: 'POA',
  econ: 'ECON',
  'bus studies': 'BS',
  business: 'BS',
  geog: 'GEO',
  hist: 'HIST',
  re: 'RE',
  'religious studies': 'RE',
  'dev studies': 'DS',
  literature: 'LIT',
  'lit in english': 'LIT',
  'english literature': 'LIT',
  'computer science': 'CS',
  'computer studies': 'CS',
  'information technology': 'ICT',
  'design technology': 'DT',
  'tech drawing': 'TD',
  td: 'TD',
  'home management': 'HE',
  'food nutrition': 'FN',
  art: 'ART',
  'art design': 'ART',
  'fashion fabrics': 'FF',
  pe: 'PE',
  'phys ed': 'PE',
}

type ServerSubject = {
  id: string
  name?: string
  code?: string
  category?: string
  curriculum_type?: string
  level?: string
}

function displayLevel(subject: ServerSubject): Grade12Subject['level'] {
  const curriculum = (subject.curriculum_type || subject.level || '').toLowerCase()
  if (curriculum === 'a_level' || curriculum === 'alevel' || curriculum === 'a-level') return 'alevel'
  return 'grade12'
}

function displayCategory(
  subject: ServerSubject,
  metadata: SubjectDisplayMetadata | undefined
): Grade12Subject['category'] {
  const serverCategory = (subject.category || '').trim().toLowerCase()
  if (serverCategory && serverCategory in SUBJECT_CATEGORY_LABELS) {
    return serverCategory as Grade12Subject['category']
  }
  return metadata?.category
}

/**
 * Build the selector list from the server catalogue.
 *
 * R11.5: the result contains **only** subjects whose id is a canonical
 * server-issued UUID. Anything else — an empty id, a retired slug, a malformed
 * row — is discarded, and an unavailable catalogue yields an empty list so the
 * education step can say "we could not load the subject list" instead of
 * offering fiction.
 */
export function mergeWizardSubjects(subjects: ServerSubject[]): Grade12Subject[] {
  const byId = new Map<string, Grade12Subject>()
  const seenIdentities = new Set<string>()

  for (const subject of subjects || []) {
    const id = typeof subject?.id === 'string' ? subject.id.trim() : ''
    if (!isCanonicalSubjectId(id) || byId.has(id)) continue

    const serverName = (subject.name || '').trim().replace(/\s+/g, ' ')
    const normalized = normalizeSubjectName(serverName)
    if (!normalized) continue

    const metadata = SUBJECT_DISPLAY_METADATA.get(normalized)
    const level = displayLevel(subject)

    // A catalogue that still carries two active rows for one real subject would
    // otherwise show it twice and let a student "use" both. The backend migration
    // retires those rows; this keeps the UI honest until it is applied everywhere.
    const identity = `${level}:${normalized}`
    if (seenIdentities.has(identity)) continue
    seenIdentities.add(identity)

    byId.set(id, {
      id,
      name: metadata?.name || serverName,
      code: (subject.code || '').trim().toUpperCase(),
      category: displayCategory(subject, metadata),
      level,
    })
  }

  // Grade 12 first, then A-Level; alphabetical within each level.
  const levelOrder: Record<string, number> = { grade12: 0, alevel: 1 }
  return Array.from(byId.values()).sort((left, right) => {
    const leftLevel = levelOrder[left.level || 'grade12'] ?? 0
    const rightLevel = levelOrder[right.level || 'grade12'] ?? 0
    if (leftLevel !== rightLevel) return leftLevel - rightLevel
    return left.name.localeCompare(right.name)
  })
}

/**
 * Resolve a stored subject reference to a canonical server ID.
 *
 * Accepts a canonical ID (returned unchanged), a retired `fallback-*` slug, a
 * subject code, or a written subject name/alias. Returns `''` when the value
 * cannot be resolved against the server catalogue — the caller then treats the
 * row as unresolved, which is what the student sees and what the server counts.
 * It never returns a non-canonical identity.
 */
export function resolveWizardSubjectId(
  value: string | undefined | null,
  subjects: Grade12Subject[]
): string {
  const trimmed = value?.trim() || ''
  if (!trimmed) return ''
  if (isCanonicalSubjectId(trimmed)) return trimmed

  const canonicalSubjects = (subjects || []).filter(subject => isCanonicalSubjectId(subject.id))
  if (canonicalSubjects.length === 0) return ''

  const isLegacySlug = trimmed.toLowerCase().startsWith('fallback-')
  const legacyCode = LEGACY_SUBJECT_SLUG_TO_CODE[trimmed.toLowerCase()]
  const normalized = normalizeSubjectName(trimmed)
  const targetCode = (legacyCode || SUBJECT_NAME_ALIASES[normalized] || trimmed).toUpperCase()

  const byCode = canonicalSubjects.find(subject => subject.code && subject.code === targetCode)
  if (byCode) return byCode.id

  if (isLegacySlug) {
    // A retired slug is an exact identity, not free text: if its code is not in
    // the server catalogue the answer is "unresolved". Guessing here is how a
    // student's Woodwork silently became something else.
    return ''
  }

  const byName = canonicalSubjects.find(
    subject => normalizeSubjectName(subject.name) === normalized
  )
  if (byName) return byName.id

  return findBestSubjectId(trimmed, canonicalSubjects) || ''
}
