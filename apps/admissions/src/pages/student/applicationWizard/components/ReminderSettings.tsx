import { useState } from 'react'
import { Bell, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/hooks/useToast'
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
      localStorage.setItem('mihas:application-reminder-request', JSON.stringify({
        email,
        fullName,
        draftName,
        lastUpdated: new Date().toISOString()
      }))

      setSent(true)
      showSuccess('Reminder request saved locally. Automatic email reminders are not available yet.')
      setTimeout(() => setSent(false), 3000)
    } catch (error) {
      console.error('Reminder save error:', error)
      showError(error instanceof Error ? error.message : 'Failed to save reminder request')
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
        Automatic reminder emails are still being migrated. You can save a reminder request on this device for now.
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
            Saved Locally
          </>
        ) : (
          <>
            <Bell className="h-4 w-4 mr-2" />
            {sending ? 'Saving...' : 'Save Reminder'}
          </>
        )}
      </Button>
    </div>
  )
}
