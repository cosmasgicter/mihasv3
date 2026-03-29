import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/hooks/useToast'
import { getApiBaseUrl } from '@/lib/apiConfig'

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
      const response = await fetch(`${getApiBaseUrl()}/test-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email })
      })

      const data = await response.json()

      if (data.success) {
        addToast('success', `Test email sent to ${email}`)
        setEmail('')
      } else {
        addToast('error', data.error || 'Failed to send test email')
      }
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
