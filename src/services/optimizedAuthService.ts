/**
 * Optimized Authentication Service - Cookie-based authentication
 * 
 * Uses HTTP-only cookies (credentials: 'include') for authentication
 * NO Supabase Auth SDK - all auth via custom API endpoints
 * 
 * @module optimizedAuthService
 */

import { QueryClient } from '@tanstack/react-query';
import { sanitizeForDisplay } from '@/lib/sanitize';
import { preloadDashboardData } from './dashboardPreloader';
import type { UserProfile } from '@/lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  full_name?: string;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
}

export interface OptimizedLoginResult {
  user: AuthUser;
  profile: UserProfile | null;
  error?: never;
}

export interface OptimizedLoginError {
  user?: never;
  profile?: never;
  error: string;
}

export type OptimizedLoginResponse = OptimizedLoginResult | OptimizedLoginError;

/**
 * Sanitize profile data
 */
function sanitizeProfile(data: any | null): UserProfile | null {
  if (!data) return null;

  return Object.entries(data).reduce((acc, [key, value]) => {
    (acc as any)[key] = typeof value === 'string' ? sanitizeForDisplay(value) : value;
    return acc;
  }, {} as UserProfile);
}

/**
 * Track device session (non-blocking)
 * Uses HTTP-only cookies for authentication
 */
function trackDeviceSession(): void {
  try {
    const deviceId =
      localStorage.getItem('device_id') ||
      (crypto?.randomUUID
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

    if (deviceId) {
      localStorage.setItem('device_id', deviceId);
    }

    // Fire and forget - don't await
    fetch('/api/sessions?action=track', {
      method: 'POST',
      credentials: 'include', // CRITICAL: Send HTTP-only cookies
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: deviceId,
        device_info: navigator.userAgent,
      }),
    }).catch(() => {
      // Silent fail for session tracking
    });
  } catch {
    // Silent fail for session tracking
  }
}

/**
 * Optimized login with parallel data fetching and dashboard preloading
 * 
 * This function:
 * 1. Authenticates the user via custom API (sets HTTP-only cookies)
 * 2. Receives user and profile data in single response
 * 3. Tracks device session (non-blocking)
 * 4. Preloads dashboard data (non-blocking)
 * 5. Returns all data in a single response
 */
export async function optimizedLogin(
  email: string,
  password: string,
  queryClient?: QueryClient
): Promise<OptimizedLoginResponse> {
  try {
    // Step 1: Authenticate user via custom API
    const response = await fetch('/api/auth?action=login', {
      method: 'POST',
      credentials: 'include', // CRITICAL: Receive HTTP-only cookies
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      const errorMessage = result.error || 'Unable to sign in. Please try again.';
      
      if (errorMessage.includes('Invalid') || errorMessage.includes('credentials')) {
        return { error: 'Invalid email or password' };
      }
      if (errorMessage.includes('verify') || errorMessage.includes('confirmed')) {
        return { error: 'Please verify your email address before signing in' };
      }
      return { error: errorMessage };
    }

    const userData = result.data?.user;
    const profileData = result.data?.profile;

    if (!userData) {
      return { error: 'Unable to sign in. Please try again.' };
    }

    // Step 2: Create auth user object
    const user: AuthUser = {
      id: userData.id,
      email: userData.email,
      role: userData.role || profileData?.role || 'student',
      full_name: userData.full_name || profileData?.full_name,
      user_metadata: { role: userData.role },
      app_metadata: { role: userData.role },
    };

    // Step 3: Sanitize profile
    const profile = sanitizeProfile(profileData);

    // Step 4: Track device session (non-blocking - fire and forget)
    trackDeviceSession();

    // Step 5: Preload dashboard data (non-blocking - fire and forget)
    if (queryClient && profile) {
      preloadDashboardData(queryClient, user.id, profile).catch(() => {
        // Silent fail - preloading is optional
      });
    }

    return { user, profile };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('fetch') || error.message.includes('network')) {
        return { error: 'Network error. Please check your connection.' };
      }
      return { error: error.message };
    }
    return { error: 'An unexpected error occurred. Please try again.' };
  }
}

/**
 * Validate session and fetch profile
 * Uses HTTP-only cookies for authentication
 */
export async function validateSessionWithProfile(): Promise<{
  user: AuthUser | null;
  profile: UserProfile | null;
}> {
  try {
    const response = await fetch('/api/auth?action=session', {
      method: 'GET',
      credentials: 'include', // CRITICAL: Send HTTP-only cookies
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { user: null, profile: null };
    }

    const result = await response.json();

    if (!result.success || !result.data?.user) {
      return { user: null, profile: null };
    }

    const userData = result.data.user;
    const profileData = result.data.profile;

    const user: AuthUser = {
      id: userData.id,
      email: userData.email,
      role: userData.role || 'student',
      full_name: userData.full_name,
      user_metadata: { role: userData.role },
      app_metadata: { role: userData.role },
    };

    const profile = sanitizeProfile(profileData);

    return { user, profile };
  } catch (error) {
    console.error('Error validating session:', error);
    return { user: null, profile: null };
  }
}
