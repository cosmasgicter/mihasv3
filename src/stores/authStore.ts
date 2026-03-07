/**
 * Auth Store
 * 
 * Zustand store for managing authentication state.
 * Implements automatic token refresh on 401, exponential backoff,
 * and local state management.
 * 
 * REQUIREMENTS:
 * - 10.1: Implement automatic token refresh on 401
 * - 10.4: Implement exponential backoff on auth failures
 * - 10.7: Clear local auth state on logout
 * 
 * SECURITY NOTES:
 * - Tokens are stored in HTTP-only cookies (not in this store)
 * - This store only tracks auth state, not credentials
 * - Exponential backoff prevents retry storms
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { clearCsrfToken } from '@/lib/csrfToken';

/**
 * User role type
 */
export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'admissions_officer'
  | 'registrar'
  | 'finance_officer'
  | 'academic_head'
  | 'reviewer'
  | 'student';

/**
 * User session info
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  permissions: string[];
}

/**
 * Auth state
 */
interface AuthState {
  // User state
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Error state
  error: string | null;
  
  // Retry state for exponential backoff
  retryCount: number;
  lastRetryTime: number | null;
  
  // Actions
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearAuth: () => void;
  
  // Retry management
  incrementRetry: () => void;
  resetRetry: () => void;
  canRetry: () => boolean;
  getRetryDelay: () => number;
}

/**
 * Maximum retry attempts before giving up
 */
const MAX_RETRY_ATTEMPTS = 5;

/**
 * Base delay for exponential backoff (in ms)
 */
const BASE_RETRY_DELAY = 1000;

/**
 * Maximum delay between retries (in ms)
 */
const MAX_RETRY_DELAY = 30000;

/**
 * Calculate exponential backoff delay
 * 
 * @param retryCount - Current retry count
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(retryCount: number): number {
  // Exponential backoff with jitter
  const exponentialDelay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
  const jitter = Math.random() * 1000; // Add up to 1 second of jitter
  return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY);
}

/**
 * Auth store
 * 
 * Manages authentication state with persistence.
 * Note: Actual tokens are in HTTP-only cookies, not stored here.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      retryCount: 0,
      lastRetryTime: null,

      /**
       * Set the authenticated user
       */
      setUser: (user) => {
        set({
          user,
          isAuthenticated: !!user,
          error: null,
        });
        
        // Reset retry count on successful auth
        if (user) {
          get().resetRetry();
        }
      },

      /**
       * Set loading state
       */
      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      /**
       * Set error state
       */
      setError: (error) => {
        set({ error });
      },

      /**
       * Clear all auth state (logout)
       * 
       * Requirement 10.7: Clear local auth state on logout
       */
      clearAuth: () => {
        clearCsrfToken();
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          retryCount: 0,
          lastRetryTime: null,
        });
      },

      /**
       * Increment retry count for exponential backoff
       * 
       * Requirement 10.4: Implement exponential backoff on auth failures
       */
      incrementRetry: () => {
        set((state) => ({
          retryCount: state.retryCount + 1,
          lastRetryTime: Date.now(),
        }));
      },

      /**
       * Reset retry count
       */
      resetRetry: () => {
        set({
          retryCount: 0,
          lastRetryTime: null,
        });
      },

      /**
       * Check if we can retry based on backoff
       * 
       * Requirement 10.4: Implement exponential backoff on auth failures
       */
      canRetry: () => {
        const state = get();
        
        // Check if we've exceeded max retries
        if (state.retryCount >= MAX_RETRY_ATTEMPTS) {
          return false;
        }
        
        // Check if enough time has passed since last retry
        if (state.lastRetryTime) {
          const delay = calculateBackoffDelay(state.retryCount);
          const timeSinceLastRetry = Date.now() - state.lastRetryTime;
          return timeSinceLastRetry >= delay;
        }
        
        return true;
      },

      /**
       * Get the delay before next retry
       */
      getRetryDelay: () => {
        const state = get();
        return calculateBackoffDelay(state.retryCount);
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist user info, not loading/error states
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

/**
 * Helper hook to get just the user
 */
export const useAuthUser = () => useAuthStore((state) => state.user);

/**
 * Helper hook to check if authenticated
 */
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);

/**
 * Helper hook to check if loading
 */
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);

/**
 * Helper hook to get auth error
 */
export const useAuthError = () => useAuthStore((state) => state.error);

/**
 * Helper hook to check user role
 */
export const useHasRole = (roles: UserRole | UserRole[]) => {
  const user = useAuthStore((state) => state.user);
  if (!user) return false;
  
  const roleArray = Array.isArray(roles) ? roles : [roles];
  return roleArray.includes(user.role);
};

/**
 * Helper hook to check user permission
 */
export const useHasPermission = (permission: string) => {
  const user = useAuthStore((state) => state.user);
  if (!user) return false;
  
  return user.permissions.includes(permission);
};
