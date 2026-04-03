import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('auth/session API client consistency', () => {
  it('uses apiClient for live auth mutations and removes direct auth fetch calls', () => {
    const resetSource = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/auth/ResetPasswordPage.tsx'), 'utf-8')
    const callbackSource = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/auth/AuthCallbackPage.tsx'), 'utf-8')

    // ResetPasswordPage uses authService (which wraps apiClient) — not direct fetch
    expect(resetSource).toContain("from '@/services/auth'")
    expect(resetSource).not.toContain("fetch('/api/auth")

    expect(callbackSource).not.toContain("fetch('/api/auth")
    expect(callbackSource).toContain('External authentication callbacks are not configured in the Django backend.')
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
