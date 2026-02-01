/**
 * Session Listener Hook - Cookie-based authentication
 * 
 * CRITICAL: This hook uses HTTP-only cookies ONLY
 * - NO localStorage token storage (XSS vulnerable)
 * - NO Supabase auth SDK (being removed)
 * - All auth state comes from /api/auth endpoints
 * 
 * Auth flow:
 * 1. On mount: GET /api/auth?action=session → Check cookie
 * 2. Login: POST /api/auth?action=login → Cookie set by server
 * 3. Logout: POST /api/auth?action=logout → Cookie cleared by server
 * 
 * @module useSessionListener
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiConfig';
import type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth';

// Re-export types for backward compatibility
export type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth';

// Legacy alias for backward compatibility
export type AuthUser = User;

/**
 * Session listener hook - manages auth state via HTTP-only cookies
 */
export function useSessionListener() {
  const apiBaseUrl = getApiBaseUrl();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  // Check session on mount via API (cookies sent automatically)
  useEffect(() => {
    mountedRef.current = true;

    async function checkSession() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/auth?action=session`, {
          method: 'GET',
          credentials: 'include', // Send HTTP-only cookies
          headers: { 'Content-Type': 'application/json' },
        });

        if (!mountedRef.current) return;

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.user) {
            setUser(data.data.user);
          } else {
            setUser(null);
          }
        } else {
          // Not authenticated or session expired
          setUser(null);
        }
      } catch (error) {
        console.error('[Auth] Session check error:', error);
        if (mountedRef.current) {
          setUser(null);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }

    checkSession();

    return () => {
      mountedRef.current = false;
    };
  }, [apiBaseUrl]);

  /**
   * Sign in with email and password
   * Server sets HTTP-only cookies on success
   */
  const signIn = useCallback(async (
    email: string, 
    password: string
  ): Promise<SignInResult> => {
    try {
      // Clear all cached data from previous sessions
      queryClient.clear();

      const response = await fetch(`${apiBaseUrl}/api/auth?action=login`, {
        method: 'POST',
        credentials: 'include', // Receive HTTP-only cookies
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        return { error: result.error || 'Login failed' };
      }

      // Extract user from response
      const userData = result.data?.user;
      if (userData) {
        const authUser: User = {
          id: userData.id,
          email: userData.email,
          role: userData.role || 'student',
          full_name: userData.full_name,
          user_metadata: { role: userData.role },
          app_metadata: { role: userData.role },
        };

        setUser(authUser);

        // Cache profile data for immediate availability
        if (result.data?.profile) {
          queryClient.setQueryData(['user-profile', authUser.id], result.data.profile);
        }

        // Notify components of successful login
        window.dispatchEvent(new CustomEvent('userLoggedIn', {
          detail: { userId: authUser.id },
        }));

        return {
          user: authUser,
          profile: result.data?.profile,
        };
      }

      return { error: 'Login succeeded but no user data returned' };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('fetch') || error.message.includes('network')) {
          return { error: 'Network error. Please check your connection.' };
        }
        return { error: error.message };
      }
      return { error: 'An unexpected error occurred. Please try again.' };
    }
  }, [apiBaseUrl, queryClient]);

  /**
   * Sign up with email, password, and user data
   * Server sets HTTP-only cookies on success (auto-login)
   */
  const signUp = useCallback(async (
    email: string, 
    password: string, 
    userData: Record<string, any>
  ): Promise<SignUpResult> => {
    try {
      // Remove fields that shouldn't be sent to backend
      const { confirmPassword, turnstileToken, ...cleanUserData } = userData;

      const response = await fetch(`${apiBaseUrl}/api/auth?action=register`, {
        method: 'POST',
        credentials: 'include', // Receive HTTP-only cookies
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...cleanUserData }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (result.error?.includes('already registered') || result.error?.includes('already exists')) {
          return { error: 'This email is already registered. Please sign in instead.' };
        }
        return { error: result.error || 'Unable to create account' };
      }

      // Clear any stale cached data
      queryClient.clear();

      // Extract user from response (auto-login)
      const userData2 = result.data?.user;
      if (userData2) {
        const authUser: User = {
          id: userData2.id,
          email: userData2.email,
          role: userData2.role || 'student',
          full_name: userData2.full_name,
          user_metadata: { role: userData2.role },
          app_metadata: { role: userData2.role },
        };

        setUser(authUser);

        // Notify components of successful login
        window.dispatchEvent(new CustomEvent('userLoggedIn', {
          detail: { userId: authUser.id },
        }));

        return { user: authUser };
      }

      return { user: null };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('fetch') || error.message.includes('network')) {
          return { error: 'Network error. Please check your connection.' };
        }
        return { error: error.message };
      }
      return { error: 'Unable to create account. Please try again.' };
    }
  }, [apiBaseUrl, queryClient]);

  /**
   * Sign out current user
   * Server clears HTTP-only cookies
   */
  const signOut = useCallback(async () => {
    // Clear local state immediately (non-blocking UX)
    setUser(null);

    // Clear React Query cache
    queryClient.clear();

    // Fire-and-forget: notify API of logout
    fetch(`${apiBaseUrl}/api/auth?action=logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {
      // Silent fail - user is already logged out locally
    });
  }, [apiBaseUrl, queryClient]);

  /**
   * Request password reset email
   */
  const requestPasswordReset = useCallback(async (
    email: string
  ): Promise<PasswordResetResult> => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth?action=forgot-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        return { error: result.error || 'Unable to send reset instructions' };
      }

      return {};
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unable to send reset instructions',
      };
    }
  }, [apiBaseUrl]);

  /**
   * Update password with reset token
   */
  const updatePassword = useCallback(async (
    password: string,
    token?: string
  ): Promise<PasswordResetResult> => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth?action=reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, token }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        return { error: result.error || 'Unable to reset password' };
      }

      // If auto-login after reset, update user state
      if (result.data?.user) {
        setUser(result.data.user);
      }

      return {};
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unable to reset password',
      };
    }
  }, [apiBaseUrl]);

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
  };
}
