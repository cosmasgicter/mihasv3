/**
 * Regression: secureStorage.keys() must NOT return the salt entry.
 *
 * The persistent PBKDF2 salt lives at localStorage key `beanola_secure_salt`,
 * which shares the `beanola_secure_` prefix used for encrypted entries. Before
 * the fix, keys() returned 'salt', so preloadSecureStorage() called get('salt')
 * and tried to AES-GCM-decrypt the raw 16-byte salt — the 12-byte IV strip
 * left 4 bytes (< the 16-byte GCM tag), throwing
 * "OperationError: The provided data is too small" (seen in production
 * GlitchTip). keys() must exclude the salt key.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { secureStorage } from '@/lib/secureStorage'

describe('secureStorage.keys() salt-key collision', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('excludes the salt key from keys()', async () => {
    localStorage.setItem('beanola_secure_salt', 'cmF3LXNhbHQtYnl0ZXM=')
    localStorage.setItem('beanola_secure_applicationDraft', 'encrypted-blob')

    const keys = await secureStorage.keys()

    expect(keys).not.toContain('salt')
    expect(keys).toContain('applicationDraft')
  })

  it('keeps legacy secure entries discoverable during migration', async () => {
    localStorage.setItem('mihas_secure_salt', 'cmF3LXNhbHQtYnl0ZXM=')
    localStorage.setItem('mihas_secure_applicationDraft', 'encrypted-blob')

    const keys = await secureStorage.keys()

    expect(keys).not.toContain('salt')
    expect(keys).toContain('applicationDraft')
  })
})
