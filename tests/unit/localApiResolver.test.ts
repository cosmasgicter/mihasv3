import { describe, expect, it } from 'vitest'

import { resolveLocalApiModulePath } from '@/lib/localApiResolver'

describe('localApiResolver', () => {
  it('prefers bundled api javascript files when they exist', () => {
    const result = resolveLocalApiModulePath('health', {
      rootDir: '/workspace',
      exists: (candidate) => candidate === '/workspace/api/health.js',
    })

    expect(result).toBe('./api/health.js')
  })

  it('falls back to api source typescript when no bundled file exists', () => {
    const result = resolveLocalApiModulePath('auth', {
      rootDir: '/workspace',
      exists: (candidate) => candidate === '/workspace/api-src/auth.ts',
    })

    expect(result).toBe('./api-src/auth.ts')
  })

  it('throws a useful error when neither bundled nor source handlers exist', () => {
    expect(() => resolveLocalApiModulePath('missing', {
      rootDir: '/workspace',
      exists: () => false,
    })).toThrow('No local API module found for "missing"')
  })
})
