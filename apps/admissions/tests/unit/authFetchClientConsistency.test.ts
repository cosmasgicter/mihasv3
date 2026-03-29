import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const files = [
  'src/pages/auth/AuthCallbackPage.tsx',
  'src/pages/auth/ResetPasswordPage.tsx',
] as const

describe('auth/session API client consistency', () => {
  it('uses apiClient instead of direct auth fetch calls', () => {
    files.forEach((relativePath) => {
      const source = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8')
      expect(source).toContain("from '@/services/client'")
      expect(source).not.toContain("fetch('/api/auth")
    })
  })

  it('migrated components use useAuth instead of direct API calls', () => {
    const migratedFiles = [
      'src/components/application/AuthenticationGuard.tsx',
      'src/components/application/AuthStatusChecker.tsx',
    ] as const

    migratedFiles.forEach((relativePath) => {
      const source = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8')
      expect(source).not.toContain("fetch('/api/auth")
      expect(source).toContain("useAuth")
    })
  })
})
