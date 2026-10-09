/**
 * Single-application-addressed local draft cache (admissions-v2 task 6.3,
 * R10.4 / R10.10 — the fourth clause of finding STU-12 deferred here from 6.2).
 *
 * This is the ONE adapter the wizard draft machine uses to read/write/clear the
 * local recovery snapshot. Every operation is addressed by a single
 * `(user_id, application_id)` identity (design §8.2). Cleanup therefore:
 *
 *   - targets exactly one draft and NEVER erases another draft's snapshot, and
 *   - NEVER erases any payment-recovery record (payment-linked protection —
 *     steering "Student Draft Lifecycle": payment-linked drafts and their
 *     recovery caches must never be wiped by cleanup / bulk-clear).
 *
 * It replaces the previous `clearAllDraftData()` bulk wipe, which removed every
 * draft key for every application AND deleted the entire payment-recovery store
 * (`beanola-payment-recovery`) in one shot — the exact R10.10 violation.
 *
 * The payment-recovery lifecycle stays owned solely by the payment flow
 * (`paymentRecoveryStore.record/clear` on initiate/success, TTL expiry, and
 * prune-on-rehydrate). This module intentionally does not touch it.
 *
 * The local snapshot is a recovery cache only. It is never authoritative over
 * the selected online `Application(status='draft')`; the loader treats the
 * server draft as the source of truth (no local-vs-server timestamp
 * arbitration — R10.3).
 */

import { cachedGetItem, cachedRemoveItem, cachedSetItem } from '@/lib/localStorageCache'
import {
  getLegacyWizardDraftStorageKey,
  getWizardDraftStorageKey,
} from '@/lib/draftStorageKeys'
import { useDraftStore } from '@/stores/draftStore'
import { logger } from '@/lib/logger'
import type { WizardDraftAddress } from '@/lib/wizardDraftMachine'

/**
 * Persist the recovery record for exactly one (user, application). Extracted
 * from the two copies previously inlined in `useWizardDraftLoader` and
 * `useWizardDraftPersistence`.
 *
 * An attached write no longer removes the user's unattached "new" record
 * (task 6.3 M14, R10.10). It used to, on every attached write — so merely
 * resuming one draft erased another application the student had typed on this
 * device but not yet started on the server (measured:
 * `wizardDraftOutboxMinimisation.test.tsx` M6). That record is removed when ITS
 * application attaches (the start command's `onStarted`), and by explicit
 * `mode=new`. The shadowing the old removal guarded against cannot occur: an
 * attached record now holds no form copy for the key-less local reader to
 * restore, and in production that reader never sees attached records at all.
 */
export function writeWizardDraftSnapshot(
  snapshot: Record<string, unknown>,
  address: WizardDraftAddress,
): void {
  const { userId, applicationId } = address
  cachedSetItem(getWizardDraftStorageKey(userId, applicationId), JSON.stringify(snapshot))
  cachedRemoveItem(getLegacyWizardDraftStorageKey())
  try {
    sessionStorage.removeItem(getLegacyWizardDraftStorageKey())
  } catch {
    // sessionStorage may be unavailable — best effort.
  }
}

/**
 * The server holds everything for one attached draft: keep nothing for it on this
 * device (admissions-v2 task 6.3 M14 — R10.4 "cleared on successful sync"; design
 * §8.2 "only pending deltas and retry metadata").
 *
 * Removes that one `(user, application)` record and — as every write does — the
 * shared legacy key. It is not a draft deletion, so it announces nothing
 * (`clearWizardDraftCache` is the deletion path). Never another application's
 * record (an unattached new application's included), never the payment-recovery
 * store.
 */
export function settleWizardDraftOutbox(address: WizardDraftAddress): void {
  const { userId, applicationId } = address
  if (!applicationId) return
  try {
    removeKeyEverywhere(getWizardDraftStorageKey(userId, applicationId))
    removeKeyEverywhere(getLegacyWizardDraftStorageKey())
  } catch (error) {
    logger.error('settleWizardDraftOutbox failed', error)
  }
}

/**
 * Read the recovery record for exactly one (user, application) — never another
 * draft's, and never the shared legacy key. Returns `null` for a missing or
 * unreadable record. The draft machine uses this to decide whether pending
 * outbox edits may be replayed over a freshly loaded server draft.
 */
export function readWizardDraftSnapshot(address: WizardDraftAddress): Record<string, unknown> | null {
  if (!address.applicationId) return null
  try {
    const raw = cachedGetItem(getWizardDraftStorageKey(address.userId, address.applicationId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export interface ClearWizardDraftCacheOptions {
  /**
   * Bump the shared draft-store revision + dispatch the `draftCleared` event so
   * the dashboard, ContinueApplication card, and multi-draft list refresh.
   * Default true. Set false for internal churn where a refresh is not wanted.
   */
  notify?: boolean
}

function notifyDraftCleared(applicationId: string | null): void {
  try {
    useDraftStore.getState().markCleared()
  } catch {
    // store may be unavailable in non-React contexts
  }
  try {
    window.dispatchEvent(new CustomEvent('draftCleared', { detail: { applicationId } }))
  } catch {
    // window may be unavailable
  }
}

function removeKeyEverywhere(key: string): void {
  try {
    cachedRemoveItem(key)
  } catch {
    // localStorage may be unavailable
  }
  try {
    sessionStorage.removeItem(key)
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Clear the local recovery snapshot for exactly ONE (user, application).
 *
 * R10.10: cleanup targets one user/application identity. This removes only the
 * `applicationWizardDraft:<user>:<application>` key and never:
 *   - another application's snapshot (siblings are addressed by a different id),
 *   - the shared legacy `applicationWizardDraft` key (it may belong to another
 *     draft — cleared only by `clearNewWizardDraftCache`), or
 *   - any payment-recovery record.
 *
 * Use for: a submitted application's stale local cache, a resolved stale
 * reference, or an explicit single-draft delete after the server confirmed it.
 */
export function clearWizardDraftCache(
  address: WizardDraftAddress,
  options: ClearWizardDraftCacheOptions = {},
): void {
  const { userId, applicationId } = address
  if (!applicationId) {
    // No application id -> route to the new/unattached cleanup, which is the
    // only cleanup allowed to touch the shared legacy key.
    clearNewWizardDraftCache(userId, options)
    return
  }

  try {
    // Exactly the one scoped key for this (user, application). We deliberately
    // do NOT enumerate `listWizardDraftStorageKeys` here (it also returns the
    // shared legacy key) so a specific-application clear can never wipe the
    // legacy draft that may belong to a different application.
    removeKeyEverywhere(getWizardDraftStorageKey(userId, applicationId))
  } catch (error) {
    logger.error('clearWizardDraftCache failed', error)
  }

  if (options.notify ?? true) {
    notifyDraftCleared(applicationId)
  }
}

/**
 * Clear ONLY the unattached "new" draft snapshot for a user, plus the shared
 * legacy `applicationWizardDraft` key. Used for explicit `mode=new` intent so a
 * fresh start does not restore stale local data — while every other attached
 * draft's snapshot (each addressed by its own application id) survives (R10.10:
 * starting one application must not erase another).
 */
export function clearNewWizardDraftCache(
  userId?: string | null,
  options: ClearWizardDraftCacheOptions = {},
): void {
  try {
    removeKeyEverywhere(getWizardDraftStorageKey(userId, null))
    removeKeyEverywhere(getLegacyWizardDraftStorageKey())
  } catch (error) {
    logger.error('clearNewWizardDraftCache failed', error)
  }

  if (options.notify ?? true) {
    notifyDraftCleared(null)
  }
}
