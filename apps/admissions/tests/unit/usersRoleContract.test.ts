/**
 * Admin user role contract (admissions-v2 task 2.4, AUTH-04 / R3.4).
 *
 * The admin user-management surface must offer only the four canonical roles
 * that the backend supports (mirrors backend ROLE_HIERARCHY and the
 * AdminUserCreate/Update serializer choices). The retired unsupported roles
 * (admissions_officer, registrar, finance_officer, academic_head) must not
 * reappear in the role selectors.
 */
import { describe, it, expect } from 'vitest'

import { ROLE_VALUES, AVAILABLE_ROLES } from '@/pages/admin/lib/usersReducer'

const CANONICAL_ROLES = ['student', 'reviewer', 'admin', 'super_admin']
const RETIRED_ROLES = ['admissions_officer', 'registrar', 'finance_officer', 'academic_head']

describe('admin user role contract', () => {
  it('ROLE_VALUES is exactly the four canonical roles', () => {
    expect([...ROLE_VALUES].sort()).toEqual([...CANONICAL_ROLES].sort())
  })

  it('AVAILABLE_ROLES lists exactly the four canonical roles', () => {
    expect(AVAILABLE_ROLES.map((r) => r.value).sort()).toEqual([...CANONICAL_ROLES].sort())
  })

  it('no retired unsupported role remains in the selectors', () => {
    const values = new Set<string>([...ROLE_VALUES, ...AVAILABLE_ROLES.map((r) => r.value)])
    for (const retired of RETIRED_ROLES) {
      expect(values.has(retired)).toBe(false)
    }
  })
})
