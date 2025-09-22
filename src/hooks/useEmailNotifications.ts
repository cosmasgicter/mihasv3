import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

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
      const { data, error } = await supabase
        .from('email_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setNotifications(data || [])
    } catch (error) {
      console.error('Error loading notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsSent = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('email_notifications')
        .update({ 
          status: 'sent', 
          sent_at: new Date().toISOString() 
        })
        .eq('id', notificationId)

      if (error) throw error
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