import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { STATUS_TONES, toneSurfaceClasses, type StatusTone } from '@/lib/statusTone'
import { CheckCircle, Info, XCircle, AlertTriangle } from 'lucide-react'

const alertVariants = cva(
  'relative w-full rounded-xl border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        info: `${toneSurfaceClasses('info')} [&>svg]:text-info`,
        success: `${toneSurfaceClasses('success')} [&>svg]:text-success`,
        warning: `${toneSurfaceClasses('warning')} [&>svg]:text-warning`,
        error: `${toneSurfaceClasses('danger')} [&>svg]:text-destructive`,
        destructive: `${toneSurfaceClasses('danger')} [&>svg]:text-destructive`,
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

const icons = {
  default: Info,
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  destructive: XCircle,
}

/**
 * `inset` alerts sit inside a card: tint and icon only, no border, so they are
 * not a card inside a card (platform-simplification task 31.3, R21.5). The
 * status still reads from the icon and the title, never from colour alone.
 */
const INSET_TONE: Record<string, StatusTone> = {
  default: 'neutral',
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'danger',
  destructive: 'danger',
}
const INSET_ICON: Record<string, string> = {
  default: '[&>svg]:text-foreground',
  info: '[&>svg]:text-info',
  success: '[&>svg]:text-success',
  warning: '[&>svg]:text-warning',
  error: '[&>svg]:text-destructive',
  destructive: '[&>svg]:text-destructive',
}
const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants> & { inset?: boolean }
>(({ className, variant = 'default', inset = false, children, ...props }, ref) => {
  const Icon = icons[variant || 'default']
  const key = variant || 'default'
  const insetClasses = inset
    ? cn(
        'relative w-full rounded-lg p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4',
        STATUS_TONES[INSET_TONE[key] ?? 'neutral'].tint,
        STATUS_TONES[INSET_TONE[key] ?? 'neutral'].text,
        INSET_ICON[key],
      )
    : null
  
  return (
    <div
      ref={ref}
      role="alert"
      className={cn(insetClasses ?? alertVariants({ variant }), className)}
      {...props}
    >
      <Icon className="h-4 w-4" />
      {children}
    </div>
  )
})
Alert.displayName = 'Alert'

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
))
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-base sm:text-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
))
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertTitle, AlertDescription, alertVariants }
