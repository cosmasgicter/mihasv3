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

  it('AuthContext configures authController with redirectToSignIn', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'contexts/AuthContext.tsx'), 'utf-8')
    expect(content).toContain('configureAuthController')
    expect(content).toContain('redirectToSignIn')
  })

  it('AdminRoute imports from useSessionListener', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'components/AdminRoute.tsx'), 'utf-8')
    expect(content).not.toContain('useOptimizedAuthState')
    expect(content).toContain("import { useSessionListener }")
  })

  it('StudentRoute imports from useSessionListener', () => {
    const content = fs.readFileSync(path.join(srcRoot, 'components/StudentRoute.tsx'), 'utf-8')
    expect(content).not.toContain('useOptimizedAuthState')
    expect(content).toContain("import { useSessionListener }")
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
    expect(content).toContain('export function useInvalidateAuthCache()')
    expect(content).toContain('export function checkIsAdmin(')
    expect(content).toContain('export function normalizeSessionResult(')
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
