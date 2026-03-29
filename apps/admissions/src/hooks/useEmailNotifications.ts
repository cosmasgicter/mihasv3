import { useState, useEffect } from 'react'
import { apiClient } from '@/services/client'

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
      const result = await apiClient.request<{ data: EmailNotification[] } | EmailNotification[]>(
        '/notifications?action=preferences'
      )
      
      if (Array.isArray(result)) {
        setNotifications(result)
      } else if (result && 'data' in result) {
        setNotifications(result.data ?? [])
      } else {
        setNotifications([])
      }
    } catch (error) {
      console.error('Error loading notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsSent = async (notificationId: string) => {
    try {
      await apiClient.request('/notifications?action=send', {
        method: 'POST',
        body: JSON.stringify({
          id: notificationId,
          status: 'sent',
          sent_at: new Date().toISOString()
        })
      })
      await loadNotifications()
    } catch (error) {
      console.error('Error updating notification:', error)
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
