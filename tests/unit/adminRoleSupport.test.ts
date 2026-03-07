import { describe, expect, it } from 'vitest'

import { adminRegisterBodySchema, updateRoleBodySchema } from '@/../lib/validation/admin'
import { getPermissionsForRole } from '@/../lib/auth/permissions'

describe('admin role support', () => {
  it('accepts operational admin roles in admin validation schemas', () => {
    expect(
      adminRegisterBodySchema.safeParse({
        email: 'officer@example.com',
        password: 'StrongPass123!',
        firstName: 'Ada',
        lastName: 'Officer',
        role: 'admissions_officer',
      }).success
    ).toBe(true)

    expect(
      updateRoleBodySchema.safeParse({
        userId: 'user-123',
        role: 'finance_officer',
      }).success
    ).toBe(true)
  })

  it('returns effective permissions for operational admin roles', () => {
    expect(getPermissionsForRole('admissions_officer')).toContain('applications:review')
    expect(getPermissionsForRole('finance_officer')).toContain('payments:verify')
    expect(getPermissionsForRole('academic_head')).toContain('analytics:read')
  })
})
