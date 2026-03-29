/**
 * Multi-Tab Auth Sync via BroadcastChannel
 *
 * Broadcasts auth events (logout, login, CSRF token updates) across
 * browser tabs so that all tabs stay in sync. Falls back to
 * `window.addEventListener('storage', ...)` for browsers without
 * BroadcastChannel support.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { syncApiClientCsrfToken } from '@/services/client'
import { useAuthStore } from '@/stores/authStore'

// ── Types ───────────────────────────────────────────────────────────────────

export interface AuthBroadcastMessage {
  type: 'logout' | 'login' | 'csrf-update'
  timestamp: number
  csrfToken?: string
  userId?: string
}

type AuthEventHandler = (message: AuthBroadcastMessage) => void

// ── Constants ───────────────────────────────────────────────────────────────

const CHANNEL_NAME = 'mihas-auth'
const STORAGE_KEY = 'mihas-auth-event'

// ── Singleton state ─────────────────────────────────────────────────────────

let channel: BroadcastChannel | null = null
let storageHandler: ((e: StorageEvent) => void) | null = null
let listeners: AuthEventHandler[] = []
let useBroadcastChannel = false

// ── Helpers ─────────────────────────────────────────────────────────────────

function hasBroadcastChannelSupport(): boolean {
  return typeof BroadcastChannel !== 'undefined'
}

function dispatch(message: AuthBroadcastMessage) {
  for (const handler of listeners) {
    try {
      handler(message)
    } catch {
      // Swallow handler errors to avoid breaking other listeners
    }
  }
}

// ── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize the broadcast transport. Safe to call multiple times —
 * subsequent calls are no-ops if already initialized.
 */
export function initAuthBroadcast(): void {
  if (channel || storageHandler) return // already initialized

  if (hasBroadcastChannelSupport()) {
    useBroadcastChannel = true
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
      dispatch(event.data)
    }
  } else if (typeof window !== 'undefined') {
    useBroadcastChannel = false
    storageHandler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        const message: AuthBroadcastMessage = JSON.parse(e.newValue)
        dispatch(message)
      } catch {
        // Ignore malformed storage values
      }
    }
    window.addEventListener('storage', storageHandler)
  }
}

/**
 * Tear down the broadcast transport and remove all listeners.
 */
export function destroyAuthBroadcast(): void {
  if (channel) {
    channel.close()
    channel = null
  }
  if (storageHandler && typeof window !== 'undefined') {
    window.removeEventListener('storage', storageHandler)
    storageHandler = null
  }
  listeners = []
  useBroadcastChannel = false
}

// ── Subscribe / Unsubscribe ─────────────────────────────────────────────────

export function onAuthBroadcast(handler: AuthEventHandler): () => void {
  listeners.push(handler)
  return () => {
    listeners = listeners.filter((h) => h !== handler)
  }
}

// ── Broadcast helpers ───────────────────────────────────────────────────────

function send(message: AuthBroadcastMessage): void {
  if (useBroadcastChannel && channel) {
    channel.postMessage(message)
  } else if (typeof window !== 'undefined') {
    // Storage event only fires in *other* tabs, which is exactly what we want.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(message))
    // Remove immediately so the next write triggers a new event.
    localStorage.removeItem(STORAGE_KEY)
  }
}

/** Broadcast a logout event to other tabs. Req 4.1 */
export function broadcastLogout(): void {
  send({ type: 'logout', timestamp: Date.now() })
}

/** Broadcast a login event to other tabs. Req 4.3 */
export function broadcastLogin(userId?: string): void {
  send({ type: 'login', timestamp: Date.now(), userId })
}

/** Broadcast a CSRF token update to other tabs. Req 4.4 */
export function broadcastCsrfUpdate(token: string): void {
  send({ type: 'csrf-update', timestamp: Date.now(), csrfToken: token })
}

// ── React hook ──────────────────────────────────────────────────────────────

/**
 * React hook that listens for auth broadcast events and handles them:
 * - logout  → clear React Query auth cache, reset authStore, navigate to /sign-in
 * - login   → invalidate session query so the tab picks up the new user
 * - csrf-update → update the in-memory CSRF token
 *
 * Must be called inside a component tree that has QueryClientProvider and
 * a router (for navigation).
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export function useAuthBroadcast(): void {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    // Ensure the transport is initialized (idempotent)
    initAuthBroadcast()

    const unsubscribe = onAuthBroadcast((message) => {
      switch (message.type) {
        case 'logout':
          // Req 4.2: Clear React Query auth cache, clear authStore, redirect
          queryClient.setQueryData(['auth', 'session'], null)
          queryClient.removeQueries({ queryKey: ['user-profile'] })
          useAuthStore.getState().clearAuth()
          navigate('/auth/signin', { replace: true })
          break

        case 'login':
          // Req 4.3: Invalidate session query so this tab picks up the new user
          queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })
          break

        case 'csrf-update':
          // Req 4.4: Update the in-memory CSRF token from the broadcasting tab
          if (message.csrfToken) {
            syncApiClientCsrfToken(message.csrfToken)
          }
          break
      }
    })

    return () => {
      unsubscribe()
    }
  }, [queryClient, navigate])
}

// ── Testing helpers (exported for unit tests only) ──────────────────────────

/** @internal — exposed for tests to inspect transport type */
export function _isUsingBroadcastChannel(): boolean {
  return useBroadcastChannel
}

/** @internal — exposed for tests to inspect listener count */
export function _getListenerCount(): number {
  return listeners.length
}
