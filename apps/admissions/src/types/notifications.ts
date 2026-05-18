export interface StudentNotification {
  id: string
  title: string
  content: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  action_url?: string
  created_at: string
  read_at?: string
}

export interface EmailNotificationData {
  applicationId: string
  recipientEmail: string
  subject: string
  body: string
}

export interface NotificationData {
  userId: string
  title: string
  content: string
  type?: 'info' | 'success' | 'warning' | 'error'
  actionUrl?: string
}

export interface NotificationResult {
  success: boolean
  error?: string
}

export interface BroadcastResult {
  success: boolean
  sent: number
  error?: string
}

export interface NotificationPreferences {
  id?: string
  user_id: string
  email_enabled: boolean
  sms_enabled: boolean
  whatsapp_enabled: boolean
  in_app_enabled: boolean
  email_consent_at?: string
  sms_consent_at?: string
  whatsapp_consent_at?: string
  quiet_hours_start: string
  quiet_hours_end: string
  timezone: string
  created_at?: string
  updated_at?: string
  is_default?: boolean
}

export interface PreferenceAuditEntry {
  id: string
  user_id: string
  action: 'opt_in' | 'opt_out' | 'update_settings' | 'initialize' | 'delete_all'
  channel: string
  previous_value?: unknown
  new_value?: unknown
  metadata?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
  source: string
  reason?: string
  created_at: string
}

export interface ConsentStatus {
  success: boolean
  user_id: string
  channel?: string
  enabled?: boolean
  status?: 'opted_in' | 'opted_out'
  preferences?: Record<string, boolean>
}
