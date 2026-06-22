export const BROWSER_KEYS = {
  adminErrorContext: 'beanola:admin-error-context',
  applicationReminderRequest: 'beanola:application-reminder-request',
  assignmentInterest: 'beanola:assignment-interest',
  authBroadcastChannel: 'beanola-auth',
  authBroadcastStorage: 'beanola-auth-event',
  chunkReloadCount: 'beanola_chunk_reload_count',
  chunkReloadCountV2: 'beanola_chunk_reload_count_v2',
  chunkReloadGuard: 'beanola_chunk_reload',
  chunkReloadRouteV2: 'beanola_chunk_reload_route_v2',
  chunkReloadTs: 'beanola_chunk_reload_ts',
  chunkReloadTsV2: 'beanola_chunk_reload_ts_v2',
  lazyChunkRecoveryPrefix: 'beanola:lazy-chunk-recovery:',
  lencoWidgetScriptId: 'beanola-lenco-inline-widget',
  paymentErrorPrefix: 'beanola:payment-initiation-error:',
  paymentRecovery: 'beanola-payment-recovery',
  pendingPaymentId: 'beanola:pending-payment-id',
  postAuthRedirect: 'beanola:post-auth-redirect',
  securePrefix: 'beanola_secure_',
  secureSalt: 'beanola_secure_salt',
  sidebarCollapsed: 'beanola:sidebar-collapsed',
  wizardAuthRedirectGuard: 'beanola:wizard-auth-redirect-guard',
  autoReloadGuard: 'beanola_auto_reload_guard_v2',
  reloadReasonCounters: 'beanola_reload_reason_counters_v1',
} as const

export const LEGACY_BROWSER_KEYS = {
  adminErrorContext: 'mihas:admin-error-context',
  applicationReminderRequest: 'mihas:application-reminder-request',
  applicationReminderRequestPrefix: 'mihas:application-reminder-request:',
  assignmentInterest: 'mihas:assignment-interest',
  authBroadcastChannel: 'mihas-auth',
  authBroadcastStorage: 'mihas-auth-event',
  autoReloadGuard: 'mihas_auto_reload_guard_v2',
  chunkReloadCount: 'mihas_chunk_reload_count',
  chunkReloadCountV2: 'mihas_chunk_reload_count_v2',
  chunkReloadGuard: 'mihas_chunk_reload',
  chunkReloadRouteV2: 'mihas_chunk_reload_route_v2',
  chunkReloadTs: 'mihas_chunk_reload_ts',
  chunkReloadTsV2: 'mihas_chunk_reload_ts_v2',
  lazyChunkRecoveryPrefix: 'mihas:lazy-chunk-recovery:',
  paymentErrorPrefix: 'mihas:payment-initiation-error:',
  paymentRecovery: 'mihas-payment-recovery',
  pendingPaymentId: 'mihas:pending-payment-id',
  postAuthRedirect: 'mihas:post-auth-redirect',
  securePrefix: 'mihas_secure_',
  secureSalt: 'mihas_secure_salt',
  sidebarCollapsed: 'mihas:sidebar-collapsed',
  wizardAuthRedirectGuard: 'mihas:wizard-auth-redirect-guard',
  reloadReasonCounters: 'mihas_reload_reason_counters_v1',
} as const

export const BROWSER_EVENTS = {
  authExpired: 'beanola:auth-expired',
  authRecovered: 'beanola:auth-recovered',
  authRedirect: 'beanola:auth-redirect',
  beforeAuthRedirect: 'beanola:before-auth-redirect',
} as const

export const LEGACY_BROWSER_EVENTS = {
  authExpired: 'mihas:auth-expired',
  authRecovered: 'mihas:auth-recovered',
  authRedirect: 'mihas:auth-redirect',
  beforeAuthRedirect: 'mihas:before-auth-redirect',
} as const

export function getStorageItemWithLegacyFallback(
  storage: Storage,
  key: string,
  legacyKeys: readonly string[] = [],
): string | null {
  const current = storage.getItem(key)
  if (current !== null) return current

  for (const legacyKey of legacyKeys) {
    const legacyValue = storage.getItem(legacyKey)
    if (legacyValue === null) continue
    try {
      storage.setItem(key, legacyValue)
      storage.removeItem(legacyKey)
    } catch {
      // best effort migration
    }
    return legacyValue
  }

  return null
}

export function removeStorageItemAndLegacy(
  storage: Storage,
  key: string,
  legacyKeys: readonly string[] = [],
): void {
  storage.removeItem(key)
  for (const legacyKey of legacyKeys) {
    storage.removeItem(legacyKey)
  }
}

export function listenWithLegacyEventFallback(
  target: Window,
  eventName: string,
  legacyEventNames: readonly string[],
  handler: EventListener,
): () => void {
  target.addEventListener(eventName, handler)
  for (const legacyEventName of legacyEventNames) {
    target.addEventListener(legacyEventName, handler)
  }

  return () => {
    target.removeEventListener(eventName, handler)
    for (const legacyEventName of legacyEventNames) {
      target.removeEventListener(legacyEventName, handler)
    }
  }
}
