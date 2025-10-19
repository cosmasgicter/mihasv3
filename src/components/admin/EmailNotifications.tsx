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
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
      case 'failed':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
      default:
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
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
    <div className="bg-card rounded-lg shadow">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-lg font-medium text-foreground flex items-center">
          <Mail className="h-5 w-5 mr-2" />
          Email Notifications
        </h3>
      </div>
      
      <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-6 py-8 text-center text-muted-foreground dark:text-muted-foreground">
            No email notifications found
          </div>
        ) : (
          notifications.map((notification) => (
            <div key={notification.id} className="px-6 py-4 hover:bg-muted">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    {getStatusIcon(notification.status)}
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(notification.status)}`}>
                      {sanitizeForDisplay(notification.status.toUpperCase())}
                    </span>
                  </div>
                  
                  <h4 className="text-sm font-medium text-foreground mb-1">
                    {sanitizeForDisplay(notification.subject)}
                  </h4>
                  
                  <p className="text-sm text-muted-foreground mb-2">
                    To: {sanitizeForDisplay(notification.recipient_email)}
                  </p>
                  
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground mb-2">
                    {sanitizeForDisplay(notification.body)}
                  </p>
                  
                  <p className="text-xs text-muted-foreground">
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