import { logger } from '@/lib/logger'

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

type ReloadReasonCounterBucket = 'attempted' | 'blocked' | 'executed'

type ReloadReasonCounters = Record<ReloadReason, Record<ReloadReasonCounterBucket, number>>

const isTruthy = (value: string | undefined): boolean => {
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on', 'enabled'].includes(value.trim().toLowerCase())
}

const AUTO_RELOAD_ENABLED = isTruthy(import.meta.env.VITE_ENABLE_AUTO_RELOAD)

interface AutoReloadOptions {
  reason: ReloadReason
  buildKey: string
  details?: Record<string, unknown>
  fingerprint?: string
}

const AUTO_RELOAD_GUARD_KEY = 'mihas_auto_reload_guard_v2'
const RELOAD_REASON_COUNTERS_KEY = 'mihas_reload_reason_counters_v1'

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

const createDefaultCounters = (): ReloadReasonCounters => ({
  chunk_preload_error: { attempted: 0, blocked: 0, executed: 0 },
  chunk_import_error: { attempted: 0, blocked: 0, executed: 0 },
  chunk_mime_error: { attempted: 0, blocked: 0, executed: 0 },
  sw_controller_change: { attempted: 0, blocked: 0, executed: 0 },
  manual_hard_reload: { attempted: 0, blocked: 0, executed: 0 },
})

const readReloadReasonCounters = (): ReloadReasonCounters => {
  try {
    const raw = sessionStorage.getItem(RELOAD_REASON_COUNTERS_KEY)
    if (!raw) {
      return createDefaultCounters()
    }

    return {
      ...createDefaultCounters(),
      ...(JSON.parse(raw) as Partial<ReloadReasonCounters>),
    }
  } catch {
    return createDefaultCounters()
  }
}

const writeReloadReasonCounters = (counters: ReloadReasonCounters) => {
  sessionStorage.setItem(RELOAD_REASON_COUNTERS_KEY, JSON.stringify(counters))
}

export const incrementReloadReasonCounter = (
  reason: ReloadReason,
  bucket: ReloadReasonCounterBucket,
): number => {
  const counters = readReloadReasonCounters()
  const reasonCounters = counters[reason] ?? { attempted: 0, blocked: 0, executed: 0 }
  const nextValue = (reasonCounters[bucket] ?? 0) + 1

  counters[reason] = {
    ...reasonCounters,
    [bucket]: nextValue,
  }

  writeReloadReasonCounters(counters)
  return nextValue
}

export const logReloadEvent = (context: ReloadLogContext) => {
  const payload = {
    ...context,
    ts: new Date().toISOString(),
  }

  logger.info('[ReloadControl]', payload)
}

export const consumeAutoReloadGuard = ({
  reason,
  buildKey,
  details,
  fingerprint = 'default',
}: AutoReloadOptions): boolean => {
  const guards = readAutoReloadGuards()
  const guardKey = `${buildKey}:${reason}:${fingerprint}`

  if (guards[guardKey]) {
    const blockedCount = incrementReloadReasonCounter(reason, 'blocked')
    logReloadEvent({
      reason,
      mode: 'auto',
      buildKey,
      details: {
        ...details,
        blockedByGuard: true,
        blockedCount,
        previousAt: guards[guardKey],
      },
    })
    return false
  }

  guards[guardKey] = new Date().toISOString()
  writeAutoReloadGuards(guards)
  return true
}

export const emitReloadTelemetry = ({ reason, mode, buildKey, details }: ReloadLogContext): void => {
  if (typeof window === 'undefined') {
    return
  }

  const payload = {
    reason,
    mode,
    buildKey,
    route: `${window.location.pathname}${window.location.search}`,
    ts: new Date().toISOString(),
    details: details ?? {},
  }

  window.dispatchEvent(new CustomEvent('mihas:reload', { detail: payload }))
  logger.info('[telemetry] reload', payload)
}

export const performReload = ({
  reason,
  mode,
  buildKey,
  details,
}: ReloadLogContext) => {
  incrementReloadReasonCounter(reason, 'attempted')

  if (mode === 'auto' && !AUTO_RELOAD_ENABLED) {
    const blockedCount = incrementReloadReasonCounter(reason, 'blocked')
    logReloadEvent({
      reason,
      mode,
      buildKey,
      details: {
        ...details,
        ignored: true,
        cause: 'auto-reload-disabled',
        blockedCount,
      },
    })
    return
  }

  const executedCount = incrementReloadReasonCounter(reason, 'executed')
  const enrichedDetails = {
    ...details,
    executedCount,
  }

  logReloadEvent({ reason, mode, buildKey, details: enrichedDetails })
  emitReloadTelemetry({ reason, mode, buildKey, details: enrichedDetails })
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
