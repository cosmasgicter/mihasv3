import React from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  type DialogSize 
} from './Dialog'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className?: string
}

/**
 * Modal component - Backward compatible wrapper using Radix Dialog
 * 
 * This component maintains the original Modal API (isOpen/onClose) while
 * using the Radix-based Dialog component under the hood.
 * 
 * Features:
 * - Focus trapping (via Radix)
 * - Escape key close (via Radix)
 * - Backdrop click close (via Radix)
 * - Body scroll lock (via Radix)
 * - Size variants (sm, md, lg, xl, full)
 * - ARIA attributes (role="dialog", aria-modal)
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  className
}: ModalProps) {
  const handleOpenChange = React.useCallback((open: boolean) => {
    if (!open) {
      onClose()
    }
  }, [onClose])

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent size={size as DialogSize} className={className}>
        {(title || description) && (
          <DialogHeader>
            {title && (
              <DialogTitle className="text-lg md:text-xl font-semibold text-foreground">
                {title}
              </DialogTitle>
            )}
            {description && (
              <DialogDescription className="mt-1 text-sm text-foreground">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
        )}
        {children}
      </DialogContent>
    </Dialog>
  )
}
