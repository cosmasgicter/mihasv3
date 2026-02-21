// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { 
  Bell, 
  BellOff, 
  Smartphone, 
  Settings, 
  Clock,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { Alert, AlertDescription } from '@/components/ui/Alert'
import { pushNotificationManager } from '@/services/pushNotificationManager'
import { useAuth } from '@/hooks/useAuth'

interface PushNotificationSettingsProps {
  className?: string
}

/**
 * Push Notification Settings Component
 * Requirements: 9.4 - Implement notification preferences and controls
 * Requirements: 1.2 - CSS transitions instead of framer-motion
 */
export const PushNotificationSettings: React.FC<PushNotificationSettingsProps> = ({
  className = ''
}) => {
  const { user } = useAuth()
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isEnabled, setIsEnabled] = useState(false)
  const [preferences, setPreferences] = useState({
    applications: true,
    interviews: true,
    payments: true,
    system: true,
    quietHours: true,
    quietStart: '22:00',
    quietEnd: '08:00'
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check browser support and current status
  useEffect(() => {
    const checkSupport = async () => {
      try {
        const supported = pushNotificationManager.isSupported()
        setIsSupported(supported)
        
        if (supported) {
          const currentPermission = Notification.permission
          setPermission(currentPermission)
          
          if (user?.id) {
            const userPrefs = await pushNotificationManager.getUserPreferences(user.id)
            setIsEnabled(userPrefs.pushEnabled)
            setPreferences(prev => ({
              ...prev,
              applications: userPrefs.applicationUpdates,
              interviews: userPrefs.interviewReminders,
              payments: userPrefs.paymentNotifications,
              system: userPrefs.systemAlerts,
              quietHours: userPrefs.quietHours,
              quietStart: userPrefs.quietStart,
              quietEnd: userPrefs.quietEnd
            }))
          }
        }
      } catch (err) {
        console.error('Failed to check push notification support:', err)
        setError('Failed to load notification settings')
      } finally {
        setLoading(false)
      }
    }

    checkSupport()
  }, [user?.id])

  // Request permission and enable notifications
  const handleEnableNotifications = async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      setError(null)

      const success = await pushNotificationManager.requestPermission()
      
      if (success) {
        setPermission('granted')
        setIsEnabled(true)
        
        await pushNotificationManager.updatePreferences(user.id, {
          pushEnabled: true,
          ...preferences
        })
        
        // Send test notification
        await pushNotificationManager.sendNotification({
          title: 'Push Notifications Enabled',
          body: 'You will now receive important updates about your application.',
          icon: '/favicon.ico',
          data: { type: 'system' }
        }, user.id)
        
      } else {
        setError('Permission denied. Please enable notifications in your browser settings.')
      }
    } catch (err) {
      console.error('Failed to enable push notifications:', err)
      setError('Failed to enable push notifications. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Disable notifications
  const handleDisableNotifications = async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      setIsEnabled(false)
      
      await pushNotificationManager.updatePreferences(user.id, {
        pushEnabled: false
      })
    } catch (err) {
      console.error('Failed to disable push notifications:', err)
      setError('Failed to update notification settings')
    } finally {
      setLoading(false)
    }
  }

  // Update specific preference
  const handlePreferenceChange = async (key: string, value: boolean | string) => {
    if (!user?.id) return

    try {
      const newPreferences = { ...preferences, [key]: value }
      setPreferences(newPreferences)
      
      await pushNotificationManager.updatePreferences(user.id, {
        pushEnabled: isEnabled,
        applicationUpdates: newPreferences.applications,
        interviewReminders: newPreferences.interviews,
        paymentNotifications: newPreferences.payments,
        systemAlerts: newPreferences.system,
        quietHours: newPreferences.quietHours,
        quietStart: newPreferences.quietStart,
        quietEnd: newPreferences.quietEnd
      })
    } catch (err) {
      console.error('Failed to update preference:', err)
      setError('Failed to update notification preference')
    }
  }

  // Send test notification
  const handleTestNotification = async () => {
    if (!user?.id || !isEnabled) return

    try {
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
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Push Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!isSupported) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-muted-foreground" />
            Push Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Push notifications are not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Push Notifications
        </CardTitle>
        <CardDescription>
          Receive important updates about your application directly on your device
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Main toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              <span className="font-medium">Enable Push Notifications</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Get notified about application updates, interviews, and important announcements
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {permission === 'granted' && isEnabled && (
              <CheckCircle className="h-4 w-4 text-success" />
            )}
            
            {permission === 'granted' ? (
              <Switch
                checked={isEnabled}
                onCheckedChange={isEnabled ? handleDisableNotifications : handleEnableNotifications}
                disabled={loading}
                data-testid="push-notifications-toggle"
              />
            ) : (
              <Button
                onClick={handleEnableNotifications}
                disabled={loading}
                size="sm"
                data-testid="enable-push-notifications"
              >
                Enable
              </Button>
            )}
          </div>
        </div>

        {/* Permission status */}
        {permission !== 'granted' && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {permission === 'denied' 
                ? 'Notifications are blocked. Please enable them in your browser settings.'
                : 'Click "Enable" to allow push notifications for this application.'
              }
            </AlertDescription>
          </Alert>
        )}

        {/* Notification type preferences */}
        {isEnabled && permission === 'granted' && (
          <div
            className="space-y-4 border-t pt-4 transition-all duration-300 ease-out motion-reduce:transition-none animate-fade-in"
          >
            <h4 className="font-medium flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Notification Types
            </h4>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">Application Updates</span>
                  <p className="text-xs text-muted-foreground">Status changes, approvals, rejections</p>
                </div>
                <Switch
                  checked={preferences.applications}
                  onCheckedChange={(checked) => handlePreferenceChange('applications', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">Interview Reminders</span>
                  <p className="text-xs text-muted-foreground">Upcoming interviews and schedule changes</p>
                </div>
                <Switch
                  checked={preferences.interviews}
                  onCheckedChange={(checked) => handlePreferenceChange('interviews', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">Payment Notifications</span>
                  <p className="text-xs text-muted-foreground">Payment confirmations and reminders</p>
                </div>
                <Switch
                  checked={preferences.payments}
                  onCheckedChange={(checked) => handlePreferenceChange('payments', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">System Alerts</span>
                  <p className="text-xs text-muted-foreground">Important system announcements</p>
                </div>
                <Switch
                  checked={preferences.system}
                  onCheckedChange={(checked) => handlePreferenceChange('system', checked)}
                />
              </div>
            </div>

            {/* Quiet hours */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Quiet Hours
                  </span>
                  <p className="text-xs text-muted-foreground">Pause notifications during specified hours</p>
                </div>
                <Switch
                  checked={preferences.quietHours}
                  onCheckedChange={(checked) => handlePreferenceChange('quietHours', checked)}
                />
              </div>
              
              {preferences.quietHours && (
                <div
                  className="flex items-center gap-4 pl-6 transition-all duration-200 ease-out motion-reduce:transition-none animate-fade-in"
                >
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">From:</label>
                    <input
                      type="time"
                      value={preferences.quietStart}
                      onChange={(e) => handlePreferenceChange('quietStart', e.target.value)}
                      className="text-xs border rounded px-2 py-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">To:</label>
                    <input
                      type="time"
                      value={preferences.quietEnd}
                      onChange={(e) => handlePreferenceChange('quietEnd', e.target.value)}
                      className="text-xs border rounded px-2 py-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Test notification */}
            <div className="flex justify-end pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestNotification}
                disabled={!isEnabled}
              >
                Send Test Notification
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default PushNotificationSettings
