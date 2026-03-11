import React, { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, X, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useStudentNotifications } from '@/hooks/useStudentNotifications'
import { formatDate } from '@/lib/utils'
import { isSafeNavigationUrl } from '@/lib/urlSafety'
import type { StudentNotification } from '@/types/notifications'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { NotificationItem } from '@/components/student/NotificationItem'

export function NotificationBell() {
  const [showPanel, setShowPanel] = useState(false)
  const focusTrapRef = useFocusTrap(showPanel)
  useEscapeKey(showPanel, () => setShowPanel(false))
  const { 
    notifications, 
    loading, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification,
    refresh,
    isPolling,
    lastLoadedAt,
  } = useStudentNotifications()

  const handleNotificationClick = useCallback(async (notification: StudentNotification) => {
    try {
      // Optimistic update - mark as read immediately in UI
      if (!notification.read) {
        // Update local state first for instant feedback
        markAsRead(notification.id).catch(error => {
          console.error('Failed to mark notification as read:', error)
          // Note: markAsRead already handles rollback via state update
        })
      }
      
      // Navigate after optimistic update (don't wait for server)
      if (notification.action_url) {
        if (isSafeNavigationUrl(notification.action_url)) {
          window.location.href = notification.action_url
        } else if (import.meta.env.DEV) {
          console.warn('[NotificationBell] Blocked unsafe navigation URL:', notification.action_url)
        }
      }
    } catch (error) {
      console.error('Failed to handle notification click')
    }
  }, [markAsRead])

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead()
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
    }
  }

  const handleDeleteNotification = useCallback(async (id: string) => {
    await deleteNotification(id)
  }, [deleteNotification])

  return (
    <div className="relative z-50">
      {/* Notification Bell */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowPanel(!showPanel)}
        className="relative hover:bg-primary/5 flex items-center justify-center"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        data-testid="notification-bell"
      >
        <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 bg-error text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold animate-scale-in"
            data-testid="unread-count"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Notifications Panel */}
        {showPanel && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40 bg-black bg-opacity-20 md:hidden"
              onClick={() => setShowPanel(false)}
            />
            
            <div
              ref={focusTrapRef as React.RefObject<HTMLDivElement>}
              role="dialog"
              aria-modal="true"
              aria-label="Notifications"
              className="fixed md:absolute right-2 md:right-0 top-16 md:top-full md:mt-2 w-80 md:w-96 bg-card rounded-xl shadow-2xl border border-border z-[9999] max-h-[80vh] flex flex-col animate-scale-in"
              data-testid="notifications-panel"
            >
              {/* Header */}
              <div className="p-4 border-b border-border bg-gradient-to-r from-blue-50 to-purple-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-foreground flex items-center gap-2"><Bell className="w-5 h-5" /> Notifications</h3>
                    <p className="text-xs text-muted-foreground">
                      {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
                      {isPolling && ' · auto-refresh on'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refresh()}
                      disabled={loading}
                      className="text-xs text-primary hover:bg-primary/10"
                    >
                      Refresh
                    </Button>
                    {unreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleMarkAllRead}
                        className="text-xs text-primary hover:bg-primary/10"
                        data-testid="mark-all-read"
                      >
                        Mark all read
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPanel(false)}
                      aria-label="Close notifications"
                      data-testid="close-notifications"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Notifications List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-6 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="text-muted-foreground text-sm mt-2">Loading notifications...</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">No notifications yet</p>
                    <p className="text-xs mt-1 text-muted-foreground">We'll notify you about important updates</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-2">
                    {notifications.map((notification, index) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        index={index}
                        onClick={handleNotificationClick}
                        onDelete={handleDeleteNotification}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="p-3 border-t border-border bg-muted">
                  <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-center flex items-center justify-center gap-1 sm:text-left">
                      <Lightbulb className="w-5 h-5" /> Click notifications to mark as read
                    </p>
                    <div className="flex items-center justify-center gap-3 sm:justify-end">
                      {lastLoadedAt && (
                        <span>Synced {formatDate(lastLoadedAt)}</span>
                      )}
                      <Link to="/student/notifications" className="font-medium text-primary hover:underline" onClick={() => setShowPanel(false)}>
                        Open inbox
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
    </div>
  )
}
