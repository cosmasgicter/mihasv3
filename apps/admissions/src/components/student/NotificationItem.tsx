import React from 'react'
import { Button } from '@/components/ui/Button'
import { CheckCircle, AlertTriangle, AlertCircle, Info, Trash2 } from 'lucide-react'
import { sanitizeText } from '@/lib/sanitize'
import { cn } from '@/lib/utils'
import type { StudentNotification } from '@/types/notifications'

/** Compact relative time: "just now", "2m ago", "1h ago", "yesterday", "Apr 20" */
function compactRelativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return formatShortDate(date)
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days === 1) return 'yesterday'
  return formatShortDate(date)
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const
function formatShortDate(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`
}

interface NotificationItemProps {
  notification: StudentNotification
  index: number
  onClick: (notification: StudentNotification) => void
  onDelete: (id: string) => Promise<void>
}

const TYPE_ICON_STYLES: Record<string, { icon: typeof Info; bg: string; text: string }> = {
  info:    { icon: Info,          bg: 'bg-info/10',        text: 'text-info' },
  success: { icon: CheckCircle,   bg: 'bg-success/10',     text: 'text-success' },
  warning: { icon: AlertTriangle, bg: 'bg-warning/10',     text: 'text-warning' },
  error:   { icon: AlertCircle,   bg: 'bg-destructive/10', text: 'text-destructive' },
}

const DEFAULT_STYLE = TYPE_ICON_STYLES.info!

function getTypeStyle(type: string) {
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
      role="button"
      tabIndex={0}
      className={cn(
        'group min-h-[60px] py-3 px-4 cursor-pointer transition-colors duration-150 animate-fade-in opacity-0',
        !notification.read
          ? 'bg-primary/5 border-l-[3px] border-primary'
          : 'bg-transparent border-l-[3px] border-transparent',
        'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
      )}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
      onClick={() => onClick(notification)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(notification) } }}
      data-testid="notification-item"
    >
      <div className="flex items-start gap-3">
        <div className={cn('flex-shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center', style.bg)}>
          <IconComponent className={cn('h-4 w-4', style.text)} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm truncate', !notification.read ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>
            {sanitizeText(notification.title)}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {sanitizeText(notification.content)}
          </p>
          <span className="text-[11px] text-muted-foreground/70 mt-1 block">
            {compactRelativeTime(notification.created_at)}
          </span>
        </div>
        <div className="flex items-center flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={async (e) => {
              e.stopPropagation()
              try { await onDelete(notification.id) } catch { /* handled upstream */ }
            }}
            aria-label={`Delete notification: ${sanitizeText(notification.title)}`}
            className="p-1.5 h-auto min-h-touch min-w-touch opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}, areNotificationItemPropsEqual)
