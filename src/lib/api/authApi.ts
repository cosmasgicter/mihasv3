/**
 * Auth API Client - Cookie-based authentication
 */

import { authRequest } from '@/services/authController'

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

export async function fetchUserRole(): Promise<AuthUserRole | null> {
  const result = await authRequest<AuthUserRole>('/api/auth?action=roles');
  return result.success && result.data ? result.data : null;
}

export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  return authRequest<LoginResponse['data']>('/api/auth?action=login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, {
    attemptRefreshOn401: false,
    redirectOnUnauthorized: false,
  });
}

export async function logout(): Promise<{ success: boolean; error?: string }> {
  return authRequest('/api/auth?action=logout', {
    method: 'POST',
  }, {
    attemptRefreshOn401: false,
    redirectOnUnauthorized: false,
  });
}

export async function getSession(): Promise<{ success: boolean; data?: AuthSession; error?: string }> {
  return authRequest<AuthSession>('/api/auth?action=session');
}

export async function register(data: RegisterData): Promise<LoginResponse> {
  return authRequest<LoginResponse['data']>('/api/auth?action=register', {
    method: 'POST',
    body: JSON.stringify(data),
  }, {
    attemptRefreshOn401: false,
    redirectOnUnauthorized: false,
  });
}

export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; error?: string }> {
  return authRequest('/api/auth?action=forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, {
    attemptRefreshOn401: false,
    redirectOnUnauthorized: false,
  });
}

export async function resetPassword(
  token: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  return authRequest('/api/auth?action=reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  }, {
    attemptRefreshOn401: false,
    redirectOnUnauthorized: false,
  });
}

export async function verifyEmail(
  token: string
): Promise<{ success: boolean; error?: string }> {
  return authRequest('/api/auth?action=verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  }, {
    attemptRefreshOn401: false,
    redirectOnUnauthorized: false,
  });
}

export async function refreshSession(): Promise<{ success: boolean; data?: AuthSession; error?: string }> {
  return authRequest<AuthSession>('/api/auth?action=refresh', {
    method: 'POST',
  }, {
    attemptRefreshOn401: false,
  });
}
