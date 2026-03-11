import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/services/client'
import { Button } from '@/components/ui/Button'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'
import { Bell, Mail, MessageSquare, Check, MessageCircle, ShieldCheck } from 'lucide-react'

interface NotificationPreferencesType {
  email_enabled: boolean
  sms_enabled?: boolean
  whatsapp_enabled?: boolean
  in_app_enabled?: boolean
  push_enabled?: boolean
  marketing_emails?: boolean
  notification_types?: {
    application_update: boolean
    interview_schedule: boolean
    document_ready: boolean
  }
}

export function NotificationPreferences() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState({
    email_enabled: true,
    sms_enabled: true,
    whatsapp_enabled: true,
    in_app_enabled: true,
    marketing_emails: false,
    notification_types: {
      application_update: true,
      interview_schedule: true,
      document_ready: true
    }
  })

  useEffect(() => {
    loadPreferences()
  }, [user])

  const loadPreferences = async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      const data = await apiClient.request<{ preferences?: NotificationPreferencesType } | NotificationPreferencesType>('/notifications?action=preferences')
      const incoming = (data && 'preferences' in data ? data.preferences : data) as NotificationPreferencesType | undefined

      if (incoming) {
        setPreferences({
          email_enabled: true,
          sms_enabled: incoming.sms_enabled ?? true,
          whatsapp_enabled: incoming.whatsapp_enabled ?? true,
          in_app_enabled: incoming.in_app_enabled ?? incoming.push_enabled ?? true,
          marketing_emails: incoming.marketing_emails ?? false,
          notification_types: incoming.notification_types ?? {
            application_update: true,
            interview_schedule: true,
            document_ready: true
          }
        })
      }
    } catch (error) {
      console.error('Load preferences error:', error)
    } finally {
      setLoading(false)
    }
  }

  const savePreferences = async () => {
    if (!user) return

    try {
      setSaving(true)

      await apiClient.request('/notifications?action=preferences', {
        method: 'POST',
        body: JSON.stringify({
          sms_enabled: preferences.sms_enabled,
          whatsapp_enabled: preferences.whatsapp_enabled,
          in_app_enabled: true,
          push_enabled: true,
          marketing_emails: preferences.marketing_emails,
          notification_types: preferences.notification_types
        })
      })
    } catch (error) {
      console.error('Save preferences error:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <UnifiedLoader variant="inline" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Notification Preferences</h2>
        <p className="text-foreground">Manage optional channels while required operational channels stay enabled.</p>
      </div>

      <div className="bg-card rounded-lg border border-border p-6 space-y-4">
        <h3 className="font-semibold text-foreground mb-4">Required Operational Channels</h3>

        <div className="flex items-center justify-between p-4 bg-muted rounded-lg border border-dashed border-primary/40">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-foreground">Operational Email</p>
              <p className="text-sm text-foreground">Mandatory for account, application, and payment notices.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-primary/10 text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Mandatory
          </span>
        </div>

        <div className="flex items-center justify-between p-4 bg-muted rounded-lg border border-dashed border-primary/40">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-secondary" />
            <div>
              <p className="font-medium text-foreground">In-App Notifications</p>
              <p className="text-sm text-foreground">Mandatory for real-time operational updates inside the portal.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-primary/10 text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Mandatory
          </span>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border p-6 space-y-4">
        <h3 className="font-semibold text-foreground mb-4">Optional Channels & Marketing</h3>

        <label className="flex items-center justify-between p-4 bg-muted rounded-lg cursor-pointer hover:bg-accent">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-accent" />
            <div>
              <p className="font-medium text-foreground">SMS Notifications</p>
              <p className="text-sm text-foreground">Text message updates to your phone.</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.sms_enabled}
            onChange={(e) => setPreferences({ ...preferences, sms_enabled: e.target.checked })}
            className="h-5 w-5 text-primary rounded"
          />
        </label>

        <label className="flex items-center justify-between p-4 bg-muted rounded-lg cursor-pointer hover:bg-accent">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-foreground">WhatsApp Notifications</p>
              <p className="text-sm text-foreground">Receive the same updates via WhatsApp.</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.whatsapp_enabled}
            onChange={(e) => setPreferences({ ...preferences, whatsapp_enabled: e.target.checked })}
            className="h-5 w-5 text-primary rounded"
          />
        </label>

        <label className="flex items-center justify-between p-4 bg-muted rounded-lg cursor-pointer hover:bg-accent">
          <div>
            <p className="font-medium text-foreground">Marketing Emails</p>
            <p className="text-sm text-foreground">Optional promotional and campaign messages.</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.marketing_emails}
            onChange={(e) => setPreferences({ ...preferences, marketing_emails: e.target.checked })}
            className="h-5 w-5 text-primary rounded"
          />
        </label>
      </div>

      <Button
        onClick={savePreferences}
        loading={saving}
        className="w-full bg-primary hover:bg-primary"
      >
        <Check className="h-5 w-5 mr-2" />
        Save Preferences
      </Button>
    </div>
  )
}
