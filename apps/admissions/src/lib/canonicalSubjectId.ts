/**
 * The one definition of "a subject identity the server issued".
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` — task **7.1**.
 * Requirements: R11.5 ("SUBJECT selectors SHALL contain only server-provided
 *               canonical IDs … fake or unresolved subject IDs SHALL never count
 *               as complete")
 * Findings:     STU-11
 *
 * Before task 7.1 three modules each decided this for themselves, and two of them
 * did it by *denylist* (`!id.startsWith('fallback-')`). A denylist only rejects
 * the fabricated IDs someone remembered to name; anything else — a truncated
 * paste, a stale slug, an OCR artefact — passed as real, counted toward the
 * student's progress meter, and was then dropped on persist because the backend
 * requires a canonical UUID. That gap is finding STU-11.
 *
 * This is the allowlist replacement: a subject_id counts only when it is shaped
 * like an identity `subjects.id` can hold. The backend enforces the same rule at
 * the write boundary (`ApplicationGradeSerializer.validate_subject_id`, which
 * additionally requires the row to exist and be active), so the client can no
 * longer show progress the server would refuse.
 */

/** RFC 4122 UUID (versions 1–5), the shape of every `subjects.id`. */
const CANONICAL_SUBJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * True when `value` is a canonical, server-issued subject identity.
 *
 * Deliberately a plain boolean rather than a `value is string` type predicate:
 * most callers already hold a `string`, and a predicate would narrow the negative
 * branch to `never` and break the "this string is not canonical" paths this
 * contract is built on.
 */
export function isCanonicalSubjectId(value: unknown): boolean {
  return typeof value === 'string' && CANONICAL_SUBJECT_ID_PATTERN.test(value.trim())
}

/**
 * Keep only the grade rows the server can persist: a canonical subject and an
 * ECZ grade of 1–9. Used by every sync path so "what the student sees counted"
 * and "what gets saved" cannot diverge.
 */
export function syncableGrades<T extends { subject_id?: unknown; grade?: unknown }>(
  grades: readonly T[] | null | undefined
): Array<{ subject_id: string; grade: number }> {
  if (!Array.isArray(grades)) return []
  const seen = new Set<string>()
  const rows: Array<{ subject_id: string; grade: number }> = []
  for (const candidate of grades) {
    const subjectId = typeof candidate?.subject_id === 'string' ? candidate.subject_id.trim() : ''
    const grade = Number(candidate?.grade)
    if (!isCanonicalSubjectId(subjectId)) continue
    if (!Number.isInteger(grade) || grade < 1 || grade > 9) continue
    if (seen.has(subjectId)) continue
    seen.add(subjectId)
    rows.push({ subject_id: subjectId, grade })
  }
  return rows
}
