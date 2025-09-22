import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, CheckCircle, AlertTriangle, Info, Clock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useStudentNotifications } from '@/hooks/useStudentNotifications'
import { formatDate } from '@/lib/utils'
import { sanitizeText } from '@/lib/sanitize'
import type { StudentNotification } from '@/types/notifications'

export function NotificationBell() {
  const [showPanel, setShowPanel] = useState(false)
  const { 
    notifications, 
    loading, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification 
  } = useStudentNotifications()

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'error':
        return <X className="h-4 w-4 text-red-500" />
      default:
        return <Info className="h-4 w-4 text-blue-500" />
    }
  }

  const getBgColor = (type: string, read: boolean) => {
    const opacity = read ? 'bg-opacity-30' : 'bg-opacity-60'
    switch (type) {
      case 'success':
        return `bg-green-50 border-green-200 ${opacity}`
      case 'warning':
        return `bg-yellow-50 border-yellow-200 ${opacity}`
      case 'error':
        return `bg-red-50 border-red-200 ${opacity}`
      default:
        return `bg-blue-50 border-blue-200 ${opacity}`
    }
  }

  const handleNotificationClick = async (notification: StudentNotification) => {
    try {
      if (!notification.read) {
        await markAsRead(notification.id)
      }
      
      if (notification.action_url) {
        window.location.href = notification.action_url
      }
    } catch (error) {
      console.error('Failed to handle notification click')
    }
  }

  return (
    <div className="relative">
      {/* Notification Bell */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowPanel(!showPanel)}
        className="relative hover:bg-blue-50"
        data-testid="notification-bell"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold"
            data-testid="unread-count"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </Button>

      {/* Notifications Panel */}
      <AnimatePresence>
        {showPanel && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40 bg-black bg-opacity-20 md:hidden"
              onClick={() => setShowPanel(false)}
            />
            
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="fixed md:absolute right-2 md:right-0 top-16 md:top-full md:mt-2 w-80 md:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-[80vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900">🔔 Notifications</h3>
                    <p className="text-xs text-gray-600">
                      {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {unreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={markAllAsRead}
                        className="text-xs text-blue-600 hover:bg-blue-100"
                        data-testid="mark-all-read"
                      >
                        Mark all read
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPanel(false)}
                      data-testid="close-notifications"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Notifications List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-6 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-gray-500 text-sm mt-2">Loading notifications...</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No notifications yet</p>
                    <p className="text-xs mt-1">We'll notify you about important updates</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-2">
                    {notifications.map((notification, index) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`group p-3 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md ${getBgColor(notification.type, notification.read)} ${
                          !notification.read ? 'border-l-4 shadow-sm' : ''
                        }`}
                        onClick={() => handleNotificationClick(notification)}
                        data-testid="notification-item"
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {getIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className={`font-medium text-sm ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                                  {sanitizeText(notification.title)}
                                </p>
                                <p className={`text-xs mt-1 ${!notification.read ? 'text-gray-700' : 'text-gray-500'}`}>
                                  {sanitizeText(notification.content)}
                                </p>
                                <div className="flex items-center justify-between mt-2">
                                  <span className="text-xs text-gray-500">
                                    {formatDate(notification.created_at)}
                                  </span>
                                  {!notification.read && (
                                    <span className="inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  try {
                                    await deleteNotification(notification.id)
                                  } catch (error) {
                                    console.error('Failed to delete notification')
                                  }
                                }}
                                className="p-1 h-auto opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 hover:bg-red-100 hover:text-red-600 focus:bg-red-100 focus:text-red-600"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="p-3 border-t border-gray-200 bg-gray-50">
                  <p className="text-xs text-gray-500 text-center">
                    💡 Click notifications to mark as read
                  </p>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}