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
  setting: SystemSettingPayload
): Promise<boolean> {
  try {
    await apiClient.request('/admin/settings/', {
      method: 'POST',
      body: JSON.stringify({
        key: setting.key,
        value: setting.value,
        description: setting.description,
        category: setting.category,
        is_public: setting.is_public ?? false,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function updateSetting(
  id: string,
  updates: Partial<SystemSettingPayload>
): Promise<boolean> {
  try {
    await apiClient.request(`/admin/settings/${encodeURIComponent(id)}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        value: updates.value,
        description: updates.description,
        category: updates.category,
        is_public: updates.is_public,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteSetting(id: string): Promise<boolean> {
  try {
    await apiClient.request(`/admin/settings/${encodeURIComponent(id)}/`, {
      method: 'DELETE',
    });
    return true;
  } catch {
    return false;
  }
}

export async function importSettings(
  settings: Array<SystemSettingPayload>
): Promise<{ success: boolean; imported?: string[]; errors?: string[]; message?: string }> {
  try {
    const result = await apiClient.request<{ imported?: string[]; errors?: string[]; message?: string }>(
      '/admin/settings/import/',
      {
        method: 'POST',
        body: JSON.stringify({ settings }),
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





