/**
 * Notification Preferences Component
 * Allows users to manage their notification channel preferences with consent tracking
 * Implements Requirements 6.2: Respect user consent settings for each notification channel
 */

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui'
import { AlertCircle, Bell, Clock, Download, History, Mail, MessageSquare, Smartphone, Volume2 } from 'lucide-react'
import { notificationService } from '@/services/notifications'
import { useAuth } from '@/contexts/AuthContext'
import { useToastStore } from '@/hooks/useToast'
import { formatDate, formatTimestamp } from '@/lib/dateFormat'
import type { NotificationPreferences, PreferenceAuditEntry } from '@/types/notifications'

interface NotificationPreferencesProps {
  onPreferencesChange?: (preferences: NotificationPreferences) => void
}

const CHANNEL_ICONS = {
  email: Mail,
  sms: Smartphone,
  whatsapp: MessageSquare,
  push: Bell,
  in_app: Volume2
}

const CHANNEL_LABELS = {
  email: 'Email Notifications',
  sms: 'SMS Messages',
  whatsapp: 'WhatsApp Messages',
  push: 'Push Notifications',
  in_app: 'In-App Notifications'
}

const CHANNEL_DESCRIPTIONS = {
  email: 'Receive notifications via email',
  sms: 'Receive SMS text messages (charges may apply)',
  whatsapp: 'Receive messages on WhatsApp',
  push: 'Browser push notifications',
  in_app: 'Notifications within the application'
}

const TIMEZONES = [
  { value: 'Africa/Lusaka', label: 'Lusaka (CAT)' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' }
]

export function NotificationPreferences({ onPreferencesChange }: NotificationPreferencesProps) {
  const { user } = useAuth()
  const toast = useToastStore()
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [auditTrail, setAuditTrail] = useState<PreferenceAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('preferences')

  // Load preferences on mount
  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      setLoading(true)
      const response = await notificationService.getPreferences() as any
      
      if (response) {
        setPreferences(response.preferences)
        setAuditTrail(response.audit_trail || [])
        onPreferencesChange?.(response.preferences)
      } else {
        toast.error('Failed to load notification preferences')
      }
    } catch (error) {
      console.error('Error loading preferences:', error)
      toast.error('Failed to load notification preferences')
    } finally {
      setLoading(false)
    }
  }

  const updateChannelPreference = async (channel: string, enabled: boolean) => {
    if (!preferences) return

    try {
      setSaving(true)
      
      const response = await notificationService.updatePreferences({
        [`${channel}_enabled`]: enabled
      }) as any

      if (response) {
        setPreferences(response.preferences)
        onPreferencesChange?.(response.preferences)
        
        toast.success(`${CHANNEL_LABELS[channel as keyof typeof CHANNEL_LABELS]} ${enabled ? 'enabled' : 'disabled'}`)
        
        loadPreferences()
      } else {
        toast.error('Failed to update preferences')
      }
    } catch (error) {
      console.error('Error updating channel preference:', error)
      toast.error('Failed to update preferences')
    } finally {
      setSaving(false)
    }
  }

  const updateQuietHours = async (quietHoursStart: string, quietHoursEnd: string, timezone: string) => {
    if (!preferences) return

    try {
      setSaving(true)
      
      const response = await notificationService.updatePreferences({
        quiet_hours_start: quietHoursStart,
        quiet_hours_end: quietHoursEnd
      }) as any

      if (response) {
        setPreferences(response.preferences)
        onPreferencesChange?.(response.preferences)
        
        toast.success('Your quiet hours preferences have been saved')
        
        loadPreferences()
      } else {
        toast.error('Failed to update quiet hours')
      }
    } catch (error) {
      console.error('Error updating quiet hours:', error)
      toast.error('Failed to update quiet hours')
    } finally {
      setSaving(false)
    }
  }

  const exportPreferences = async () => {
    try {
      // Export current preferences as a local download — no separate backend endpoint
      if (!preferences) {
        toast.error('No preferences to export')
        return
      }

      const exportData = {
        userId: user?.id,
        preferences,
        auditTrail,
        exportedAt: new Date().toISOString()
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `notification-preferences-${user?.id}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('Your preferences have been exported')
    } catch (error) {
      console.error('Error exporting preferences:', error)
      toast.error('Failed to export preferences')
    }
  }

  const formatAuditAction = (action: string) => {
    switch (action) {
      case 'opt_in': return 'Opted In'
      case 'opt_out': return 'Opted Out'
      case 'update_settings': return 'Updated Settings'
      case 'initialize': return 'Initialized'
      case 'delete_all': return 'Deleted All'
      default: return action
    }
  }

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case 'opt_in': return 'success'
      case 'opt_out': return 'destructive'
      case 'update_settings': return 'default'
      case 'initialize': return 'secondary'
      case 'delete_all': return 'destructive'
      default: return 'default'
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 rounded-full bg-primary/20 animate-pulse" aria-hidden="true"></div>
        </div>
      </Card>
    )
  }

  if (!preferences) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">Failed to load notification preferences</p>
            <Button onClick={loadPreferences} className="mt-4">
              Try Again
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Notification Preferences</h3>
            <p className="text-sm text-muted-foreground">
              Manage how you receive notifications from MIHAS
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportPreferences}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="preferences">Channels</TabsTrigger>
            <TabsTrigger value="quiet-hours">Quiet Hours</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="preferences" className="space-y-4">
            <div className="grid gap-4">
              {Object.entries(CHANNEL_LABELS).map(([channel, label]) => {
                const Icon = CHANNEL_ICONS[channel as keyof typeof CHANNEL_ICONS]
                const enabled = preferences[`${channel}_enabled` as keyof NotificationPreferences] as boolean
                const consentAt = preferences[`${channel}_consent_at` as keyof NotificationPreferences] as string | undefined

                return (
                  <div key={channel} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{label}</div>
                        <div className="text-sm text-muted-foreground">
                          {CHANNEL_DESCRIPTIONS[channel as keyof typeof CHANNEL_DESCRIPTIONS]}
                        </div>
                        {consentAt && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Consented: {formatDate(consentAt)}
                          </div>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(checked) => updateChannelPreference(channel, checked)}
                      disabled={saving}
                    />
                  </div>
                )
              })}
            </div>
          </TabsContent>

          <TabsContent value="quiet-hours" className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h4 className="font-medium">Quiet Hours</h4>
                  <p className="text-sm text-muted-foreground">
                    Set times when you don't want to receive notifications
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quiet-start">Start Time</Label>
                  <Input
                    id="quiet-start"
                    type="time"
                    value={preferences.quiet_hours_start}
                    onChange={(e) => {
                      const newPrefs = { ...preferences, quiet_hours_start: e.target.value }
                      setPreferences(newPrefs)
                    }}
                    onBlur={() => {
                      updateQuietHours(
                        preferences.quiet_hours_start,
                        preferences.quiet_hours_end,
                        preferences.timezone
                      )
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quiet-end">End Time</Label>
                  <Input
                    id="quiet-end"
                    type="time"
                    value={preferences.quiet_hours_end}
                    onChange={(e) => {
                      const newPrefs = { ...preferences, quiet_hours_end: e.target.value }
                      setPreferences(newPrefs)
                    }}
                    onBlur={() => {
                      updateQuietHours(
                        preferences.quiet_hours_start,
                        preferences.quiet_hours_end,
                        preferences.timezone
                      )
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select
                    value={preferences.timezone}
                    onValueChange={(value) => {
                      updateQuietHours(
                        preferences.quiet_hours_start,
                        preferences.quiet_hours_end,
                        value
                      )
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  During quiet hours ({preferences.quiet_hours_start} - {preferences.quiet_hours_end}), 
                  you will only receive urgent notifications. Regular notifications will be delivered 
                  after quiet hours end.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <History className="h-5 w-5 text-muted-foreground" />
              <div>
                <h4 className="font-medium">Preference History</h4>
                <p className="text-sm text-muted-foreground">
                  Track of all changes to your notification preferences
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {auditTrail.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No preference changes recorded yet
                </div>
              ) : (
                auditTrail.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant={getActionBadgeVariant(entry.action) as any}>
                        {formatAuditAction(entry.action)}
                      </Badge>
                      <div>
                        <div className="font-medium capitalize">{entry.channel}</div>
                        <div className="text-sm text-muted-foreground">
                          {entry.reason || 'No reason provided'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {formatDate(entry.created_at)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTimestamp(entry.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  )
}
