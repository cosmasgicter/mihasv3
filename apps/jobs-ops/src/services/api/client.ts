import { env } from '@/lib/env'
import type { ApiEnvelope } from '@/services/api/contracts'

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const payload = (await response.json()) as ApiEnvelope<T> | T

  if (!response.ok) {
    if (typeof payload === 'object' && payload && 'error' in payload) {
      throw new Error(String(payload.error || 'API request failed'))
    }
    throw new Error('API request failed')
  }

  if (typeof payload === 'object' && payload && 'success' in payload) {
    return payload.data
  }

  return payload as T
}

export const apiClient = {
  get<T>(path: string) {
    return request<T>(path, { method: 'GET' })
  },
  post<T>(path: string, body?: unknown) {
    return request<T>(path, { method: 'POST', body })
  },
}

