import { apiClient } from '@/lib/apiClient';
import { authFetch } from '@/lib/authFetch';

export async function apiCall0() {
  return await authFetch('/api/payments', { method: 'PUT' });
}

export async function apiCall1() {
  return await apiClient.request('/api/notifications', { method: 'DELETE' });
}
