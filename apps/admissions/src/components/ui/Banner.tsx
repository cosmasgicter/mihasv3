import { X } from 'lucide-react'

/**
 * Banner Component
 * Full-width, fixed-top notification banner with severity variants.
 * Consolidates OfflineBanner and InsecureStorageBanner patterns.
 *
 * Requirements: 19.4, 19.5
 */

interface BannerProps {
  variant: 'info' | 'warning' | 'error' | 'offline'
  children: React.ReactNode
  dismissible?: boolean
  onDismiss?: () => void
  className?: string
}

const variantStyles: Record<BannerProps['variant'], string> = {
  info: 'bg-info/10 text-info-foreground border-info/20',
  warning: 'bg-warning/10 text-warning-foreground border-warning/20',
  error: 'bg-destructive/10 text-destructive border-destructive/20',
  offline: 'bg-muted text-muted-foreground border-border',
}

const alertVariants = new Set<BannerProps['variant']>(['error', 'warning', 'offline'])

function getRole(variant: BannerProps['variant']): 'alert' | 'status' {
  return alertVariants.has(variant) ? 'alert' : 'status'
}

export function Banner({
  variant,
  children,
  dismissible = false,
  onDismiss,
  className = '',
}: BannerProps) {
  return (
    <div
      role={getRole(variant)}
      className={`fixed top-0 left-0 right-0 z-50 flex items-center gap-2 border-b px-4 py-2 text-sm font-medium ${variantStyles[variant]} ${className}`.trim()}
    >
      <div className="flex-1">{children}</div>
      {dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full p-1 transition-colors duration-fast hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export type { BannerProps }
