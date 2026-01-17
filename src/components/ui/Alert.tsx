import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle, Info, XCircle, AlertTriangle } from 'lucide-react'

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        info: 'border-primary/50 text-primary dark:border-primary [&>svg]:text-primary bg-primary/5',
        success: 'border-success/50 text-success dark:border-success [&>svg]:text-success bg-success/5',
        warning: 'border-warning/50 text-warning dark:border-warning [&>svg]:text-warning bg-warning/5',
        error: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive bg-destructive/5',
        destructive: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive bg-destructive/5',
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

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant = 'default', children, ...props }, ref) => {
  const Icon = icons[variant || 'default']
  
  return (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
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
    className={cn('text-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
))
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertTitle, AlertDescription, alertVariants }
