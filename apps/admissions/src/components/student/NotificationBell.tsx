import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useNotificationPolling } from '@/hooks/useNotificationPolling'
import { isSafeNavigationUrl } from '@/lib/urlSafety'
import { cn } from '@/lib/utils'
import type { StudentNotification } from '@/types/notifications'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { NotificationItem } from '@/components/student/NotificationItem'
import { sanitizeText } from '@/lib/sanitize'
import { useAuth } from '@/contexts/AuthContext'

export function NotificationBell() {
  const [showPanel, setShowPanel] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const focusTrapRef = useFocusTrap(showPanel)
  useEscapeKey(showPanel, () => {
    setShowPanel(false)
    bellRef.current?.focus()
  })
  const {
    notifications,
    isLoading: loading,
    unreadCount,
    markRead: markAsRead,
    markAllRead: markAllAsRead,
    deleteNotification,
    refresh,
  } = useNotificationPolling()

  // Browser notification when unread count increases (never request permission proactively)
  const prevUnreadRef = useRef<number>(0)
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && prevUnreadRef.current !== 0) {
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
    }
    prevUnreadRef.current = unreadCount
  }, [unreadCount, notifications])

  const handleNotificationClick = useCallback(async (notification: StudentNotification) => {
    if (!notification.read) {
      markAsRead(notification.id).catch(() => {})
    }
    if (notification.action_url && isSafeNavigationUrl(notification.action_url)) {
      setShowPanel(false)
      navigate(notification.action_url)
    }
  }, [markAsRead, navigate])

  const handleMarkAllRead = async () => {
    try { await markAllAsRead() } catch { /* handled by hook */ }
  }

  const handleDeleteNotification = useCallback(async (id: string) => {
    await deleteNotification(id)
  }, [deleteNotification])

  return (
    <div className="relative z-50">
      <Button
        ref={bellRef}
        variant="ghost"
        size="sm"
        onClick={() => setShowPanel(!showPanel)}
        className="relative min-h-touch min-w-touch hover:bg-muted/50 rounded-lg transition-colors duration-150 flex items-center justify-center"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={showPanel}
        aria-haspopup="dialog"
        data-testid="notification-bell"
      >
        <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground shadow-sm"
            data-testid="unread-count"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {showPanel && (
        <>
          {/* Backdrop — mobile only */}
          <div
            className="fixed inset-0 z-40 bg-foreground/10 md:hidden"
            onClick={() => setShowPanel(false)}
            aria-hidden="true"
          />

          <div
            ref={focusTrapRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="fixed md:absolute right-2 md:right-0 top-16 md:top-full md:mt-2 w-80 md:w-96 bg-card rounded-lg shadow-md border border-border/60 z-[9999] max-h-[70vh] flex flex-col motion-safe:animate-scale-in"
            data-testid="notifications-panel"
          >
            {/* Header */}
            <div className="p-4 border-b border-border/60">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-foreground text-sm">Notifications</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleMarkAllRead}
                      className="text-xs text-primary hover:bg-primary/10 min-h-touch"
                      data-testid="mark-all-read"
                    >
                      Mark all read
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowPanel(false)
                      bellRef.current?.focus()
                    }}
                    aria-label="Close notifications"
                    className="min-h-touch min-w-touch"
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
                <div className="p-6 text-center" role="status" aria-label="Loading notifications">
                  <div className="mx-auto mb-2 h-8 w-8 rounded-full bg-muted animate-pulse" aria-hidden="true" />
                  <p className="text-muted-foreground text-sm mt-2">Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" aria-hidden="true" />
                  <p className="font-medium text-foreground text-sm">No new notifications</p>
                  <p className="text-xs mt-1 text-muted-foreground">We'll notify you when something needs your attention.</p>
                </div>
              ) : (
                <div className="py-1">
                  {notifications.slice(0, 10).map((notification, index) => (
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
                  <Link
                    to={isAdmin ? '/admin/dashboard' : '/student/communications'}
                    className="text-xs font-medium text-primary hover:underline min-h-touch inline-flex items-center"
                    onClick={() => setShowPanel(false)}
                  >
                    View all
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
