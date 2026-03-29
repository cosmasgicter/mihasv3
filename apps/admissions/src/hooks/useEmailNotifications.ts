import { useState, useEffect, useCallback } from 'react'
import { notificationService } from '@/services/notifications'

interface EmailNotification {
  id: string
  application_id: string
  recipient_email: string
  subject: string
  body: string
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  created_at: string
}

export function useEmailNotifications() {
  const [notifications, setNotifications] = useState<EmailNotification[]>([])
  const [loading, setLoading] = useState(false)

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true)
      const result = await notificationService.list()
      const items = Array.isArray(result) ? result : (result as any)?.results ?? []
      setNotifications(items as EmailNotification[])
    } catch {
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [])

  const markAsSent = useCallback(async (notificationId: string) => {
    try {
      await notificationService.markRead(notificationId)
      await loadNotifications()
    } catch {
      await loadNotifications()
    }
  }, [loadNotifications])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  return {
    notifications,
    loading,
    loadNotifications,
    markAsSent
  }
}
