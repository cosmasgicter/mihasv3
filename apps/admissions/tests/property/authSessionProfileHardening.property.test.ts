// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { mergeProfileIntoSessionUser } from '@/hooks/auth/authQueries'
import type { User, UserProfile } from '@/types/auth'

const root = path.resolve(__dirname, '../..')
const srcRoot = path.join(root, 'src')

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(fullPath)
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

describe('auth session/profile hardening source invariants', () => {
  it('only auth/client service boundary calls the raw refresh endpoint', () => {
    const offenders = listSourceFiles(srcRoot).filter((filePath) => {
      const normalized = filePath.replaceAll(path.sep, '/')
      if (normalized.endsWith('/src/services/client.ts')) return false
      if (normalized.endsWith('/src/services/auth.ts')) return false
      return /\bapiClient\.request\(\s*['"]\/auth\/refresh\//.test(read(path.relative(root, filePath)))
    })

    expect(offenders).toEqual([])
  })

  it('session bootstrap does not explicitly refresh after a no-user session response', () => {
    const authQueries = read('src/hooks/auth/authQueries.ts')

    expect(authQueries).not.toContain('authService.refresh()')
  })

  it('session listener and profile hook use the shared profile query helpers', () => {
    const sessionListener = read('src/hooks/auth/useSessionListener.ts')
    const profileHook = read('src/hooks/auth/useProfileQuery.ts')

    for (const source of [sessionListener, profileHook]) {
      expect(source).toContain('profileQueryKey')
      expect(source).toContain('fetchCurrentProfile')
      expect(source).not.toContain("apiClient.request<UserProfile>('/auth/profile/'")
      expect(source).not.toContain("apiClient.request<Record<string, unknown>>('/auth/profile/'")
    }
  })

  it('logout and auth-failure cleanup cancel auth/profile queries before clearing cache', () => {
    const sessionListener = read('src/hooks/auth/useSessionListener.ts')
    const authContext = read('src/contexts/AuthContext.tsx')

    // useSessionListener uses queryClient.clear()
    {
      const cancelAuthIndex = sessionListener.lastIndexOf("cancelQueries({ queryKey: ['auth']")
      const cancelProfileIndex = sessionListener.lastIndexOf("cancelQueries({ queryKey: ['user-profile']")
      const clearIndex = sessionListener.lastIndexOf('queryClient.clear()')

      expect(cancelAuthIndex).toBeGreaterThanOrEqual(0)
      expect(cancelProfileIndex).toBeGreaterThanOrEqual(0)
      expect(clearIndex).toBeGreaterThan(cancelAuthIndex)
      expect(clearIndex).toBeGreaterThan(cancelProfileIndex)
    }

    // AuthContext uses queryClient.removeQueries() (selective removal, not full clear)
    {
      const cancelAuthIndex = authContext.lastIndexOf("cancelQueries({ queryKey: ['auth']")
      const cancelProfileIndex = authContext.lastIndexOf("cancelQueries({ queryKey: ['user-profile']")
      const removeIndex = authContext.lastIndexOf('queryClient.removeQueries(')

      expect(cancelAuthIndex).toBeGreaterThanOrEqual(0)
      expect(cancelProfileIndex).toBeGreaterThanOrEqual(0)
      expect(removeIndex).toBeGreaterThan(cancelAuthIndex)
      expect(removeIndex).toBeGreaterThan(cancelProfileIndex)
    }
  })
})

describe('mergeProfileIntoSessionUser', () => {
  it('preserves session-only fields while merging overlapping profile fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          email: fc.emailAddress(),
          role: fc.constantFrom('student', 'admin', 'super_admin'),
          full_name: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined }),
          first_name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          last_name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          tokenMarker: fc.string({ minLength: 1, maxLength: 12 }),
        }),
        fc.record({
          id: fc.uuid(),
          email: fc.emailAddress(),
          role: fc.constantFrom('student', 'admin', 'super_admin'),
          full_name: fc.string({ minLength: 1, maxLength: 40 }),
          first_name: fc.string({ minLength: 1, maxLength: 20 }),
          last_name: fc.string({ minLength: 1, maxLength: 20 }),
          updated_at: fc.date().map((date) => date.toISOString()),
        }),
        (userInput, profileInput) => {
          const { tokenMarker, ...userFields } = userInput
          const user = {
            ...userFields,
            user_metadata: { tokenMarker },
          } satisfies User
          const profile = profileInput satisfies UserProfile

          const merged = mergeProfileIntoSessionUser(user, profile)

          expect(merged.id).toBe(user.id)
          expect(merged.email).toBe(profile.email)
          expect(merged.role).toBe(profile.role)
          expect(merged.full_name).toBe(profile.full_name)
          expect(merged.first_name).toBe(profile.first_name)
          expect(merged.last_name).toBe(profile.last_name)
          expect(merged.updated_at).toBe(profile.updated_at)
          expect(merged.user_metadata).toEqual(user.user_metadata)
        }
      ),
      { numRuns: 25 }
    )
  })
})
