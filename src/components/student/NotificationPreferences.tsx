import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Bell, Mail, MessageSquare, Check } from 'lucide-react'

export function NotificationPreferences() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState({
    email_enabled: true,
    sms_enabled: false,
    push_enabled: true,
    notification_types: {
      application_update: true,
      interview_schedule: true,
      document_ready: true
    }
  })

  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setPreferences({
          email_enabled: data.email_enabled,
          sms_enabled: data.sms_enabled,
          push_enabled: data.push_enabled,
          notification_types: data.notification_types
        })
      }
    } catch (error) {
      console.error('Load preferences error:', error)
    } finally {
      setLoading(false)
    }
  }

  const savePreferences = async () => {
    try {
      setSaving(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: user.id,
          ...preferences,
          updated_at: new Date().toISOString()
        })

      if (error) throw error
    } catch (error) {
      console.error('Save preferences error:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Notification Preferences</h2>
        <p className="text-muted-foreground">Choose how you want to receive notifications</p>
      </div>

      {/* Channels */}
      <div className="bg-card rounded-lg border border-border p-6 space-y-4">
        <h3 className="font-semibold text-foreground mb-4">Notification Channels</h3>
        
        <label className="flex items-center justify-between p-4 bg-muted rounded-lg cursor-pointer hover:bg-accent">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-foreground">Email Notifications</p>
              <p className="text-sm text-muted-foreground">Receive updates via email</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.email_enabled}
            onChange={(e) => setPreferences({ ...preferences, email_enabled: e.target.checked })}
            className="h-5 w-5 text-primary rounded"
          />
        </label>

        <label className="flex items-center justify-between p-4 bg-muted rounded-lg cursor-pointer hover:bg-accent">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-accent" />
            <div>
              <p className="font-medium text-foreground">SMS Notifications</p>
              <p className="text-sm text-muted-foreground">Receive updates via SMS</p>
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
            <Bell className="h-5 w-5 text-secondary" />
            <div>
              <p className="font-medium text-foreground">Push Notifications</p>
              <p className="text-sm text-muted-foreground">Receive in-app notifications</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.push_enabled}
            onChange={(e) => setPreferences({ ...preferences, push_enabled: e.target.checked })}
            className="h-5 w-5 text-primary rounded"
          />
        </label>
      </div>

      {/* Types */}
      <div className="bg-card rounded-lg border border-border p-6 space-y-4">
        <h3 className="font-semibold text-foreground mb-4">Notification Types</h3>
        
        <label className="flex items-center justify-between p-4 bg-muted rounded-lg cursor-pointer hover:bg-accent">
          <div>
            <p className="font-medium text-foreground">Application Updates</p>
            <p className="text-sm text-muted-foreground">Status changes and decisions</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.notification_types.application_update}
            onChange={(e) => setPreferences({
              ...preferences,
              notification_types: { ...preferences.notification_types, application_update: e.target.checked }
            })}
            className="h-5 w-5 text-primary rounded"
          />
        </label>

        <label className="flex items-center justify-between p-4 bg-muted rounded-lg cursor-pointer hover:bg-accent">
          <div>
            <p className="font-medium text-foreground">Interview Schedules</p>
            <p className="text-sm text-muted-foreground">Interview invitations and reminders</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.notification_types.interview_schedule}
            onChange={(e) => setPreferences({
              ...preferences,
              notification_types: { ...preferences.notification_types, interview_schedule: e.target.checked }
            })}
            className="h-5 w-5 text-primary rounded"
          />
        </label>

        <label className="flex items-center justify-between p-4 bg-muted rounded-lg cursor-pointer hover:bg-accent">
          <div>
            <p className="font-medium text-foreground">Document Ready</p>
            <p className="text-sm text-muted-foreground">Acceptance letters and receipts</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.notification_types.document_ready}
            onChange={(e) => setPreferences({
              ...preferences,
              notification_types: { ...preferences.notification_types, document_ready: e.target.checked }
            })}
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
