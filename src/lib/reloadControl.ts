export type ReloadReason =
  | 'chunk_preload_error'
  | 'chunk_import_error'
  | 'chunk_mime_error'
  | 'sw_controller_change'
  | 'manual_hard_reload'

interface ReloadLogContext {
  reason: ReloadReason
  mode: 'auto' | 'user'
  buildKey: string
  details?: Record<string, unknown>
}

const AUTO_RELOAD_ENABLED = import.meta.env.VITE_ENABLE_AUTO_RELOAD === 'true'

interface AutoReloadOptions {
  reason: ReloadReason
  buildKey: string
  details?: Record<string, unknown>
  fingerprint?: string
}

const AUTO_RELOAD_GUARD_KEY = 'mihas_auto_reload_guard_v2'

const readAutoReloadGuards = (): Record<string, string> => {
  try {
    const raw = sessionStorage.getItem(AUTO_RELOAD_GUARD_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const writeAutoReloadGuards = (guards: Record<string, string>) => {
  sessionStorage.setItem(AUTO_RELOAD_GUARD_KEY, JSON.stringify(guards))
}

export const logReloadEvent = (context: ReloadLogContext) => {
  const payload = {
    ...context,
    ts: new Date().toISOString()
  }

  console.info('[ReloadControl]', payload)
}

export const consumeAutoReloadGuard = ({
  reason,
  buildKey,
  details,
  fingerprint = 'default'
}: AutoReloadOptions): boolean => {
  const guards = readAutoReloadGuards()
  const guardKey = `${buildKey}:${reason}:${fingerprint}`

  if (guards[guardKey]) {
    logReloadEvent({
      reason,
      mode: 'auto',
      buildKey,
      details: {
        ...details,
        blockedByGuard: true,
        previousAt: guards[guardKey]
      }
    })
    return false
  }

  guards[guardKey] = new Date().toISOString()
  writeAutoReloadGuards(guards)
  return true
}

export const performReload = ({
  reason,
  mode,
  buildKey,
  details
}: ReloadLogContext) => {
  if (mode === 'auto' && !AUTO_RELOAD_ENABLED) {
    logReloadEvent({
      reason,
      mode,
      buildKey,
      details: {
        ...details,
        ignored: true,
        cause: 'auto-reload-disabled'
      }
    })
    return
  }

  logReloadEvent({ reason, mode, buildKey, details })
  window.location.reload()
}

export const resolveBuildKey = (): string => {
  const envVersion = import.meta.env.VITE_APP_VERSION
  if (envVersion && envVersion.trim().length > 0) {
    return envVersion
  }

  const currentScript = document.currentScript as HTMLScriptElement | null
  const src = currentScript?.src || ''
  const hashMatch = src.match(/-([a-z0-9]{8,})\.js/i)
  if (hashMatch?.[1]) {
    return hashMatch[1]
  }

  return 'unknown-build'
}
