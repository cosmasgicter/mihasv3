/**
 * Unit tests for the canonical profile autosave helpers (task 6.1).
 *
 * Covers section field ownership, dirty-delta extraction (with invalid-field
 * hold-back), backoff, version-token conflict detection, the aligned Zambian
 * phone contract, and the null-safe reset merge.
 *
 * Validates: Requirements R9.3, R9.8.
 */
import { describe, expect, it } from 'vitest'

import {
  buildProfileResetValues,
  computeBackoffDelay,
  extractSectionDelta,
  isAlignedZambianPhone,
  isUnsyncedStatus,
  isVersionConflict,
  PROFILE_SECTIONS,
  PROFILE_SECTION_IDS,
  sectionForField,
} from '@/lib/profileAutosave'

describe('profileAutosave — section ownership', () => {
  it('maps every editable field to exactly one section', () => {
    const seen = new Map<string, number>()
    for (const id of PROFILE_SECTION_IDS) {
      for (const field of PROFILE_SECTIONS[id]) {
        seen.set(field, (seen.get(field) ?? 0) + 1)
      }
    }
    for (const [, count] of seen) {
      expect(count).toBe(1)
    }
  })

  it('resolves the owning section for known fields and null for unknown', () => {
    expect(sectionForField('full_name')).toBe('applicant')
    expect(sectionForField('nrc_number')).toBe('residence')
    expect(sectionForField('next_of_kin_phone')).toBe('emergency')
    expect(sectionForField('email')).toBeNull()
  })
})

describe('profileAutosave — extractSectionDelta', () => {
  const fields = PROFILE_SECTIONS.applicant

  it('includes only dirty fields', () => {
    const delta = extractSectionDelta(
      fields,
      { full_name: 'Ada', phone: '+260970000000', date_of_birth: '', sex: 'Female' },
      { full_name: true },
    )
    expect(delta).toEqual({ full_name: 'Ada' })
  })

  it('holds back invalid dirty fields', () => {
    const delta = extractSectionDelta(
      fields,
      { full_name: 'Ada', phone: 'bad', date_of_birth: '', sex: undefined },
      { full_name: true, phone: true },
      new Set(['phone']),
    )
    expect(delta).toEqual({ full_name: 'Ada' })
  })

  it('returns an empty delta when nothing dirty', () => {
    expect(extractSectionDelta(fields, { full_name: 'Ada' }, {})).toEqual({})
  })
})

describe('profileAutosave — backoff', () => {
  it('grows exponentially and caps at the ceiling', () => {
    expect(computeBackoffDelay(1)).toBe(1000)
    expect(computeBackoffDelay(2)).toBe(2000)
    expect(computeBackoffDelay(3)).toBe(4000)
    expect(computeBackoffDelay(20)).toBe(30000)
  })

  it('never returns less than the base for attempt <= 1', () => {
    expect(computeBackoffDelay(0)).toBe(1000)
  })
})

describe('profileAutosave — version conflict', () => {
  it('is a conflict only when both versions exist and differ', () => {
    expect(isVersionConflict('a', 'b')).toBe(true)
    expect(isVersionConflict('a', 'a')).toBe(false)
    expect(isVersionConflict(undefined, 'b')).toBe(false)
    expect(isVersionConflict('a', undefined)).toBe(false)
  })
})

describe('profileAutosave — aligned Zambian phone', () => {
  it('accepts +260 followed by 9 digits', () => {
    expect(isAlignedZambianPhone('+260970000000')).toBe(true)
    expect(isAlignedZambianPhone('  +260970000000  ')).toBe(true)
  })

  it('rejects malformed numbers', () => {
    expect(isAlignedZambianPhone('0970000000')).toBe(false)
    expect(isAlignedZambianPhone('+26097000000')).toBe(false) // 8 digits
    expect(isAlignedZambianPhone('+2609700000000')).toBe(false) // 10 digits
    expect(isAlignedZambianPhone('')).toBe(false)
    expect(isAlignedZambianPhone(null)).toBe(false)
  })
})

describe('profileAutosave — unsynced status', () => {
  it('treats work-in-progress states as unsynced', () => {
    for (const status of ['dirty', 'saving', 'offline', 'retrying', 'error', 'conflict'] as const) {
      expect(isUnsyncedStatus(status)).toBe(true)
    }
    expect(isUnsyncedStatus('idle')).toBe(false)
    expect(isUnsyncedStatus('saved')).toBe(false)
  })
})

describe('profileAutosave — buildProfileResetValues (audit-production fix)', () => {
  it('never yields null string fields even with a null/partial server response', () => {
    const merged = buildProfileResetValues(
      {
        full_name: 'Ada Lovelace',
        phone: '+260970000000',
        residence_town: 'Lusaka',
        country: 'Zambia',
        nrc_number: '123456/78/1',
        address: 'Plot 1',
        nationality: 'Zambian',
        next_of_kin_name: 'Byron',
        next_of_kin_phone: '+260971111111',
        date_of_birth: '1990-01-01',
      },
      {
        // server returned nulls for several fields
        phone: null,
        residence_town: null,
        address: null,
        next_of_kin_phone: null,
      },
    )
    for (const field of [
      'phone',
      'residence_town',
      'country',
      'nrc_number',
      'address',
      'nationality',
      'next_of_kin_name',
      'next_of_kin_phone',
      'date_of_birth',
    ]) {
      expect(merged[field]).not.toBeNull()
      expect(typeof merged[field]).toBe('string')
    }
  })

  it('prefers the server value when present', () => {
    const merged = buildProfileResetValues(
      { country: 'Zambia' },
      { country: 'Zimbabwe' },
    )
    expect(merged.country).toBe('Zimbabwe')
  })

  it('defaults nationality to Zambian when both are empty', () => {
    const merged = buildProfileResetValues({}, {})
    expect(merged.nationality).toBe('Zambian')
  })
})
