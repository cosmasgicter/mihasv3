/**
 * The landing's programme list, from the catalogue (task 29.2, R12.2).
 *
 * Replaces the hardcoded `programs` constant ("Partner colleges / Partner
 * universities"). A row is one programme open at one intake: the programme's name,
 * the school or schools offering it, the intake's name and its closing date. Every
 * value is the catalogue's; a row that has no school name shows none rather than a
 * guess, and nothing here counts programmes (the heading names no count).
 *
 * Pure: no fetch, no clock. Callers pass the intakes, the programmes each intake
 * offers, and "now".
 */
import type { Intake, Program } from '@/types/database'

export interface LandingProgrammeRow {
  /** Stable key: canonical programme + intake. */
  key: string
  programmeName: string
  schoolNames: string[]
  intakeId: string
  intakeName: string
  /** ISO date the intake closes, or `null` when the catalogue gives none. */
  closesOn: string | null
}

/** An intake is open until its application deadline has passed (no deadline = open). */
export function isIntakeOpen(intake: Intake, now: Date): boolean {
  if (intake.is_active === false) return false
  const deadline = intake.application_deadline
  if (!deadline) return true
  const closes = new Date(deadline)
  if (Number.isNaN(closes.getTime())) return true
  return closes.getTime() >= now.getTime()
}

function schoolNamesOf(program: Program): string[] {
  const offerings = program.available_offerings ?? []
  const names = (offerings.length > 0 ? offerings : [program])
    .map(offering => offering.institutions?.full_name || offering.institutions?.name || '')
    .map(name => name.trim())
    .filter(Boolean)
  return Array.from(new Set(names))
}

/**
 * One row per (programme, open intake), in the catalogue's order: intakes by
 * closing date (earliest first), programmes by name within an intake.
 */
export function buildLandingProgrammeRows(
  intakes: Intake[],
  programmesByIntake: Record<string, Program[]>,
  now: Date,
): LandingProgrammeRow[] {
  const open = intakes
    .filter(intake => isIntakeOpen(intake, now))
    .sort((a, b) => (a.application_deadline ?? '9999').localeCompare(b.application_deadline ?? '9999'))
  const rows: LandingProgrammeRow[] = []
  for (const intake of open) {
    const programmes = [...(programmesByIntake[intake.id] ?? [])].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
    )
    for (const programme of programmes) {
      if (programme.is_active === false || !programme.name) continue
      rows.push({
        key: `${programme.canonical_program_id ?? programme.id}:${intake.id}`,
        programmeName: programme.name,
        schoolNames: schoolNamesOf(programme),
        intakeId: intake.id,
        intakeName: intake.name,
        closesOn: intake.application_deadline ?? null,
      })
    }
  }
  return rows
}
