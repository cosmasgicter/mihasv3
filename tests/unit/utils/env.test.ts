import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getEnvVariable } from '@/utils/env'

type MutableEnv = Record<string, string | undefined>

const KEY = 'VITE_SAMPLE_KEY'
type GlobalWithEnvOverride = typeof globalThis & { __MIHAS_IMPORT_META_ENV__?: MutableEnv }
const globalWithOverride = globalThis as GlobalWithEnvOverride

const originalImportMetaOverride = globalWithOverride.__MIHAS_IMPORT_META_ENV__
const originalProcessValue = process.env[KEY]

describe('getEnvVariable', () => {
  beforeEach(() => {
    delete globalWithOverride.__MIHAS_IMPORT_META_ENV__
    delete process.env[KEY]
  })

  afterEach(() => {
    if (originalImportMetaOverride === undefined) {
      delete globalWithOverride.__MIHAS_IMPORT_META_ENV__
    } else {
      globalWithOverride.__MIHAS_IMPORT_META_ENV__ = originalImportMetaOverride
    }

    if (originalProcessValue === undefined) {
      delete process.env[KEY]
    } else {
      process.env[KEY] = originalProcessValue
    }
  })

  it('prefers values from import.meta.env when available', () => {
    globalWithOverride.__MIHAS_IMPORT_META_ENV__ = { [KEY]: 'from-import-meta' }
    process.env[KEY] = 'from-process-env'

    expect(getEnvVariable(KEY, 'fallback')).toBe('from-import-meta')
  })

  it('falls back to process.env when import.meta.env is missing the key', () => {
    delete globalWithOverride.__MIHAS_IMPORT_META_ENV__
    process.env[KEY] = 'from-process-env'

    expect(getEnvVariable(KEY, 'fallback')).toBe('from-process-env')
  })

  it('returns the fallback when no environment value is present', () => {
    delete globalWithOverride.__MIHAS_IMPORT_META_ENV__
    delete process.env[KEY]

    expect(getEnvVariable(KEY, 'fallback')).toBe('fallback')
  })
})
