// @ts-nocheck
import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { NotificationService } from '@/lib/notificationService'
import { emailService } from '@/lib/emailService'
import { adminApi, applicationsApi } from '@/lib/apiClient'
import { Bell, Mail, Send } from 'lucide-react'

export function TestNotifications() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const sendTestNotification = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      // Get users via admin API
      const usersResponse = await adminApi.getUsers({ role: 'student', limit: 1 })
      
      if (!usersResponse.success || !usersResponse.data || usersResponse.data.length === 0) {
        setMessage('No student users found to test with')
        return
      }

      const testUser = usersResponse.data[0]
      
      // Send test in-app notification
      const success = await NotificationService.sendNotification({
        userId: testUser.user_id || testUser.id,
        title: '🧪 Test Notification',
        content: `Hello ${testUser.full_name}! This is a test notification to verify the system is working correctly.`,
        type: 'info'
      })

      if (success) {
        setMessage('✅ Test notification sent successfully!')
      } else {
        setMessage('❌ Failed to send test notification')
      }
    } catch (error) {
      console.error('Error sending test notification:', error)
      setMessage('❌ Error sending test notification')
    } finally {
      setLoading(false)
    }
  }

  const sendTestEmail = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      // Get applications via API
      const appsResponse = await applicationsApi.list({ limit: 1 })

      if (!appsResponse.success || !appsResponse.data || appsResponse.data.length === 0) {
        setMessage('No applications found to test with')
        return
      }

      const testApp = appsResponse.data[0]

      // Queue test email using the application data
      const success = await emailService.sendApplicationStatusEmail(
        testApp.id,
        testApp.email,
        'submitted',
        testApp.application_number,
        testApp.program,
        testApp.full_name
      )

      if (success) {
        setMessage('✅ Test email queued successfully!')
      } else {
        setMessage('❌ Failed to queue test email')
      }
    } catch (error) {
      console.error('Error sending test email:', error)
      setMessage('❌ Error sending test email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
        <Bell className="h-5 w-5 mr-2" />
        Test Notification System
      </h3>
      
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={sendTestNotification}
            disabled={loading}
            className="flex items-center"
          >
            <Bell className="h-4 w-4 mr-2" />
            {loading ? 'Sending...' : 'Send Test In-App Notification'}
          </Button>
          
          <Button
            onClick={sendTestEmail}
            disabled={loading}
            variant="outline"
            className="flex items-center"
          >
            <Mail className="h-4 w-4 mr-2" />
            {loading ? 'Queueing...' : 'Queue Test Email'}
          </Button>
        </div>
        
        {message && (
          <div className={`p-3 rounded-lg text-sm ${
            message.includes('✅') 
              ? 'bg-green-50 text-accent border border-green-200' 
              : 'bg-red-50 text-error border border-red-200'
          }`}>
            {message}
          </div>
        )}
        
        <div className="text-xs text-gray-900">
          <p>• In-app notifications appear instantly in the notification bell</p>
          <p>• Email notifications are queued and need to be processed by an email service</p>
          <p>• Test with existing student users and applications</p>
        </div>
      </div>
    </div>
  )
}