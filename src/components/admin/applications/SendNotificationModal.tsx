import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { XCircle, Send } from 'lucide-react'

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

  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
      <div className="bg-card rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Send Notification</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <XCircle className="h-5 w-5" />
          </Button>
        </div>

        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-gray-900">
            <strong>To:</strong> {studentName}
          </p>
          <p className="text-sm text-gray-900">
            <strong>Application:</strong> #{applicationNumber}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter notification title..."
              className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus:ring focus:ring-blue-200"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message to the student..."
              rows={4}
              className="w-full rounded-lg border border-input px-3 py-2 focus:border-primary focus:ring focus:ring-blue-200"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              loading={sending}
              disabled={!title.trim() || !message.trim()}
              className="flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Send Notification
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}