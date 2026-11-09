/**
 * The attached draft's local outbox record (admissions-v2 task 6.3 M14 — R10.4,
 * R10.10; design §8.2: "Local records are addressed by `(user_id,
 * application_id, assignment_id)` and contain only pending deltas and retry
 * metadata").
 *
 * Until M14 an attached draft's record was a full copy of the wizard: every
 * answer (name, NRC/passport, date of birth, phone, next of kin), the grades,
 * the upload flags, the step and the payment status — and it was kept after a
 * successful save as a "clean" copy. Recovery never read most of it: a resume
 * takes the step, grades, documents and payment state from the server, and an
 * outbox replay re-applies only the answers the record lists as pending
 * (characterised in `wizardDraftOutboxMinimisation.test.tsx` C1/C2 before the
 * change). The record is now exactly what recovery uses:
 *
 *   - the address: `userId`, `applicationId`, `assignment` (the server's
 *     `program_offering_id|intake_id` binding — `draftAssignmentKey`);
 *   - the base: `serverVersion`, the version the pending answers were made on;
 *   - the pending deltas: `answers`, the form value of each answer the student
 *     changed, and `pendingBase`, the value the server last acknowledged for each
 *     (null when there was no acknowledged base: then every answer is pending);
 *   - retry metadata: `pending` (always true — a record exists only while the
 *     server lacks an edit) and `savedAt`.
 *
 * The storage slot stays `applicationWizardDraft:<user>:<application>`: one
 * record per application, so a reroute replaces it rather than orphaning a
 * second one, and an application's cleanup is one key. The assignment is part of
 * the address the record is matched against on every read, not of the key name.
 *
 * Grades (SJR task 3.23, R6-b) are a second pending channel. A record that
 * holds grade rows the server has not acknowledged is format 4 and carries them
 * as `grades`; a record with no pending grades is written exactly as format 3
 * was, with no `grades` key, and a v3 record reads as "no pending grades". The
 * rows are `{ subject_id, grade }` pairs only: ids and numbers the student typed,
 * the same pairs the grades endpoint takes.
 *
 * An unattached new application is not built here: its record keeps the whole
 * form, because all of it is pending.
 */
import { DRAFT_ANSWER_FIELDS } from './draftAutosave'

/** `version` of an attached outbox record. Records without it predate task 6.3 M14. */
export const DRAFT_OUTBOX_RECORD_FORMAT = 3
/** `version` of a record that also holds pending grade rows (SJR task 3.23). */
export const DRAFT_OUTBOX_GRADES_RECORD_FORMAT = 4

export interface DraftOutboxGradeRow {
  subject_id: string
  grade: number
}

export interface DraftOutboxRecordInput {
  userId: string
  applicationId: string
  assignment: string | null
  serverVersion: number | null
  /** For each pending answer, the value the server last acknowledged; null = no base, all pending. */
  pendingBase: Record<string, unknown> | null
  /** The live form values the pending answers are read from. */
  formValues: Record<string, unknown>
  /** Grade rows the server has not acknowledged; omit or pass null when none are pending. */
  grades?: ReadonlyArray<DraftOutboxGradeRow> | null
  savedAt: string
}

/** Build the minimal record for an attached draft with pending answers. */
export function buildDraftOutboxRecord(input: DraftOutboxRecordInput): Record<string, unknown> {
  const pendingFields = input.pendingBase
    ? DRAFT_ANSWER_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(input.pendingBase, field))
    : DRAFT_ANSWER_FIELDS
  const answers: Record<string, unknown> = {}
  for (const field of pendingFields) {
    const value = input.formValues[field]
    answers[field] = value === undefined ? null : value
  }
  const grades = input.grades ?? null
  const record: Record<string, unknown> = {
    version: grades ? DRAFT_OUTBOX_GRADES_RECORD_FORMAT : DRAFT_OUTBOX_RECORD_FORMAT,
    userId: input.userId,
    applicationId: input.applicationId,
    assignment: input.assignment,
    serverVersion: input.serverVersion,
    pending: true,
    answers,
    pendingBase: input.pendingBase,
    savedAt: input.savedAt,
  }
  if (grades) record.grades = grades.map((row) => ({ subject_id: row.subject_id, grade: row.grade }))
  return record
}

/**
 * The pending grade rows a record holds. A record without the `grades` key
 * (every format 3 record) holds none; malformed members are dropped, so a
 * damaged record can never put a non-row into the grid.
 */
export function draftOutboxGrades(record: Record<string, unknown> | null | undefined): DraftOutboxGradeRow[] {
  if (!record || typeof record !== 'object') return []
  const grades = record.grades
  if (!Array.isArray(grades)) return []
  const rows: DraftOutboxGradeRow[] = []
  for (const member of grades) {
    if (!member || typeof member !== 'object') continue
    const subjectId = (member as Record<string, unknown>).subject_id
    const grade = Number((member as Record<string, unknown>).grade)
    if (typeof subjectId !== 'string' || !subjectId || !Number.isFinite(grade)) continue
    rows.push({ subject_id: subjectId, grade })
  }
  return rows
}

/**
 * The pending answers a record holds, form-shaped. A record written before
 * M14 kept them inside its full `formData` copy; `pendingBase` still says which
 * of those are pending, so both shapes recover the same answers.
 */
export function draftOutboxAnswers(record: Record<string, unknown> | null | undefined): unknown {
  if (!record || typeof record !== 'object') return undefined
  const answers = record.answers
  if (answers && typeof answers === 'object' && !Array.isArray(answers)) return answers
  return record.formData
}
