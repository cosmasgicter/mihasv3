import React from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from './Button'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger'
}) => {
  const focusTrapRef = useFocusTrap(isOpen)
  useEscapeKey(isOpen, onClose)

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-scrim/50  z-[200] transition-opacity duration-200"
      />

      {/* Dialog — scrollable container for mobile */}
      <div className="fixed inset-0 z-[201] overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            ref={focusTrapRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="bg-card rounded-lg shadow-lg w-full max-w-md overflow-hidden animate-scale-in"
          >
            {/* Header with sticky close button */}
            <div className={`sticky top-0 z-10 p-4 sm:p-6 ${
              variant === 'danger' ? 'bg-destructive/5' :
              variant === 'warning' ? 'bg-accent/5' :
              'bg-primary/5'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-full flex-shrink-0 ${
                    variant === 'danger' ? 'bg-error/10' :
                    variant === 'warning' ? 'bg-warning/10' :
                    'bg-info/10'
                  }`}>
                    <AlertTriangle className={`h-5 w-5 sm:h-6 sm:w-6 ${
                      variant === 'danger' ? 'text-destructive' :
                      variant === 'warning' ? 'text-accent' :
                      'text-primary'
                    }`} />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-foreground break-words min-w-0">
                    {title}
                  </h3>
                </div>
                <button
                  onClick={onClose}
                  className="flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-foreground hover:bg-foreground/5 transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Close dialog"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Content — scrollable */}
            <div className="p-4 sm:p-6">
              <p className="text-foreground text-sm sm:text-base">
                {message}
              </p>
            </div>

            {/* Actions — sticky bottom on mobile */}
            <div className="sticky bottom-0 p-4 sm:p-6 bg-muted/50 border-t border-border/50 flex flex-col-reverse gap-2 sm:flex-row sm:gap-3 sm:justify-end">
              <Button
                variant="outline"
                onClick={onClose}
                className="w-full sm:w-auto"
              >
                {cancelText}
              </Button>
              <Button
                variant={variant === 'danger' ? 'destructive' : 'primary'}
                onClick={handleConfirm}
                className="w-full sm:w-auto"
              >
                {confirmText}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
