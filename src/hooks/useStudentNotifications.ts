import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { StudentNotification } from '@/types/notifications'
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification as apiDeleteNotification } from '@/lib/api/adminApi'

export function useStudentNotifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<StudentNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const loadNotifications = async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      const data = await fetchNotifications()
      const formattedNotifications = data.map(formatNotification)
      setNotifications(formattedNotifications)
      setUnreadCount(formattedNotifications.filter(n => !n.read).length)
    } catch (error) {
      console.error('Error loading notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notificationId: string) => {
    if (!user?.id) return

    const timestamp = new Date().toISOString()
    try {
      const success = await markNotificationRead(notificationId)
      if (!success) throw new Error('Failed to mark as read')

      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { ...n, read: true, read_at: timestamp }
            : n
        )
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Failed to mark notification as read')
      throw error
    }
  }

  const markAllAsRead = async () => {
    if (!user?.id) return

    const timestamp = new Date().toISOString()
    try {
      const success = await markAllNotificationsRead()
      if (!success) throw new Error('Failed to mark all as read')

      setNotifications(prev => 
        prev.map(n => ({ ...n, read: true, read_at: timestamp }))
      )
      setUnreadCount(0)
    } catch (error) {
      console.error('Failed to mark all notifications as read')
      throw error
    }
  }

  const deleteNotification = async (notificationId: string) => {
    if (!user?.id) return

    try {
      const success = await apiDeleteNotification(notificationId)
      if (!success) throw new Error('Failed to delete')

      setNotifications(prev => prev.filter(n => n.id !== notificationId))
      setUnreadCount(prev => {
        const notification = notifications.find(n => n.id === notificationId)
        return notification && !notification.read ? prev - 1 : prev
      })
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user?.id) return

    loadNotifications()

    const subscription = supabase
      .channel('student_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const newNotification = formatNotification(payload.new)
          
          setNotifications(prev => [newNotification, ...prev])
          if (!newNotification.read) {
            setUnreadCount(prev => prev + 1)
          }
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [user?.id])

  const formatNotification = useCallback((notification: any): StudentNotification => ({
    id: notification.id,
    title: notification.title,
    content: notification.content,
    type: notification.type || 'info',
    read: notification.read || false,
    action_url: notification.action_url,
    created_at: notification.created_at,
    read_at: notification.read_at
  }), [])

  return {
    notifications,
    loading,
    unreadCount,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
  }
}