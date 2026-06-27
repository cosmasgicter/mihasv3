import { BROWSER_KEYS, LEGACY_BROWSER_KEYS } from '@/lib/browserNamespace'

const KNOWN_DRAFT_STORAGE_KEYS = [
  'applicationDraft',
  'applicationWizardDraft',
  'applicationDraftOffline',
  'draftFormData',
  'wizardFormData',
  'applicationFormData',
  'wizardState',
  'applicationState',
  'draftDeleted',
  BROWSER_KEYS.applicationReminderRequest,
  BROWSER_KEYS.wizardAuthRedirectGuard,
  LEGACY_BROWSER_KEYS.applicationReminderRequest,
  LEGACY_BROWSER_KEYS.wizardAuthRedirectGuard,
] as const

const KNOWN_DRAFT_STORAGE_PREFIXES = [
  'applicationWizardDraft:',
  'applicationDraft:',
  `${BROWSER_KEYS.applicationReminderRequest}:`,
  LEGACY_BROWSER_KEYS.applicationReminderRequestPrefix,
] as const

export function getWizardDraftStorageKey(userId?: string | null, applicationId?: string | null): string {
  const owner = userId?.trim() || 'anonymous'
  const draftId = applicationId?.trim() || 'new'
  return `applicationWizardDraft:${owner}:${draftId}`
}

export function getLegacyWizardDraftStorageKey(): string {
  return 'applicationWizardDraft'
}

export function listWizardDraftStorageKeys(storage: Storage, userId?: string | null, applicationId?: string | null): string[] {
  const preferred = getWizardDraftStorageKey(userId, applicationId)
  const keys = new Set<string>([preferred])
  Object.keys(storage).forEach((key) => {
    if (!key.startsWith('applicationWizardDraft:')) return
    if (userId && !key.startsWith(`applicationWizardDraft:${userId}:`)) return
    if (applicationId && key !== getWizardDraftStorageKey(userId, applicationId)) return
    keys.add(key)
  })
  keys.add(getLegacyWizardDraftStorageKey())
  return Array.from(keys)
}

export function isDraftStorageKey(key: string): boolean {
  return (
    KNOWN_DRAFT_STORAGE_KEYS.includes(key as (typeof KNOWN_DRAFT_STORAGE_KEYS)[number]) ||
    KNOWN_DRAFT_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
  )
}

export function removeDraftStorageEntries(storage: Storage): void {
  Object.keys(storage).forEach((key) => {
    if (isDraftStorageKey(key)) {
      storage.removeItem(key)
    }
  })
}

export { KNOWN_DRAFT_STORAGE_KEYS, KNOWN_DRAFT_STORAGE_PREFIXES }
