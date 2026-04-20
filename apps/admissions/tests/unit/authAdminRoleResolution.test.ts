import { describe, expect, it } from 'vitest'

import { checkIsAdmin } from '@/hooks/auth/useSessionListener'

describe('checkIsAdmin', () => {
  it('treats admin and super_admin as admin users', () => {
    expect(checkIsAdmin({ id: '1', email: 'admin@example.com', role: 'admin' } as any)).toBe(true)
    expect(checkIsAdmin({ id: '2', email: 'super@example.com', role: 'super_admin' } as any)).toBe(true)
  })

  it('does not treat phantom roles as admin (not yet in backend ROLE_CHOICES)', () => {
    expect(checkIsAdmin({ id: '1', email: 'ops@example.com', role: 'admissions_officer' } as any)).toBe(false)
    expect(checkIsAdmin({ id: '2', email: 'finance@example.com', role: 'finance_officer' } as any)).toBe(false)
    expect(checkIsAdmin({ id: '3', email: 'reg@example.com', role: 'registrar' } as any)).toBe(false)
    expect(checkIsAdmin({ id: '4', email: 'head@example.com', role: 'academic_head' } as any)).toBe(false)
  })

  it('does not resolve role from metadata (only top-level role is checked)', () => {
    expect(checkIsAdmin({
      id: '3',
      email: 'meta@example.com',
      role: undefined,
      user_metadata: { role: 'super_admin' },
    } as any)).toBe(false)
  })

  it('does not treat reviewer/student as admin', () => {
    expect(checkIsAdmin({ id: '4', email: 'reviewer@example.com', role: 'reviewer' } as any)).toBe(false)
    expect(checkIsAdmin({ id: '5', email: 'student@example.com', role: 'student' } as any)).toBe(false)
  })
})
