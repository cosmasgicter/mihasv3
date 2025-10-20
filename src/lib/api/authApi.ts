import { getApiBaseUrl } from '../apiConfig';
import { getSupabaseClient } from '../supabase';

export interface AuthUserRole {
  id: string;
  user_id: string;
  role: string;
  permissions: string[] | null;
  department: string | null;
  is_active: boolean;
}

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export async function fetchUserRole(): Promise<AuthUserRole | null> {
  const token = await getAuthToken();
  if (!token) return null;

  const response = await fetch(`${getApiBaseUrl()}/api/auth-roles`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) return null;

  const { data } = await response.json();
  return data;
}

export async function syncUserRole(userId: string, role: string): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  const response = await fetch(`${getApiBaseUrl()}/api/auth-sync-roles`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId, role })
  });

  return response.ok;
}
