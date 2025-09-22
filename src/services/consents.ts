import { apiClient } from './client'

export interface UserConsentRecord {
  id: string
  userId: string
  consentType: string
  grantedAt: string
  grantedBy: string | null
  revokedAt: string | null
  revokedBy: string | null
  source: string | null
  metadata: Record<string, unknown>
  notes: string | null
  active: boolean
}

export interface UserConsentResponse {
  consents: UserConsentRecord[]
  active: UserConsentRecord[]
}

export type ConsentAction = 'grant' | 'revoke' | 'opt_in' | 'opt_out'

export const userConsentService = {
  list: (): Promise<UserConsentResponse> =>
    apiClient.request('/api/user-consents', {
      method: 'GET'
    }),
  update: (consentType: string, action: ConsentAction, body?: { source?: string; notes?: string }) =>
    apiClient.request('/api/user-consents', {
      method: 'POST',
      body: JSON.stringify({ consentType, action, ...body })
    })
}
