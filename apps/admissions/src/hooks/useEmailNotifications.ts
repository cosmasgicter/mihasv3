import { useState, useEffect } from 'react'

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

  const loadNotifications = async () => {
    try {
      setLoading(true)
      setNotifications([])
    } catch {
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }

  const markAsSent = async (notificationId: string) => {
    try {
      void notificationId
      await loadNotifications()
    } catch {
      await loadNotifications()
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [])

  return {
    notifications,
    loading,
    loadNotifications,
    markAsSent
  }
}
