import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/hooks/useToast'
import { apiClient } from '@/services/client'

export function TestEmailButton() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const { addToast } = useToastStore()

  const handleTest = async () => {
    if (!email) {
      addToast('error', 'Please enter an email address')
      return
    }

    setLoading(true)
    try {
      await apiClient.request('/email/send', {
        method: 'POST',
        body: JSON.stringify({
          recipient_email: email,
          subject: 'MIHAS test email',
          body: 'This is a test email from the MIHAS admin console.',
        })
      })
      addToast('success', `Test email sent to ${email}`)
      setEmail('')
    } catch (error) {
      addToast('error', 'Failed to send test email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="test@example.com"
        className="px-3 py-2 border rounded-md text-sm"
      />
      <Button
        onClick={handleTest}
        loading={loading}
        disabled={loading}
        size="sm"
        variant="outline"
        className="gap-2"
      >
        <Mail className="w-4 h-4" />
        Test Email
      </Button>
    </div>
  )
}
