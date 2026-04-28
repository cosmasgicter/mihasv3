import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useNotificationPolling } from '@/hooks/useNotificationPolling'
import { isSafeNavigationUrl } from '@/lib/urlSafety'
import type { StudentNotification } from '@/types/notifications'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { NotificationItem } from '@/components/student/NotificationItem'
import { sanitizeText } from '@/lib/sanitize'
import { useAuth } from '@/contexts/AuthContext'

export function NotificationBell() {
  const [showPanel, setShowPanel] = useState(false)
  const [isPulsing, setIsPulsing] = useState(false)
  const prevUnreadRef = useRef<number>(0)
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const focusTrapRef = useFocusTrap(showPanel)
  useEscapeKey(showPanel, () => setShowPanel(false))
  const { 
    notifications, 
    isLoading: loading, 
    unreadCount, 
    markRead: markAsRead, 
    markAllRead: markAllAsRead, 
    deleteNotification,
    refresh,
  } = useNotificationPolling()

  // Badge pulse + browser notification when unread count increases
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && prevUnreadRef.current !== 0) {
      setIsPulsing(true)
      const timer = setTimeout(() => setIsPulsing(false), 1500)

      // Browser notification if already granted (never request proactively)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const newest = notifications.find((n) => !n.read)
        if (newest) {
          try {
            new Notification(sanitizeText(newest.title), {
              body: sanitizeText(newest.content).slice(0, 100),
              icon: '/favicon.ico',
            })
          } catch { /* silently fail */ }
        }
      }

      return () => clearTimeout(timer)
    }
    prevUnreadRef.current = unreadCount
  }, [unreadCount, notifications])

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
          setShowPanel(false)
          navigate(notification.action_url)
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
        className="relative min-h-[44px] min-w-[44px] hover:bg-muted/50 rounded-xl transition-colors duration-150 flex items-center justify-center"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        data-testid="notification-bell"
      >
        <Bell className={`h-5 w-5 text-muted-foreground${unreadCount > 0 ? ' motion-safe:animate-bounce' : ''}`} aria-hidden="true" style={unreadCount > 0 ? { animationIterationCount: 1 } : undefined} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5" data-testid="unread-count">
            {isPulsing && (
              <span className="absolute inset-0 rounded-full bg-destructive motion-safe:animate-ping opacity-75" />
            )}
            <span className="relative min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white shadow-sm shadow-destructive/50">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
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
              className="fixed md:absolute right-2 md:right-0 top-16 md:top-full md:mt-2 w-80 md:w-96 bg-card rounded-lg shadow-lg border border-border/60 z-[9999] max-h-[70vh] flex flex-col motion-safe:animate-scale-in"
              data-testid="notifications-panel"
            >
              {/* Header */}
              <div className="p-4 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">Notifications</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
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
                    <div className="mx-auto mb-2 h-8 w-8 rounded-full bg-primary/20 animate-pulse" aria-hidden="true" />
                    <p className="text-muted-foreground text-sm mt-2">Loading notifications...</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="font-medium text-foreground">You're all caught up!</p>
                    <p className="text-xs mt-1 text-muted-foreground">We'll notify you when something needs your attention.</p>
                  </div>
                ) : (
                  <div className="py-1">
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
                <div className="p-3 border-t border-border/60">
                  <div className="flex items-center justify-center">
                    <Link to={isAdmin ? '/admin/dashboard' : '/student/notifications'} className="text-xs font-medium text-primary hover:underline" onClick={() => setShowPanel(false)}>
                      View all notifications
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
    </div>
  )
}
