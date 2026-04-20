import React from 'react'
import { Button } from '@/components/ui/Button'
import { CheckCircle, AlertTriangle, X, Info, Trash2 } from 'lucide-react'
import { formatRelative } from '@/lib/dateFormat'
import { sanitizeText } from '@/lib/sanitize'
import { staggerChild } from '@/lib/animations'
import type { StudentNotification } from '@/types/notifications'

interface NotificationItemProps {
  notification: StudentNotification
  index: number
  onClick: (notification: StudentNotification) => void
  onDelete: (id: string) => Promise<void>
}

const TYPE_ICON_STYLES: Record<string, { icon: typeof Info; bg: string; text: string }> = {
  info:    { icon: Info,          bg: 'bg-blue-100 dark:bg-blue-900/40',   text: 'text-blue-600 dark:text-blue-400' },
  success: { icon: CheckCircle,   bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-600 dark:text-green-400' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-600 dark:text-amber-400' },
  error:   { icon: X,             bg: 'bg-red-100 dark:bg-red-900/40',     text: 'text-red-600 dark:text-red-400' },
}

const DEFAULT_STYLE: { icon: typeof Info; bg: string; text: string } = TYPE_ICON_STYLES.info!

function getTypeStyle(type: string): { icon: typeof Info; bg: string; text: string } {
  return TYPE_ICON_STYLES[type] ?? DEFAULT_STYLE
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
    prev.notification.action_url === next.notification.action_url &&
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
  const style = getTypeStyle(notification.type)
  const IconComponent = style.icon

  return (
    <div
      className={`group min-h-[60px] py-3 px-4 cursor-pointer transition-colors duration-150 ${
        !notification.read
          ? 'bg-primary/5 border-l-2 border-primary'
          : 'bg-transparent border-l-2 border-transparent'
      } hover:bg-muted/50`}
      style={staggerChild(index)}
      onClick={() => onClick(notification)}
      data-testid="notification-item"
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 mt-0.5 h-8 w-8 rounded-full ${style.bg} flex items-center justify-center`}>
          <IconComponent className={`h-4 w-4 ${style.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {sanitizeText(notification.title)}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {sanitizeText(notification.content)}
          </p>
          <span className="text-xs text-muted-foreground mt-1 block">
            {formatRelative(notification.created_at)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async (e) => {
            e.stopPropagation()
            try { await onDelete(notification.id) } catch { /* handled upstream */ }
          }}
          aria-label={`Delete notification: ${sanitizeText(notification.title)}`}
          className="p-1 h-auto opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}, areNotificationItemPropsEqual)
