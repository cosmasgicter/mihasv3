import { getApiBaseUrl } from '../apiConfig';
import { getSupabaseClient } from '../supabase';
import type { StudentNotification } from '@/types/notifications';

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

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
 * @param text - The response text to check
 * @returns true if the response appears to be HTML
 */
export function isHtmlResponse(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

/**
 * Parses a response as JSON, detecting and handling HTML responses
 * @param response - The fetch Response object
 * @throws HtmlResponseError if the response contains HTML instead of JSON
 * @returns The parsed JSON data
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

export async function fetchSettings(): Promise<SystemSetting[]> {
  const token = await getAuthToken();
  if (!token) return [];

  const response = await fetch(`${getApiBaseUrl()}/api/admin?action=settings`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) return [];
  
  const result = await parseJsonResponse<{ data?: SystemSetting[] }>(response);
  return result.data || [];
}

export async function createSetting(setting: Omit<SystemSetting, 'id' | 'created_at' | 'updated_at' | 'updated_by'>): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  const response = await fetch(`${getApiBaseUrl()}/api/admin?action=settings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(setting)
  });

  return response.ok;
}

export async function updateSetting(id: string, updates: Partial<SystemSetting>): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  const response = await fetch(`${getApiBaseUrl()}/api/admin?action=settings`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id, ...updates })
  });

  return response.ok;
}

export async function deleteSetting(id: string): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  const response = await fetch(`${getApiBaseUrl()}/api/admin?action=settings`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id })
  });

  return response.ok;
}

export async function fetchNotifications(): Promise<StudentNotification[]> {
  const token = await getAuthToken();
  if (!token) return [];

  const response = await fetch(`${getApiBaseUrl()}/api/notifications`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) return [];
  
  const result = await parseJsonResponse<{ data?: StudentNotification[] }>(response);
  return result.data || [];
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  const response = await fetch(`${getApiBaseUrl()}/api/notifications`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ notificationId })
  });

  return response.ok;
}

export async function markAllNotificationsRead(): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  const response = await fetch(`${getApiBaseUrl()}/api/notifications`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ markAll: true })
  });

  return response.ok;
}

export async function deleteNotification(notificationId: string): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  const response = await fetch(`${getApiBaseUrl()}/api/notifications`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ notificationId })
  });

  return response.ok;
}
