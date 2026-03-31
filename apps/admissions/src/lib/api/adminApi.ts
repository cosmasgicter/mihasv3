/**
 * Admin API Client - Cookie-based authentication
 *
 * All admin operations use apiClient.request() which handles:
 * - HTTP-only cookies (credentials: 'include')
 * - CSRF token attachment for state-changing requests
 * - Response envelope unwrapping
 * - Error parsing with field-level errors
 *
 * @module adminApi
 */

import { apiClient } from '@/services/client';
import type { StudentNotification } from '@/types/notifications';

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

// ---------------------------------------------------------------------------
// Settings CRUD — /admin/settings/
// ---------------------------------------------------------------------------

export async function fetchSettings(): Promise<SystemSetting[]> {
  const result = await apiClient.request<{ results?: BackendSystemSetting[] }>(
    '/admin/settings/'
  );
  return result?.results?.map(mapBackendSetting) ?? [];
}

export async function createSetting(
  setting: SystemSettingPayload | LegacySystemSettingPayload
): Promise<boolean> {
  const payload = toSystemSettingPayload(setting);
  try {
    await apiClient.request('/admin/settings/', {
      method: 'POST',
      body: JSON.stringify({
        key: payload.key,
        value: payload.value,
        description: payload.description,
        category: payload.category,
        is_public: payload.is_public ?? false,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function updateSetting(
  id: string,
  updates: Partial<SystemSettingPayload | LegacySystemSettingPayload>
): Promise<boolean> {
  const payload = toSystemSettingPayload(updates);
  try {
    await apiClient.request(`/admin/settings/${id}/`, {
      method: 'PUT',
      body: JSON.stringify({
        value: payload.value,
        description: payload.description,
        category: payload.category,
        is_public: payload.is_public,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteSetting(id: string, key?: string): Promise<boolean> {
  void key;
  try {
    await apiClient.request(`/admin/settings/${id}/`, {
      method: 'DELETE',
    });
    return true;
  } catch {
    return false;
  }
}

export async function importSettings(
  settings: Array<SystemSettingPayload | LegacySystemSettingPayload>
): Promise<{ success: boolean; imported?: string[]; errors?: string[]; message?: string }> {
  try {
    const normalized = settings.map(toSystemSettingPayload);
    const result = await apiClient.request<{ imported?: string[]; errors?: string[]; message?: string }>(
      '/admin/settings/import/',
      {
        method: 'POST',
        body: JSON.stringify({ settings: normalized }),
      }
    );
    return { success: true, ...result };
  } catch {
    return { success: false, message: 'Failed to import settings' };
  }
}

export async function resetSettings(): Promise<{ success: boolean; message?: string }> {
  try {
    const result = await apiClient.request<{ message?: string }>(
      '/admin/settings/reset/',
      { method: 'POST' }
    );
    return { success: true, ...result };
  } catch {
    return { success: false, message: 'Failed to reset settings' };
  }
}

// ---------------------------------------------------------------------------
// Eligibility Rules CRUD — /admin/eligibility-rules/
// ---------------------------------------------------------------------------

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
  const result = await apiClient.request<{ results?: EligibilityRule[] }>(
    '/admin/eligibility-rules/'
  );
  return result?.results ?? [];
}

export async function createEligibilityRule(
  rule: Omit<EligibilityRule, 'id' | 'created_at' | 'updated_at' | 'programs'>
): Promise<boolean> {
  try {
    await apiClient.request('/admin/eligibility-rules/', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
    return true;
  } catch {
    return false;
  }
}

export async function updateEligibilityRule(
  id: string,
  updates: Partial<Omit<EligibilityRule, 'id' | 'created_at' | 'updated_at' | 'programs'>>
): Promise<boolean> {
  try {
    await apiClient.request(`/admin/eligibility-rules/${id}/`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteEligibilityRule(id: string): Promise<boolean> {
  try {
    await apiClient.request(`/admin/eligibility-rules/${id}/`, {
      method: 'DELETE',
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Users / Roles — /admin/users/
// ---------------------------------------------------------------------------

export interface UserWithRole {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  created_at: string;
}

export async function fetchUsersWithRoles(): Promise<UserWithRole[]> {
  const result = await apiClient.request<{ results?: UserWithRole[]; totalCount?: number }>(
    '/admin/users/?pageSize=100'
  );
  return result?.results ?? [];
}

export async function updateUserRole(userId: string, role: string): Promise<boolean> {
  try {
    await apiClient.request(`/admin/users/${userId}/`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Notifications — /notifications/
// ---------------------------------------------------------------------------

export async function fetchNotifications(): Promise<StudentNotification[]> {
  const result = await apiClient.request<{ results?: StudentNotification[] }>(
    '/notifications/'
  );
  return result?.results ?? [];
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  try {
    await apiClient.request(`/notifications/${notificationId}/read/`, {
      method: 'PUT',
    });
    return true;
  } catch {
    return false;
  }
}

export async function markAllNotificationsRead(): Promise<boolean> {
  try {
    await apiClient.request('/notifications/read-all/', {
      method: 'PUT',
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteNotification(notificationId: string): Promise<boolean> {
  try {
    await apiClient.request(`/notifications/${notificationId}/`, {
      method: 'DELETE',
    });
    return true;
  } catch {
    return false;
  }
}
