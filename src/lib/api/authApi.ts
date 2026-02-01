/**
 * Auth API Client - Cookie-based authentication
 * 
 * All auth operations use HTTP-only cookies (credentials: 'include')
 * NO localStorage token storage - cookies are managed by the browser
 * 
 * @module authApi
 */

import { getApiBaseUrl } from '../apiConfig';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  full_name?: string;
  created_at?: string;
}

export interface AuthUserRole {
  id: string;
  user_id: string;
  role: string;
  permissions: string[] | null;
  department: string | null;
  is_active: boolean;
}

export interface AuthSession {
  user: AuthUser;
  expires_at: string;
}

export interface LoginResponse {
  success: boolean;
  data?: {
    user: AuthUser;
    profile?: any;
  };
  error?: string;
  code?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role?: string;
}

/**
 * Fetch wrapper that always includes credentials (HTTP-only cookies)
 * This is the ONLY way to make authenticated API calls
 */
async function authFetch<T>(
  url: string, 
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string; code?: string }> {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // CRITICAL: Send HTTP-only cookies
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || result.message || 'Request failed',
        code: result.code,
      };
    }

    return result;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('fetch') || error.message.includes('network')) {
        return { success: false, error: 'Network error. Please check your connection.' };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get current user's role and permissions
 * Uses HTTP-only cookie for authentication
 */
export async function fetchUserRole(): Promise<AuthUserRole | null> {
  const baseUrl = getApiBaseUrl();
  const result = await authFetch<AuthUserRole>(`${baseUrl}/api/auth?action=roles`);
  return result.success && result.data ? result.data : null;
}

/**
 * Login with email and password
 * Sets HTTP-only cookies on success
 */
export async function login(
  email: string, 
  password: string
): Promise<LoginResponse> {
  const baseUrl = getApiBaseUrl();
  return authFetch<LoginResponse['data']>(`${baseUrl}/api/auth?action=login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/**
 * Logout current user
 * Clears HTTP-only cookies
 */
export async function logout(): Promise<{ success: boolean; error?: string }> {
  const baseUrl = getApiBaseUrl();
  return authFetch(`${baseUrl}/api/auth?action=logout`, {
    method: 'POST',
  });
}

/**
 * Get current session from HTTP-only cookie
 * Returns user data if authenticated, null otherwise
 */
export async function getSession(): Promise<{ success: boolean; data?: AuthSession; error?: string }> {
  const baseUrl = getApiBaseUrl();
  return authFetch<AuthSession>(`${baseUrl}/api/auth?action=session`);
}

/**
 * Register a new user account
 * Auto-sets HTTP-only cookies on success (auto-login)
 */
export async function register(data: RegisterData): Promise<LoginResponse> {
  const baseUrl = getApiBaseUrl();
  return authFetch<LoginResponse['data']>(`${baseUrl}/api/auth?action=register`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Request password reset email
 */
export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = getApiBaseUrl();
  return authFetch(`${baseUrl}/api/auth?action=forgot-password`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/**
 * Reset password with token from email
 */
export async function resetPassword(
  token: string, 
  password: string
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = getApiBaseUrl();
  return authFetch(`${baseUrl}/api/auth?action=reset-password`, {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

/**
 * Verify email with token
 */
export async function verifyEmail(
  token: string
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = getApiBaseUrl();
  return authFetch(`${baseUrl}/api/auth?action=verify-email`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

/**
 * Refresh session (extends cookie expiry)
 * Called automatically by the session listener
 */
export async function refreshSession(): Promise<{ success: boolean; data?: AuthSession; error?: string }> {
  const baseUrl = getApiBaseUrl();
  return authFetch<AuthSession>(`${baseUrl}/api/auth?action=refresh`, {
    method: 'POST',
  });
}
