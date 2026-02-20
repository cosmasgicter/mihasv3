import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { createTestNotifications, createSingleNotification } from '@/utils/testNotifications'
import { Bell, Plus } from 'lucide-react'

export function NotificationTester() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleCreateTestNotifications = async () => {
    if (!user?.id) {
      setMessage('❌ No user logged in')
      return
    }

    setLoading(true)
    setMessage('Creating test notifications...')
    
    try {
      await createTestNotifications(user.id)
      setMessage('✅ Test notifications created! Check the bell icon.')
    } catch (error) {
      setMessage('❌ Failed to create notifications')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSingleNotification = async () => {
    if (!user?.id) {
      setMessage('❌ No user logged in')
      return
    }

    setLoading(true)
    
    try {
      const success = await createSingleNotification(
        user.id,
        '🔔 Test Notification',
        `This is a test notification created at ${new Date().toLocaleTimeString()}`,
        'info'
      )
      
      if (success) {
        setMessage('✅ Single notification created!')
      } else {
        setMessage('❌ Failed to create notification')
      }
    } catch (error) {
      setMessage('❌ Error creating notification')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 text-yellow-800 font-semibold">
        <Bell className="w-5 h-5" />
        <span>Notification Tester (Dev Only)</span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleCreateTestNotifications}
          disabled={loading}
          size="sm"
          variant="outline"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create 5 Test Notifications
        </Button>
        
        <Button
          onClick={handleCreateSingleNotification}
          disabled={loading}
          size="sm"
          variant="outline"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Single Notification
        </Button>
      </div>
      
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
      
      <p className="text-xs text-muted-foreground">
        User ID: {user.id}
      </p>
    </div>
  )
}
