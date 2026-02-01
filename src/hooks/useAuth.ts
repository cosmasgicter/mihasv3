/**
 * Auth Hooks
 * 
 * React Query hooks for authentication operations.
 * Uses the new custom auth API instead of Supabase Auth.
 * 
 * REQUIREMENTS:
 * - 10.2: Implement useSession() hook with proper cache invalidation
 * - 10.3: Implement useLogin() mutation
 * - 10.5: Implement useLogout() mutation
 * - 10.6: Implement useRefreshToken() for automatic refresh
 * 
 * SECURITY NOTES:
 * - Tokens are stored in HTTP-only cookies by the API
 * - Automatic refresh on 401 responses
 * - Redirect to login on refresh failure
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, AuthUser } from '@/stores/authStore';

/**
 * API base URL
 */
const API_BASE = '/api';

/**
 * Auth API response types
 */
interface AuthResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

interface SessionData {
  user: AuthUser;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface LoginData {
  user: AuthUser;
  message: string;
}

/**
 * Fetch wrapper with automatic 401 handling
 * 
 * Requirement 10.1: Implement automatic token refresh on 401
 */
async function authFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<AuthResponse<T>> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Include cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  // Handle 401 - try to refresh token
  if (response.status === 401 && data.code !== 'INVALID_CREDENTIALS') {
    // Try to refresh the token
    const refreshResponse = await fetch(`${API_BASE}/auth?action=refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshResponse.ok) {
      // Retry the original request
      const retryResponse = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      return retryResponse.json();
    }

    // Refresh failed - user needs to re-authenticate
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

/**
 * Query keys for cache management
 */
export const authQueryKeys = {
  all: ['auth'] as const,
  session: () => [...authQueryKeys.all, 'session'] as const,
  user: () => [...authQueryKeys.all, 'user'] as const,
};

/**
 * useSession hook
 * 
 * Requirement 10.2: Implement useSession() hook with proper cache invalidation
 * 
 * Fetches the current user session from the API.
 * Automatically refreshes on window focus.
 */
export function useSession() {
  const { setUser, setLoading, setError, clearAuth } = useAuthStore();

  return useQuery({
    queryKey: authQueryKeys.session(),
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        setLoading(true);
        const response = await authFetch<SessionData>(
          `${API_BASE}/auth?action=session`
        );

        if (response.success && response.data?.user) {
          setUser(response.data.user);
          return response.data.user;
        }

        clearAuth();
        return null;
      } catch (error) {
        setError((error as Error).message);
        clearAuth();
        return null;
      } finally {
        setLoading(false);
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: true,
    retry: false, // Don't retry on failure - let the user re-authenticate
  });
}

/**
 * useLogin hook
 * 
 * Requirement 10.3: Implement useLogin() mutation
 * 
 * Handles user login with email and password.
 */
export function useLogin() {
  const queryClient = useQueryClient();
  const { setUser, setLoading, setError, incrementRetry, canRetry } = useAuthStore();

  return useMutation({
    mutationFn: async (credentials: LoginCredentials): Promise<AuthUser> => {
      // Check if we can retry (exponential backoff)
      if (!canRetry()) {
        throw new Error('Too many login attempts. Please wait before trying again.');
      }

      setLoading(true);
      setError(null);

      try {
        const response = await authFetch<LoginData>(
          `${API_BASE}/auth?action=login`,
          {
            method: 'POST',
            body: JSON.stringify(credentials),
          }
        );

        if (!response.success || !response.data?.user) {
          throw new Error(response.error || 'Login failed');
        }

        return response.data.user;
      } catch (error) {
        incrementRetry();
        throw error;
      }
    },
    onSuccess: (user) => {
      setUser(user);
      setLoading(false);
      // Invalidate session query to refetch
      queryClient.invalidateQueries({ queryKey: authQueryKeys.session() });
    },
    onError: (error) => {
      setError((error as Error).message);
      setLoading(false);
    },
  });
}

/**
 * useLogout hook
 * 
 * Requirement 10.5: Implement useLogout() mutation
 * 
 * Handles user logout and clears all auth state.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { clearAuth, setLoading } = useAuthStore();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      setLoading(true);

      await authFetch(`${API_BASE}/auth?action=logout`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      // Clear all auth state
      clearAuth();
      // Clear all cached queries
      queryClient.clear();
      // Redirect to login
      navigate('/login');
    },
    onError: () => {
      // Even on error, clear local state and redirect
      clearAuth();
      queryClient.clear();
      navigate('/login');
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}

/**
 * useRefreshToken hook
 * 
 * Requirement 10.6: Implement useRefreshToken() for automatic refresh
 * 
 * Manually triggers a token refresh.
 * Usually called automatically by authFetch on 401.
 */
export function useRefreshToken() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setUser, clearAuth, setError } = useAuthStore();

  return useMutation({
    mutationFn: async (): Promise<AuthUser | null> => {
      const response = await fetch(`${API_BASE}/auth?action=refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      return data.data?.user || null;
    },
    onSuccess: (user) => {
      if (user) {
        setUser(user);
        queryClient.invalidateQueries({ queryKey: authQueryKeys.session() });
      } else {
        // No user returned - session invalid
        clearAuth();
        navigate('/login');
      }
    },
    onError: () => {
      // Refresh failed - redirect to login
      setError('Session expired. Please log in again.');
      clearAuth();
      queryClient.clear();
      navigate('/login');
    },
  });
}

/**
 * useRegister hook
 * 
 * Handles new user registration.
 */
export function useRegister() {
  const queryClient = useQueryClient();
  const { setUser, setLoading, setError } = useAuthStore();

  return useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }): Promise<AuthUser> => {
      setLoading(true);
      setError(null);

      const response = await authFetch<LoginData>(
        `${API_BASE}/auth?action=register`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );

      if (!response.success || !response.data?.user) {
        throw new Error(response.error || 'Registration failed');
      }

      return response.data.user;
    },
    onSuccess: (user) => {
      setUser(user);
      setLoading(false);
      queryClient.invalidateQueries({ queryKey: authQueryKeys.session() });
    },
    onError: (error) => {
      setError((error as Error).message);
      setLoading(false);
    },
  });
}

/**
 * useActiveSessions hook
 * 
 * Fetches the user's active sessions for security settings.
 */
export function useActiveSessions() {
  return useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: async () => {
      const response = await authFetch<{ sessions: unknown[] }>(
        `${API_BASE}/sessions?action=list`
      );
      return response.data?.sessions || [];
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * useRevokeSession hook
 * 
 * Revokes a specific session.
 */
export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string): Promise<void> => {
      await authFetch(`${API_BASE}/sessions?action=revoke`, {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
    },
  });
}

/**
 * useRevokeAllSessions hook
 * 
 * Revokes all sessions except the current one.
 */
export function useRevokeAllSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      await authFetch(`${API_BASE}/sessions?action=revoke-all`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
    },
  });
}


/**
 * useAuth hook
 * 
 * Re-exports the useAuth from AuthContext for convenience.
 * This allows importing from @/hooks/useAuth instead of @/contexts/AuthContext
 */
export { useAuth } from '@/contexts/AuthContext';
