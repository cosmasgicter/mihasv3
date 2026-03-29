import { describe, expect, it } from 'vitest'

import { checkIsAdmin } from '@/hooks/auth/useSessionListener'

describe('checkIsAdmin', () => {
  it('treats operational admin roles as admin users', () => {
    expect(checkIsAdmin({ id: '1', email: 'ops@example.com', role: 'admissions_officer' } as any)).toBe(true)
    expect(checkIsAdmin({ id: '2', email: 'finance@example.com', role: 'finance_officer' } as any)).toBe(true)
  })

  it('accepts role values sourced from metadata', () => {
    expect(checkIsAdmin({
      id: '3',
      email: 'meta@example.com',
      role: undefined,
      user_metadata: { role: 'academic_head' },
    } as any)).toBe(true)
  })

  it('does not treat reviewer/student as admin', () => {
    expect(checkIsAdmin({ id: '4', email: 'reviewer@example.com', role: 'reviewer' } as any)).toBe(false)
    expect(checkIsAdmin({ id: '5', email: 'student@example.com', role: 'student' } as any)).toBe(false)
  })
})
