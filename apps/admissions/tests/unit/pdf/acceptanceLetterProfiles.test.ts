/**
 * Unit tests — acceptance-letter profile registry.
 *
 * These guard the operationally and legally significant data transcribed
 * from the official sample letters: bank account numbers, fee amounts,
 * institution resolution, and the K1,000 commitment-fee semantics. A failing
 * test here means the rendered letter would no longer match the official
 * documents — treat any change as requiring an updated official sample.
 */

import { describe, expect, it } from 'vitest'

import {
  computeIntakeTotal,
  resolveAcceptanceProfile,
  resolveInstitutionCode,
} from '@/lib/pdf/documents/acceptanceLetterProfiles'

describe('resolveInstitutionCode', () => {
  it('resolves short codes', () => {
    expect(resolveInstitutionCode('MIHAS')).toBe('MIHAS')
    expect(resolveInstitutionCode('KATC')).toBe('KATC')
    expect(resolveInstitutionCode('katc')).toBe('KATC')
  })

  it('resolves full institution names (the shape the backend actually sends)', () => {
    expect(resolveInstitutionCode('Kalulushi Training Centre')).toBe('KATC')
    expect(
      resolveInstitutionCode('Mukuba Institute of Health and Applied Sciences'),
    ).toBe('MIHAS')
  })

  it('does not assign an institution identity for empty/unknown values', () => {
    expect(resolveInstitutionCode('')).toBeNull()
    expect(resolveInstitutionCode(null)).toBeNull()
    expect(resolveInstitutionCode('Something Else')).toBeNull()
  })
})

describe('resolveAcceptanceProfile — MIHAS Registered Nursing', () => {
  const profile = resolveAcceptanceProfile('MIHAS', 'Diploma in Registered Nursing')

  it('resolves the RN profile with the correct tuition account', () => {
    expect(profile.institutionCode).toBe('MIHAS')
    expect(profile.programCode).toBe('RN')
    expect(profile.tuitionAccount.accountNumber).toBe('5768098500188')
    expect(profile.tuitionAccount.accountName).toBe(
      'Mukuba Institute of Health and Applied Sciences',
    )
  })

  it('carries the separate "other fees" account', () => {
    expect(profile.otherFeesAccount?.accountNumber).toBe('5768098500289')
  })

  it('uses the shared Zanaco / Mukuba Mall branch details', () => {
    expect(profile.tuitionAccount.bankName).toContain('Zanaco')
    expect(profile.tuitionAccount.branchName).toBe('Mukuba Mall')
    expect(profile.tuitionAccount.branchCode).toBe('098')
    expect(profile.tuitionAccount.swiftCode).toBe('Zncozmlu')
    expect(profile.tuitionAccount.sortCode).toBe('010298')
  })
})

describe('resolveAcceptanceProfile — KATC Clinical Medicine (COG)', () => {
  const profile = resolveAcceptanceProfile(
    'Kalulushi Training Centre',
    'Diploma in Clinical Medicine',
  )

  it('resolves the COG profile by full institution name', () => {
    expect(profile.institutionCode).toBe('KATC')
    expect(profile.programCode).toBe('COG')
    expect(profile.tuitionAccount.accountNumber).toBe('5729097500125')
    expect(profile.studyMode).toBe('Full Time')
  })

  it('records the late-registration penalty note', () => {
    expect(profile.notes.join(' ')).toMatch(/late registration.*penalty.*K500/i)
  })
})

describe('resolveAcceptanceProfile — KATC Environmental Health (EHT)', () => {
  const profile = resolveAcceptanceProfile('KATC', 'Diploma in Environmental Health')

  it('resolves the EHT profile (distance) with its tuition account', () => {
    expect(profile.programCode).toBe('EHT')
    expect(profile.studyMode).toBe('Distance')
    expect(profile.tuitionAccount.accountNumber).toBe('5729097500630')
  })

  it('has a non-empty fee chart and requirements list', () => {
    expect(profile.feeChart.length).toBeGreaterThan(0)
    expect(profile.requirements.length).toBeGreaterThan(0)
  })
})

describe('resolveAcceptanceProfile — fallback', () => {
  it('returns a generic profile (institution banking only) for an unknown programme', () => {
    const profile = resolveAcceptanceProfile('MIHAS', 'Diploma in Something New')
    expect(profile.institutionCode).toBe('MIHAS')
    expect(profile.feeChart).toEqual([])
    expect(profile.requirements).toEqual([])
    // Still carries a valid tuition account so the commitment-fee clause renders.
    expect(profile.tuitionAccount.accountNumber).toBeTruthy()
  })

  it('returns a neutral Beanola profile for unknown institutions instead of MIHAS/KATC banking', () => {
    const profile = resolveAcceptanceProfile('Unknown College', 'Diploma in Something New')

    expect(profile.institutionCode).toBe('BEANOLA')
    expect(profile.feeChart).toEqual([])
    expect(profile.requirements).toEqual([])
    expect(profile.tuitionAccount.accountName).toBe('Configured by the issuing school')
    expect(profile.tuitionAccount.accountNumber).toBe('Configured in tenant template')
    expect(profile.tuitionAccount.accountName).not.toContain('Mukuba')
    expect(profile.tuitionAccount.accountName).not.toContain('Kalulushi')
  })
})

describe('MIHAS fee chart — 50% bursary + intake total', () => {
  const profile = resolveAcceptanceProfile('MIHAS', 'Diploma in Registered Nursing')

  it('models gross tuition, a 50% bursary deduction, and a net subtotal', () => {
    const gross = profile.feeChart.find((r) => r.item.startsWith('Tuition fees'))
    const bursary = profile.feeChart.find((r) => r.kind === 'deduction')
    const subtotal = profile.feeChart.find((r) => r.kind === 'subtotal')
    expect(gross?.amount).toBe(8000)
    expect(bursary?.amount).toBe(-4000)
    expect(subtotal?.amount).toBe(4000)
    expect(subtotal?.emphasis).toBe(true)
  })

  it('flags accommodation as optional', () => {
    const accom = profile.feeChart.find((r) => r.item.toLowerCase().includes('accommodation'))
    expect(accom?.optional).toBe(true)
  })

  it('computes the intake total net of bursary, excluding optional items', () => {
    // Net tuition 4000 + other fees 4200 + GNC 1332 = 9532; accommodation excluded.
    expect(computeIntakeTotal(profile.feeChart)).toBe(9532)
  })
})

describe('KATC fee chart — no bursary, optional items excluded', () => {
  const cog = resolveAcceptanceProfile('KATC', 'Diploma in Clinical Medicine')

  it('has no bursary deduction', () => {
    expect(cog.feeChart.some((r) => r.kind === 'deduction')).toBe(false)
  })

  it('excludes optional accommodation + UNZA affiliation from the total', () => {
    // Tuition 7500 + HPCZ 300 + ID 150 + Uniform 500 + Lab coat 300 +
    // Friday T-shirt 300 = 9050; UNZA (450) and accommodation (650) optional.
    expect(computeIntakeTotal(cog.feeChart)).toBe(9050)
  })
})

describe('computeIntakeTotal — edge cases', () => {
  it('returns 0 for an empty fee chart', () => {
    expect(computeIntakeTotal([])).toBe(0)
  })

  it('counts plain charges at face value when there is no subtotal', () => {
    expect(
      computeIntakeTotal([
        { item: 'A', amount: 100 },
        { item: 'B', amount: 50 },
        { item: 'C', amount: 25, optional: true },
      ]),
    ).toBe(150)
  })
})
