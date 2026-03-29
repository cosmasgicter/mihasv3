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
  key: string;
  value: string;
  description: string | null;
  category: string | null;
  is_public: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface BackendSystemSetting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  category: string | null;
  is_public: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemSettingPayload {
  key: string;
  value: string;
  description?: string | null;
  category?: string | null;
  is_public?: boolean;
}


interface LegacySystemSettingPayload {
  setting_key?: string;
  setting_value?: string;
  category?: string | null;
  description?: string | null;
  is_public?: boolean;
}

function normalizeSettingValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
        return String(parsed);
      }
      return value;
    } catch {
      return value;
    }
  }

  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}


function toSystemSettingPayload(
  setting: Partial<SystemSettingPayload> | LegacySystemSettingPayload
): Partial<SystemSettingPayload> {
  const legacy = setting as LegacySystemSettingPayload;
  const modern = setting as Partial<SystemSettingPayload>;
  return {
    key: 'key' in setting ? modern.key : legacy.setting_key,
    value: 'value' in setting ? modern.value : legacy.setting_value,
    description: setting.description,
    category: setting.category,
    is_public: setting.is_public,
  };
}

function mapBackendSetting(setting: BackendSystemSetting): SystemSetting {
  return {
    id: setting.id,
    key: setting.key,
    value: normalizeSettingValue(setting.value),
    description: setting.description,
    category: setting.category,
    is_public: setting.is_public,
    updated_by: setting.updated_by,
    created_at: setting.created_at,
    updated_at: setting.updated_at,
  };
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

    const result = await parseJsonResponse<{ data?: T } | T>(response);
    const payload =
      result && typeof result === 'object' && 'data' in result
        ? result.data
        : result;

    return { ok: true, data: payload as T };
  } catch {
    return { ok: false };
  }
}

export async function fetchSettings(): Promise<SystemSetting[]> {
  const result = await adminFetch<{ results?: BackendSystemSetting[] }>(
    `${getApiBaseUrl()}/api/v1/admin/settings/`
  );

  return result.data?.results?.map(mapBackendSetting) || [];
}

export async function createSetting(
  setting: SystemSettingPayload | LegacySystemSettingPayload
): Promise<boolean> {
  const payload = toSystemSettingPayload(setting);
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/v1/admin/settings/`,
    {
      method: 'POST',
      body: JSON.stringify({
        key: payload.key,
        value: payload.value,
        description: payload.description,
        category: payload.category,
        is_public: payload.is_public ?? false,
      }),
    }
  );
  return result.ok;
}

export async function updateSetting(
  id: string,
  updates: Partial<SystemSettingPayload | LegacySystemSettingPayload>
): Promise<boolean> {
  const payload = toSystemSettingPayload(updates);
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/v1/admin/settings/${id}/`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        value: payload.value,
        description: payload.description,
        category: payload.category,
        is_public: payload.is_public,
      }),
    }
  );
  return result.ok;
}

export async function deleteSetting(id: string, key?: string): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/v1/admin/settings/${id}/`,
    {
      method: 'DELETE',
      body: JSON.stringify({ id, key }),
    }
  );
  return result.ok;
}

export async function importSettings(
  settings: Array<SystemSettingPayload | LegacySystemSettingPayload>
): Promise<{ success: boolean; imported?: string[]; errors?: string[]; message?: string }> {
  void settings;
  return { success: false, message: 'Bulk settings import is not implemented in the Django backend yet' };
}

export async function resetSettings(): Promise<{ success: boolean; message?: string }> {
  return { success: false, message: 'Settings reset is not implemented in the Django backend yet' };
}

export async function fetchNotifications(): Promise<StudentNotification[]> {
  return [];
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  void notificationId;
  return false;
}

export async function markAllNotificationsRead(): Promise<boolean> {
  return false;
}

export async function deleteNotification(notificationId: string): Promise<boolean> {
  void notificationId;
  return false;
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
  return [];
}

export async function createEligibilityRule(
  rule: Omit<EligibilityRule, 'id' | 'created_at' | 'updated_at' | 'programs'>
): Promise<boolean> {
  void rule;
  return false;
}

export async function updateEligibilityRule(
  id: string,
  updates: Partial<Omit<EligibilityRule, 'id' | 'created_at' | 'updated_at' | 'programs'>>
): Promise<boolean> {
  void id;
  void updates;
  return false;
}

export async function deleteEligibilityRule(id: string): Promise<boolean> {
  void id;
  return false;
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
  const result = await adminFetch<{ results?: UserWithRole[]; totalCount?: number }>(
    `${getApiBaseUrl()}/api/v1/admin/users/?pageSize=100`
  );
  return result.data?.results || [];
}

export async function updateUserRole(userId: string, role: string): Promise<boolean> {
  const result = await adminFetch(
    `${getApiBaseUrl()}/api/v1/admin/users/${userId}/`,
    {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }
  );
  return result.ok;
}
