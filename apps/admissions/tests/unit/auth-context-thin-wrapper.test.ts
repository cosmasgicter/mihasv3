/**
 * @vitest-environment node
 *
 * Test: AuthContext thin wrapper verification
 * Validates that useOptimizedAuthState was deleted and useSessionListener
 * provides the correct exports for all consumers.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const srcRoot = path.resolve(__dirname, '../../src')

describe('Auth hook consolidation - task 2.2 verification', () => {
  it('useOptimizedAuthState.ts has been deleted', () => {
    const filePath = path.join(srcRoot, 'hooks/auth/useOptimizedAuthState.ts')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('AuthContext.tsx does not import useOptimizedAuthState', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'contexts/AuthContext.tsx'), 'utf-8')
    expect(content).not.toContain('useOptimizedAuthState')
  })

  it('AuthContext.tsx imports useSessionListener', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'contexts/AuthContext.tsx'), 'utf-8')
    expect(content).toContain("import { useSessionListener }")
  })

  it('AuthContext.tsx calls useSessionListener() as single hook', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'contexts/AuthContext.tsx'), 'utf-8')
    expect(content).toContain('const auth = useSessionListener()')
  })

  it('AuthContext provides correct context shape', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'contexts/AuthContext.tsx'), 'utf-8')
    expect(content).toContain('auth.user')
    expect(content).toContain('auth.profile')
    expect(content).toContain('auth.loading')
    expect(content).toContain('auth.isAdmin')
    expect(content).toContain('auth.signIn')
    expect(content).toContain('auth.signUp')
    expect(content).toContain('auth.signOut')
    expect(content).toContain('auth.requestPasswordReset')
    expect(content).toContain('auth.updatePassword')
  })

  it('AuthContext configures ApiClient auth failure callback', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'contexts/AuthContext.tsx'), 'utf-8')
    expect(content).toContain('configureApiClientAuthFailure')
    expect(content).not.toContain('configureAuthController')
  })

  it('AdminRoute imports from AuthContext (useAuth)', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'components/AdminRoute.tsx'), 'utf-8')
    expect(content).not.toContain('useOptimizedAuthState')
    expect(content).not.toContain('useAuthStore')
    expect(content).toContain("import { useAuth } from '@/contexts/AuthContext'")
  })

  it('StudentRoute imports from AuthContext (useAuth)', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'components/StudentRoute.tsx'), 'utf-8')
    expect(content).not.toContain('useOptimizedAuthState')
    expect(content).not.toContain('useAuthStore')
    expect(content).toContain("import { useAuth } from '@/contexts/AuthContext'")
  })

  it('ProtectedRoute imports useAuthCheck from useSessionListener', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'components/ProtectedRoute.tsx'), 'utf-8')
    expect(content).not.toContain('useOptimizedAuthState')
    expect(content).toContain("import { useAuthCheck } from '@/hooks/auth/useSessionListener'")
  })

  it('useSessionListener exports all required functions', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'hooks/auth/useSessionListener.ts'), 'utf-8')
    expect(content).toContain('export function useSessionListener()')
    expect(content).toContain('export function useAuthCheck()')
  })

  it('no source files import from useOptimizedAuthState', () => {
    const checkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          checkDir(fullPath)
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf-8')
          if (content.includes("from '@/hooks/auth/useOptimizedAuthState'") ||
              content.includes('from "@/hooks/auth/useOptimizedAuthState"')) {
            throw new Error(`${fullPath} still imports from useOptimizedAuthState`)
          }
        }
      }
    }
    checkDir(srcRoot)
  })
})

describe('Deleted module verification (consolidation)', () => {
  it('authController.ts has been deleted (task 6.1)', () => {
    const filePath = path.join(srcRoot, 'services/authController.ts')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('authApi.ts has been deleted (task 8.1)', () => {
    const filePath = path.join(srcRoot, 'lib/api/authApi.ts')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('session.ts has been deleted (task 8.1)', () => {
    const filePath = path.join(srcRoot, 'lib/session.ts')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('authRefresh.ts has been deleted (task 8.1)', () => {
    const filePath = path.join(srcRoot, 'lib/authRefresh.ts')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('authPersistence.ts has been deleted (task 8.1)', () => {
    const filePath = path.join(srcRoot, 'lib/authPersistence.ts')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('sessionUtils.ts has been deleted (task 8.1)', () => {
    const filePath = path.join(srcRoot, 'lib/sessionUtils.ts')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('useTokenRefresh.ts has been deleted (task 7.1)', () => {
    const filePath = path.join(srcRoot, 'hooks/auth/useTokenRefresh.ts')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('useRoleQuery.ts has been deleted (task 7.3)', () => {
    const filePath = path.join(srcRoot, 'hooks/auth/useRoleQuery.ts')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('useAuthMutations.ts has been deleted (task 8.2)', () => {
    const filePath = path.join(srcRoot, 'hooks/queries/useAuthMutations.ts')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('no source files import from authController', () => {
    const checkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          checkDir(fullPath)
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf-8')
          if (content.includes("from '@/services/authController'") ||
              content.includes('from "@/services/authController"') ||
              content.includes("from '../services/authController'") ||
              content.includes("from './authController'")) {
            throw new Error(`${fullPath} still imports from authController`)
          }
        }
      }
    }
    checkDir(srcRoot)
  })
})

