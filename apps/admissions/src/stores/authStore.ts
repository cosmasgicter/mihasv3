/**
 * Auth Store — Retry/Backoff/Error State Only
 * 
 * Zustand store for managing auth retry and error state.
 * User identity and authentication status are managed exclusively
 * by useSessionListener (React Query) via AuthContext.
 * 
 * This store retains ONLY:
 * - Loading state for auth operations
 * - Error state for auth failures
 * - Retry count and backoff logic for exponential backoff
 * 
 * For user identity, role, and auth status, use:
 *   import { useAuth } from '@/contexts/AuthContext'
 * 
 * REQUIREMENTS:
 * - 1.1: Single source of truth for auth state (React Query)
 * - 1.2: authStore retains only retry/backoff/error state
 * - 1.3: User identity delegated to useSessionListener
 * - 10.4: Implement exponential backoff on auth failures
 * - 10.7: Clear local auth state on logout
 */

import { create } from 'zustand';
import { clearCsrfToken } from '@/lib/csrfToken';

/**
 * Auth state — retry/backoff/error only.
 * User identity lives in React Query via useSessionListener.
 */
interface AuthState {
  isLoading: boolean;
  error: string | null;
  retryCount: number;
  lastRetryTime: number | null;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearAuth: () => void;
  incrementRetry: () => void;
  resetRetry: () => void;
  canRetry: () => boolean;
  getRetryDelay: () => number;
}

/** Maximum retry attempts before giving up */
const MAX_RETRY_ATTEMPTS = 5;

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY = 1000;

/** Maximum delay between retries (ms) */
const MAX_RETRY_DELAY = 30000;

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(retryCount: number): number {
  const exponentialDelay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY);
}

/**
 * Auth store — retry/backoff/error state only.
 * Tokens live in HTTP-only cookies. User identity lives in React Query.
 */
export const useAuthStore = create<AuthState>()(
  (set, get) => ({
    isLoading: false,
    error: null,
    retryCount: 0,
    lastRetryTime: null,

    setLoading: (loading) => {
      set({ isLoading: loading });
    },

    setError: (error) => {
      set({ error });
    },

    /**
     * Clear all auth-related state (logout).
     * Requirement 10.7: Clear local auth state on logout
     */
    clearAuth: () => {
      clearCsrfToken();
      set({
        isLoading: false,
        error: null,
        retryCount: 0,
        lastRetryTime: null,
      });
    },

    /**
     * Increment retry count for exponential backoff.
     * Requirement 10.4: Implement exponential backoff on auth failures
     */
    incrementRetry: () => {
      set((state) => ({
        retryCount: state.retryCount + 1,
        lastRetryTime: Date.now(),
      }));
    },

    resetRetry: () => {
      set({
        retryCount: 0,
        lastRetryTime: null,
      });
    },

    /**
     * Check if we can retry based on backoff.
     * Requirement 10.4: Implement exponential backoff on auth failures
     */
    canRetry: () => {
      const state = get();
      if (state.retryCount >= MAX_RETRY_ATTEMPTS) {
        return false;
      }
      if (state.lastRetryTime) {
        const delay = calculateBackoffDelay(state.retryCount);
        const timeSinceLastRetry = Date.now() - state.lastRetryTime;
        return timeSinceLastRetry >= delay;
      }
      return true;
    },

    getRetryDelay: () => {
      const state = get();
      return calculateBackoffDelay(state.retryCount);
    },
  })
);

/**
 * Helper hook to check if loading
 */
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);

/**
 * Helper hook to get auth error
 */
export const useAuthError = () => useAuthStore((state) => state.error);
