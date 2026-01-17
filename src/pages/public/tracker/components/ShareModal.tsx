import React from 'react'
import { Copy, FileText, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/Dialog'

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
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose()
    }
  }

  return (
    <Dialog open={show} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Share2 className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>Share Application Status</DialogTitle>
          </div>
        </DialogHeader>
        
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
      </DialogContent>
    </Dialog>
  )
}
