/**
 * A resumed draft is hydrated with its canonical intake id (admissions-v2 task
 * 6.3, M13 — R10.1, R10.5; findings STU-01, STU-02).
 *
 * `applications.intake` is a display snapshot, and two tenants can run intakes
 * with the same name. The wizard used to put that name into the form and let its
 * reconcilers resolve it against the platform-wide intake list, which is ordered
 * by year and name only — so among same-named intakes the pick was arbitrary. The
 * adversarial matrix's F1 caught it on a fresh stack: a tenant-A draft resumed
 * with tenant B's same-named intake in the form, and the assignment preview asked
 * for an offering that does not exist (409 NO_ELIGIBLE_OFFERING). The same wrong
 * id would have been the target of a Continue's reroute command.
 */
import { describe, expect, it } from 'vitest'

import { draftRecordAnswers, draftRecordToFormValues } from '@/pages/student/applicationWizard/lib/draftHydration'

const findProgramId = (value?: string | null) => (value ? 'canonical-program-1' : '')

const baseRecord = {
  id: 'draft-1',
  full_name: 'Tenant A Student',
  program: 'Shared Offering Name',
  institution: 'Tenant A School',
  intake: 'Shared Intake Name 2027',
}

describe('draftRecordToFormValues — the intake', () => {
  it('holds the canonical intake id, not the shared display name', () => {
    const values = draftRecordToFormValues(
      { ...baseRecord, intake_id: '07ed1c07-76e9-46e3-9015-82bd3a249a90' },
      { findProgramId },
    )
    expect(values.intake).toBe('07ed1c07-76e9-46e3-9015-82bd3a249a90')
  })

  it('keeps the display name for a legacy draft that has no canonical intake id', () => {
    for (const intake_id of [undefined, null, '', '   ']) {
      const values = draftRecordToFormValues({ ...baseRecord, intake_id }, { findProgramId })
      expect(values.intake, `intake_id=${JSON.stringify(intake_id)}`).toBe('Shared Intake Name 2027')
    }
  })

  it('never changes the answer projection the draft machine compares and sends', () => {
    // Assignment is not an answer (R10.5): which intake representation the form
    // holds must not move the baseline, or a resume would look like an edit.
    const byId = draftRecordAnswers({ ...baseRecord, intake_id: 'intake-uuid' }, { findProgramId })
    const byName = draftRecordAnswers(baseRecord, { findProgramId })
    expect(byId.answers).toEqual(byName.answers)
    expect(byId.answers).not.toHaveProperty('intake')
    expect(byId.formValues).not.toHaveProperty('intake')
  })
})
