/**
 * Communication Modal Component
 * Provides admin interface for sending messages to applicants via multiple channels
 * 
 * Requirements: 5.3, 5.4 - Admin-applicant communication
 */

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui'
import { Alert } from '@/components/ui/Alert'
import { Mail, MessageSquare, Phone, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CommunicationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicant: {
    id: string
    full_name: string
    email: string
    phone?: string
    application_id?: string
  }
  onSend?: (data: CommunicationData) => Promise<void>
}

export interface CommunicationData {
  applicantId: string
  channel: 'email' | 'sms' | 'in-app'
  message: string
  template?: string
  subject?: string
}

const MESSAGE_TEMPLATES = [
  {
    id: 'custom',
    name: 'Custom Message',
    subject: '',
    body: ''
  },
  {
    id: 'draft_reminder',
    name: 'Draft Application Reminder',
    subject: 'Complete Your MIHAS Application',
    body: 'Dear {name},\n\nWe noticed you have started an application with MIHAS but haven\'t completed it yet. We encourage you to complete your application as soon as possible.\n\nIf you need any assistance, please don\'t hesitate to reach out.\n\nBest regards,\nMIHAS Admissions Team'
  },
  {
    id: 'document_request',
    name: 'Document Request',
    subject: 'Additional Documents Required',
    body: 'Dear {name},\n\nWe need additional documents to process your application. Please upload the required documents at your earliest convenience.\n\nBest regards,\nMIHAS Admissions Team'
  },
  {
    id: 'status_update',
    name: 'Application Status Update',
    subject: 'Application Status Update',
    body: 'Dear {name},\n\nWe wanted to update you on the status of your application. Please log in to your account to view the latest information.\n\nBest regards,\nMIHAS Admissions Team'
  },
  {
    id: 'interview_reminder',
    name: 'Interview Reminder',
    subject: 'Interview Reminder',
    body: 'Dear {name},\n\nThis is a reminder about your upcoming interview. Please ensure you are prepared and arrive on time.\n\nBest regards,\nMIHAS Admissions Team'
  }
]

export function CommunicationModal({ open, onOpenChange, applicant, onSend }: CommunicationModalProps) {
  const [channel, setChannel] = useState<'email' | 'sms' | 'in-app'>('email')
  const [selectedTemplate, setSelectedTemplate] = useState('custom')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Reset form when modal opens/closes
  React.useEffect(() => {
    if (open) {
      setChannel('email')
      setSelectedTemplate('custom')
      setSubject('')
      setMessage('')
      setError(null)
      setSuccess(false)
    }
  }, [open])

  // Update message when template changes
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = MESSAGE_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      setSubject(template.subject)
      // Replace {name} placeholder with actual name
      const personalizedMessage = template.body.replace('{name}', applicant.full_name)
      setMessage(personalizedMessage)
    }
  }

  const handleSend = async () => {
    // Validation
    if (!message.trim()) {
      setError('Message cannot be empty')
      return
    }

    if (channel === 'email' && !subject.trim()) {
      setError('Email subject is required')
      return
    }

    if (channel === 'sms' && !applicant.phone) {
      setError('Applicant does not have a phone number on file')
      return
    }

    setSending(true)
    setError(null)

    try {
      const data: CommunicationData = {
        applicantId: applicant.id,
        channel,
        message: message.trim(),
        template: selectedTemplate !== 'custom' ? selectedTemplate : undefined,
        subject: channel === 'email' ? subject.trim() : undefined
      }

      if (onSend) {
        await onSend(data)
      }

      setSuccess(true)
      
      // Close modal after 1.5 seconds
      setTimeout(() => {
        onOpenChange(false)
      }, 1500)
    } catch (err) {
      console.error('Error sending message:', err)
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const getChannelIcon = (channelType: string) => {
    switch (channelType) {
      case 'email':
        return <Mail className="w-4 h-4" />
      case 'sms':
        return <Phone className="w-4 h-4" />
      case 'in-app':
        return <MessageSquare className="w-4 h-4" />
      default:
        return null
    }
  }

  const getChannelAvailability = (channelType: string) => {
    switch (channelType) {
      case 'email':
        return !!applicant.email
      case 'sms':
        return !!applicant.phone
      case 'in-app':
        return true // Always available
      default:
        return false
    }
  }

  const characterLimit = channel === 'sms' ? 160 : 1000
  const remainingChars = characterLimit - message.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <span>Contact Applicant</span>
          </DialogTitle>
          <DialogDescription>
            Send a message to {applicant.full_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Success Message */}
          {success && (
            <Alert variant="success">
              Message sent successfully!
            </Alert>
          )}

          {/* Error Message */}
          {error && (
            <Alert variant="error">
              {error}
            </Alert>
          )}

          {/* Applicant Info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-medium">{applicant.full_name}</p>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {applicant.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {applicant.email}
                </span>
              )}
              {applicant.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {applicant.phone}
                </span>
              )}
            </div>
          </div>

          {/* Channel Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Communication Channel *</label>
            <div className="grid grid-cols-3 gap-2">
              {(['email', 'sms', 'in-app'] as const).map((channelType) => {
                const isAvailable = getChannelAvailability(channelType)
                return (
                  <button
                    key={channelType}
                    type="button"
                    onClick={() => isAvailable && setChannel(channelType)}
                    disabled={!isAvailable}
                    className={cn(
                      'flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all',
                      'hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed',
                      channel === channelType
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background'
                    )}
                  >
                    {getChannelIcon(channelType)}
                    <span className="text-xs font-medium mt-1 capitalize">
                      {channelType === 'in-app' ? 'In-App' : channelType}
                    </span>
                    {!isAvailable && (
                      <Badge variant="secondary" className="mt-1 text-xs">
                        N/A
                      </Badge>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Template Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Message Template</label>
            <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject (Email only) */}
          {channel === 'email' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject *</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Message *</label>
              <span
                className={cn(
                  'text-xs',
                  remainingChars < 0
                    ? 'text-destructive font-medium'
                    : remainingChars < 20
                    ? 'text-orange-600'
                    : 'text-muted-foreground'
                )}
              >
                {remainingChars} characters remaining
              </span>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message..."
              rows={channel === 'sms' ? 4 : 6}
              className={cn(remainingChars < 0 && 'border-destructive')}
            />
            {channel === 'sms' && (
              <p className="text-xs text-muted-foreground">
                SMS messages are limited to 160 characters
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !message.trim() || remainingChars < 0 || success}
          >
            {sending ? (
              <>
                <Send className="w-4 h-4 mr-2 animate-pulse" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Message
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
