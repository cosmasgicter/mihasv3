import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const DialogPortal = DialogPrimitive.Portal

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[60] bg-scrim/50 ',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out data-[state=open]:fade-in',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

// Size variants for DialogContent — applied only at md+ breakpoint
const dialogSizeClasses = {
  sm: 'md:max-w-md',
  md: 'md:max-w-lg',
  lg: 'md:max-w-2xl',
  xl: 'md:max-w-4xl',
  full: 'md:max-w-7xl'
} as const

export type DialogSize = keyof typeof dialogSizeClasses

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: DialogSize
  hideCloseButton?: boolean
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, size = 'md', hideCloseButton = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Mobile: full-screen dialog (inset-0, no translate, no rounded corners)
        'fixed inset-0 z-[60] grid w-full gap-4 border-0 bg-card p-4 shadow-lg duration-200 overflow-y-auto',
        // Desktop (md+): centered card with translate, rounded corners, max-height
        'md:inset-auto md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%] md:border md:border-border md:rounded-lg md:p-6 md:max-h-[90vh]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
        // Size classes only apply on desktop
        dialogSizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
      {!hideCloseButton && (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none touch-target min-h-touch min-w-touch flex items-center justify-center">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse gap-2 md:flex-row md:justify-end md:gap-0 md:space-x-2', className)} {...props} />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-secondary', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

/**
 * ModalDialog - Compatibility wrapper for migrating from Modal to Dialog
 * 
 * Supports the old Modal API (isOpen/onClose) while using Radix Dialog under the hood.
 * This allows gradual migration from the framer-motion Modal component.
 * 
 * Features:
 * - Focus trapping (via Radix)
 * - Escape key close (via Radix)
 * - Backdrop click close (via Radix)
 * - Body scroll lock (via Radix)
 * - Size variants (sm, md, lg, xl, full)
 * - ARIA attributes (role="dialog", aria-modal)
 */
interface ModalDialogProps {
  /** Whether the dialog is open (Modal API compatibility) */
  isOpen?: boolean
  /** Callback when dialog should close (Modal API compatibility) */
  onClose?: () => void
  /** Whether the dialog is open (Radix API) */
  open?: boolean
  /** Callback when open state changes (Radix API) */
  onOpenChange?: (open: boolean) => void
  /** Dialog title */
  title?: string
  /** Dialog description */
  description?: string
  /** Dialog content */
  children: React.ReactNode
  /** Size variant */
  size?: DialogSize
  /** Additional className for the content */
  className?: string
  /** Hide the close button */
  hideCloseButton?: boolean
}

function ModalDialog({
  isOpen,
  onClose,
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
  className,
  hideCloseButton = false
}: ModalDialogProps) {
  // Support both Modal API (isOpen/onClose) and Radix API (open/onOpenChange)
  const isDialogOpen = open ?? isOpen ?? false
  const handleOpenChange = React.useCallback((newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen)
    }
    if (!newOpen && onClose) {
      onClose()
    }
  }, [onOpenChange, onClose])

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent size={size} className={className} hideCloseButton={hideCloseButton}>
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {children}
      </DialogContent>
    </Dialog>
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  ModalDialog
}

export type { ModalDialogProps }
