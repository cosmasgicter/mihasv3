import { useState, useEffect, useCallback } from 'react'
import { pushNotificationManager } from '@/services/pushNotificationManager'
import { useAuth } from '@/contexts/AuthContext'

export interface UsePushNotificationsReturn {
  isSupported: boolean
  permission: NotificationPermission
  isEnabled: boolean
  isLoading: boolean
  error: string | null
  requestPermission: () => Promise<boolean>
  enableNotifications: () => Promise<void>
  disableNotifications: () => Promise<void>
  sendTestNotification: () => Promise<void>
  updatePreferences: (preferences: any) => Promise<void>
  clearError: () => void
}

/**
 * Hook for managing push notifications
 * Requirements: 9.4 - Enable push notifications for mobile devices
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const { user } = useAuth()
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isEnabled, setIsEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize push notification status
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Check browser support
        const supported = pushNotificationManager.isSupported()
        setIsSupported(supported)

        if (!supported) {
          setIsLoading(false)
          return
        }

        // Initialize push notification manager
        const initialized = await pushNotificationManager.initialize()
        
        if (initialized) {
          // Get current permission status
          const currentPermission = Notification.permission
          setPermission(currentPermission)

          // Get user preferences if logged in
          if (user?.id && currentPermission === 'granted') {
            const preferences = await pushNotificationManager.getUserPreferences(user.id)
            setIsEnabled(preferences.pushEnabled)
          }
        }
      } catch (err) {
        console.error('Failed to initialize push notifications:', err)
        setError('Failed to initialize push notifications')
      } finally {
        setIsLoading(false)
      }
    }

    initialize()
  }, [user?.id])

  // Request permission for push notifications
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true)
      setError(null)

      const success = await pushNotificationManager.requestPermission()
      
      if (success) {
        setPermission('granted')
        return true
      } else {
        setError('Permission denied. Please enable notifications in your browser settings.')
        return false
      }
    } catch (err) {
      console.error('Failed to request push notification permission:', err)
      setError('Failed to request notification permission')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Enable push notifications
  const enableNotifications = useCallback(async (): Promise<void> => {
    if (!user?.id) {
      setError('User not authenticated')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Request permission if not already granted
      if (permission !== 'granted') {
        const permissionGranted = await requestPermission()
        if (!permissionGranted) {
          return
        }
      }

      // Update user preferences
      await pushNotificationManager.updatePreferences(user.id, {
        pushEnabled: true
      })

      setIsEnabled(true)

      // Send welcome notification
      await pushNotificationManager.sendNotification({
        title: 'Push Notifications Enabled',
        body: 'You will now receive important updates about your application.',
        icon: '/favicon.ico',
        data: { type: 'system' }
      }, user.id)

    } catch (err) {
      console.error('Failed to enable push notifications:', err)
      setError('Failed to enable push notifications')
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, permission, requestPermission])

  // Disable push notifications
  const disableNotifications = useCallback(async (): Promise<void> => {
    if (!user?.id) {
      setError('User not authenticated')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      await pushNotificationManager.updatePreferences(user.id, {
        pushEnabled: false
      })

      setIsEnabled(false)
    } catch (err) {
      console.error('Failed to disable push notifications:', err)
      setError('Failed to disable push notifications')
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  // Send test notification
  const sendTestNotification = useCallback(async (): Promise<void> => {
    if (!user?.id || !isEnabled) {
      setError('Push notifications not enabled')
      return
    }

    try {
      setError(null)

      await pushNotificationManager.sendNotification({
        title: 'Test Notification',
        body: 'This is a test notification to verify your settings are working correctly.',
        icon: '/favicon.ico',
        data: { type: 'test' }
      }, user.id)

    } catch (err) {
      console.error('Failed to send test notification:', err)
      setError('Failed to send test notification')
    }
  }, [user?.id, isEnabled])

  // Update notification preferences
  const updatePreferences = useCallback(async (preferences: any): Promise<void> => {
    if (!user?.id) {
      setError('User not authenticated')
      return
    }

    try {
      setError(null)

      await pushNotificationManager.updatePreferences(user.id, preferences)
    } catch (err) {
      console.error('Failed to update notification preferences:', err)
      setError('Failed to update notification preferences')
    }
  }, [user?.id])

  // Clear error state
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isSupported,
    permission,
    isEnabled,
    isLoading,
    error,
    requestPermission,
    enableNotifications,
    disableNotifications,
    sendTestNotification,
    updatePreferences,
    clearError
  }
}

export default usePushNotifications
