import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/Dialog'
import { Send } from 'lucide-react'

interface SendNotificationModalProps {
  show: boolean
  applicationNumber: string
  studentName: string
  onClose: () => void
  onSend: (title: string, message: string) => Promise<void>
}

export function SendNotificationModal({
  show,
  applicationNumber,
  studentName,
  onClose,
  onSend
}: SendNotificationModalProps) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !message.trim()) return

    try {
      setSending(true)
      await onSend(title.trim(), message.trim())
      setTitle('')
      setMessage('')
      onClose()
    } catch (error) {
      console.error('Failed to send notification:', error)
    } finally {
      setSending(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose()
    }
  }

  return (
    <Dialog open={show} onOpenChange={handleOpenChange}>
      <DialogContent size="sm" className="z-[70]">
        <DialogHeader>
          <DialogTitle>Send Notification</DialogTitle>
        </DialogHeader>

        <div className="mb-4 p-3 bg-muted rounded-lg">
          <p className="text-sm text-foreground">
            <strong>To:</strong> {studentName}
          </p>
          <p className="text-sm text-foreground">
            <strong>Application:</strong> #{applicationNumber}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Subject
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter notification title..."
              className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message to the student..."
              rows={4}
              className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={sending}
              disabled={!title.trim() || !message.trim()}
              className="flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Send Notification
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}