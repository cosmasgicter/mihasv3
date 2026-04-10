import { describe, expect, it, vi } from 'vitest'

import {
  importWithChunkRecovery,
  isRecoverableLazyChunkError,
} from '@/lib/lazyImportRecovery'

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
  }
}

describe('lazy import recovery', () => {
  it('detects stale chunk failures by message pattern', () => {
    expect(isRecoverableLazyChunkError(new Error('Failed to fetch dynamically imported module'))).toBe(true)
    expect(isRecoverableLazyChunkError(new Error('Loading chunk 72 failed'))).toBe(true)
    expect(isRecoverableLazyChunkError(new Error('Importing a module script failed'))).toBe(true)
    expect(isRecoverableLazyChunkError(new Error('Random validation error'))).toBe(false)
  })

  it('clears the guard after a successful import', async () => {
    const storage = createMemoryStorage({ 'mihas:lazy-chunk-recovery:wizard-storage': '123' })

    const mod = await importWithChunkRecovery(
      async () => ({ uploadApplicationFile: vi.fn() }),
      {
        guardKey: 'wizard-storage',
        storage,
      }
    )

    expect(mod).toHaveProperty('uploadApplicationFile')
    expect(storage.removeItem).toHaveBeenCalledWith('mihas:lazy-chunk-recovery:wizard-storage')
  })

  it('runs cleanup and reloads once for a recoverable stale chunk error', async () => {
    const storage = createMemoryStorage()
    const cleanup = vi.fn(async () => {})
    const reload = vi.fn()

    await expect(
      importWithChunkRecovery(
        async () => {
          throw new Error('Failed to fetch dynamically imported module')
        },
        {
          guardKey: 'wizard-smart-features',
          storage,
          cleanup,
          reload,
          recoveryMessage: 'Recovering from deploy',
        }
      )
    ).rejects.toThrow('Recovering from deploy')

    expect(storage.setItem).toHaveBeenCalledWith(
      'mihas:lazy-chunk-recovery:wizard-smart-features',
      expect.any(String)
    )
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not loop reloads when the guard is already present', async () => {
    const storage = createMemoryStorage({ 'mihas:lazy-chunk-recovery:wizard-smart-features': 'existing' })
    const cleanup = vi.fn(async () => {})
    const reload = vi.fn()

    await expect(
      importWithChunkRecovery(
        async () => {
          throw new Error('Failed to fetch dynamically imported module')
        },
        {
          guardKey: 'wizard-smart-features',
          storage,
          cleanup,
          reload,
        }
      )
    ).rejects.toThrow('Failed to fetch dynamically imported module')

    expect(cleanup).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})

