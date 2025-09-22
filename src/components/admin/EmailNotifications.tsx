import React from 'react'
import { useEmailNotifications } from '@/hooks/useEmailNotifications'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { Mail, CheckCircle, XCircle, Clock } from 'lucide-react'

export default function EmailNotifications() {
  const { notifications, loading, markAsSent } = useEmailNotifications()

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-yellow-100 text-yellow-800'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Mail className="h-5 w-5 mr-2" />
          Email Notifications
        </h3>
      </div>
      
      <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            No email notifications found
          </div>
        ) : (
          notifications.map((notification) => (
            <div key={notification.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    {getStatusIcon(notification.status)}
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(notification.status)}`}>
                      {sanitizeForDisplay(notification.status.toUpperCase())}
                    </span>
                  </div>
                  
                  <h4 className="text-sm font-medium text-gray-900 mb-1">
                    {sanitizeForDisplay(notification.subject)}
                  </h4>
                  
                  <p className="text-sm text-gray-600 mb-2">
                    To: {sanitizeForDisplay(notification.recipient_email)}
                  </p>
                  
                  <p className="text-xs text-gray-500 mb-2">
                    {sanitizeForDisplay(notification.body)}
                  </p>
                  
                  <p className="text-xs text-gray-400">
                    {new Date(notification.created_at).toLocaleString()}
                    {notification.sent_at && (
                      <span className="ml-2">
                        • Sent: {new Date(notification.sent_at).toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>
                
                {notification.status === 'pending' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markAsSent(notification.id)}
                  >
                    Mark as Sent
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}