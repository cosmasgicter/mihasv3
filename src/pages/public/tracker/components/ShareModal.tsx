import React from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Copy, FileText, X, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface ShareModalProps {
  show: boolean
  applicationNumber: string
  onClose: () => void
  onCopyLink: () => void
  onCopyNumber: () => void
}

export const ShareModal: React.FC<ShareModalProps> = ({
  show,
  applicationNumber,
  onClose,
  onCopyLink,
  onCopyNumber
}) => {
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)

  return (
    <AnimatePresence initial={!shouldReduceMotion}>
      {show && (
        <motion.div
          initial={maybeMotion({ opacity: 0 })}
          animate={maybeMotion({ opacity: 1 })}
          exit={maybeMotion({ opacity: 0 })}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={onClose}
        >
          <motion.div
            initial={maybeMotion({ scale: 0.95, opacity: 0 })}
            animate={maybeMotion({ scale: 1, opacity: 1 })}
            exit={maybeMotion({ scale: 0.95, opacity: 0 })}
            className="bg-card rounded-2xl p-6 max-w-md w-full shadow-2xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Share2 className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Share Application Status
                </h3>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            
            {/* Content */}
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-xl p-4 border border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Application Number</p>
                <p className="font-mono text-lg font-bold text-gray-900">{applicationNumber}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onCopyLink}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onCopyNumber}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Copy Number
                </Button>
              </div>
              
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
