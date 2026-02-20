import { useState } from 'react'
import { Bell, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/components/ui/Toast'
import { animateClasses } from '@/lib/animations'

interface ReminderSettingsProps {
  email: string
  fullName: string
  draftName?: string
}

export const ReminderSettings = ({ email, fullName, draftName }: ReminderSettingsProps) => {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const { addToast } = useToastStore()
  const showSuccess = (msg: string) => addToast('success', msg)
  const showError = (msg: string) => addToast('error', msg)

  const sendReminder = async () => {
    if (!email || !fullName) {
      showError('Email and name required')
      return
    }

    setSending(true)
    try {
      const response = await fetch('/applications/reminders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          fullName,
          draftName,
          lastUpdated: new Date().toISOString()
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to send reminder')
      }

      setSent(true)
      showSuccess('Reminder email sent!')
      setTimeout(() => setSent(false), 3000)
    } catch (error) {
      console.error('Reminder send error:', error)
      showError(error instanceof Error ? error.message : 'Failed to send reminder')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={`bg-card border border-border rounded-lg p-4 ${animateClasses.slideUp}`}
    >
      <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
        <Bell className="h-4 w-4" />
        Email Reminders
      </h3>
      <p className="text-xs text-caption mb-3">
        Get reminded to complete your application
      </p>
      <Button
        type="button"
        variant={sent ? 'outline' : 'default'}
        size="sm"
        onClick={sendReminder}
        disabled={sending || sent}
        className="w-full"
      >
        {sent ? (
          <>
            <Check className="h-4 w-4 mr-2" />
            Reminder Sent
          </>
        ) : (
          <>
            <Bell className="h-4 w-4 mr-2" />
            {sending ? 'Sending...' : 'Send Reminder'}
          </>
        )}
      </Button>
    </div>
  )
}

