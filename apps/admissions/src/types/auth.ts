/**
 * Custom Auth Types for MIHAS Application System
 * 
 * These types define app-level User and Session contracts.
 * All authentication is handled via HTTP-only cookies and /api/auth endpoints.
 * 
 * @module types/auth
 */

/**
 * User roles in the system
 */
export type UserRole =
  | 'student'
  | 'reviewer'
  | 'admissions_officer'
  | 'registrar'
  | 'finance_officer'
  | 'academic_head'
  | 'admin'
  | 'super_admin';

/**
 * User type for custom JWT authentication
 */
export interface User {
  id: string;
  email: string;
  role: string; // Keep as string for flexibility with API responses
  full_name?: string;
  email_confirmed_at?: string;
  created_at?: string;
  updated_at?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

/**
 * User profile from profiles table
 */
export interface UserProfile {
  id: string;
  user_id?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  role: string;
  date_of_birth?: string;
  sex?: string;
  residence_town?: string;
  country?: string;
  nationality?: string;
  address?: string;
  city?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  avatar_url?: string;
  bio?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/**
 * Auth session response from /api/auth?action=session
 */
export interface AuthSession {
  user: User | null;
  profile: UserProfile | null;
}

/**
 * Sign in result from /api/auth?action=login
 */
export interface SignInResult {
  user?: User;
  profile?: UserProfile | null;
  error?: string;
}

/**
 * Sign up result from /api/auth?action=register
 */
export interface SignUpResult {
  user?: User | null;
  profile?: UserProfile | null;
  error?: string;
}

/**
 * Password reset result
 */
export interface PasswordResetResult {
  success?: boolean;
  error?: string;
}

/**
 * Auth API response wrapper
 */
export interface AuthApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Login request payload
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Register request payload
 */
export interface RegisterRequest {
  email: string;
  password: string;
  full_name?: string;
  phone?: string;
  date_of_birth?: string;
  sex?: string;
  residence_town?: string;
  country?: string;
  nationality?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  role?: UserRole;
}

/**
 * Password reset request payload
 */
export interface PasswordResetRequest {
  email: string;
}

/**
 * Update password request payload
 */
export interface UpdatePasswordRequest {
  token: string;
  password: string;
}
