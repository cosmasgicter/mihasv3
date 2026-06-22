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
  `${BROWSER_KEYS.applicationReminderRequest}:`,
  LEGACY_BROWSER_KEYS.applicationReminderRequestPrefix,
] as const

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
