// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { DEFAULT_NATIONALITY, NATIONALITY_OPTIONS } from '@/lib/nationalityOptions'

/**
 * Unit tests for nationality/citizenship migration and sync logic.
 * Validates: Requirements 32.2, 32.3, 32.4, 32.5
 *
 * Tests cover:
 * 1. Migration: citizenship → nationality copy when nationality IS NULL
 * 2. Sync: nationality → citizenship on profile save
 * 3. Default: "Zambian" is the default nationality
 */

// --- Helpers that mirror the migration / sync logic ---

/** Simulates the SQL migration: copy citizenship → nationality where nationality is null */
function migrateCitizenshipToNationality(profile: {
  citizenship: string | null
  nationality: string | null
}): { citizenship: string | null; nationality: string | null } {
  const result = { ...profile }

  // Step 1: Copy citizenship → nationality where nationality IS NULL (Req 32.3)
  if (
    (result.nationality === null || result.nationality === '') &&
    result.citizenship !== null &&
    result.citizenship !== ''
  ) {
    result.nationality = result.citizenship
  }

  // Step 2: Default nationality to 'Zambian' where still NULL (Req 32.4)
  if (result.nationality === null || result.nationality === '') {
    result.nationality = DEFAULT_NATIONALITY
  }

  return result
}

/** Simulates the server-side sync: when nationality is set, citizenship is kept in sync (Req 32.2, 32.5) */
function syncNationalityToCitizenship(updates: Record<string, unknown>): Record<string, unknown> {
  const result = { ...updates }
  if (result.nationality && typeof result.nationality === 'string') {
    result.citizenship = result.nationality
  }
  return result
}

describe('nationality migration: citizenship → nationality copy', () => {
  it('copies citizenship to nationality when nationality is null', () => {
    const profile = { citizenship: 'South African', nationality: null }
    const result = migrateCitizenshipToNationality(profile)
    expect(result.nationality).toBe('South African')
  })

  it('copies citizenship to nationality when nationality is empty string', () => {
    const profile = { citizenship: 'Kenyan', nationality: '' }
    const result = migrateCitizenshipToNationality(profile)
    expect(result.nationality).toBe('Kenyan')
  })

  it('does not overwrite existing nationality with citizenship', () => {
    const profile = { citizenship: 'British', nationality: 'Zambian' }
    const result = migrateCitizenshipToNationality(profile)
    expect(result.nationality).toBe('Zambian')
  })

  it('defaults to Zambian when both citizenship and nationality are null', () => {
    const profile = { citizenship: null, nationality: null }
    const result = migrateCitizenshipToNationality(profile)
    expect(result.nationality).toBe('Zambian')
  })

  it('defaults to Zambian when citizenship is empty and nationality is null', () => {
    const profile = { citizenship: '', nationality: null }
    const result = migrateCitizenshipToNationality(profile)
    expect(result.nationality).toBe('Zambian')
  })

  it('is idempotent — running twice produces the same result', () => {
    const profile = { citizenship: 'Nigerian', nationality: null }
    const first = migrateCitizenshipToNationality(profile)
    const second = migrateCitizenshipToNationality(first)
    expect(second).toEqual(first)
  })
})

describe('nationality sync: nationality → citizenship on save', () => {
  it('sets citizenship to match nationality when nationality is provided', () => {
    const updates = { nationality: 'Zambian', first_name: 'Jane' }
    const result = syncNationalityToCitizenship(updates)
    expect(result.citizenship).toBe('Zambian')
    expect(result.nationality).toBe('Zambian')
  })

  it('syncs non-Zambian nationality to citizenship', () => {
    const updates = { nationality: 'Kenyan' }
    const result = syncNationalityToCitizenship(updates)
    expect(result.citizenship).toBe('Kenyan')
  })

  it('does not add citizenship when nationality is not in the update', () => {
    const updates = { first_name: 'John', phone: '+260971234567' }
    const result = syncNationalityToCitizenship(updates)
    expect(result.citizenship).toBeUndefined()
  })

  it('does not sync when nationality is empty string', () => {
    const updates = { nationality: '' }
    const result = syncNationalityToCitizenship(updates)
    expect(result.citizenship).toBeUndefined()
  })
})

describe('nationality defaults and options', () => {
  it('has Zambian as the default nationality', () => {
    expect(DEFAULT_NATIONALITY).toBe('Zambian')
  })

  it('has Zambian as the first option in the dropdown', () => {
    expect(NATIONALITY_OPTIONS[0]).toEqual({ value: 'Zambian', label: 'Zambian' })
  })

  it('includes Other as the last option', () => {
    const last = NATIONALITY_OPTIONS[NATIONALITY_OPTIONS.length - 1]
    expect(last).toEqual({ value: 'Other', label: 'Other' })
  })

  it('has remaining options in alphabetical order after Zambian', () => {
    const rest = NATIONALITY_OPTIONS.slice(1)
    // "Other" is at the end, so check all except last are alphabetical
    const withoutOther = rest.slice(0, -1)
    for (let i = 1; i < withoutOther.length; i++) {
      expect(withoutOther[i].value.localeCompare(withoutOther[i - 1].value)).toBeGreaterThanOrEqual(0)
    }
  })

  it('has no duplicate values in the options list', () => {
    const values = NATIONALITY_OPTIONS.map(o => o.value)
    expect(new Set(values).size).toBe(values.length)
  })
})
