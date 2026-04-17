interface LazyImportRecoveryOptions {
  guardKey: string
  recoveryMessage?: string
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  cleanup?: () => Promise<void>
  reload?: () => void
}

const GUARD_PREFIX = 'mihas:lazy-chunk-recovery:'

const getDefaultStorage = () => {
  if (typeof window === 'undefined') {
    return null
  }

  return window.sessionStorage
}

const getGuardStorageKey = (guardKey: string) => `${GUARD_PREFIX}${guardKey}`

export function isRecoverableLazyChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('loading chunk') ||
    message.includes('mime type') ||
    message.includes('unable to preload css')
  )
}

async function defaultCleanup(): Promise<void> {
  return
}

export async function recoverFromStaleLazyChunk(
  error: unknown,
  options: LazyImportRecoveryOptions
): Promise<boolean> {
  if (typeof window === 'undefined' || !isRecoverableLazyChunkError(error)) {
    return false
  }

  const storage = options.storage ?? getDefaultStorage()
  const guardStorageKey = getGuardStorageKey(options.guardKey)

  try {
    if (storage?.getItem(guardStorageKey)) {
      return false
    }
    storage?.setItem(guardStorageKey, String(Date.now()))
  } catch {
    // best effort guard
  }

  await (options.cleanup ?? defaultCleanup)()
  ;(options.reload ?? (() => window.location.reload()))()
  return true
}

export async function importWithChunkRecovery<T>(
  loader: () => Promise<T>,
  options: LazyImportRecoveryOptions
): Promise<T> {
  const storage = options.storage ?? getDefaultStorage()
  const guardStorageKey = getGuardStorageKey(options.guardKey)

  try {
    const module = await loader()
    try {
      storage?.removeItem(guardStorageKey)
    } catch {
      // best effort cleanup
    }
    return module
  } catch (error) {
    if (await recoverFromStaleLazyChunk(error, options)) {
      throw new Error(options.recoveryMessage ?? 'A new version of the application is loading. Please wait a moment and try again.')
    }
    throw error
  }
}
