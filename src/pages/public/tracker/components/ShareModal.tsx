import React from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Copy, FileText } from 'lucide-react'
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
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={onClose}
        >
          <motion.div
            initial={maybeMotion({ scale: 0.8, opacity: 0 })}
            animate={maybeMotion({ scale: 1, opacity: 1 })}
            exit={maybeMotion({ scale: 0.8, opacity: 0 })}
            className="bg-card rounded-2xl p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold text-body mb-6 text-center">
              📤 Share Application Status
            </h3>
            
            <div className="space-y-4">
              <div className="bg-muted rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-2">Application Number</p>
                <p className="font-mono text-lg font-bold">{applicationNumber}</p>
              </div>
              
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={onCopyLink}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={onCopyNumber}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Copy Number
                </Button>
              </div>
              
              <Button
                variant="ghost"
                className="w-full"
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
