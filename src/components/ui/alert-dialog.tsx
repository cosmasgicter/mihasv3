import * as React from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

const AlertDialog = AlertDialogPrimitive.Root
const AlertDialogTrigger = AlertDialogPrimitive.Trigger
const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out data-[state=open]:fade-in',
      className
    )}
    {...props}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-[201] grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-card shadow-2xl duration-200 rounded-2xl overflow-hidden',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
        'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
        'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
        className
      )}
      {...props}
    />
  </AlertDialogPortal>
))
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-2 text-center sm:text-left', className)}
    {...props}
  />
)
AlertDialogHeader.displayName = 'AlertDialogHeader'


const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2 sm:gap-0',
      className
    )}
    {...props}
  />
)
AlertDialogFooter.displayName = 'AlertDialogFooter'

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-gray-900', className)}
    {...props}
  />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-gray-900', className)}
    {...props}
  />
))
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
      className
    )}
    {...props}
  />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
      className
    )}
    {...props}
  />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName


/**
 * ConfirmAlertDialog - Compatibility wrapper for migrating from ConfirmDialog to AlertDialog
 * 
 * Supports the old ConfirmDialog API (isOpen/onClose/onConfirm) while using Radix AlertDialog.
 * This allows gradual migration from the framer-motion ConfirmDialog component.
 * 
 * Features:
 * - Focus trapping (via Radix AlertDialog)
 * - Escape key close (via Radix AlertDialog)
 * - NO backdrop click close (AlertDialog requires explicit action)
 * - Body scroll lock (via Radix AlertDialog)
 * - ARIA attributes (role="alertdialog")
 * - Variant styling (danger, warning, info)
 */
interface ConfirmAlertDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean
  /** Callback when dialog should close (cancel action) */
  onClose: () => void
  /** Callback when confirm action is triggered */
  onConfirm: () => void
  /** Dialog title */
  title: string
  /** Dialog message/description */
  message: string
  /** Text for confirm button */
  confirmText?: string
  /** Text for cancel button */
  cancelText?: string
  /** Visual variant */
  variant?: 'danger' | 'warning' | 'info'
  /** Whether to show cancel button (default: true) */
  showCancel?: boolean
}

function ConfirmAlertDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  showCancel = true
}: ConfirmAlertDialogProps) {
  const handleConfirm = React.useCallback(() => {
    onConfirm()
    onClose()
  }, [onConfirm, onClose])

  // Determine variant styles
  const variantStyles = {
    danger: {
      headerBg: 'bg-destructive/5',
      iconBg: 'bg-error/10',
      iconColor: 'text-destructive',
      buttonVariant: 'destructive' as const
    },
    warning: {
      headerBg: 'bg-accent/5',
      iconBg: 'bg-warning/10',
      iconColor: 'text-accent',
      buttonVariant: 'primary' as const
    },
    info: {
      headerBg: 'bg-primary/5',
      iconBg: 'bg-info/10',
      iconColor: 'text-primary',
      buttonVariant: 'primary' as const
    }
  }

  const styles = variantStyles[variant]

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        {/* Header */}
        <div className={cn('p-6', styles.headerBg)}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-full', styles.iconBg)}>
                <AlertTriangle className={cn('h-6 w-6', styles.iconColor)} />
              </div>
              <AlertDialogTitle>{title}</AlertDialogTitle>
            </div>
            {showCancel && (
              <AlertDialogCancel asChild>
                <button
                  className="text-gray-900 hover:text-gray-700 transition-colors p-1 rounded-md hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </AlertDialogCancel>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </div>

        {/* Actions */}
        <div className="p-6 bg-muted/50">
          <AlertDialogFooter>
            {showCancel && (
              <AlertDialogCancel asChild>
                <Button variant="outline">{cancelText}</Button>
              </AlertDialogCancel>
            )}
            <AlertDialogAction asChild>
              <Button variant={styles.buttonVariant} onClick={handleConfirm}>
                {confirmText}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  ConfirmAlertDialog
}

export type { ConfirmAlertDialogProps }
