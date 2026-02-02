/**
 * Admin API Client - Cookie-based authentication
 * 
 * All admin operations use HTTP-only cookies (credentials: 'include')
 * NO Bearer token headers - cookies are managed by the browser
 * 
 * @module adminApi
 */

import { getApiBaseUrl } from '../apiConfig';
import type { StudentNotification } from '@/types/notifications';

/**
 * Custom error class for HTML response detection
 */
export class HtmlResponseError extends Error {
  constructor(message: string = 'Server returned an unexpected response. Please try again.') {
    super(message);
    this.name = 'HtmlResponseError';
  }
}

/**
 * Checks if a response body contains HTML instead of JSON
 */
export function isHtmlResponse(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

/**
 * Parses a response as JSON, detecting and handling HTML responses
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  
  if (isHtmlResponse(text)) {
    throw new HtmlResponseError();
  }
  
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Failed to parse server response');
  }
}

export interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  setting_type: 'string' | 'integer' | 'decimal' | 'boolean';
  description: string | null;
  is_public: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch wrapper with credentials (HTTP-only cookies)
 */
async function adminFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; data?: T }> {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // CRITICAL: Send HTTP-only cookies
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      return { ok: false };
    }

    const result = await parseJsonResponse<{ data?: T }>(response);
    return { ok: true, data: result.data };
  } catch {
    return { ok: false };
  }
}

export async function fetchSettings(): Promise<SystemSetting[]> {
  const result = await adminFetch<SystemSetting[]>(
    `${getApiBaseUrl()}/api/admin?action=settings`
  );
  return result.data || [];
}

export async function createSetting(
  setting: Omit<SystemSetting, 'id' | 'created_at' | 'updated_at' | 'updated_by'>
): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/admin?action=settings`,
    {
      method: 'POST',
      body: JSON.stringify(setting),
    }
  );
  return result.ok;
}

export async function updateSetting(
  id: string,
  updates: Partial<SystemSetting>
): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/admin?action=settings`,
    {
      method: 'PUT',
      body: JSON.stringify({ id, ...updates }),
    }
  );
  return result.ok;
}

export async function deleteSetting(id: string): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/admin?action=settings`,
    {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    }
  );
  return result.ok;
}

export async function importSettings(
  settings: Omit<SystemSetting, 'id' | 'created_at' | 'updated_at' | 'updated_by'>[]
): Promise<{ success: boolean; imported?: string[]; errors?: string[]; message?: string }> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/admin?action=import-settings`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      }
    );

    if (!response.ok) {
      return { success: false, message: 'Import failed' };
    }

    const result = await parseJsonResponse<{ data?: { imported?: string[]; errors?: string[]; message?: string } }>(response);
    return {
      success: true,
      imported: result.data?.imported,
      errors: result.data?.errors,
      message: result.data?.message,
    };
  } catch {
    return { success: false, message: 'Import failed' };
  }
}

export async function resetSettings(): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/admin?action=reset-settings`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      return { success: false, message: 'Reset failed' };
    }

    const result = await parseJsonResponse<{ data?: { message?: string } }>(response);
    return {
      success: true,
      message: result.data?.message,
    };
  } catch {
    return { success: false, message: 'Reset failed' };
  }
}

export async function fetchNotifications(): Promise<StudentNotification[]> {
  const result = await adminFetch<StudentNotification[]>(
    `${getApiBaseUrl()}/api/notifications?action=list`
  );
  return result.data || [];
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/notifications?action=mark-read`,
    {
      method: 'PUT',
      body: JSON.stringify({ notificationId }),
    }
  );
  return result.ok;
}

export async function markAllNotificationsRead(): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/notifications?action=mark-all-read`,
    {
      method: 'PUT',
    }
  );
  return result.ok;
}

export async function deleteNotification(notificationId: string): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/notifications?action=delete`,
    {
      method: 'DELETE',
      body: JSON.stringify({ notificationId }),
    }
  );
  return result.ok;
}


export interface EligibilityRule {
  id: string;
  program_id: string;
  rule_name: string;
  rule_type: string;
  condition_json: Record<string, unknown>;
  weight: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  programs?: { name: string };
}

export async function fetchEligibilityRules(): Promise<EligibilityRule[]> {
  const result = await adminFetch<{ rules: EligibilityRule[] }>(
    `${getApiBaseUrl()}/api/admin?action=eligibility-rules`
  );
  return result.data?.rules || [];
}

export async function createEligibilityRule(
  rule: Omit<EligibilityRule, 'id' | 'created_at' | 'updated_at' | 'programs'>
): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/admin?action=eligibility-rules`,
    {
      method: 'POST',
      body: JSON.stringify(rule),
    }
  );
  return result.ok;
}

export async function updateEligibilityRule(
  id: string,
  updates: Partial<Omit<EligibilityRule, 'id' | 'created_at' | 'updated_at' | 'programs'>>
): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/admin?action=eligibility-rules`,
    {
      method: 'PUT',
      body: JSON.stringify({ id, ...updates }),
    }
  );
  return result.ok;
}

export async function deleteEligibilityRule(id: string): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/admin?action=eligibility-rules`,
    {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    }
  );
  return result.ok;
}


export interface UserWithRole {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  created_at: string;
}

export async function fetchUsersWithRoles(): Promise<UserWithRole[]> {
  const result = await adminFetch<{ data: UserWithRole[]; meta: { total: number } }>(
    `${getApiBaseUrl()}/api/admin?action=users&limit=100`
  );
  return result.data?.data || [];
}

export async function updateUserRole(userId: string, role: string): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/admin?action=update-role`,
    {
      method: 'PUT',
      body: JSON.stringify({ userId, role }),
    }
  );
  return result.ok;
}
