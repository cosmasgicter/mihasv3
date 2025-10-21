import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react'

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 flex items-start gap-3',
  {
    variants: {
      variant: {
        default: 'bg-background border-border text-foreground',
        info: 'bg-primary/5 border-primary/20 text-primary',
        success: 'bg-success/5 border-success/20 text-success',
        warning: 'bg-warning/5 border-warning/20 text-warning',
        error: 'bg-error/5 border-error/20 text-error',
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
  warning: AlertCircle,
  error: XCircle,
}

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string
}

export function Alert({ className, variant = 'default', title, children, ...props }: AlertProps) {
  const Icon = icons[variant]

  return (
    <div className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="flex-1">
        {title && <h5 className="font-semibold mb-1">{title}</h5>}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  )
}
