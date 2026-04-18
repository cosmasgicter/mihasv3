import { describe, expect, it } from 'vitest'
import { getDisplayName } from '@/utils/userDisplayName'

describe('getDisplayName', () => {
  it('uses profile.full_name first', () => {
    expect(
      getDisplayName(
        { id: 'p1', role: 'student', full_name: 'Profile Preferred' },
        { id: 'u1', email: 'user@example.com', role: 'student', full_name: 'User Name' }
      )
    ).toBe('Profile Preferred')
  })

  it('falls back to user.full_name then first+last then email local-part', () => {
    expect(
      getDisplayName(
        null,
        { id: 'u1', email: 'user@example.com', role: 'student', full_name: 'User Name' }
      )
    ).toBe('User Name')

    expect(
      getDisplayName(
        null,
        { id: 'u2', email: 'user@example.com', role: 'student', firstName: 'First', lastName: 'Last' }
      )
    ).toBe('First Last')

    expect(
      getDisplayName(
        null,
        { id: 'u3', email: 'local-part@example.com', role: 'student', firstName: ' ', lastName: ' ' }
      )
    ).toBe('local-part')
  })

  it('never falls back to "User" placeholder', () => {
    expect(getDisplayName(null, { id: 'u4', email: '', role: 'student' })).toBe('Student')
  })
})
