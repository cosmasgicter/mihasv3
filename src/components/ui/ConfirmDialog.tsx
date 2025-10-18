import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from './Button'

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
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200]"
          />

          {/* Dialog */}
          <div className="fixed inset-0 flex items-center justify-center z-[201] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Header */}
              <div className={`p-6 ${
                variant === 'danger' ? 'bg-red-50 dark:bg-red-950/30' :
                variant === 'warning' ? 'bg-yellow-50 dark:bg-yellow-950/30' :
                'bg-blue-50 dark:bg-blue-950/30'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      variant === 'danger' ? 'bg-red-100 dark:bg-red-900/50' :
                      variant === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/50' :
                      'bg-blue-100 dark:bg-blue-900/50'
                    }`}>
                      <AlertTriangle className={`h-6 w-6 ${
                        variant === 'danger' ? 'text-red-600 dark:text-red-400' :
                        variant === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-blue-600 dark:text-blue-400'
                      }`} />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {title}
                    </h3>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-gray-600 dark:text-gray-300">
                  {message}
                </p>
              </div>

              {/* Actions */}
              <div className="p-6 bg-gray-50 dark:bg-gray-900/50 flex gap-3 justify-end">
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
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
