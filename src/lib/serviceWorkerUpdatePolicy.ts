const AUTO_RELOAD_SAFE_PATTERNS = [
  /^\/$/,
  /^\/auth\//,
  /^\/signin$/,
  /^\/login$/,
  /^\/dashboard$/,
  /^\/student\/dashboard$/,
  /^\/admin$/,
  /^\/admin\/dashboard$/,
  /^\/track-application$/,
  /^\/contact$/,
  /^\/404$/,
] as const

export function shouldAutoReloadForServiceWorkerUpdate(pathname: string): boolean {
  return AUTO_RELOAD_SAFE_PATTERNS.some((pattern) => pattern.test(pathname))
}

export type ServiceWorkerUpdateTrigger = 'skip_waiting' | 'reload' | 'noop'

export function resolveServiceWorkerUpdateTrigger({
  hasWaitingWorker,
  updateAvailable,
}: {
  hasWaitingWorker: boolean
  updateAvailable: boolean
}): ServiceWorkerUpdateTrigger {
  if (hasWaitingWorker) {
    return 'skip_waiting'
  }

  if (updateAvailable) {
    return 'reload'
  }

  return 'noop'
}
