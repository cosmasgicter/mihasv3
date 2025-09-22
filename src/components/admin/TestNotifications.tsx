import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { NotificationService } from '@/lib/notificationService'
import { EmailService } from '@/lib/emailService'
import { supabase } from '@/lib/supabase'
import { Bell, Mail, Send } from 'lucide-react'

export function TestNotifications() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const sendTestNotification = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      // Get a test user
      const { data: users } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email')
        .eq('role', 'student')
        .limit(1)

      if (!users || users.length === 0) {
        setMessage('No student users found to test with')
        return
      }

      const testUser = users[0]
      
      // Send test in-app notification
      const success = await NotificationService.sendNotification({
        userId: testUser.user_id,
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
      // Get a test application
      const { data: applications } = await supabase
        .from('applications_new')
        .select('id, user_id, application_number, program')
        .limit(1)

      if (!applications || applications.length === 0) {
        setMessage('No applications found to test with')
        return
      }

      const testApp = applications[0]
      
      // Get user details
      const { data: user } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('user_id', testApp.user_id)
        .single()

      if (!user) {
        setMessage('User not found for test application')
        return
      }

      // Queue test email
      const success = await EmailService.sendApplicationStatusEmail(
        testApp.id,
        user.email,
        'submitted',
        testApp.application_number,
        testApp.program,
        user.full_name
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
    <div className="bg-white rounded-lg shadow-md p-6">
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
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message}
          </div>
        )}
        
        <div className="text-xs text-gray-500">
          <p>• In-app notifications appear instantly in the notification bell</p>
          <p>• Email notifications are queued and need to be processed by an email service</p>
          <p>• Test with existing student users and applications</p>
        </div>
      </div>
    </div>
  )
}