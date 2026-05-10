/**
 * Payment recovery store — Zustand slice with localStorage persistence.
 *
 * Task 33.1 of the payment-hardening spec. Keyed by `application_id`,
 * survives a page refresh, and self-expires entries older than 24 hours.
 *
 * Design contract (from `design.md` Frontend Interface Signatures):
 *   - `record(entry)` computes `ttl_expires_at = initiated_at + 24h`.
 *   - `get(id)` returns null when the stored entry's TTL has passed.
 *   - `clear(id)` unconditionally removes the entry.
 *   - `pruneExpired()` drops every entry with `ttl_expires_at < now`;
 *     safe to re-run.
 *
 * Requirements: R14.2, R22.8.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** 24 hours in milliseconds — the TTL window for every recovery entry. */
export const PAYMENT_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000

export type PaymentMethod = 'card' | 'mobile_money'

export interface PaymentRecoveryEntry {
  application_id: string
  payment_id: string
  reference: string
  method: PaymentMethod
  /** Unix epoch milliseconds at which the payment was first initiated. */
  initiated_at: number
  /** Unix epoch milliseconds after which the entry is treated as expired. */
  ttl_expires_at: number
}

/** Shape of the store surface consumed by React components. */
export interface PaymentRecoveryStore {
  entries: Record<string, PaymentRecoveryEntry>
  record(entry: Omit<PaymentRecoveryEntry, 'ttl_expires_at'>): void
  clear(applicationId: string): void
  get(applicationId: string): PaymentRecoveryEntry | null
  pruneExpired(): void
}

/**
 * Build a recovery store. Exported as a factory (and invoked once for the
 * default export) so tests can instantiate fresh stores without leaking
 * state between examples.
 */
export function createPaymentRecoveryStore(name = 'mihas-payment-recovery') {
  return create<PaymentRecoveryStore>()(
    persist(
      (set, get) => ({
        entries: {},

        record(entry) {
          const ttl_expires_at = entry.initiated_at + PAYMENT_RECOVERY_TTL_MS
          set((state) => ({
            entries: {
              ...state.entries,
              [entry.application_id]: { ...entry, ttl_expires_at },
            },
          }))
        },

        clear(applicationId) {
          set((state) => {
            if (!(applicationId in state.entries)) {
              return state
            }
            const next = { ...state.entries }
            delete next[applicationId]
            return { entries: next }
          })
        },

        get(applicationId) {
          const entry = get().entries[applicationId]
          if (!entry) {
            return null
          }
          if (entry.ttl_expires_at < Date.now()) {
            // Expired — lazy read returns null without mutating state so
            // concurrent tabs don't race on the removal.
            return null
          }
          return entry
        },

        pruneExpired() {
          const now = Date.now()
          const current = get().entries
          const next: Record<string, PaymentRecoveryEntry> = {}
          let changed = false
          for (const [appId, entry] of Object.entries(current)) {
            if (entry.ttl_expires_at >= now) {
              next[appId] = entry
            } else {
              changed = true
            }
          }
          if (changed) {
            set({ entries: next })
          }
        },
      }),
      {
        name,
        version: 1,
        storage: createJSONStorage(() => localStorage),
        onRehydrateStorage: () => (state) => {
          // Drop expired entries on every rehydration so stale data from
          // a prior session never leaks into the new UI. Guard against
          // `state` being undefined during the early hydration cycle.
          state?.pruneExpired()
        },
      },
    ),
  )
}

/** Default, module-scoped store instance used by the wizard. */
export const usePaymentRecoveryStore = createPaymentRecoveryStore()
