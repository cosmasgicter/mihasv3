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
 className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] transition-opacity duration-200"
 />

 {/* Dialog */}
 <div className="fixed inset-0 flex items-center justify-center z-[201] p-4">
 <div
 ref={focusTrapRef as React.RefObject<HTMLDivElement>}
 role="dialog"
 aria-modal="true"
 aria-label={title}
 className="bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in"
 >
 {/* Header */}
 <div className={`p-6 ${
 variant === 'danger' ? 'bg-destructive/5' :
 variant === 'warning' ? 'bg-accent/5' :
 'bg-primary/5'
 }`}>
 <div className="flex items-start justify-between">
 <div className="flex items-center gap-3">
 <div className={`p-2 rounded-full ${
 variant === 'danger' ? 'bg-error/10' :
 variant === 'warning' ? 'bg-warning/10' :
 'bg-info/10'
 }`}>
 <AlertTriangle className={`h-6 w-6 ${
 variant === 'danger' ? 'text-destructive' :
 variant === 'warning' ? 'text-accent' :
 'text-primary'
 }`} />
 </div>
 <h3 className="text-lg font-semibold text-foreground">
 {title}
 </h3>
 </div>
 <button
 onClick={onClose}
 className="text-foreground hover:text-foreground hover:text-foreground transition-colors"
 aria-label="Close dialog"
 >
 <X className="h-5 w-5" aria-hidden="true" />
 </button>
 </div>
 </div>

 {/* Content */}
 <div className="p-6">
 <p className="text-foreground">
 {message}
 </p>
 </div>

 {/* Actions */}
 <div className="p-6 bg-muted/50 flex gap-3 justify-end">
 <Button
 variant="outline"
 onClick={onClose}
 >
 {cancelText}
 </Button>
 <Button
 variant={variant === 'danger' ? 'destructive' : 'primary'}
 onClick={handleConfirm}
 >
 {confirmText}
 </Button>
 </div>
 </div>
 </div>
 </>
 )
}
