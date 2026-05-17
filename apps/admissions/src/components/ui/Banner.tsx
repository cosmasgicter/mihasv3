import { useRef, useCallback } from 'react'
import { X, Info, CheckCircle, AlertTriangle, AlertCircle, Bell, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BannerVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'brand' | 'error'

export interface BannerProps {
  variant: BannerVariant
  children: React.ReactNode
  dismissible?: boolean
  onDismiss?: () => void
  sticky?: boolean
  className?: string
}

const variantStyles: Record<BannerVariant, string> = {
  info: 'bg-info/5 text-foreground border-info/20',
  success: 'bg-success/5 text-foreground border-success/20',
  warning: 'bg-warning/5 text-foreground border-warning/20',
  danger: 'bg-destructive/5 text-foreground border-destructive/20',
  error: 'bg-destructive/5 text-foreground border-destructive/20',
  neutral: 'bg-muted text-foreground border-border/40',
  brand: 'bg-primary/5 text-foreground border-primary/20',
}

const variantIcons: Record<BannerVariant, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  danger: AlertCircle,
  error: AlertCircle,
  neutral: Bell,
  brand: Megaphone,
}

const iconStyles: Record<BannerVariant, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  error: 'text-destructive',
  neutral: 'text-muted-foreground',
  brand: 'text-primary',
}

const alertVariants = new Set<BannerVariant>(['danger', 'warning', 'error'])

function getRole(variant: BannerVariant): 'alert' | 'status' {
  return alertVariants.has(variant) ? 'alert' : 'status'
}

export function Banner({
  variant,
  children,
  dismissible = false,
  onDismiss,
  sticky = false,
  className,
}: BannerProps) {
  const triggerRef = useRef<HTMLElement | null>(null)
  const Icon = variantIcons[variant]

  const handleDismiss = useCallback(() => {
    onDismiss?.()
    // Return focus to the element that was focused before the banner appeared
    triggerRef.current?.focus()
  }, [onDismiss])

  // Capture the active element when the banner mounts (for focus return)
  const captureRef = useCallback((node: HTMLDivElement | null) => {
    if (node && !triggerRef.current) {
      triggerRef.current = document.activeElement as HTMLElement | null
    }
  }, [])

  return (
    <div
      ref={captureRef}
      role={getRole(variant)}
      className={cn(
        'flex items-center gap-3 border-b px-4 py-2.5 text-sm',
        sticky && 'sticky top-0 z-50',
        variantStyles[variant],
        className,
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', iconStyles[variant])} aria-hidden="true" />
      <div className="flex-1 font-medium">{children}</div>
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-full p-1 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
