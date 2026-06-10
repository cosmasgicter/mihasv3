/**
 * Unit tests for the intake-year resolver — the logic that replaces the
 * hard-coded "2026 INTAKE" with the correct July/January intake + year
 * computed from the offer date.
 */

import { describe, expect, it } from 'vitest'

import { resolveIntake } from '@/lib/pdf/documents/intakeSchedule'

describe('resolveIntake — offer-date roll-forward', () => {
  it('June offer → July of the same year', () => {
    const r = resolveIntake(null, '2026-06-08T00:00:00Z')
    expect(r.month).toBe('July')
    expect(r.year).toBe(2026)
    expect(r.label).toBe('July 2026 Intake')
  })

  it('mid-July offer → still July of the same year', () => {
    const r = resolveIntake(undefined, '2026-07-15T00:00:00Z')
    expect(r.month).toBe('July')
    expect(r.year).toBe(2026)
  })

  it('August offer → January of the NEXT year', () => {
    const r = resolveIntake('', '2026-08-02T00:00:00Z')
    expect(r.month).toBe('January')
    expect(r.year).toBe(2027)
  })

  it('December offer → January of the next year', () => {
    const r = resolveIntake('', '2026-12-20T00:00:00Z')
    expect(r.month).toBe('January')
    expect(r.year).toBe(2027)
  })

  it('January offer → January of the same year', () => {
    const r = resolveIntake('', '2027-01-10T00:00:00Z')
    expect(r.month).toBe('January')
    expect(r.year).toBe(2027)
  })

  it('February offer → July of the same year', () => {
    const r = resolveIntake('', '2027-02-01T00:00:00Z')
    expect(r.month).toBe('July')
    expect(r.year).toBe(2027)
  })
})

describe('resolveIntake — explicit intake string wins', () => {
  it('parses an explicit "July 2027 Intake" regardless of offer date', () => {
    const r = resolveIntake('July 2027 Intake', '2026-06-08T00:00:00Z')
    expect(r.month).toBe('July')
    expect(r.year).toBe(2027)
  })

  it('normalises an oddly-named "June 2026" intake to July 2026', () => {
    const r = resolveIntake('June 2026', '2025-01-01T00:00:00Z')
    expect(r.month).toBe('July')
    expect(r.year).toBe(2026)
  })

  it('normalises "September 2026" to the January 2026 intake bucket', () => {
    const r = resolveIntake('September 2026', null)
    expect(r.month).toBe('January')
    expect(r.year).toBe(2026)
  })

  it('ignores an intake string with no 4-digit year and uses the offer date', () => {
    const r = resolveIntake('Main Intake', '2026-06-08T00:00:00Z')
    expect(r.month).toBe('July')
    expect(r.year).toBe(2026)
  })

  it('ignores a UUID-like intake reference and uses the offer date', () => {
    const r = resolveIntake('13ee0626-cc7a-4215-883a-55306c8e755f', '2026-09-01T00:00:00Z')
    expect(r.month).toBe('January')
    expect(r.year).toBe(2027)
  })
})

describe('resolveIntake — robustness', () => {
  it('falls back to now when offer date is invalid and intake unparseable', () => {
    const r = resolveIntake('', 'not-a-date')
    // Should not throw; returns a valid intake for the current date.
    expect(['January', 'July']).toContain(r.month)
    expect(r.year).toBeGreaterThanOrEqual(new Date().getFullYear())
  })
})
