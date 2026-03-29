import React from 'react'
import { Button } from '@/components/ui/Button'
import { CheckCircle, AlertTriangle, X, Info, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { sanitizeText } from '@/lib/sanitize'
import { staggerChild, animateClasses } from '@/lib/animations'
import type { StudentNotification } from '@/types/notifications'

interface NotificationItemProps {
  notification: StudentNotification
  index: number
  onClick: (notification: StudentNotification) => void
  onDelete: (id: string) => Promise<void>
}

const getIcon = (type: string) => {
  switch (type) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-success" />
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-warning" />
    case 'error':
      return <X className="h-4 w-4 text-error" />
    default:
      return <Info className="h-4 w-4 text-primary" />
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

function areNotificationItemPropsEqual(
  prev: NotificationItemProps,
  next: NotificationItemProps
): boolean {
  return (
    prev.notification.id === next.notification.id &&
    prev.notification.read === next.notification.read &&
    prev.notification.type === next.notification.type &&
    prev.notification.title === next.notification.title &&
    prev.notification.content === next.notification.content &&
    prev.notification.created_at === next.notification.created_at &&
    prev.index === next.index &&
    prev.onClick === next.onClick &&
    prev.onDelete === next.onDelete
  )
}

export const NotificationItem = React.memo<NotificationItemProps>(function NotificationItem({
  notification,
  index,
  onClick,
  onDelete,
}) {
  return (
    <div
      className={`${animateClasses.fadeIn} opacity-0 group p-3 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md ${getBgColor(notification.type, notification.read)} ${
        !notification.read ? 'border-l-4 shadow-sm' : ''
      }`}
      style={staggerChild(index)}
      onClick={() => onClick(notification)}
      data-testid="notification-item"
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon(notification.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className={`font-medium text-sm ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                {sanitizeText(notification.title)}
              </p>
              <p className="text-xs mt-1 text-muted-foreground">
                {sanitizeText(notification.content)}
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">
                  {formatDate(notification.created_at)}
                </span>
                {!notification.read && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-primary"></span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async (e) => {
                e.stopPropagation()
                try {
                  await onDelete(notification.id)
                } catch (error) {
                  console.error('Failed to delete notification')
                }
              }}
              aria-label={`Delete notification: ${sanitizeText(notification.title)}`}
              className="p-1 h-auto opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-error"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}, areNotificationItemPropsEqual)
