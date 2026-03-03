import React, { useState } from 'react'
import { Bell, X, CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'

interface Notification {
  id: string
  type: 'success' | 'warning' | 'info' | 'error'
  title: string
  message: string
  timestamp: Date
  read: boolean
}

export function RealTimeNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'warning',
      title: 'Pending Applications',
      message: '5 new applications require review',
      timestamp: new Date(),
      read: false
    },
    {
      id: '2',
      type: 'success',
      title: 'System Update',
      message: 'Database optimization completed successfully',
      timestamp: new Date(Date.now() - 300000),
      read: false
    }
  ])
  const [showPanel, setShowPanel] = useState(false)
  const focusTrapRef = useFocusTrap(showPanel)
  useEscapeKey(showPanel, () => setShowPanel(false))

  const unreadCount = notifications.filter(n => !n.read).length

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
  }

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-success" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-warning" />
      case 'error':
        return <X className="h-5 w-5 text-error" />
      default:
        return <Info className="h-5 w-5 text-primary" />
    }
  }

  const getBgColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      default:
        return 'bg-blue-50 border-blue-200'
    }
  }

  return (
    <div className="relative">
      {/* Notification Bell */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowPanel(!showPanel)}
        className="relative"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </Button>

      {/* Notifications Panel */}
        {showPanel && (
          <div
            ref={focusTrapRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="absolute right-0 top-full mt-2 w-80 bg-card rounded-xl shadow-xl border border-border z-50 animate-fade-in"
          >
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground">Notifications</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPanel(false)}
                  aria-label="Close notifications panel"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No notifications</p>
                </div>
              ) : (
                <div className="p-2">
                  {notifications.map((notification, index) => (
                    <div
                      key={notification.id}
                      style={{ animationDelay: `${index * 100}ms` }}
                      className={`p-3 rounded-lg border mb-2 animate-fade-in ${getBgColor(notification.type)} ${
                        !notification.read ? 'border-l-4' : ''
                      }`}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <div className="flex items-start space-x-3">
                        {getIcon(notification.type)}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-sm">
                            {notification.title}
                          </p>
                          <p className="text-foreground text-xs mt-1">
                            {notification.message}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-foreground">
                              {notification.timestamp.toLocaleTimeString()}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeNotification(notification.id)
                              }}
                              className="p-1 h-auto"
                              aria-label={`Dismiss notification: ${notification.title}`}
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="p-3 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                  className="w-full text-xs"
                >
                  Mark all as read
                </Button>
              </div>
            )}
          </div>
        )}
    </div>
  )
}