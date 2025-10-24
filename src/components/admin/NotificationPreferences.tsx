import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/components/ui/Toast'
import { Mail, MessageSquare, Bell, Phone } from 'lucide-react'

interface NotificationPreferencesProps {
  userId: string
}

export function NotificationPreferences({ userId }: NotificationPreferencesProps) {
  const [prefs, setPrefs] = useState({
    email_enabled: true,
    sms_enabled: false,
    whatsapp_enabled: false,
    in_app_enabled: true
  })
  const [loading, setLoading] = useState(false)
  const { addToast } = useToastStore()

  useEffect(() => {
    loadPreferences()
  }, [userId])

  const loadPreferences = async () => {
    try {
      const response = await fetch(`/api/users/${userId}/notification-preferences`)
      if (response.ok) {
        const { data } = await response.json()
        if (data) setPrefs(data)
      }
    } catch (error) {
      console.error('Failed to load preferences')
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/users/${userId}/notification-preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs)
      })

      if (!response.ok) throw new Error('Failed to save')

      addToast('success', 'Preferences saved')
    } catch (error) {
      addToast('error', 'Failed to save preferences')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Notification Channels</h3>
      
      <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted">
        <input
          type="checkbox"
          checked={prefs.in_app_enabled}
          onChange={(e) => setPrefs({ ...prefs, in_app_enabled: e.target.checked })}
          className="w-4 h-4"
        />
        <Bell className="w-5 h-5" />
        <span>In-App Notifications</span>
      </label>

      <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted">
        <input
          type="checkbox"
          checked={prefs.email_enabled}
          onChange={(e) => setPrefs({ ...prefs, email_enabled: e.target.checked })}
          className="w-4 h-4"
        />
        <Mail className="w-5 h-5" />
        <span>Email Notifications</span>
      </label>

      <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted">
        <input
          type="checkbox"
          checked={prefs.sms_enabled}
          onChange={(e) => setPrefs({ ...prefs, sms_enabled: e.target.checked })}
          className="w-4 h-4"
        />
        <Phone className="w-5 h-5" />
        <span>SMS Notifications</span>
      </label>

      <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted">
        <input
          type="checkbox"
          checked={prefs.whatsapp_enabled}
          onChange={(e) => setPrefs({ ...prefs, whatsapp_enabled: e.target.checked })}
          className="w-4 h-4"
        />
        <MessageSquare className="w-5 h-5" />
        <span>WhatsApp Notifications</span>
      </label>

      <Button onClick={handleSave} disabled={loading}>
        {loading ? 'Saving...' : 'Save Preferences'}
      </Button>
    </div>
  )
}
