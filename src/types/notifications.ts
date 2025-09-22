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