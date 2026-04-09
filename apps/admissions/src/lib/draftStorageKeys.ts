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
  'mihas:application-reminder-request',
  'mihas:wizard-auth-redirect-guard',
] as const

const KNOWN_DRAFT_STORAGE_PREFIXES = [
  'mihas:application-reminder-request:',
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
